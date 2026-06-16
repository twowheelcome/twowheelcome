import { useEffect, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'

// Module-level cache so all instances share one fetch
let _name: string | null | undefined = undefined
const _listeners = new Set<(n: string | null) => void>()

async function loadName() {
  if (_name !== undefined) return
  _name = null
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return
  const { data } = await supabase.from('profiles').select('full_name').eq('id', user.id).single()
  _name = data?.full_name || user.email?.split('@')[0] || null
  _listeners.forEach(l => l(_name!))
}

export function UserChip() {
  const C = useTheme()
  const [name, setName] = useState<string | null>(_name ?? null)

  useEffect(() => {
    if (_name !== undefined) return
    _listeners.add(setName)
    loadName()
    return () => { _listeners.delete(setName) }
  }, [])

  if (!name) return null
  const initial = name.charAt(0).toUpperCase()

  return (
    <TouchableOpacity
      style={{ flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.elevated, borderRadius: 20, paddingVertical: 5, paddingLeft: 5, paddingRight: 11, borderWidth: 1, borderColor: C.border }}
      onPress={() => router.push('/(tabs)/profile')}
      activeOpacity={0.7}
    >
      <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: C.white, fontSize: 12, fontWeight: '800' }}>{initial}</Text>
      </View>
      <Text style={{ color: C.text, fontSize: 13, fontWeight: '600', maxWidth: 100 }} numberOfLines={1}>{name}</Text>
    </TouchableOpacity>
  )
}
