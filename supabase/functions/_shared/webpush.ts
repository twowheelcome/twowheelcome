import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Fail-safe web push. Sends a PWA web push to a user's subscriptions ALONGSIDE the existing
// Expo push. It NEVER throws — every failure (missing VAPID env, import error, send error) is
// caught and logged, so the Expo path and the rest of the notify function are never affected.
// Dead subscriptions (404/410) are cleaned up. `url` is a WEB path (e.g. "/requests?...").
export async function sendWebPushToUser(
  admin: SupabaseClient,
  userId: string,
  msg: { title: string; body: string; url?: string },
): Promise<void> {
  try {
    const pub = Deno.env.get('VAPID_PUBLIC_KEY') ?? ''
    const priv = Deno.env.get('VAPID_PRIVATE_KEY') ?? ''
    const subject = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:petr.manych@gmail.com'
    if (!pub || !priv) return

    const { data: subs } = await admin
      .from('web_push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId)
    if (!subs?.length) return

    // Dynamic import so a module-load failure is caught here (can't break function boot).
    const webpush = (await import('npm:web-push@3.6.7')).default
    webpush.setVapidDetails(subject, pub, priv)
    const payload = JSON.stringify({ title: msg.title, body: msg.body, url: msg.url || '/' })

    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload)
      } catch (e) {
        const status = (e as { statusCode?: number })?.statusCode
        if (status === 404 || status === 410) {
          await admin.from('web_push_subscriptions').delete().eq('endpoint', s.endpoint)
        } else {
          console.error('web push send error (non-fatal):', status, (e as Error)?.message)
        }
      }
    }
  } catch (e) {
    console.error('web push (non-fatal):', (e as Error)?.message)
  }
}
