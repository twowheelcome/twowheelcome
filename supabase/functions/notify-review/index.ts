import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!
const FROM = 'TWOwheelCOME <noreply@twowheelcome.com>'
const APP_URL = 'https://twowheelcome.com'
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  })
  if (!res.ok) console.error('Resend error:', await res.text())
}

async function sendPush(token: string, title: string, body: string, url?: string) {
  if (!token?.startsWith('ExponentPushToken')) return
  const res = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ to: token, title, body, data: url ? { url } : {}, sound: 'default' }),
  })
  if (!res.ok) console.error('Expo push error:', await res.text())
}

function guestHtml(hostName: string, url: string): string {
  return '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#eee;padding:32px;border-radius:12px">'
    + '<h2 style="color:#C47050;margin:0 0 16px">&#11088; How was your stay?</h2>'
    + '<p>You stayed with <strong>' + hostName + '</strong> yesterday. Leave a quick review &mdash; it helps the community.</p>'
    + '<a href="' + url + '" style="display:inline-block;margin-top:16px;background:#C47050;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Leave a review &#8594;</a>'
    + '</div>'
}

function hostHtml(guestName: string, url: string): string {
  return '<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#eee;padding:32px;border-radius:12px">'
    + '<h2 style="color:#C47050;margin:0 0 16px">&#11088; How was your guest?</h2>'
    + '<p><strong>' + guestName + '</strong> stayed with you yesterday. A short review helps other hosts in the community.</p>'
    + '<a href="' + url + '" style="display:inline-block;margin-top:16px;background:#C47050;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Leave a review &#8594;</a>'
    + '</div>'
}

Deno.serve(async (req) => {
  const secret = req.headers.get('x-cron-secret')
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

  const yesterday = new Date()
  yesterday.setDate(yesterday.getDate() - 1)
  const yesterdayStr = yesterday.toISOString().split('T')[0]

  const { data: stays, error: staysError } = await admin
    .from('stay_requests')
    .select('id, guest_id, host_id, conversation_id')
    .eq('status', 'ACCEPTED')
    .eq('departure_date', yesterdayStr)

  if (staysError) {
    console.error('stays query error:', staysError)
    return new Response('DB error', { status: 500 })
  }
  if (!stays?.length) return new Response('OK - nothing to notify', { status: 200 })

  const stayIds = stays.map((s) => s.id)
  const userIds = [...new Set(stays.flatMap((s) => [s.guest_id, s.host_id]))]

  const [{ data: existingReviews }, { data: profiles }] = await Promise.all([
    admin.from('reviews').select('stay_request_id, reviewer_id').in('stay_request_id', stayIds),
    admin.from('profiles').select('id, full_name, push_token').in('id', userIds),
  ])

  const emailMap: Record<string, string> = {}
  await Promise.all(
    userIds.map(async (uid) => {
      const { data } = await admin.auth.admin.getUserById(uid)
      if (data?.user?.email) emailMap[uid] = data.user.email
    })
  )

  const profileMap = Object.fromEntries(profiles?.map((p) => [p.id, p]) ?? [])
  const reviewedSet = new Set(existingReviews?.map((r) => r.stay_request_id + ':' + r.reviewer_id) ?? [])

  const tasks: Promise<void>[] = []

  for (const stay of stays) {
    const guestProfile = profileMap[stay.guest_id]
    const hostProfile = profileMap[stay.host_id]
    const guestName = escapeHtml(guestProfile?.full_name || 'your guest')
    const hostName = escapeHtml(hostProfile?.full_name || 'your host')

    const webUrl = stay.conversation_id
      ? APP_URL + '/requests?openConv=' + encodeURIComponent(stay.conversation_id)
      : APP_URL + '/requests'
    const pushUrl = stay.conversation_id
      ? '/(tabs)/requests?openConv=' + encodeURIComponent(stay.conversation_id)
      : '/(tabs)/requests'

    if (!reviewedSet.has(stay.id + ':' + stay.guest_id)) {
      const email = emailMap[stay.guest_id]
      if (email) tasks.push(sendEmail(email, 'How was your stay? - TWOwheelCOME', guestHtml(hostName, webUrl)))
      if (guestProfile?.push_token) tasks.push(sendPush(guestProfile.push_token, 'How was your stay?', 'Leave a review for ' + (hostProfile?.full_name || 'your host'), pushUrl))
    }

    if (!reviewedSet.has(stay.id + ':' + stay.host_id)) {
      const email = emailMap[stay.host_id]
      if (email) tasks.push(sendEmail(email, 'How was your guest? - TWOwheelCOME', hostHtml(guestName, webUrl)))
      if (hostProfile?.push_token) tasks.push(sendPush(hostProfile.push_token, 'How was your guest?', 'Leave a review for ' + (guestProfile?.full_name || 'your guest'), pushUrl))
    }
  }

  await Promise.all(tasks)
  console.log('Notified for ' + stays.length + ' stays')
  return new Response('OK', { status: 200 })
})
