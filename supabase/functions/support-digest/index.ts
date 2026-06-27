import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Weekly digest of who tapped "Support twowheelcome" in the last 7 days, emailed to
// the developer inbox. If nobody clicked, it sends nothing. Triggered by pg_cron with
// the x-cron-secret header (same pattern as notify-review).
const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const CRON_SECRET = Deno.env.get('CRON_SECRET')!
const FROM = 'TWOWHEELCOME <noreply@twowheelcome.com>'
const DEV_EMAIL = 'privacy@twowheelcome.com'

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

Deno.serve(async (req) => {
  const secret = req.headers.get('x-cron-secret')
  if (!CRON_SECRET || secret !== CRON_SECRET) {
    return new Response('Unauthorized', { status: 401 })
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

  const since = new Date()
  since.setDate(since.getDate() - 7)

  const { data: clicks, error } = await admin
    .from('support_clicks')
    .select('user_id, created_at')
    .gte('created_at', since.toISOString())
    .order('created_at', { ascending: false })

  if (error) {
    console.error('support_clicks query error:', error)
    return new Response('DB error', { status: 500 })
  }
  // Nobody clicked → send nothing.
  if (!clicks?.length) return new Response('OK - no support clicks this week', { status: 200 })

  // Aggregate per user: count + latest click.
  const byUser: Record<string, { count: number; last: string }> = {}
  for (const c of clicks) {
    const u = c.user_id as string
    if (!byUser[u]) byUser[u] = { count: 0, last: c.created_at as string }
    byUser[u].count += 1
    if (new Date(c.created_at as string) > new Date(byUser[u].last)) byUser[u].last = c.created_at as string
  }
  const userIds = Object.keys(byUser)

  const [{ data: profiles }, emailEntries] = await Promise.all([
    admin.from('profiles').select('id, full_name').in('id', userIds),
    Promise.all(userIds.map(async (uid) => {
      const { data } = await admin.auth.admin.getUserById(uid)
      return [uid, data?.user?.email ?? ''] as const
    })),
  ])
  const nameMap = Object.fromEntries((profiles ?? []).map((p) => [p.id, p.full_name]))
  const emailMap = Object.fromEntries(emailEntries)

  const rows = userIds
    .sort((a, b) => byUser[b].count - byUser[a].count)
    .map((uid) => {
      const name = escapeHtml(nameMap[uid] || 'Rider')
      const email = escapeHtml(emailMap[uid] || '—')
      const last = new Date(byUser[uid].last).toISOString().split('T')[0]
      return `<tr><td style="padding:6px 12px;border-bottom:1px solid #eee">${name}</td>`
        + `<td style="padding:6px 12px;border-bottom:1px solid #eee;color:#666">${email}</td>`
        + `<td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center">${byUser[uid].count}</td>`
        + `<td style="padding:6px 12px;border-bottom:1px solid #eee;color:#666">${last}</td></tr>`
    })
    .join('')

  const html = `<div style="font-family:sans-serif;max-width:640px">
    <h2 style="color:#D9621F">🍺 Support interest — last 7 days</h2>
    <p style="color:#666">${userIds.length} ${userIds.length === 1 ? 'person' : 'people'} · ${clicks.length} ${clicks.length === 1 ? 'click' : 'clicks'} total.</p>
    <table style="border-collapse:collapse;width:100%;font-size:14px">
      <thead><tr>
        <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #ddd">Name</th>
        <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #ddd">Email</th>
        <th style="padding:6px 12px;border-bottom:2px solid #ddd">Clicks</th>
        <th style="text-align:left;padding:6px 12px;border-bottom:2px solid #ddd">Last</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({ from: FROM, to: DEV_EMAIL, subject: `🍺 Support interest — ${userIds.length} this week`, html }),
  })
  if (!res.ok) {
    console.error('support digest email error:', res.status, await res.text())
    return new Response('Email error', { status: 500 })
  }
  console.log(`support digest emailed: ${userIds.length} users, ${clicks.length} clicks`)
  return new Response('OK', { status: 200 })
})
