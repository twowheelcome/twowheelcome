import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FlatList, Image, KeyboardAvoidingView, Linking, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View,
} from 'react-native'
import { useFocusEffect, useLocalSearchParams } from 'expo-router'
import { Feather } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { useTheme, type ThemeColors } from '../../lib/ThemeContext'
import { unreadStore } from '../../lib/unreadStore'
import { UserChip } from '../../components/UserChip'
import { AppHeader } from '../../components/AppHeader'

// ── Types ──────────────────────────────────────────────────────────────────

type OtherUser = { id: string; full_name: string | null; avatar_url?: string | null }

type ConvRow = {
  id: string
  user_a: string
  user_b: string
  last_message_at: string
  other: OtherUser
  lastMsgBody: string | null
  lastMsgSenderId: string | null
  lastMsgIsRequest: boolean
  hasRequest: boolean
}

type RequestData = {
  id: string
  arrival_date: string
  departure_date: string
  arrival_time: string | null
  guests_count: number
  guest_vehicle: string | null
  status: string
  photo_url: string | null
  host_id: string
  guest_id: string
  location_id: string | null
}

type MsgRow = {
  id: string
  conversation_id: string
  sender_id: string
  sender_name: string | null
  body: string | null
  photo_url: string | null
  request_id: string | null
  request: RequestData | null
  created_at: string
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeStatus(C: ThemeColors): Record<string, { label: string; color: string; bg: string }> {
  return {
    PENDING:  { label: 'Pending',  color: C.text,  bg: C.accent },
    ACCEPTED: { label: 'Accepted', color: C.white, bg: C.success },
    REJECTED: { label: 'Rejected', color: C.white, bg: C.error },
  }
}

// For DATE strings (YYYY-MM-DD) — manual parse to avoid timezone shifts
function fmtDateStr(s: string): string {
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y.slice(2)}`
}

// For full ISO timestamps (last_message_at etc.)
function fmtDate(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getFullYear()).slice(2)}`
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
}

function extractCoords(body: string | null): { lat: number; lng: number } | null {
  const match = body?.match(/(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/)
  if (!match) return null
  const lat = Number(match[1])
  const lng = Number(match[2])
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null
  return { lat, lng }
}

async function openNavigation(lat: number, lng: number) {
  const label = encodeURIComponent('Twowheelcome meeting point')
  const coords = `${lat},${lng}`
  const url = Platform.select({
    android: `geo:${coords}?q=${coords}(${label})`,
    ios: `http://maps.apple.com/?ll=${coords}&q=${label}`,
    default: `https://www.google.com/maps/search/?api=1&query=${coords}`,
  })!
  await Linking.openURL(url)
}

// ── RequestCard ───────────────────────────────────────────────────────────

function RequestCard({
  req, body, isHost, onRespond, onSendCoordinates, sendingCoordinates,
}: {
  req: RequestData
  body: string | null
  isHost: boolean
  onRespond: (id: string, status: 'ACCEPTED' | 'REJECTED') => void
  onSendCoordinates?: (req: RequestData) => void
  sendingCoordinates?: boolean
}) {
  const C = useTheme()
  const rc = useMemo(() => makeRc(C), [C])
  const STATUS = useMemo(() => makeStatus(C), [C])
  const s = STATUS[req.status] || STATUS.PENDING
  const vehicle = req.guest_vehicle === 'moto' ? '🏍 Moto' : null
  const guestsLabel = req.guests_count === 1 ? '1 rider' : `${req.guests_count} riders`
  const isGuest = !isHost

  return (
    <View style={rc.card}>
      <Text style={rc.cardTitle}>{isGuest ? '🔒 YOUR KNOCK' : '🤞 STAY REQUEST'}</Text>

      {/* Status badge */}
      <View style={[rc.statusBadge, { backgroundColor: s.bg }]}>
        <Text style={[rc.statusText, { color: s.color }]}>{s.label}</Text>
      </View>

      {/* Privacy block — guest side only */}
      {isGuest && req.status === 'PENDING' && (
        <View style={[rc.privacyBlock, { backgroundColor: C.accentSoft, borderColor: C.accentBorder }]}>
          <Text style={rc.privacyIcon}>🔒</Text>
          <Text style={[rc.privacyText, { color: C.textMuted }]}>
            Approx. area for now. The host sends the exact meeting point in chat when you agree.
          </Text>
        </View>
      )}
      {isGuest && req.status === 'ACCEPTED' && (
        <View style={[rc.privacyBlock, { backgroundColor: C.successSoft, borderColor: C.successBorder }]}>
          <Text style={rc.privacyIcon}>📍</Text>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[rc.privacyText, { color: C.success, fontWeight: '700' }]}>REQUEST ACCEPTED</Text>
            <Text style={[rc.privacyText, { color: C.textMuted }]}>
              The exact spot is shared by the host in chat, so both sides know the stay is confirmed.
            </Text>
          </View>
        </View>
      )}
      {isHost && req.status === 'ACCEPTED' && onSendCoordinates && (
        <View style={[rc.privacyBlock, { backgroundColor: C.accentSoft, borderColor: C.accentBorder }]}>
          <Text style={rc.privacyIcon}>📍</Text>
          <View style={{ flex: 1, gap: 6 }}>
            <Text style={[rc.privacyText, { color: C.textMuted }]}>
              Send the exact meeting point when you are ready to share it.
            </Text>
            <TouchableOpacity
              style={[rc.shareBtn, sendingCoordinates && rc.shareBtnDisabled]}
              onPress={() => onSendCoordinates(req)}
              disabled={sendingCoordinates}
            >
              <Text style={rc.shareBtnText}>{sendingCoordinates ? 'Sending...' : 'Send coordinates'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Details */}
      <View style={rc.details}>
        <View style={rc.detailRow}>
          <Text style={rc.detailIcon}>📅</Text>
          <Text style={rc.detailText}>
            {fmtDateStr(req.arrival_date)} → {fmtDateStr(req.departure_date)}
          </Text>
        </View>
        <View style={rc.detailRow}>
          <Text style={rc.detailIcon}>🕐</Text>
          <Text style={rc.detailText}>
            {req.arrival_time ? `Arrival approx. ${req.arrival_time}` : 'Arrival time not set'}
          </Text>
        </View>
        <View style={rc.detailRow}>
          <Text style={rc.detailIcon}>👥</Text>
          <Text style={rc.detailText}>
            {guestsLabel}{vehicle ? `  ·  ${vehicle}` : ''}
          </Text>
        </View>
      </View>

      {/* Message text */}
      {body ? (
        <View style={rc.msgBlock}>
          <Text style={rc.msgText}>"{body}"</Text>
        </View>
      ) : null}

      {/* Photo */}
      {req.photo_url ? (
        <Image source={{ uri: req.photo_url }} style={rc.photo} resizeMode="cover" />
      ) : null}

      {/* Host actions */}
      {isHost && req.status === 'PENDING' && (
        <View style={rc.actions}>
          <TouchableOpacity style={rc.acceptBtn} onPress={() => onRespond(req.id, 'ACCEPTED')}>
            <Text style={rc.acceptTxt}>✓ ACCEPT</Text>
          </TouchableOpacity>
          <TouchableOpacity style={rc.rejectBtn} onPress={() => onRespond(req.id, 'REJECTED')}>
            <Text style={rc.rejectTxt}>✕ DECLINE</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

function makeRc(C: ThemeColors) { return StyleSheet.create({
  card: {
    backgroundColor: C.surface, borderRadius: 20,
    borderWidth: 1, borderColor: C.border,
    padding: 14, gap: 10, maxWidth: '90%',
  },
  cardTitle: { color: C.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  statusBadge: {
    alignSelf: 'flex-start', borderRadius: 100,
    paddingHorizontal: 12, paddingVertical: 5,
  },
  statusText: { fontSize: 12, fontWeight: '700' },
  details: { gap: 6 },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  detailIcon: { fontSize: 13, lineHeight: 20 },
  detailText: { color: C.text, fontSize: 13, lineHeight: 20, flex: 1 },
  msgBlock: {
    backgroundColor: C.elevated, borderRadius: 12,
    paddingHorizontal: 12, paddingVertical: 10,
    borderLeftWidth: 3, borderLeftColor: C.accent,
  },
  msgText: { color: C.textMuted, fontSize: 13, lineHeight: 20, fontStyle: 'italic' },
  photo: { width: '100%', height: 200, borderRadius: 14 },
  privacyBlock: { flexDirection: 'row', gap: 8, borderRadius: 12, borderWidth: 1, padding: 10, alignItems: 'flex-start' },
  privacyIcon:  { fontSize: 18, marginTop: 1 },
  privacyText:  { fontSize: 13, lineHeight: 19, flex: 1 },
  shareBtn:     { alignSelf: 'flex-start', marginTop: 2, backgroundColor: C.accent, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8 },
  shareBtnDisabled: { opacity: 0.65 },
  shareBtnText: { color: C.white, fontWeight: '700', fontSize: 13 },
  actions: { flexDirection: 'row', gap: 8, paddingTop: 4 },
  acceptBtn: { flex: 1, backgroundColor: C.success, borderRadius: 100, padding: 13, alignItems: 'center' },
  acceptTxt: { color: C.white, fontWeight: '700', fontSize: 13 },
  rejectBtn: { flex: 1, borderRadius: 100, padding: 13, alignItems: 'center', borderWidth: 1, borderColor: C.error },
  rejectTxt: { color: C.error, fontWeight: '700', fontSize: 13 },
}) }

// ── Main Screen ───────────────────────────────────────────────────────────

export default function RequestsScreen() {
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])
  const [convs, setConvs] = useState<ConvRow[]>([])
  const [selected, setSelected] = useState<ConvRow | null>(null)
  const [messages, setMessages] = useState<MsgRow[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [seenConvIds, setSeenConvIds] = useState<Set<string>>(new Set())
  const [sendingCoordsFor, setSendingCoordsFor] = useState<string | null>(null)
  const [myReview, setMyReview] = useState<{ rating: number; body: string } | null>(null)
  const [reviewStars, setReviewStars] = useState(0)
  const [reviewBody, setReviewBody] = useState('')
  const [submittingReview, setSubmittingReview] = useState(false)
  const flatRef = useRef<FlatList<MsgRow>>(null)
  const channelRef = useRef<any>(null)
  const autoOpenedRef = useRef<string | null>(null)

  const { openConv: openConvParam } = useLocalSearchParams<{ openConv?: string }>()

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) { setCurrentUser(user); loadConvs(user.id) }
    })
  }, [])

  // Refresh convs every time the tab gets focus
  useFocusEffect(
    useCallback(() => {
      if (currentUser) loadConvs(currentUser.id)
    }, [currentUser])
  )

  // Auto-open conversation when navigated from map with openConv param
  useEffect(() => {
    if (openConvParam && convs.length > 0 && autoOpenedRef.current !== openConvParam) {
      const conv = convs.find(c => c.id === openConvParam)
      if (conv) {
        autoOpenedRef.current = openConvParam
        openConv(conv)
      }
    }
  }, [convs, openConvParam])

  // Reload convs when navigating back from chat
  useEffect(() => {
    if (!selected && currentUser) loadConvs(currentUser.id)
  }, [selected])

  // Sync unread indicator to tab bar
  useEffect(() => {
    const anyUnread = convs.some(c =>
      c.lastMsgSenderId && c.lastMsgSenderId !== currentUser?.id && !seenConvIds.has(c.id)
    )
    unreadStore.set(anyUnread)
  }, [convs, currentUser, seenConvIds])

  async function loadConvs(userId: string) {
    setLoading(true)
    const { data: convData } = await supabase
      .from('conversations')
      .select('id, user_a, user_b, last_message_at')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)
      .order('last_message_at', { ascending: false })

    if (!convData || convData.length === 0) { setConvs([]); setLoading(false); return }

    const convIds = convData.map((c: any) => c.id)
    const otherIds = convData.map((c: any) => c.user_a === userId ? c.user_b : c.user_a)

    const [{ data: profiles }, { data: lastMsgs }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, avatar_url').in('id', otherIds),
      supabase.from('messages')
        .select('conversation_id, body, sender_id, request_id, created_at')
        .in('conversation_id', convIds)
        .order('created_at', { ascending: false }),
    ])

    const profileMap: Record<string, { full_name: string | null; avatar_url: string | null }> = {}
    profiles?.forEach((p: any) => { profileMap[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url } })

    const lastMsgMap: Record<string, { body: string | null; sender_id: string; request_id: string | null }> = {}
    const hasRequestMap: Record<string, boolean> = {}
    lastMsgs?.forEach((m: any) => {
      if (!lastMsgMap[m.conversation_id]) {
        lastMsgMap[m.conversation_id] = { body: m.body, sender_id: m.sender_id, request_id: m.request_id }
      }
      if (m.request_id) hasRequestMap[m.conversation_id] = true
    })

    setConvs(convData.map((c: any) => {
      const otherId = c.user_a === userId ? c.user_b : c.user_a
      const last = lastMsgMap[c.id]
      const prof = profileMap[otherId]
      return {
        id: c.id,
        user_a: c.user_a,
        user_b: c.user_b,
        last_message_at: c.last_message_at,
        other: { id: otherId, full_name: prof?.full_name ?? null, avatar_url: prof?.avatar_url ?? null } as OtherUser,
        lastMsgBody: last?.body ?? null,
        lastMsgSenderId: last?.sender_id ?? null,
        lastMsgIsRequest: !!last?.request_id,
        hasRequest: !!hasRequestMap[c.id],
      }
    }))
    setLoading(false)
  }

  async function openConv(conv: ConvRow) {
    setSelected(conv)
    setSeenConvIds(prev => new Set([...prev, conv.id]))
    setMessages([])
    const { data: msgData } = await supabase
      .from('messages')
      .select(`
        id, conversation_id, sender_id, body, photo_url, request_id, created_at,
        request:stay_requests!request_id(
          id, arrival_date, departure_date, arrival_time,
          guests_count, guest_vehicle, status, photo_url, host_id, guest_id, location_id
        )
      `)
      .eq('conversation_id', conv.id)
      .order('created_at', { ascending: true })

    if (!msgData || msgData.length === 0) { setMessages([]); subscribeToConv(conv.id); return }

    const senderIds = [...new Set(msgData.map((m: any) => m.sender_id))]
    const { data: senderProfiles } = await supabase
      .from('profiles').select('id, full_name').in('id', senderIds)
    const senderMap: Record<string, string | null> = {}
    senderProfiles?.forEach((p: any) => { senderMap[p.id] = p.full_name })

    const normalized = msgData.map((m: any) => normalizeMsg({ ...m, sender: { full_name: senderMap[m.sender_id] ?? null } }))
    setMessages(normalized)

    // Fetch my existing review for this stay
    const acceptedReq = normalized.find(m => m.request?.status === 'ACCEPTED')?.request
    setMyReview(null); setReviewStars(0); setReviewBody('')
    if (acceptedReq && currentUser) {
      const { data: rev } = await supabase
        .from('reviews')
        .select('rating, body')
        .eq('stay_request_id', acceptedReq.id)
        .eq('reviewer_id', currentUser.id)
        .maybeSingle()
      if (rev) { setMyReview({ rating: rev.rating, body: rev.body ?? '' }); setReviewStars(rev.rating) }
    }

    subscribeToConv(conv.id)
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 100)
  }

  async function submitReview() {
    const req = messages.find(m => m.request?.status === 'ACCEPTED')?.request
    if (!req || !currentUser || !reviewStars) return
    const revieweeId = currentUser.id === req.host_id ? req.guest_id : req.host_id
    setSubmittingReview(true)
    const { error } = await supabase.from('reviews').insert({
      stay_request_id: req.id,
      reviewer_id: currentUser.id,
      reviewee_id: revieweeId,
      rating: reviewStars,
      body: reviewBody.trim() || null,
    })
    setSubmittingReview(false)
    if (!error) setMyReview({ rating: reviewStars, body: reviewBody })
  }

  function normalizeMsg(m: any): MsgRow {
    return {
      id: m.id,
      conversation_id: m.conversation_id,
      sender_id: m.sender_id,
      sender_name: m.sender?.full_name ?? null,
      body: m.body,
      photo_url: m.photo_url,
      request_id: m.request_id,
      request: Array.isArray(m.request) ? (m.request[0] ?? null) : (m.request ?? null),
      created_at: m.created_at,
    }
  }

  function subscribeToConv(convId: string) {
    if (channelRef.current) supabase.removeChannel(channelRef.current)
    channelRef.current = supabase
      .channel(`conv:${convId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `conversation_id=eq.${convId}`,
      }, async (payload) => {
        const { data } = await supabase
          .from('messages')
          .select(`
            id, conversation_id, sender_id, body, photo_url, request_id, created_at,
            request:stay_requests!request_id(
              id, arrival_date, departure_date, arrival_time,
              guests_count, guest_vehicle, status, photo_url, host_id, guest_id, location_id
            )
          `)
          .eq('id', payload.new.id)
          .single()
        if (!data) return
        const { data: sp } = await supabase.from('profiles').select('full_name').eq('id', data.sender_id).single()
        setMessages(prev => {
          if (prev.find(m => m.id === data.id)) return prev
          return [...prev, normalizeMsg({ ...data, sender: { full_name: sp?.full_name ?? null } })]
        })
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100)
      })
      .subscribe()
  }

  useEffect(() => {
    return () => { if (channelRef.current) supabase.removeChannel(channelRef.current) }
  }, [])

  async function sendMessage() {
    if (!text.trim() || !selected || !currentUser) return
    setSending(true)
    const body = text.trim()
    setText('')
    await supabase.from('messages').insert({
      conversation_id: selected.id,
      sender_id: currentUser.id,
      body,
    })
    await supabase
      .from('conversations')
      .update({ last_message_at: new Date().toISOString() })
      .eq('id', selected.id)
    setSending(false)
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100)
  }

  async function sendCoordinates(req: RequestData) {
    if (!selected || !currentUser || currentUser.id !== req.host_id) return
    setSendingCoordsFor(req.id)

    let loc: any = null
    if (req.location_id) {
      const { data } = await supabase
        .from('host_locations')
        .select('location_lat, location_lng, location_city, location_country')
        .eq('id', req.location_id)
        .eq('user_id', req.host_id)
        .maybeSingle()
      loc = data
    }
    if (!loc) {
      const { data } = await supabase
        .from('host_locations')
        .select('location_lat, location_lng, location_city, location_country')
        .eq('user_id', req.host_id)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
      loc = data
    }

    if (loc?.location_lat && loc?.location_lng) {
      const coords = `${Number(loc.location_lat).toFixed(6)}, ${Number(loc.location_lng).toFixed(6)}`
      const place = [loc.location_city, loc.location_country].filter(Boolean).join(', ')
      const body = [
        'Exact meeting point:',
        coords,
        Platform.OS === 'web' ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(coords)}` : null,
        place || null,
      ].filter(Boolean).join('\n')

      await supabase.from('messages').insert({
        conversation_id: selected.id,
        sender_id: currentUser.id,
        body,
      })
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', selected.id)
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100)
    }

    setSendingCoordsFor(null)
  }

  async function respondToRequest(requestId: string, status: 'ACCEPTED' | 'REJECTED') {
    await supabase.from('stay_requests').update({ status }).eq('id', requestId)
    supabase.functions.invoke('notify-request', {
      body: { request_id: requestId, event: status === 'ACCEPTED' ? 'accepted' : 'rejected' },
    }).catch(() => {})

    // Auto-message in chat
    if (selected && currentUser) {
      const autoBody = status === 'ACCEPTED'
        ? "Accepted. I'll send the exact meeting point here when we're set."
        : "Unfortunately it won't work this time. Have a great ride! 🤞"
      await supabase.from('messages').insert({
        conversation_id: selected.id,
        sender_id: currentUser.id,
        body: autoBody,
      })
      await supabase
        .from('conversations')
        .update({ last_message_at: new Date().toISOString() })
        .eq('id', selected.id)
    }

    setMessages(prev => prev.map(m =>
      m.request?.id === requestId
        ? { ...m, request: { ...m.request!, status } }
        : m
    ))
  }

  // ── Chat view ────────────────────────────────────────────────────────────

  if (selected) {
    const otherName = selected.other.full_name || 'Rider'
    return (
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => {
            setSelected(null)
            setMyReview(null); setReviewStars(0); setReviewBody('')
            if (channelRef.current) supabase.removeChannel(channelRef.current)
          }}>
            <Text style={styles.back}>←</Text>
          </TouchableOpacity>
          <View style={styles.chatAvatar}>
            <Text style={styles.chatAvatarText}>{otherName.charAt(0).toUpperCase()}</Text>
          </View>
          <Text style={styles.chatName}>{otherName}</Text>
        </View>

        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={m => m.id}
          contentContainerStyle={styles.msgList}
          onLayout={() => flatRef.current?.scrollToEnd({ animated: false })}
          ListFooterComponent={(() => {
            const acceptedReq = messages.find(m => m.request?.status === 'ACCEPTED')?.request
            if (!acceptedReq) return null
            if (myReview) return (
              <View style={styles.reviewDone}>
                <Text style={styles.reviewDoneText}>
                  {'⭐'.repeat(myReview.rating)}{'☆'.repeat(5 - myReview.rating)}{'  '}Your review submitted
                </Text>
              </View>
            )
            return (
              <View style={styles.reviewCard}>
                <Text style={styles.reviewTitle}>⭐ RATE THIS STAY</Text>
                <View style={styles.reviewStars}>
                  {[1,2,3,4,5].map(n => (
                    <TouchableOpacity key={n} onPress={() => setReviewStars(n)} hitSlop={8}>
                      <Text style={[styles.reviewStar, n <= reviewStars && styles.reviewStarActive]}>★</Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <TextInput
                  style={styles.reviewInput}
                  placeholder="Say something... (optional)"
                  placeholderTextColor={C.placeholder}
                  value={reviewBody}
                  onChangeText={setReviewBody}
                  multiline
                />
                <TouchableOpacity
                  style={[styles.reviewSubmit, (!reviewStars || submittingReview) && styles.reviewSubmitDisabled]}
                  onPress={submitReview}
                  disabled={!reviewStars || submittingReview}
                >
                  <Text style={styles.reviewSubmitText}>{submittingReview ? 'Submitting...' : 'SUBMIT REVIEW'}</Text>
                </TouchableOpacity>
              </View>
            )
          })()}
          renderItem={({ item: m }) => {
            const isMine = m.sender_id === currentUser?.id
            const isHost = m.request ? currentUser?.id === m.request.host_id : false
            const navCoords = extractCoords(m.body)

            if (m.request_id && m.request) {
              return (
                <View style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}>
                  <RequestCard
                    req={m.request}
                    body={m.body}
                    isHost={isHost}
                    onRespond={respondToRequest}
                    onSendCoordinates={sendCoordinates}
                    sendingCoordinates={sendingCoordsFor === m.request.id}
                  />
                </View>
              )
            }

            return (
              <View style={[styles.msgRow, isMine ? styles.msgRowRight : styles.msgRowLeft]}>
                <View style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleOther]}>
                  {m.body ? <Text selectable style={[styles.bubbleText, isMine && styles.bubbleTextMine]}>{m.body}</Text> : null}
                  {navCoords ? (
                    <TouchableOpacity
                      style={[styles.navAction, isMine && styles.navActionMine]}
                      onPress={() => openNavigation(navCoords.lat, navCoords.lng)}
                    >
                      <Text style={[styles.navActionText, isMine && styles.navActionTextMine]}>Open navigation</Text>
                    </TouchableOpacity>
                  ) : null}
                  {m.photo_url ? (
                    <Image source={{ uri: m.photo_url }} style={styles.bubblePhoto} resizeMode="cover" />
                  ) : null}
                  <Text style={[styles.bubbleTime, isMine && styles.bubbleTimeMine]}>{fmtTime(m.created_at)}</Text>
                </View>
              </View>
            )
          }}
        />

        <View style={styles.inputRow}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Type a message..."
            placeholderTextColor={C.textDim}
            multiline
            onSubmitEditing={Platform.OS === 'web' ? sendMessage : undefined}
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!text.trim() || sending) && styles.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!text.trim() || sending}
          >
            <Text style={styles.sendBtnText}>→</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    )
  }

  // ── Conversations list ────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      <AppHeader right={<UserChip />} />


      {loading ? (
        <View style={styles.center}>
          <Text style={{ color: C.textDim, fontSize: 14 }}>Loading...</Text>
        </View>
      ) : convs.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🏕️</Text>
          <Text style={styles.emptyTitle}>Safe night for your bike and you.</Text>
          <Text style={styles.emptyText}>From riders to riders.{'\n\n'}Find a host on the map and send them a request — the chat opens automatically.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.convList}>
          {convs
            .map(conv => {
              const name = conv.other.full_name || 'Rider'
              const isUnread = !!conv.lastMsgSenderId
                && conv.lastMsgSenderId !== currentUser?.id
                && !seenConvIds.has(conv.id)
              const preview = conv.lastMsgIsRequest
                ? '🤞 Stay request'
                : (conv.lastMsgBody ?? '')
              return (
                <TouchableOpacity
                  key={conv.id}
                  style={styles.convRow}
                  onPress={() => openConv(conv)}
                >
                  <View style={styles.convCard}>
                    <View style={styles.convAvatarWrap}>
                      {conv.other.avatar_url ? (
                        <Image source={{ uri: conv.other.avatar_url }} style={styles.convAvatarImg} />
                      ) : (
                        <View style={styles.convAvatar}>
                          <Text style={styles.convAvatarText}>{name.charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                      {isUnread && <View style={styles.unreadDot} />}
                    </View>
                    <View style={styles.convInfo}>
                      <View style={styles.convTopRow}>
                        <Text style={[styles.convName, isUnread && styles.convNameUnread]}>{name}</Text>
                        <Text style={styles.convTime}>{fmtDate(conv.last_message_at)}</Text>
                      </View>
                      {preview ? (
                        <Text style={[styles.convPreview, isUnread && styles.convPreviewUnread]} numberOfLines={1}>
                          {preview}
                        </Text>
                      ) : null}
                    </View>
                    {conv.hasRequest && (
                      <View style={styles.convStatusBadge}>
                        <Text style={styles.convStatusText}>Pending</Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              )
            })}
        </ScrollView>
      )}
    </View>
  )
}

// ── Styles ────────────────────────────────────────────────────────────────

function makeStyles(C: ThemeColors) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 46, paddingBottom: 14,
    backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.border,
  },
  title: { color: C.text, fontSize: 24, fontWeight: '900', letterSpacing: 1, flex: 1 },
  titleAccent: { color: C.accent },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 12,
    gap: 8,
    backgroundColor: C.surface,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  tabBarBtn: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: C.border,
  },
  tabBarBtnActive: { backgroundColor: C.accent, borderColor: C.accent },
  tabBarBtnText: { color: C.textDim, fontSize: 13, fontWeight: '600' },
  tabBarBtnTextActive: { color: C.white, fontWeight: '700' },
  back: { color: C.accent, fontSize: 24, fontWeight: '700', paddingRight: 4 },
  chatAvatar: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: C.border,
  },
  chatAvatarText: { color: C.accent, fontWeight: '800', fontSize: 15 },
  chatName: { color: C.text, fontSize: 16, fontWeight: '700', flex: 1 },

  // Messages
  msgList: { padding: 16, gap: 8, paddingBottom: 8 },
  msgRow: { flexDirection: 'row' },
  msgRowLeft: { justifyContent: 'flex-start' },
  msgRowRight: { justifyContent: 'flex-end' },
  bubble: {
    maxWidth: '78%', borderRadius: 20, padding: 12,
    backgroundColor: C.surface, gap: 4,
  },
  bubbleMine: { backgroundColor: C.accent },
  bubbleOther: { backgroundColor: C.surface },
  bubbleText: { color: C.text, fontSize: 14, lineHeight: 21 },
  bubbleTextMine: { color: C.white },
  navAction: {
    alignSelf: 'flex-start',
    marginTop: 6,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: C.accent,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: C.accentSoft,
  },
  navActionMine: {
    borderColor: 'rgba(255,255,255,0.55)',
    backgroundColor: 'rgba(255,255,255,0.14)',
  },
  navActionText: { color: C.accent, fontSize: 12, fontWeight: '800' },
  navActionTextMine: { color: C.white },
  bubblePhoto: { width: 220, height: 160, borderRadius: 14 },
  bubbleTime: { color: C.textDim, fontSize: 10, alignSelf: 'flex-end' },
  bubbleTimeMine: { color: 'rgba(255,255,255,0.55)' },

  // Input
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, paddingHorizontal: 16,
    backgroundColor: C.surface,
    borderTopWidth: 1, borderTopColor: C.border,
  },
  input: {
    flex: 1, backgroundColor: C.elevated, borderRadius: 100,
    paddingHorizontal: 18, paddingVertical: 12,
    color: C.text, fontSize: 14, maxHeight: 120,
  },
  sendBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: C.border },
  sendBtnText: { color: C.white, fontSize: 20, fontWeight: '700' },

  // Conversation list
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  emptyEmoji: { fontSize: 52, marginBottom: 16 },
  emptyTitle: { color: C.text, fontSize: 18, fontWeight: '800', marginBottom: 8, textAlign: 'center' },
  emptyText: { color: C.textDim, fontSize: 13, textAlign: 'center', lineHeight: 21 },
  convList: {
    width: '100%',
    maxWidth: 920,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
    gap: 12,
  },
  convRow: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 0, paddingVertical: 0,
  },
  convCard: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.surface, borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 15,
    borderWidth: 1, borderColor: C.border,
  },
  convAvatarWrap: { position: 'relative' },
  convAvatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center',
  },
  convAvatarImg: {
    width: 48, height: 48, borderRadius: 24,
  },
  convAvatarText: { color: C.accent, fontWeight: '800', fontSize: 17 },
  unreadDot: {
    position: 'absolute', top: 0, right: 0,
    width: 12, height: 12, borderRadius: 6,
    backgroundColor: C.accent, borderWidth: 2, borderColor: C.bg,
  },
  convInfo: { flex: 1, gap: 3 },
  convTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  convName: { color: C.text, fontWeight: '600', fontSize: 15 },
  convNameUnread: { fontWeight: '800' },
  convTime: { color: C.textDim, fontSize: 12 },
  convPreview: { color: C.textDim, fontSize: 13, lineHeight: 18 },
  convPreviewUnread: { color: C.textMuted, fontWeight: '600' },
  convStatusBadge: {
    borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4,
    backgroundColor: C.accent,
  },
  convStatusText: { color: C.white, fontSize: 11, fontWeight: '700' },

  reviewCard: {
    backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.buddyBorder,
    padding: 16, gap: 12, marginTop: 16,
  },
  reviewTitle: { color: C.buddy, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  reviewStars: { flexDirection: 'row', gap: 8 },
  reviewStar: { fontSize: 32, color: C.border },
  reviewStarActive: { color: C.buddy },
  reviewInput: {
    backgroundColor: C.elevated, borderRadius: 14, padding: 12,
    color: C.text, fontSize: 14, minHeight: 60,
    borderWidth: 1, borderColor: C.border,
  },
  reviewSubmit: {
    backgroundColor: C.buddy, borderRadius: 100, padding: 13, alignItems: 'center',
  },
  reviewSubmitDisabled: { backgroundColor: C.elevated },
  reviewSubmitText: { color: C.white, fontWeight: '700', fontSize: 13, letterSpacing: 1 },
  reviewDone: {
    backgroundColor: C.buddySoft, borderRadius: 14, borderWidth: 1, borderColor: C.buddyBorder,
    padding: 12, alignItems: 'center', marginTop: 16,
  },
  reviewDoneText: { color: C.buddy, fontSize: 13, fontWeight: '600' },
}) }
