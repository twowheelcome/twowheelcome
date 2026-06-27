import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
import { pendingChatStore } from '../lib/pendingChatStore'
import { AppHeader, HeaderBackButton } from '../components/AppHeader'

type Stay = {
  id: string
  status: string
  role: 'guest' | 'host'
  otherName: string
  place: string
  arrival: string
  departure: string
  conversationId: string | null
  canReview: boolean
}

// YYYY-MM-DD → DD.MM.YY (manual parse to avoid timezone shifts)
function fmtDateStr(s?: string | null): string {
  if (!s) return ''
  const [y, m, d] = s.split('-')
  if (!y || !m || !d) return s
  return `${d}.${m}.${y.slice(2)}`
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

const STATUS_META: Record<string, { label: string; key: 'success' | 'warning' | 'error' | 'info' }> = {
  PENDING: { label: 'Pending', key: 'warning' },
  ACCEPTED: { label: 'Confirmed', key: 'success' },
  REJECTED: { label: 'Declined', key: 'error' },
}

export default function HistoryScreen() {
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])
  const [loading, setLoading] = useState(true)
  const [stays, setStays] = useState<Stay[]>([])

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setStays([]); setLoading(false); return }
    const userId = user.id

    const { data: reqs } = await supabase
      .from('stay_requests')
      .select('id, status, host_id, guest_id, location_id, conversation_id, arrival_date, departure_date, created_at')
      .or(`guest_id.eq.${userId},host_id.eq.${userId}`)
      .order('arrival_date', { ascending: false })

    if (!reqs || reqs.length === 0) { setStays([]); setLoading(false); return }

    const otherIds = [...new Set(reqs.map((r: any) => (r.guest_id === userId ? r.host_id : r.guest_id)).filter(Boolean))]
    const locIds = [...new Set(reqs.map((r: any) => r.location_id).filter(Boolean))]

    const [{ data: profiles }, { data: locs }, { data: myReviews }] = await Promise.all([
      otherIds.length ? supabase.from('profiles').select('id, full_name').in('id', otherIds) : Promise.resolve({ data: [] as any[] }),
      locIds.length ? supabase.from('host_locations_public').select('id, location_city, location_country').in('id', locIds) : Promise.resolve({ data: [] as any[] }),
      supabase.from('reviews').select('stay_request_id').eq('reviewer_id', userId),
    ])

    const nameMap: Record<string, string> = {}
    profiles?.forEach((p: any) => { nameMap[p.id] = p.full_name || 'Rider' })
    const locMap: Record<string, string> = {}
    locs?.forEach((l: any) => { locMap[l.id] = [l.location_city, l.location_country].filter(Boolean).join(', ') })
    const reviewed = new Set((myReviews ?? []).map((r: any) => r.stay_request_id))

    const today = todayStr()
    const items: Stay[] = reqs.map((r: any) => {
      const role: 'guest' | 'host' = r.guest_id === userId ? 'guest' : 'host'
      const otherId = role === 'guest' ? r.host_id : r.guest_id
      const stayEnded = r.departure_date && r.departure_date <= today
      return {
        id: r.id,
        status: r.status,
        role,
        otherName: nameMap[otherId] || 'Rider',
        place: locMap[r.location_id] || 'Location on the map',
        arrival: r.arrival_date,
        departure: r.departure_date,
        conversationId: r.conversation_id,
        canReview: r.status === 'ACCEPTED' && !!stayEnded && !reviewed.has(r.id),
      }
    })

    setStays(items)
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { load() }, [load]))

  function openConversation(s: Stay) {
    if (!s.conversationId) return
    pendingChatStore.set({ convId: s.conversationId, reviewRequestId: s.canReview ? s.id : null })
    router.push('/(tabs)/requests')
  }

  return (
    <View style={styles.container}>
      <AppHeader left={<HeaderBackButton />}>
        <Text style={styles.headerTitle}>History</Text>
      </AppHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.accent} /></View>
      ) : stays.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyEmoji}>🏍</Text>
          <Text style={styles.emptyTitle}>No stays yet</Text>
          <Text style={styles.emptyText}>Your past stays — as a rider and as a host — will show up here.</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {stays.map(s => {
            const meta = STATUS_META[s.status] || STATUS_META.PENDING
            return (
              <TouchableOpacity key={s.id} style={styles.card} onPress={() => openConversation(s)} activeOpacity={0.85}>
                <View style={styles.cardTop}>
                  <View style={[styles.roleChip, s.role === 'guest' ? styles.roleGuest : styles.roleHost]}>
                    <Text style={[styles.roleText, { color: s.role === 'guest' ? C.accent : C.info }]}>
                      {s.role === 'guest' ? 'As rider' : 'As host'}
                    </Text>
                  </View>
                  <View style={[styles.statusChip, { backgroundColor: C[`${meta.key}Soft`], borderColor: C[`${meta.key}Border`] }]}>
                    <Text style={[styles.statusText, { color: C[meta.key] }]}>{meta.label}</Text>
                  </View>
                </View>

                <Text style={styles.place}>📍 {s.place}</Text>
                <Text style={styles.with}>
                  {s.role === 'guest' ? 'Host: ' : 'Guest: '}{s.otherName}
                </Text>
                <Text style={styles.dates}>{fmtDateStr(s.arrival)} → {fmtDateStr(s.departure)}</Text>

                {s.canReview ? (
                  <Text style={styles.reviewHint}>⭐ Tap to leave a review →</Text>
                ) : null}
              </TouchableOpacity>
            )
          })}
        </ScrollView>
      )}
    </View>
  )
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    headerTitle: { color: C.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
    emptyEmoji: { fontSize: 40 },
    emptyTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
    emptyText: { color: C.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20 },
    list: { padding: 16, gap: 12, maxWidth: 700, width: '100%', alignSelf: 'center' },
    card: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, padding: 16, gap: 4 },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
    roleChip: { borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4 },
    roleGuest: { backgroundColor: C.accentSoft },
    roleHost: { backgroundColor: C.infoSoft },
    roleText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
    statusChip: { borderRadius: 100, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1 },
    statusText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
    place: { color: C.text, fontSize: 15, fontWeight: '700' },
    with: { color: C.textMuted, fontSize: 14 },
    dates: { color: C.textDim, fontSize: 13, marginTop: 2 },
    reviewHint: { color: C.accent, fontSize: 13, fontWeight: '700', marginTop: 8 },
  })
}
