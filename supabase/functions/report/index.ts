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
  if (!TARGET_TYPES.has(targetType) || !targetId) {
    return new Response('Invalid report', { status: 400, headers: CORS })
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

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
  // report is already stored.
  try {
    await fetch('https://api.resend.com/emails', {
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
  } catch (e) {
    console.error('report email error:', e)
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })
})
