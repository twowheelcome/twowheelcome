import { supabase } from './supabase'

// Buddy = mutual friendship. A pending request becomes a buddy when accepted.
export type BuddyState = 'none' | 'requested' | 'incoming' | 'buddies'

function pairFilter(a: string, b: string) {
  return `and(requester_id.eq.${a},addressee_id.eq.${b}),and(requester_id.eq.${b},addressee_id.eq.${a})`
}

// User ids of my accepted buddies.
export async function getBuddyUserIds(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('buddies')
    .select('requester_id, addressee_id')
    .eq('status', 'accepted')
    .or(`requester_id.eq.${userId},addressee_id.eq.${userId}`)
  return (data || []).map((r: any) => (r.requester_id === userId ? r.addressee_id : r.requester_id))
}

// Pending requests addressed to me (people who want to be my buddy).
export async function getIncomingRequests(userId: string): Promise<string[]> {
  const { data } = await supabase
    .from('buddies')
    .select('requester_id')
    .eq('addressee_id', userId)
    .eq('status', 'pending')
  return (data || []).map((r: any) => r.requester_id)
}

export async function getBuddyState(userId: string, otherId: string): Promise<BuddyState> {
  const { data } = await supabase
    .from('buddies')
    .select('requester_id, addressee_id, status')
    .or(pairFilter(userId, otherId))
  if (!data || data.length === 0) return 'none'
  if (data.some((r: any) => r.status === 'accepted')) return 'buddies'
  if (data.some((r: any) => r.requester_id === userId)) return 'requested'
  return 'incoming'
}

export function sendBuddyRequest(userId: string, otherId: string) {
  return supabase.from('buddies').insert({ requester_id: userId, addressee_id: otherId, status: 'pending' })
}

// I (the addressee) accept a pending request from requesterId.
export function acceptBuddy(userId: string, requesterId: string) {
  return supabase.from('buddies').update({ status: 'accepted' }).eq('requester_id', requesterId).eq('addressee_id', userId)
}

export function removeBuddy(userId: string, otherId: string) {
  return supabase.from('buddies').delete().or(pairFilter(userId, otherId))
}
