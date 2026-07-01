import { supabase } from './supabase'
import { getLocalYMD } from './date'
import { placeNameWithCountry } from './placeName'

// Notification centre (the header bell). Events are DERIVED from existing data — there is
// no notifications table. Sources:
//  - request_notification_events (new_request → host; accepted/rejected/cancelled_by_host → guest)
//  - reviews left on me (new review)
//  - accepted stays that have ended and I haven't reviewed (pending review — always actionable)
// Read/unread is a single profiles.notifications_seen_at timestamp.
//
// "Clear all" + auto-expiry: announcement events (knock/accepted/rejected/cancelled/review) are
// hidden when older than the cutoff = max(profiles.notifications_cleared_at, now − 45 days). No
// data is deleted — the derived events are just not shown. review_due (a pending TODO) is EXEMPT:
// it always shows until the review is written (then it drops out naturally).
const EXPIRY_DAYS = 45

export type NotifLink =
  | { kind: 'chat'; convId: string | null; reviewRequestId?: string }
  | { kind: 'reviews' }

export type NotifType = 'knock' | 'accepted' | 'rejected' | 'cancelled' | 'review' | 'review_due'

export type NotifEvent = {
  id: string
  type: NotifType
  at: string
  title: string
  sub: string
  unread: boolean
  link: NotifLink
}

export type NotifResult = { events: NotifEvent[]; unreadCount: number }

export async function loadNotifications(userId: string): Promise<NotifResult> {
  const today = getLocalYMD()

  const [{ data: prof }, { data: reqs }, { data: revs }, { data: myRevs }] = await Promise.all([
    supabase.from('profiles').select('notifications_seen_at, notifications_cleared_at').eq('id', userId).maybeSingle(),
    supabase.from('stay_requests')
      .select('id, status, host_id, guest_id, conversation_id, departure_date, location_id, location_city, location_country')
      .or(`guest_id.eq.${userId},host_id.eq.${userId}`),
    supabase.from('reviews').select('id, reviewer_id, created_at').eq('reviewee_id', userId).order('created_at', { ascending: false }),
    supabase.from('reviews').select('stay_request_id').eq('reviewer_id', userId),
  ])

  const seenAt: string | null = prof?.notifications_seen_at ?? null
  const isUnread = (at: string) => (seenAt ? new Date(at).getTime() > new Date(seenAt).getTime() : true)
  // Hide announcement events older than the cutoff (Clear all timestamp, or 45-day expiry).
  const clearedMs = prof?.notifications_cleared_at ? new Date(prof.notifications_cleared_at).getTime() : 0
  const cutoffMs = Math.max(clearedMs, Date.now() - EXPIRY_DAYS * 24 * 60 * 60 * 1000)

  const reqList = (reqs ?? []) as any[]
  const reqMap: Record<string, any> = {}
  reqList.forEach(r => { reqMap[r.id] = r })
  const reqIds = reqList.map(r => r.id)
  const reviewed = new Set((myRevs ?? []).map((r: any) => r.stay_request_id))

  // Notification-event log for my requests (already RLS-scoped to me).
  const { data: rne } = reqIds.length
    ? await supabase.from('request_notification_events').select('request_id, event, created_at').in('request_id', reqIds)
    : { data: [] as any[] }

  // Resolve the other party's / reviewers' names in one batch.
  const otherIds = new Set<string>()
  reqList.forEach(r => { const o = r.guest_id === userId ? r.host_id : r.guest_id; if (o) otherIds.add(o) })
  ;(revs ?? []).forEach((r: any) => { if (r.reviewer_id) otherIds.add(r.reviewer_id) })
  const nameMap: Record<string, string> = {}
  const ids = [...otherIds]
  if (ids.length) {
    const { data: profs } = await supabase.from('profiles').select('id, full_name').in('id', ids)
    profs?.forEach((p: any) => { nameMap[p.id] = p.full_name || 'Rider' })
  }
  // Same place name as the Messages list ("Garage in Prague (Josefov), CZ"), built from the
  // live public listing when it still exists; otherwise fall back to the denormalized
  // city/country snapshot kept on the stay request (survives a deleted listing). No ★ rating
  // here — a transactional notification shouldn't carry a quality signal.
  const notifLocIds = [...new Set(reqList.map(r => r.location_id).filter(Boolean))] as string[]
  const locById: Record<string, any> = {}
  if (notifLocIds.length) {
    const { data: locs } = await supabase
      .from('host_locations_public')
      .select('id, location_city, location_country, location_district, parking, parkings')
      .in('id', notifLocIds)
    locs?.forEach((l: any) => { locById[l.id] = l })
  }
  const placeOf = (r: any) => {
    const live = r.location_id ? locById[r.location_id] : null
    return placeNameWithCountry(live ?? { location_city: r.location_city, location_country: r.location_country })
  }

  const events: NotifEvent[] = []

  // Status events from the notification log (created_at = when it happened).
  for (const e of (rne ?? []) as any[]) {
    const r = reqMap[e.request_id]
    if (!r) continue
    const recipient = e.event === 'new_request' ? r.host_id : r.guest_id
    if (recipient !== userId) continue
    const otherId = r.guest_id === userId ? r.host_id : r.guest_id
    const name = nameMap[otherId] || 'A rider'
    const place = placeOf(r)
    const link: NotifLink = { kind: 'chat', convId: r.conversation_id }
    let type: NotifType, title: string
    if (e.event === 'new_request') { type = 'knock'; title = `New stay request from ${name}` }
    else if (e.event === 'accepted') { type = 'accepted'; title = `${name} accepted your stay` }
    else if (e.event === 'rejected') { type = 'rejected'; title = `${name} declined your request` }
    else if (e.event === 'cancelled_by_host') { type = 'cancelled'; title = `${name} cancelled the stay` }
    else continue
    events.push({ id: `rne:${e.request_id}:${e.event}`, type, at: e.created_at, title, sub: place || 'Tap to open the chat', unread: isUnread(e.created_at), link })
  }

  // New reviews on me.
  for (const rv of (revs ?? []) as any[]) {
    const name = nameMap[rv.reviewer_id] || 'A rider'
    events.push({ id: `review:${rv.id}`, type: 'review', at: rv.created_at, title: `${name} left you a review`, sub: 'Tap to see your reviews', unread: isUnread(rv.created_at), link: { kind: 'reviews' } })
  }

  // Pending reviews — ended accepted stays I haven't reviewed. Always actionable (unread)
  // until written; this is the indicator that previously didn't light up (bug fix).
  for (const r of reqList) {
    if (r.status === 'ACCEPTED' && r.departure_date && r.departure_date <= today && !reviewed.has(r.id)) {
      const otherId = r.guest_id === userId ? r.host_id : r.guest_id
      const name = nameMap[otherId] || 'your host'
      events.push({
        id: `due:${r.id}`,
        type: 'review_due',
        at: r.departure_date,
        title: `Leave a review for ${name}`,
        sub: placeOf(r) || 'Rate your stay',
        unread: true,
        link: { kind: 'chat', convId: r.conversation_id, reviewRequestId: r.id },
      })
    }
  }

  // review_due is a pending TODO — always keep it. Everything else respects the cutoff.
  const visible = events.filter(e => e.type === 'review_due' || new Date(e.at).getTime() > cutoffMs)
  visible.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  return { events: visible, unreadCount: visible.filter(e => e.unread).length }
}

export async function markNotificationsSeen(userId: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ notifications_seen_at: new Date().toISOString() }).eq('id', userId)
  if (error) console.warn('markNotificationsSeen error:', error.message)
}

// "Clear all": hide every announcement event up to now (review_due survives). Derived-only —
// nothing is deleted.
export async function clearAllNotifications(userId: string): Promise<void> {
  const { error } = await supabase.from('profiles').update({ notifications_cleared_at: new Date().toISOString() }).eq('id', userId)
  if (error) console.warn('clearAllNotifications error:', error.message)
}
