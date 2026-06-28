import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const FROM = 'TWOWHEELCOME <noreply@twowheelcome.com>'
const ADMIN_EMAIL = 'privacy@twowheelcome.com'

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
    'Access-Control-Allow-Origin': ALLOWED_ORIGINS.has(origin) ? origin : 'https://www.twowheelcome.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

const TARGET_TYPES = new Set(['user', 'listing', 'message', 'conversation'])
// All report targets reference a UUID primary key — validate the shape so an
// unbounded/garbage target_id can't bloat the row or the email.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_REPORTS_PER_DAY = 5

Deno.serve(async req => {
  const CORS = corsHeaders(req)
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401, headers: CORS })

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })
  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return new Response('Unauthorized', { status: 401, headers: CORS })

  let body: { target_type?: string; target_id?: string; reason?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS })
  }

  const targetType = String(body.target_type ?? '')
  const targetId = String(body.target_id ?? '')
  const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 2000) : ''
  if (!TARGET_TYPES.has(targetType) || !UUID_RE.test(targetId)) {
    return new Response('Invalid report', { status: 400, headers: CORS })
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

  // Rate limit: at most MAX_REPORTS_PER_DAY per reporter per rolling 24h (anti-spam / cost).
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const { count: recentCount } = await admin
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('reporter_id', user.id)
    .gte('created_at', since)
  if ((recentCount ?? 0) >= MAX_REPORTS_PER_DAY) {
    return new Response(JSON.stringify({ error: 'Too many reports today. Please try again later.' }), { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  const { error: insertErr } = await admin.from('reports').insert({
    reporter_id: user.id,
    target_type: targetType,
    target_id: targetId,
    reason: reason || null,
  })
  if (insertErr) {
    console.error('report insert error:', insertErr)
    return new Response(JSON.stringify({ error: 'Could not save report' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  // Notify the admin inbox (DSA point of contact). Non-fatal if the email fails — the
  // report is already stored — but surface the Resend status so a silent failure is visible.
  let emailed = false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: FROM,
        to: ADMIN_EMAIL,
        subject: `🚩 New report: ${targetType}`,
        html: `<div style="font-family:sans-serif;max-width:560px">
          <h2>New report</h2>
          <p><strong>Type:</strong> ${escapeHtml(targetType)}<br>
             <strong>Target id:</strong> ${escapeHtml(targetId)}<br>
             <strong>Reporter:</strong> ${escapeHtml(user.id)} (${escapeHtml(user.email)})</p>
          ${reason ? `<blockquote style="border-left:3px solid #D9621F;padding:8px 16px;color:#444">${escapeHtml(reason)}</blockquote>` : '<p style="color:#888">No reason text provided.</p>'}
        </div>`,
      }),
    })
    emailed = res.ok
    if (!res.ok) console.error('report email non-2xx:', res.status, await res.text())
  } catch (e) {
    console.error('report email error:', e)
  }

  return new Response(JSON.stringify({ ok: true, emailed }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })
})
