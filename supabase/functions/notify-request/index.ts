import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { sendWebPushToUser } from '../_shared/webpush.ts'

const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM = 'TWOWHEELCOME <noreply@twowheelcome.com>'
const APP_URL = 'https://twowheelcome.com'
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

const ALLOWED_ORIGINS = new Set([
  'https://twowheelcome.com',
  'https://www.twowheelcome.com',
  'https://twowheelcome.vercel.app',
  'https://twowheelcome-twowheelcome-7088s-projects.vercel.app',
  'https://twowheelcome-git-main-twowheelcome-7088s-projects.vercel.app',
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:3000',
])

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  return {
    // Reflect a known origin; a disallowed browser origin gets a mismatch and is blocked.
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://www.twowheelcome.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1] ?? null
}

// Canonical app date format: YYYY-MM-DD → DD.MM.YY (matches fmtDateStr in the app).
function fmtStayDate(s: string): string {
  const [y, m, d] = (s || '').split('-')
  return y && m && d ? `${d}.${m}.${y.slice(2)}` : s
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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

Deno.serve(async req => {
  const CORS = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  let body: { request_id?: string; event?: 'new_request' | 'accepted' | 'rejected' | 'cancelled_by_host' }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS })
  }

  const { request_id, event } = body
  if (!request_id || !event || !['new_request', 'accepted', 'rejected', 'cancelled_by_host'].includes(event)) {
    return new Response('Invalid request', { status: 400, headers: CORS })
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
  const token = getBearerToken(req)
  if (!token) return new Response('Unauthorized', { status: 401, headers: CORS })

  const { data: authData, error: authError } = await admin.auth.getUser(token)
  const caller = authData.user
  if (authError || !caller) return new Response('Unauthorized', { status: 401, headers: CORS })

  const { data: request } = await admin
    .from('stay_requests')
    .select('*')
    .eq('id', request_id)
    .single()

  if (!request) return new Response('Not found', { status: 404, headers: CORS })

  const expectedStatus =
    event === 'accepted' ? 'ACCEPTED'
    : event === 'rejected' ? 'REJECTED'
    : event === 'cancelled_by_host' ? 'CANCELLED'
    : 'PENDING'
  const callerCanNotify =
    (event === 'new_request' && caller.id === request.guest_id) ||
    ((event === 'accepted' || event === 'rejected' || event === 'cancelled_by_host') && caller.id === request.host_id)

  if (!callerCanNotify) return new Response('Forbidden', { status: 403, headers: CORS })
  if (request.status !== expectedStatus) {
    return new Response('Request state does not match notification event', { status: 409, headers: CORS })
  }

  // Claim this one-shot event before sending. The unique key prevents retries
  // or a malicious caller from spamming the same notification repeatedly.
  const { error: eventError } = await admin
    .from('request_notification_events')
    .insert({ request_id, event })
  if (eventError?.code === '23505') {
    return new Response('Already sent', { status: 200, headers: CORS })
  }
  if (eventError) {
    console.error('Notification idempotency error:', eventError)
    return new Response('Could not reserve notification event', { status: 500, headers: CORS })
  }

  const [{ data: { user: host } }, { data: { user: guest } }] = await Promise.all([
    admin.auth.admin.getUserById(request.host_id),
    admin.auth.admin.getUserById(request.guest_id),
  ])

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, push_token, notify_email, notify_push')
    .in('id', [request.host_id, request.guest_id])

  const hostProfile  = profiles?.find(p => p.id === request.host_id)
  const guestProfile = profiles?.find(p => p.id === request.guest_id)
  // Respect each recipient's notification preferences (default on when unset).
  const hostWantsEmail  = hostProfile?.notify_email  !== false
  const hostWantsPush   = hostProfile?.notify_push   !== false
  const guestWantsEmail = guestProfile?.notify_email !== false
  const guestWantsPush  = guestProfile?.notify_push  !== false
  const hostName  = hostProfile?.full_name  || 'your host'
  const guestName = guestProfile?.full_name || 'A rider'
  const safeHostName = escapeHtml(hostName)
  const safeGuestName = escapeHtml(guestName)
  const safeMessage = escapeHtml(request.message)

  const dateInfo = escapeHtml(`${fmtStayDate(request.arrival_date)} → ${fmtStayDate(request.departure_date)}`)
  const conversationId = typeof request.conversation_id === 'string' ? request.conversation_id : ''
  const webChatUrl = conversationId
    ? `${APP_URL}/requests?openConv=${encodeURIComponent(conversationId)}`
    : `${APP_URL}/requests`
  const pushChatUrl = conversationId
    ? `/(tabs)/requests?openConv=${encodeURIComponent(conversationId)}`
    : '/(tabs)/requests'
  // Web push opens a web route (relative → stays inside the installed PWA).
  const webPushUrl = conversationId
    ? `/requests?openConv=${encodeURIComponent(conversationId)}`
    : '/requests'
  // Dates in push bodies use the app's canonical DD.MM.YY (both Expo + web push).
  const stayRange = `${fmtStayDate(request.arrival_date)} → ${fmtStayDate(request.departure_date)}`

  if (event === 'new_request') {
    await Promise.all([
      host?.email && hostWantsEmail ? sendEmail(
        host.email,
        `🚪 Someone's knocking! — TWOWHEELCOME`,
        `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#eee;padding:32px;border-radius:12px">
          <h2 style="color:#C47050;margin:0 0 16px">🚪 Someone's knocking!</h2>
          <p><strong>${safeGuestName}</strong> sent you a stay request.</p>
          <p style="color:#aaa">🗓 ${dateInfo}<br>👥 Riders: ${request.guests_count}</p>
          ${request.message ? `<blockquote style="border-left:3px solid #C47050;margin:16px 0;padding:8px 16px;color:#ccc">"${safeMessage}"</blockquote>` : ''}
          <a href="${webChatUrl}" style="display:inline-block;margin-top:16px;background:#C47050;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Open messages →</a>
        </div>`
      ) : Promise.resolve(),
      hostProfile?.push_token && hostWantsPush ? sendPush(
        hostProfile.push_token,
        '🚪 Someone\'s knocking!',
        `${guestName} wants to stay — ${stayRange}`,
        pushChatUrl,
      ) : Promise.resolve(),
      hostWantsPush ? sendWebPushToUser(admin, request.host_id, {
        title: '🚪 Someone\'s knocking!',
        body: `${guestName} wants to stay — ${stayRange}`,
        url: webPushUrl,
      }) : Promise.resolve(),
    ])
  }

  if (event === 'accepted') {
    await Promise.all([
      guest?.email && guestWantsEmail ? sendEmail(
        guest.email,
        `✅ Request accepted — TWOWHEELCOME`,
        `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#eee;padding:32px;border-radius:12px">
          <h2 style="color:#76C085;margin:0 0 16px">Request accepted</h2>
          <p><strong>${safeHostName}</strong> accepted your request.</p>
          <p style="color:#aaa">🗓 ${dateInfo}</p>
          <p>Check the chat. The host will send the exact meeting point when you are set.</p>
          <a href="${webChatUrl}" style="display:inline-block;margin-top:16px;background:#76C085;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Open messages →</a>
        </div>`
      ) : Promise.resolve(),
      guestProfile?.push_token && guestWantsPush ? sendPush(
        guestProfile.push_token,
        'Request accepted',
        `${hostName} accepted. Exact spot comes in chat.`,
        pushChatUrl,
      ) : Promise.resolve(),
      guestWantsPush ? sendWebPushToUser(admin, request.guest_id, {
        title: 'Request accepted',
        body: `${hostName} accepted. Exact spot comes in chat.`,
        url: webPushUrl,
      }) : Promise.resolve(),
    ])
  }

  if (event === 'rejected') {
    await Promise.all([
      guest?.email && guestWantsEmail ? sendEmail(
        guest.email,
        `Knock declined — TWOWHEELCOME`,
        `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#eee;padding:32px;border-radius:12px">
          <h2 style="margin:0 0 16px">No luck this time 🤙</h2>
          <p><strong>${safeHostName}</strong> can't host right now. Find another host on the map.</p>
          <a href="${webChatUrl}" style="display:inline-block;margin-top:16px;background:#C47050;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Open messages →</a>
        </div>`
      ) : Promise.resolve(),
      guestProfile?.push_token && guestWantsPush ? sendPush(
        guestProfile.push_token,
        'No luck this time 🤙',
        `${hostName} can't host right now. Try another host on the map.`,
        pushChatUrl,
      ) : Promise.resolve(),
      guestWantsPush ? sendWebPushToUser(admin, request.guest_id, {
        title: 'No luck this time 🤙',
        body: `${hostName} can't host right now. Try another host on the map.`,
        url: webPushUrl,
      }) : Promise.resolve(),
    ])
  }

  if (event === 'cancelled_by_host') {
    await Promise.all([
      guest?.email && guestWantsEmail ? sendEmail(
        guest.email,
        `Your stay was cancelled — TWOWHEELCOME`,
        `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#eee;padding:32px;border-radius:12px">
          <h2 style="margin:0 0 16px">Your stay was cancelled</h2>
          <p><strong>${safeHostName}</strong> had to cancel your accepted stay.</p>
          <p style="color:#aaa">🗓 ${dateInfo}</p>
          <p>Sometimes life gets in the way. The dates are free again — find another host on the map for these nights.</p>
          <a href="${webChatUrl}" style="display:inline-block;margin-top:16px;background:#C47050;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Open messages →</a>
        </div>`
      ) : Promise.resolve(),
      guestProfile?.push_token && guestWantsPush ? sendPush(
        guestProfile.push_token,
        'Your stay was cancelled',
        `${hostName} had to cancel your stay — ${stayRange}`,
        pushChatUrl,
      ) : Promise.resolve(),
      guestWantsPush ? sendWebPushToUser(admin, request.guest_id, {
        title: 'Your stay was cancelled',
        body: `${hostName} had to cancel your stay — ${stayRange}`,
        url: webPushUrl,
      }) : Promise.resolve(),
    ])
  }

  return new Response('OK', { status: 200, headers: CORS })
})
