import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS })

  // Verify caller is authenticated
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return new Response('Unauthorized', { status: 401, headers: CORS })

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  const { data: { user }, error: authErr } = await userClient.auth.getUser()
  if (authErr || !user) return new Response('Unauthorized', { status: 401, headers: CORS })

  const userId = user.id
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { auth: { persistSession: false } })

  try {
    async function must(label: string, query: PromiseLike<{ error: { message?: string } | null }>) {
      const { error } = await query
      if (error) throw new Error(`${label}: ${error.message || 'failed'}`)
    }

    // Find conversations this user is part of
    const { data: convs } = await admin
      .from('conversations')
      .select('id')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)

    // Delete in dependency order. Messages reference both conversations and stay_requests.
    if (convs?.length) {
      const convIds = convs.map((c: any) => c.id)
      await must('delete messages', admin.from('messages').delete().in('conversation_id', convIds))
    }

    await must('delete reviews', admin.from('reviews').delete().or(`reviewer_id.eq.${userId},reviewee_id.eq.${userId}`))
    await must('delete stay_requests', admin.from('stay_requests').delete().or(`guest_id.eq.${userId},host_id.eq.${userId}`))

    if (convs?.length) {
      const convIds = convs.map((c: any) => c.id)
      await must('delete conversations', admin.from('conversations').delete().in('id', convIds))
    }

    await must('delete host_locations', admin.from('host_locations').delete().eq('user_id', userId))
    await must('delete profiles', admin.from('profiles').delete().eq('id', userId))

    // Delete auth user (also clears auth.users row)
    const { error: deleteErr } = await admin.auth.admin.deleteUser(userId)
    if (deleteErr) throw deleteErr

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('delete-account error:', err)
    return new Response(JSON.stringify({ error: err.message || 'Failed to delete account' }), {
      status: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    })
  }
})
