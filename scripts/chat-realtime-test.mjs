// Two-client live test of the chat realtime path.
//
// It mirrors what the app does in src/app/(tabs)/requests.tsx:
//   - authenticate, call supabase.realtime.setAuth(token)
//   - open ONE channel ('messages-stream')
//   - listen to postgres_changes INSERT on `messages`
//   - have the OTHER user insert a message
//   - assert the first user receives the realtime event live
//
// This is the only way to verify the #1 goal end-to-end, because realtime
// delivery depends on RLS + the publication on the LIVE database, which a code
// read alone cannot prove.
//
// Requires TWO already-confirmed accounts (email confirmation is ON). Pass their
// credentials as env vars — no secrets are stored in the repo:
//
//   EMAIL_A=a@example.com PASS_A=... EMAIL_B=b@example.com PASS_B=... \
//     node scripts/chat-realtime-test.mjs
//
// User B must be a host (have at least one row in host_locations). If B has no
// location yet, create one in the app (Become a host) first, or the script will
// tell you.
//
// Residue: the test reuses one conversation between A and B per host location and
// only appends one message per run (messages/conversations have no client DELETE
// policy, so it cannot self-clean — this is intentional and minimal).

import { createClient } from '@supabase/supabase-js'

const URL = 'https://igrmxzvnadqckxjachdc.supabase.co'
const ANON = 'sb_publishable__9ut7dzGoOq3ZabRwoDabg_Rznv47CA'

const { EMAIL_A, PASS_A, EMAIL_B, PASS_B } = process.env
if (!EMAIL_A || !PASS_A || !EMAIL_B || !PASS_B) {
  console.error('Missing env. Need EMAIL_A, PASS_A, EMAIL_B, PASS_B (two confirmed accounts).')
  process.exit(2)
}

const mk = () => createClient(URL, ANON, { auth: { persistSession: false } })

async function signIn(label, email, password) {
  const sb = mk()
  const { data, error } = await sb.auth.signInWithPassword({ email, password })
  if (error || !data.session) throw new Error(`${label} sign-in failed: ${error?.message || 'no session (email not confirmed?)'}`)
  await sb.realtime.setAuth(data.session.access_token)
  return { sb, user: data.user, token: data.session.access_token }
}

function fail(msg) { console.error('\n❌ ' + msg); process.exit(1) }
function ok(msg) { console.log('✓ ' + msg) }

const A = await signIn('A (listener/guest)', EMAIL_A, PASS_A)
ok(`A signed in: ${A.user.id}`)
const B = await signIn('B (sender/host)', EMAIL_B, PASS_B)
ok(`B signed in: ${B.user.id}`)
if (A.user.id === B.user.id) fail('A and B are the same account — use two different accounts.')

// B must own a host location.
const { data: locs, error: locErr } = await B.sb.from('host_locations').select('id').eq('user_id', B.user.id).limit(1)
if (locErr) fail('reading B host_locations: ' + locErr.message)
if (!locs || locs.length === 0) fail('B has no host_locations. Create one in the app (Become a host) and retry.')
const locationId = locs[0].id
ok(`B host location: ${locationId}`)

// Find or create the conversation (ordered user_a < user_b, scoped to the location).
const [ua, ub] = [A.user.id, B.user.id].sort()
let convId
{
  const { data: existing } = await A.sb.from('conversations')
    .select('id').eq('user_a', ua).eq('user_b', ub).eq('location_id', locationId).maybeSingle()
  if (existing) { convId = existing.id; ok(`reusing conversation: ${convId}`) }
  else {
    const { data: nc, error: cErr } = await A.sb.from('conversations')
      .insert({ user_a: ua, user_b: ub, location_id: locationId }).select('id').single()
    if (cErr || !nc) fail('creating conversation: ' + (cErr?.message || 'none'))
    convId = nc.id; ok(`created conversation: ${convId}`)
  }
}

// A subscribes exactly like the app: one 'messages-stream' channel, postgres_changes INSERT on messages.
const marker = `realtime-probe-${Date.now()}`
let received = null
const channel = A.sb.channel('messages-stream')
const subStatus = await new Promise((resolve) => {
  const t = setTimeout(() => resolve('TIMEOUT'), 10000)
  channel.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
    if (payload.new?.conversation_id === convId && payload.new?.body === marker) received = payload.new
  }).subscribe((s) => {
    if (s === 'SUBSCRIBED') { clearTimeout(t); resolve(s) }
    else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') { clearTimeout(t); resolve(s) }
  })
})
if (subStatus !== 'SUBSCRIBED') fail(`A could not subscribe to messages-stream: ${subStatus}`)
ok('A subscribed to messages-stream')

// Give the subscription a moment to be fully registered before B inserts.
await new Promise(r => setTimeout(r, 1000))

// B inserts a message into the shared conversation.
const { error: insErr } = await B.sb.from('messages').insert({ conversation_id: convId, sender_id: B.user.id, body: marker })
if (insErr) fail('B inserting message: ' + insErr.message)
ok('B inserted a message')

// Wait for A to receive it live.
const got = await new Promise((resolve) => {
  const t = setInterval(() => { if (received) { clearInterval(t); resolve(true) } }, 100)
  setTimeout(() => { clearInterval(t); resolve(false) }, 8000)
})

await A.sb.removeChannel(channel)

if (got) {
  console.log('\n✅ PASS — A received B\'s message live over realtime. Chat realtime delivery works on the live DB.')
  process.exit(0)
} else {
  console.error('\n❌ FAIL — A did NOT receive the message within 8s.')
  console.error('   The subscription connected but no event arrived. Most likely causes:')
  console.error('   1) `messages` is not in the supabase_realtime publication on the live DB.')
  console.error('   2) RLS prevents A from SELECTing the row (A is not a participant of the conversation).')
  console.error('   Apply supabase/migrations/realtime_publication.sql, then retry.')
  process.exit(1)
}
