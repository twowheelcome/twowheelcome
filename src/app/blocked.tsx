import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
import { FONT } from '../lib/theme'
import { AppHeader, HeaderBackButton } from '../components/AppHeader'
import { Avatar } from '../components/Avatar'

type Blocked = { id: string; name: string | null; avatar_url: string | null }

export default function BlockedScreen() {
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])
  const [loading, setLoading] = useState(true)
  const [rows, setRows] = useState<Blocked[]>([])
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setRows([]); setLoading(false); return }
    const { data: blocks } = await supabase.from('blocks').select('blocked_id').eq('blocker_id', user.id)
    const ids = (blocks || []).map((b: any) => b.blocked_id)
    if (!ids.length) { setRows([]); setLoading(false); return }
    const { data: profs } = await supabase.from('profiles').select('id, full_name, avatar_url').in('id', ids)
    const map: Record<string, any> = {}
    profs?.forEach((p: any) => { map[p.id] = p })
    setRows(ids.map((id: string) => ({ id, name: map[id]?.full_name ?? null, avatar_url: map[id]?.avatar_url ?? null })))
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  async function unblock(id: string) {
    if (busy) return
    setBusy(id)
    const { data: { user } } = await supabase.auth.getUser()
    if (user) await supabase.from('blocks').delete().eq('blocker_id', user.id).eq('blocked_id', id)
    setBusy(null)
    setRows(prev => prev.filter(r => r.id !== id))
  }

  return (
    <View style={styles.container}>
      <AppHeader left={<HeaderBackButton />}>
        <Text style={styles.headerTitle}>Blocked users</Text>
      </AppHeader>
      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.accent} /></View>
      ) : rows.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🚫</Text>
          <Text style={styles.emptyTitle}>No one blocked</Text>
          <Text style={styles.emptyText}>People you block stop appearing on the map and in your chats, and can&apos;t message or knock you.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={styles.note}>Blocked people don&apos;t appear on the map or in your chats, and can&apos;t message or knock you.</Text>
          {rows.map(r => (
            <View key={r.id} style={styles.row}>
              <Avatar url={r.avatar_url} name={r.name} size={42} />
              <Text style={styles.name} numberOfLines={1}>{r.name || 'Rider'}</Text>
              <TouchableOpacity style={styles.unblockBtn} onPress={() => unblock(r.id)} disabled={busy === r.id}>
                <Text style={styles.unblockText}>{busy === r.id ? '…' : 'Unblock'}</Text>
              </TouchableOpacity>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  )
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    headerTitle: { color: C.text, fontSize: 20, fontFamily: FONT.headBold, textAlign: 'center' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
    emptyEmoji: { fontSize: 40 },
    emptyTitle: { color: C.text, fontSize: 18, fontFamily: FONT.headBold },
    emptyText: { color: C.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: FONT.body },
    list: { padding: 16, gap: 10, maxWidth: 700, width: '100%', alignSelf: 'center' },
    note: { color: C.textDim, fontSize: 13, lineHeight: 19, fontFamily: FONT.body, marginBottom: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 12 },
    name: { flex: 1, color: C.text, fontSize: 15, fontWeight: '700' },
    unblockBtn: { borderRadius: 100, borderWidth: 1.5, borderColor: C.accent, paddingHorizontal: 16, paddingVertical: 8 },
    unblockText: { color: C.accent, fontSize: 13, fontWeight: '800' },
  })
}
