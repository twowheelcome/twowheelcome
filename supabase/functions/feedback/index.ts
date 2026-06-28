import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
const FROM = 'TWOWHEELCOME <noreply@twowheelcome.com>'
const DEV_EMAIL = 'privacy@twowheelcome.com'

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

const CATEGORIES = new Set(['bug', 'idea', 'other'])
const MAX_FEEDBACK_PER_HOUR = 5

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

  let body: { category?: string; message?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400, headers: CORS })
  }

  const category = CATEGORIES.has(String(body.category)) ? String(body.category) : 'other'
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 4000) : ''
  if (!message) return new Response('Empty feedback', { status: 400, headers: CORS })

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

  // Rate limit: at most MAX_FEEDBACK_PER_HOUR per user per rolling hour (anti-spam / cost).
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const { count: recentCount } = await admin
    .from('feedback')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', since)
  if ((recentCount ?? 0) >= MAX_FEEDBACK_PER_HOUR) {
    return new Response(JSON.stringify({ error: 'Too much feedback in a short time. Please try again later.' }), { status: 429, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  const { error: insertErr } = await admin.from('feedback').insert({
    user_id: user.id,
    category,
    message,
  })
  if (insertErr) {
    console.error('feedback insert error:', insertErr)
    return new Response(JSON.stringify({ error: 'Could not save feedback' }), { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } })
  }

  // Email the developer inbox. Non-fatal if it fails — the feedback is already stored —
  // but surface the Resend status so a silent failure is visible.
  let emailed = false
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: FROM,
        to: DEV_EMAIL,
        reply_to: user.email,
        subject: `💬 Feedback (${category}) — TWOWHEELCOME`,
        html: `<div style="font-family:sans-serif;max-width:560px">
          <h2>New feedback · ${escapeHtml(category)}</h2>
          <p style="color:#666">From ${escapeHtml(user.email)} (${escapeHtml(user.id)})</p>
          <blockquote style="border-left:3px solid #D9621F;padding:8px 16px;color:#333;white-space:pre-wrap">${escapeHtml(message)}</blockquote>
        </div>`,
      }),
    })
    emailed = res.ok
    if (!res.ok) console.error('feedback email non-2xx:', res.status, await res.text())
  } catch (e) {
    console.error('feedback email error:', e)
  }

  return new Response(JSON.stringify({ ok: true, emailed }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })
})
