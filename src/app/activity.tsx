import { useCallback, useMemo, useState } from 'react'
import type { ComponentProps } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
import { FONT } from '../lib/theme'
import { AppHeader, HeaderBackButton } from '../components/AppHeader'
import { pendingChatStore } from '../lib/pendingChatStore'
import { loadNotifications, markNotificationsSeen, clearAllNotifications, type NotifEvent, type NotifType } from '../lib/notifications'
import { refreshNotificationCount } from '../lib/notificationStore'

const ICON: Record<NotifType, ComponentProps<typeof Feather>['name']> = {
  knock: 'inbox',
  accepted: 'check-circle',
  rejected: 'x-circle',
  cancelled: 'slash',
  review: 'star',
  review_due: 'edit-3',
}

// YYYY-MM-DD or ISO → short DD.MM.YY
function fmtWhen(at: string): string {
  const d = new Date(at)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getFullYear()).slice(2)}`
}

export default function ActivityScreen() {
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])
  const [loading, setLoading] = useState(true)
  const [events, setEvents] = useState<NotifEvent[]>([])

  useFocusEffect(useCallback(() => {
    let active = true
    void supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) { if (active) { setEvents([]); setLoading(false) } return }
      const { events: ev } = await loadNotifications(user.id)
      if (!active) return
      setEvents(ev)
      setLoading(false)
      // Mark seen, then refresh the badge (what remains = still-actionable pending reviews).
      await markNotificationsSeen(user.id)
      await refreshNotificationCount(user.id)
    })
    return () => { active = false }
  }, []))

  // Clear all hides announcement events (review_due survives and stays visible).
  const hasClearable = events.some(e => e.type !== 'review_due')
  async function clearAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await clearAllNotifications(user.id)
    const { events: ev } = await loadNotifications(user.id)
    setEvents(ev)
    await refreshNotificationCount(user.id)
  }

  function open(e: NotifEvent) {
    if (e.link.kind === 'reviews') { router.push('/reviews'); return }
    if (e.link.kind === 'chat') {
      if (!e.link.convId) return
      pendingChatStore.set({ convId: e.link.convId, reviewRequestId: e.link.reviewRequestId ?? null })
      router.push('/(tabs)/requests')
    }
  }

  return (
    <View style={styles.container}>
      <AppHeader
        left={<HeaderBackButton />}
        right={hasClearable ? (
          <TouchableOpacity onPress={clearAll} accessibilityRole="button" accessibilityLabel="Clear all notifications" hitSlop={8}>
            <Text style={styles.clearAll}>Clear all</Text>
          </TouchableOpacity>
        ) : undefined}
      >
        <Text style={styles.headerTitle}>Notifications</Text>
      </AppHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.accent} /></View>
      ) : events.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🔔</Text>
          <Text style={styles.emptyTitle}>No notifications</Text>
          <Text style={styles.emptyText}>Knocks, replies, reviews and stays to rate will show up here.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {events.map(e => (
            <TouchableOpacity key={e.id} style={styles.row} onPress={() => open(e)} activeOpacity={0.7}>
              {e.unread && <View style={styles.unreadBar} />}
              <View style={styles.iconWrap}><Feather name={ICON[e.type]} size={18} color={C.accent} /></View>
              <View style={styles.body}>
                <Text style={[styles.title, e.unread && styles.titleUnread]} numberOfLines={2}>{e.title}</Text>
                {e.sub ? <Text style={styles.sub} numberOfLines={1}>{e.sub}</Text> : null}
              </View>
              <Text style={styles.when}>{fmtWhen(e.at)}</Text>
            </TouchableOpacity>
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
    clearAll: { color: C.accent, fontSize: 13, fontWeight: '700' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
    emptyEmoji: { fontSize: 40 },
    emptyTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
    emptyText: { color: C.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: FONT.body },
    list: { padding: 16, gap: 10, maxWidth: 700, width: '100%', alignSelf: 'center' },
    row: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border,
      paddingVertical: 13, paddingHorizontal: 14, overflow: 'hidden',
    },
    unreadBar: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 4, backgroundColor: C.accent },
    iconWrap: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center' },
    body: { flex: 1, gap: 2, minWidth: 0 },
    title: { color: C.text, fontSize: 14, fontWeight: '700', lineHeight: 19 },
    titleUnread: { fontWeight: '800' },
    sub: { color: C.textDim, fontSize: 12, fontFamily: FONT.body },
    when: { color: C.textDim, fontSize: 12 },
  })
}
