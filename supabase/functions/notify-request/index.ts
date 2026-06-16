import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM = 'TWOwheelCOME <noreply@twowheelcome.com>'
const APP_URL = 'https://twowheelcome.com'
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function getBearerToken(req: Request): string | null {
  const header = req.headers.get('Authorization') || ''
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1] ?? null
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
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  let body: { request_id?: string; event?: 'new_request' | 'accepted' | 'rejected' }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS })
  }

  const { request_id, event } = body
  if (!request_id || !event || !['new_request', 'accepted', 'rejected'].includes(event)) {
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

  const expectedStatus = event === 'accepted' ? 'ACCEPTED' : event === 'rejected' ? 'REJECTED' : 'PENDING'
  const callerCanNotify =
    (event === 'new_request' && caller.id === request.guest_id) ||
    ((event === 'accepted' || event === 'rejected') && caller.id === request.host_id)

  if (!callerCanNotify) return new Response('Forbidden', { status: 403, headers: CORS })
  if (request.status !== expectedStatus) {
    return new Response('Request state does not match notification event', { status: 409, headers: CORS })
  }

  const [{ data: { user: host } }, { data: { user: guest } }] = await Promise.all([
    admin.auth.admin.getUserById(request.host_id),
    admin.auth.admin.getUserById(request.guest_id),
  ])

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, push_token')
    .in('id', [request.host_id, request.guest_id])

  const hostProfile  = profiles?.find(p => p.id === request.host_id)
  const guestProfile = profiles?.find(p => p.id === request.guest_id)
  const hostName  = hostProfile?.full_name  || 'your host'
  const guestName = guestProfile?.full_name || 'A rider'
  const safeHostName = escapeHtml(hostName)
  const safeGuestName = escapeHtml(guestName)
  const safeMessage = escapeHtml(request.message)

  const dateInfo = escapeHtml(`${request.arrival_date}${request.arrival_time ? ' ~' + request.arrival_time : ''} → ${request.departure_date}`)
  const conversationId = typeof request.conversation_id === 'string' ? request.conversation_id : ''
  const webChatUrl = conversationId
    ? `${APP_URL}/requests?openConv=${encodeURIComponent(conversationId)}`
    : `${APP_URL}/requests`
  const pushChatUrl = conversationId
    ? `/(tabs)/requests?openConv=${encodeURIComponent(conversationId)}`
    : '/(tabs)/requests'

  if (event === 'new_request') {
    await Promise.all([
      host?.email ? sendEmail(
        host.email,
        `🚪 Someone's knocking! — TWOwheelCOME`,
        `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#eee;padding:32px;border-radius:12px">
          <h2 style="color:#C47050;margin:0 0 16px">🚪 Someone's knocking!</h2>
          <p><strong>${safeGuestName}</strong> sent you a stay request.</p>
          <p style="color:#aaa">🗓 ${dateInfo}<br>👥 Riders: ${request.guests_count}</p>
          ${request.message ? `<blockquote style="border-left:3px solid #C47050;margin:16px 0;padding:8px 16px;color:#ccc">"${safeMessage}"</blockquote>` : ''}
          <a href="${webChatUrl}" style="display:inline-block;margin-top:16px;background:#C47050;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Open messages →</a>
        </div>`
      ) : Promise.resolve(),
      hostProfile?.push_token ? sendPush(
        hostProfile.push_token,
        '🚪 Someone\'s knocking!',
        `${guestName} wants to stay — ${request.arrival_date}${request.arrival_time ? ' ~' + request.arrival_time : ''} → ${request.departure_date}`,
        pushChatUrl,
      ) : Promise.resolve(),
    ])
  }

  if (event === 'accepted') {
    await Promise.all([
      guest?.email ? sendEmail(
        guest.email,
        `✅ Request accepted — TWOwheelCOME`,
        `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#eee;padding:32px;border-radius:12px">
          <h2 style="color:#76C085;margin:0 0 16px">Request accepted</h2>
          <p><strong>${safeHostName}</strong> accepted your request.</p>
          <p style="color:#aaa">🗓 ${dateInfo}</p>
          <p>Check the chat. The host will send the exact meeting point when you are set.</p>
          <a href="${webChatUrl}" style="display:inline-block;margin-top:16px;background:#76C085;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Open messages →</a>
        </div>`
      ) : Promise.resolve(),
      guestProfile?.push_token ? sendPush(
        guestProfile.push_token,
        'Request accepted',
        `${hostName} accepted. Exact spot comes in chat.`,
        pushChatUrl,
      ) : Promise.resolve(),
    ])
  }

  if (event === 'rejected') {
    await Promise.all([
      guest?.email ? sendEmail(
        guest.email,
        `Knock declined — TWOwheelCOME`,
        `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#eee;padding:32px;border-radius:12px">
          <h2 style="margin:0 0 16px">No luck this time 🤙</h2>
          <p><strong>${safeHostName}</strong> can't host right now. Find another host on the map.</p>
          <a href="${webChatUrl}" style="display:inline-block;margin-top:16px;background:#C47050;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Open messages →</a>
        </div>`
      ) : Promise.resolve(),
      guestProfile?.push_token ? sendPush(
        guestProfile.push_token,
        'No luck this time 🤙',
        `${hostName} can't host right now. Try another host on the map.`,
        pushChatUrl,
      ) : Promise.resolve(),
    ])
  }

  return new Response('OK', { status: 200, headers: CORS })
})
