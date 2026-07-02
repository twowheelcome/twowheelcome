// Standalone, ISOLATED web-push sender — deliberately NOT wired into notify-request /
// notify-review yet, so the live Expo push path is untouched. An authenticated user calls this
// to send a test web push to THEIR OWN subscriptions only (no fan-out to others = no abuse).
// Once delivery is verified on a device, the same send logic can be folded into the notify
// functions (fail-safe / try-catch) so web push goes out alongside Expo push.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import webpush from 'npm:web-push@3.6.7'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:petr.manych@gmail.com'

const ALLOWED_ORIGINS = new Set([
  'https://twowheelcome.com',
  'https://www.twowheelcome.com',
  'https://twowheelcome.vercel.app',
  'http://localhost:8081',
  'http://localhost:19006',
  'http://localhost:3000',
])

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get('Origin') ?? ''
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://www.twowheelcome.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function getBearerToken(req: Request): string | null {
  const m = (req.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/i)
  return m?.[1] ?? null
}

Deno.serve(async (req) => {
  const CORS = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    return new Response('VAPID keys not configured', { status: 500, headers: CORS })
  }

  const token = getBearerToken(req)
  if (!token) return new Response('Unauthorized', { status: 401, headers: CORS })

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })
  const { data: authData, error: authError } = await admin.auth.getUser(token)
  const caller = authData.user
  if (authError || !caller) return new Response('Unauthorized', { status: 401, headers: CORS })

  // Only the caller's own subscriptions — this is a self-test, never a fan-out.
  const { data: subs } = await admin
    .from('web_push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', caller.id)

  if (!subs?.length) return new Response(JSON.stringify({ sent: 0, note: 'no subscriptions' }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })

  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
  const payload = JSON.stringify({ title: 'twowheelcome', body: 'Web push works 🎉', url: '/' })

  let sent = 0, removed = 0
  for (const s of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
        payload,
      )
      sent++
    } catch (e) {
      const status = (e as { statusCode?: number })?.statusCode
      if (status === 404 || status === 410) {
        // Endpoint gone — clean up the dead subscription.
        await admin.from('web_push_subscriptions').delete().eq('endpoint', s.endpoint)
        removed++
      } else {
        console.error('web push send error:', status, (e as Error)?.message)
      }
    }
  }

  return new Response(JSON.stringify({ sent, removed }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })
})
