import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!

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

Deno.serve(async req => {
  const CORS = corsHeaders(req)
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
    async function removeStorageFolder(bucket: string, folder: string) {
      const { data, error } = await admin.storage.from(bucket).list(folder, { limit: 1000 })
      if (error && !/not found/i.test(error.message)) throw new Error(`list ${bucket}: ${error.message}`)
      const paths = (data || []).filter(item => item.name && item.id).map(item => `${folder}/${item.name}`)
      if (!paths.length) return
      const { error: removeError } = await admin.storage.from(bucket).remove(paths)
      if (removeError) throw new Error(`delete ${bucket}: ${removeError.message}`)
    }

    // Remove personal uploads before their database pointers disappear. listing-photos are
    // public, so they especially must not linger after deletion (GDPR).
    await Promise.all([
      removeStorageFolder('avatars', userId),
      removeStorageFolder('request-photos', userId),
      removeStorageFolder('listing-photos', userId),
    ])

    // All DB cleanup in ONE transaction (atomic, no half-deleted state). The RPC
    // deletes only this user's rows, anonymizes shared conversations (keeping the
    // other rider's side), prunes empty ones, and cascades bikes/host_profiles via
    // the profile delete. It runs as service_role, which the conversation
    // immutability trigger allows for the anonymization step.
    const { error: rpcErr } = await admin.rpc('delete_account_data', { p_uid: userId })
    if (rpcErr) throw new Error(`delete account data: ${rpcErr.message}`)

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
