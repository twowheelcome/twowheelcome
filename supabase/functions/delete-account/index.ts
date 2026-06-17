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

    async function removeStorageFolder(bucket: string, folder: string) {
      const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000 })
      if (error && !/not found/i.test(error.message)) throw new Error(`list ${bucket}: ${error.message}`)
      const paths = (data || []).filter(item => item.name && item.id).map(item => `${folder}/${item.name}`)
      if (!paths.length) return
      const { error: removeError } = await admin.storage.from(bucket).remove(paths)
      if (removeError) throw new Error(`delete ${bucket}: ${removeError.message}`)
    }

    // Find conversations this user is part of
    const { data: convs } = await admin
      .from('conversations')
      .select('id')
      .or(`user_a.eq.${userId},user_b.eq.${userId}`)

    const { data: requests, error: requestsError } = await admin
      .from('stay_requests')
      .select('id')
      .or(`guest_id.eq.${userId},host_id.eq.${userId}`)
    if (requestsError) throw new Error(`load stay requests: ${requestsError.message}`)
    const requestIds = (requests || []).map((request: any) => request.id)

    // Remove personal uploads before their database pointers disappear.
    await Promise.all([
      removeStorageFolder('avatars', userId),
      removeStorageFolder('request-photos', userId),
    ])

    // Keep the other rider's messages. Remove only this user's messages and
    // detach surviving messages from requests that are about to be deleted.
    await must('delete own messages', admin.from('messages').delete().eq('sender_id', userId))
    if (requestIds.length) {
      await must('detach request messages', admin.from('messages').update({ request_id: null }).in('request_id', requestIds))
    }

    await must('delete reviews', admin.from('reviews').delete().or(`reviewer_id.eq.${userId},reviewee_id.eq.${userId}`))
    await must('delete stay_requests', admin.from('stay_requests').delete().or(`guest_id.eq.${userId},host_id.eq.${userId}`))

    // Anonymize this participant. The remaining rider keeps their side of the
    // conversation; completely empty conversations are removed.
    await must('anonymize conversations user_a', admin.from('conversations').update({ user_a: null }).eq('user_a', userId))
    await must('anonymize conversations user_b', admin.from('conversations').update({ user_b: null }).eq('user_b', userId))
    if (convs?.length) {
      const convIds = convs.map((c: any) => c.id)
      const { data: remaining } = await admin.from('messages').select('conversation_id').in('conversation_id', convIds)
      const nonEmpty = new Set((remaining || []).map((message: any) => message.conversation_id))
      const emptyIds = convIds.filter((id: string) => !nonEmpty.has(id))
      if (emptyIds.length) await must('delete empty conversations', admin.from('conversations').delete().in('id', emptyIds))
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
