import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_KEY = Deno.env.get('RESEND_API_KEY')!
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const FROM = 'TWOwheelCOME <noreply@twowheelcome.com>'
const APP_URL = 'https://twowheelcome.com'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

async function sendEmail(to: string, subject: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${RESEND_KEY}` },
    body: JSON.stringify({ from: FROM, to, subject, html }),
  })
  if (!res.ok) console.error('Resend error:', await res.text())
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  const { request_id, event } = await req.json() as { request_id: string; event: 'new_request' | 'accepted' | 'rejected' }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

  const { data: request } = await admin
    .from('stay_requests')
    .select('*')
    .eq('id', request_id)
    .single()

  if (!request) return new Response('Not found', { status: 404, headers: CORS })

  const [{ data: { user: host } }, { data: { user: guest } }] = await Promise.all([
    admin.auth.admin.getUserById(request.host_id),
    admin.auth.admin.getUserById(request.guest_id),
  ])

  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name')
    .in('id', [request.host_id, request.guest_id])

  const hostName = profiles?.find(p => p.id === request.host_id)?.full_name || 'hostiteli'
  const guestName = profiles?.find(p => p.id === request.guest_id)?.full_name || 'Jezdec'

  const dateInfo = `${request.arrival_date}${request.arrival_time ? ' cca ' + request.arrival_time : ''} → ${request.departure_date}`

  if (event === 'new_request' && host?.email) {
    await sendEmail(
      host.email,
      `🚪 Někdo klepe na dveře! — TWOwheelCOME`,
      `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#eee;padding:32px;border-radius:12px">
        <h2 style="color:#e8631a;margin:0 0 16px">🚪 Někdo klepe na dveře!</h2>
        <p><strong>${guestName}</strong> ti poslal žádost o ubytování.</p>
        <p style="color:#aaa">🗓 ${dateInfo}<br>👥 Jezdců: ${request.guests_count}</p>
        ${request.message ? `<blockquote style="border-left:3px solid #e8631a;margin:16px 0;padding:8px 16px;color:#ccc">"${request.message}"</blockquote>` : ''}
        <a href="${APP_URL}" style="display:inline-block;margin-top:16px;background:#e8631a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Otevřít aplikaci →</a>
      </div>`
    )
  }

  if (event === 'accepted' && guest?.email) {
    await sendEmail(
      guest.email,
      `✅ Máš kde složit hlavu! — TWOwheelCOME`,
      `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#eee;padding:32px;border-radius:12px">
        <h2 style="color:#22c55e;margin:0 0 16px">✅ Máš kde složit hlavu!</h2>
        <p><strong>${hostName}</strong> přijal tvoji žádost.</p>
        <p style="color:#aaa">🗓 ${dateInfo}<br>👥 Jezdců: ${request.guests_count}</p>
        <p>Domluv se s hostitelem na detailech přímo. Safe travels! 🏍</p>
        <a href="${APP_URL}" style="display:inline-block;margin-top:16px;background:#22c55e;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Otevřít aplikaci →</a>
      </div>`
    )
  }

  if (event === 'rejected' && guest?.email) {
    await sendEmail(
      guest.email,
      `Žádost nebyla přijata — TWOwheelCOME`,
      `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#1a1a1a;color:#eee;padding:32px;border-radius:12px">
        <h2 style="margin:0 0 16px">Tentokrát to nevyšlo 🤙</h2>
        <p><strong>${hostName}</strong> nemá tentokrát místo. Zkus jiného hostitele na mapě — komunit je dost.</p>
        <a href="${APP_URL}" style="display:inline-block;margin-top:16px;background:#e8631a;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700">Hledat na mapě →</a>
      </div>`
    )
  }

  return new Response('OK', { status: 200, headers: CORS })
})
