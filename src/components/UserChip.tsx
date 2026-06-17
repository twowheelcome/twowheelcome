import { useEffect, useState } from 'react'
import { Image, Text, TouchableOpacity, View } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'

// Module-level cache so all instances share one fetch
type UserChipData = { userId: string; name: string; avatarUrl: string | null }
type AuthUserLike = { id: string; email?: string | null }

let _profile: UserChipData | null | undefined = undefined
const _listeners = new Set<(profile: UserChipData | null) => void>()

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const initials = parts.length > 1
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : name.slice(0, 2)
  return initials.toUpperCase()
}

function publish(profile: UserChipData | null) {
  _profile = profile
  _listeners.forEach(l => l(profile))
}

async function loadProfile(authUser?: AuthUserLike | null) {
  const currentUser = authUser ?? (await supabase.auth.getUser()).data.user
  if (!currentUser) { publish(null); return }
  if (_profile?.userId === currentUser.id) return

  publish(null)
  const { data } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', currentUser.id).single()
  const name = data?.full_name || currentUser.email?.split('@')[0] || 'Rider'
  publish({ userId: currentUser.id, name, avatarUrl: data?.avatar_url ?? null })
}

export function UserChip() {
  const C = useTheme()
  const [profile, setProfile] = useState<UserChipData | null>(_profile ?? null)

  useEffect(() => {
    _listeners.add(setProfile)
    loadProfile()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        loadProfile(session.user)
      } else {
        publish(null)
      }
    })
    return () => {
      _listeners.delete(setProfile)
      subscription.unsubscribe()
    }
  }, [])

  if (!profile) return null
  const initials = getInitials(profile.name)

  return (
    <TouchableOpacity
      style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
      onPress={() => router.push('/(tabs)/profile')}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel="Open profile"
    >
      {profile.avatarUrl ? (
        <Image source={{ uri: profile.avatarUrl }} style={{ width: 40, height: 40 }} resizeMode="cover" />
      ) : (
        <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.white, fontSize: 12, fontWeight: '900' }}>{initials}</Text>
        </View>
      )}
    </TouchableOpacity>
  )
}
