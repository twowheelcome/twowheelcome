// Automated, self-contained chat realtime regression test.
//
// Creates 2 confirmed test users + a host location, then verifies — with two real
// authenticated realtime clients, exactly like the app — that an OPEN conversation
// receives (a) a live message from the other participant and (b) a live accept/reject
// status update. Cleans up all test data + users afterward.
//
// Needs a Supabase access token (Management API) for admin setup/teardown:
//   SB_TOKEN=$(security find-generic-password -s "Supabase CLI" -w) \
//     STAMP=$(date +%s) node scripts/chat-realtime-autotest.mjs
//
// Note: the very first realtime connection in a fresh process can miss the first
// event (cold-start race) — re-run if a single run flakes; warm runs pass reliably.
// No secrets are stored in this file (token comes from the environment).
import { createClient } from '@supabase/supabase-js'

const REF = 'igrmxzvnadqckxjachdc'
const URL = `https://${REF}.supabase.co`
const ANON = 'sb_publishable__9ut7dzGoOq3ZabRwoDabg_Rznv47CA'
const TOKEN = process.env.SB_TOKEN
if (!TOKEN) { console.error('no SB_TOKEN'); process.exit(2) }

const stamp = process.env.STAMP || 'x'
async function adminQuery(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query }),
  })
  const t = await r.text()
  if (!r.ok) throw new Error(`adminQuery ${r.status}: ${t}`)
  return t ? JSON.parse(t) : null
}
const q = (s) => s.replace(/'/g, "''")

const PASS = 'NightTest!' + stamp
const emailA = `night_a_${stamp}@example.com`
const emailB = `night_b_${stamp}@example.com`
let idA, idB, locId, convId, reqId
const log = (...a) => console.log(...a)

try {
  // 1) create users via anon signUp
  const boot = createClient(URL, ANON, { auth: { persistSession: false } })
  const ra = await boot.auth.signUp({ email: emailA, password: PASS, options: { data: { full_name: 'Night A' } } })
  const rb = await boot.auth.signUp({ email: emailB, password: PASS, options: { data: { full_name: 'Night B' } } })
  idA = ra.data.user?.id; idB = rb.data.user?.id
  if (!idA || !idB) throw new Error('signUp failed: ' + (ra.error?.message || rb.error?.message))
  log('users:', idA.slice(0, 8), idB.slice(0, 8))

  // 2) confirm emails + ensure profiles + host_location for B (admin SQL)
  await adminQuery(`update auth.users set email_confirmed_at = now() where id in ('${idA}','${idB}');`)
  await adminQuery(`insert into profiles (id, full_name) values ('${idA}','Night A') on conflict (id) do update set full_name=excluded.full_name;
                    insert into profiles (id, full_name) values ('${idB}','Night B') on conflict (id) do update set full_name=excluded.full_name;`)
  const locRows = await adminQuery(`insert into host_locations (user_id, location_lat, location_lng, location_city, location_country, parking, parkings, sleep_types, amenities, max_guests, pricing, pricings)
    values ('${idB}', 50.08, 14.42, 'Praha', 'CZ', 'yard', array['yard'], array['room'], array[]::text[], 2, 'free', array['free']) returning id;`)
  locId = locRows[0].id
  log('host location:', locId.slice(0, 8))

  // 3) sign in both via anon, set realtime auth
  const A = createClient(URL, ANON, { auth: { persistSession: false } })
  const B = createClient(URL, ANON, { auth: { persistSession: false } })
  const sa = await A.auth.signInWithPassword({ email: emailA, password: PASS })
  const sb = await B.auth.signInWithPassword({ email: emailB, password: PASS })
  if (!sa.data.session || !sb.data.session) throw new Error('signIn failed')
  await A.realtime.setAuth(sa.data.session.access_token)
  await B.realtime.setAuth(sb.data.session.access_token)
  log('both signed in + realtime auth set')

  // 4) A (guest) creates the conversation + a stay_request (mirrors the app knock)
  const [ua, ub] = [idA, idB].sort()
  const nc = await A.from('conversations').insert({ user_a: ua, user_b: ub, location_id: locId }).select('id').single()
  if (nc.error) throw new Error('conv insert: ' + nc.error.message)
  convId = nc.data.id
  const today = new Date().toISOString().slice(0, 10)
  const req = await A.from('stay_requests').insert({
    guest_id: idA, host_id: idB, location_id: locId, status: 'PENDING', guests_count: 1,
    arrival_date: today, departure_date: today, conversation_id: convId,
  }).select('id').single()
  if (req.error) throw new Error('stay_request insert: ' + req.error.message)
  reqId = req.data.id
  log('conversation + request created')

  // 5) A subscribes (single messages-stream channel, like the app) and listens for
  //    (a) a new message INSERT and (b) the stay_request UPDATE.
  let gotMsg = null, gotStatus = null
  const marker = `night-marker-${stamp}`
  const ch = A.channel('messages-stream')
  const sub = await new Promise((res) => {
    const t = setTimeout(() => res('TIMEOUT'), 10000)
    ch.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => {
        if (p.new?.conversation_id === convId && p.new?.body === marker) gotMsg = p.new
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'stay_requests' }, (p) => {
        if (p.new?.id === reqId) gotStatus = p.new.status
      })
      .subscribe((s) => { if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { clearTimeout(t); res(s) } })
  })
  if (sub !== 'SUBSCRIBED') throw new Error('A subscribe status: ' + sub)
  log('A subscribed')
  await new Promise(r => setTimeout(r, 1200))

  // 6) B (host) sends a message → expect A to receive live
  const bi = await B.from('messages').insert({ conversation_id: convId, sender_id: idB, body: marker })
  if (bi.error) throw new Error('B message insert: ' + bi.error.message)
  // 7) B (host) accepts the request → expect A to receive the status UPDATE live
  const bu = await B.from('stay_requests').update({ status: 'ACCEPTED' }).eq('id', reqId)
  if (bu.error) throw new Error('B status update: ' + bu.error.message)

  const waitFor = (get, ms) => new Promise((res) => {
    const t = setInterval(() => { if (get()) { clearInterval(t); res(true) } }, 100)
    setTimeout(() => { clearInterval(t); res(false) }, ms)
  })
  const okMsg = await waitFor(() => gotMsg, 8000)
  const okStatus = await waitFor(() => gotStatus === 'ACCEPTED', 8000)
  await A.removeChannel(ch)

  log('')
  log('RESULT live message delivery (open conversation append):', okMsg ? '✅ PASS' : '❌ FAIL')
  log('RESULT live accept/reject status update:', okStatus ? '✅ PASS' : '❌ FAIL')
  log('')
  process.exitCode = okMsg && okStatus ? 0 : 1
} catch (e) {
  console.error('ERROR:', e.message)
  process.exitCode = 1
} finally {
  // cleanup — delete test data + users (token/admin)
  try {
    if (convId) await adminQuery(`delete from messages where conversation_id='${convId}';
                                  delete from stay_requests where conversation_id='${convId}';
                                  delete from conversations where id='${convId}';`)
    if (locId) await adminQuery(`delete from host_locations where id='${locId}';`)
    const ids = [idA, idB].filter(Boolean).map(i => `'${i}'`).join(',')
    if (ids) {
      await adminQuery(`delete from conversation_reads where user_id in (${ids}); delete from profiles where id in (${ids});`)
      await adminQuery(`delete from auth.users where id in (${ids});`)
    }
    console.log('cleanup done')
  } catch (e) { console.error('cleanup error:', e.message) }
}
