import { useEffect, useState } from 'react'
import { Image, Text, TouchableOpacity, View } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'

// Module-level cache so all instances share one fetch
type UserChipData = { name: string; avatarUrl: string | null }

let _profile: UserChipData | null | undefined = undefined
const _listeners = new Set<(profile: UserChipData | null) => void>()

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  const initials = parts.length > 1
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : name.slice(0, 2)
  return initials.toUpperCase()
}

async function loadName() {
  if (_profile !== undefined) return
  _profile = null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { data } = await supabase.from('profiles').select('full_name, avatar_url').eq('id', user.id).single()
  const name = data?.full_name || user.email?.split('@')[0] || 'Rider'
  _profile = { name, avatarUrl: data?.avatar_url ?? null }
  _listeners.forEach(l => l(_profile!))
}

export function UserChip() {
  const C = useTheme()
  const [profile, setProfile] = useState<UserChipData | null>(_profile ?? null)

  useEffect(() => {
    if (_profile !== undefined) return
    _listeners.add(setProfile)
    loadName()
    return () => { _listeners.delete(setProfile) }
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
