import { useEffect, useState } from 'react'
import { Image, Text, TouchableOpacity, View } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'
import { thumbnailUrl } from '../lib/imageThumb'

// Module-level cache so all instances share one fetch
type UserChipData = { userId: string; name: string; avatarUrl: string | null }
type AuthUserLike = { id: string; email?: string | null }

// loggedIn: null = unknown/loading, false = confirmed logged out, true = logged in
type ChipState = { loggedIn: boolean | null; profile: UserChipData | null }

let _state: ChipState = { loggedIn: null, profile: null }
const _listeners = new Set<(state: ChipState) => void>()

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const initials = parts.length > 1
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : name.slice(0, 2)
  return initials.toUpperCase()
}

function publish(next: Partial<ChipState>) {
  _state = { ..._state, ...next }
  _listeners.forEach(l => l(_state))
}

async function loadProfile(authUser?: AuthUserLike | null, force = false) {
  const currentUser = authUser ?? (await supabase.auth.getUser()).data.user
  if (!currentUser) { publish({ loggedIn: false, profile: null }); return null }
  if (!force && _state.profile?.userId === currentUser.id) {
    publish({ loggedIn: true })
    return currentUser
  }

  if (!_state.profile) publish({ loggedIn: true, profile: null })
  const { data } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', currentUser.id).single()
  const name = data?.full_name || currentUser.email?.split('@')[0] || 'Rider'
  publish({ loggedIn: true, profile: { userId: currentUser.id, name, avatarUrl: data?.avatar_url ?? null } })
  return currentUser
}

// Call after the user edits their own profile (name/avatar) so the chip updates immediately.
export function refreshUserChip() {
  void loadProfile(undefined, true)
}

export function UserChip() {
  const C = useTheme()
  const [state, setState] = useState<ChipState>(_state)

  useEffect(() => {
    _listeners.add(setState)
    void loadProfile()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        void loadProfile(session.user)
      } else {
        publish({ loggedIn: false, profile: null })
      }
    })
    return () => {
      _listeners.delete(setState)
      subscription.unsubscribe()
    }
  }, [])

  // Logged out → always offer a way in. Never strand a visitor without a login entry.
  if (state.loggedIn === false) {
    return (
      <TouchableOpacity
        style={{ paddingHorizontal: 16, height: 40, borderRadius: 100, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}
        onPress={() => router.push('/')}
        activeOpacity={0.8}
        accessibilityRole="button"
        accessibilityLabel="Log in or sign up"
      >
        <Text style={{ color: C.white, fontSize: 13, fontWeight: '800', letterSpacing: 0.5 }}>Log in</Text>
      </TouchableOpacity>
    )
  }

  // Unknown/loading, or logged in but profile not fetched yet → render nothing (avoids a Login flash)
  if (!state.profile) return null
  const initials = getInitials(state.profile.name)

  return (
    <TouchableOpacity
      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
      onPress={() => router.push('/(tabs)/profile')}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Open profile"
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' }}>
        {state.profile.avatarUrl ? (
          <Image source={{ uri: thumbnailUrl(state.profile.avatarUrl, 80) }} style={{ width: 40, height: 40 }} resizeMode="cover" />
        ) : (
          <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ color: C.white, fontSize: 12, fontWeight: '900' }}>{initials}</Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  )
}
