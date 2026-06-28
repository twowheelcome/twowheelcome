import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
import { FONT } from '../lib/theme'
import { pendingChatStore } from '../lib/pendingChatStore'
import { getLocalYMD } from '../lib/date'
import { AppHeader, HeaderBackButton } from '../components/AppHeader'

type Stay = {
  id: string
  status: string
  role: 'guest' | 'host'
  otherName: string
  city: string
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

function dateRange(a?: string | null, d?: string | null): string {
  const fa = fmtDateStr(a), fd = fmtDateStr(d)
  if (fa && fd && fa !== fd) return `${fa}–${fd}`
  return fa || fd || ''
}

function todayStr() {
  return getLocalYMD()
}

const STATUS_META: Record<string, { label: string; key: 'success' | 'warning' | 'error' | 'info' }> = {
  PENDING: { label: 'Pending', key: 'warning' },
  ACCEPTED: { label: 'Accepted', key: 'success' },
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

    // Country is read from the stay's own snapshot, so the log stays intact even after
    // the listing is deleted — it's a historical record. City is intentionally not shown
    // (privacy): the exact point lived only in the chat between the two parties.
    const { data: reqs } = await supabase
      .from('stay_requests')
      .select('id, status, host_id, guest_id, conversation_id, arrival_date, departure_date, location_country')
      .or(`guest_id.eq.${userId},host_id.eq.${userId}`)
      .order('arrival_date', { ascending: false })

    if (!reqs || reqs.length === 0) { setStays([]); setLoading(false); return }

    const otherIds = [...new Set(reqs.map((r: any) => (r.guest_id === userId ? r.host_id : r.guest_id)).filter(Boolean))]

    const [{ data: profiles }, { data: myReviews }] = await Promise.all([
      otherIds.length ? supabase.from('profiles').select('id, full_name').in('id', otherIds) : Promise.resolve({ data: [] as any[] }),
      supabase.from('reviews').select('stay_request_id').eq('reviewer_id', userId),
    ])

    const nameMap: Record<string, string> = {}
    profiles?.forEach((p: any) => { nameMap[p.id] = p.full_name || 'Rider' })
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
        city: [r.location_country].filter(Boolean).join(', '),
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

  // The conversation always exists (it's never deleted with a listing), so this is
  // the one safe tap — to the chat, and into the review for a finished stay.
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
            // Pending knock whose arrival day is in the past = expired (no reply); show muted.
            const expired = s.status === 'PENDING' && !!s.arrival && s.arrival < todayStr()
            return (
              <TouchableOpacity key={s.id} style={styles.row} onPress={() => openConversation(s)} activeOpacity={0.7}>
                <Text style={styles.rowIcon}>{s.role === 'guest' ? '🏍' : '🏠'}</Text>
                <View style={styles.rowBody}>
                  <Text style={styles.sentence}>
                    {s.role === 'guest' ? 'You stayed at ' : 'You hosted '}
                    <Text style={styles.strong}>{s.otherName}</Text>
                    {s.city ? <>{s.role === 'guest' ? ' in ' : ' at '}<Text style={styles.strong}>{s.city}</Text></> : null}
                  </Text>
                  <View style={styles.metaRow}>
                    <Text style={styles.date}>{dateRange(s.arrival, s.departure)}</Text>
                    <View style={[styles.statusChip, expired
                      ? { backgroundColor: C.surface, borderColor: C.border }
                      : { backgroundColor: C[`${meta.key}Soft`], borderColor: C[`${meta.key}Border`] }]}>
                      <Text style={[styles.statusText, { color: expired ? C.textMuted : C[meta.key] }]}>{expired ? 'Expired' : meta.label}</Text>
                    </View>
                  </View>
                  {s.canReview ? <Text style={styles.reviewHint}>⭐ Leave a review →</Text> : null}
                </View>
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
    headerTitle: { color: C.text, fontSize: 20, fontFamily: FONT.headBold, textAlign: 'center' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
    emptyEmoji: { fontSize: 40 },
    emptyTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
    emptyText: { color: C.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: FONT.body },
    list: { padding: 16, gap: 10, maxWidth: 700, width: '100%', alignSelf: 'center' },
    row: { flexDirection: 'row', gap: 12, backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14 },
    rowIcon: { fontSize: 20, marginTop: 1 },
    rowBody: { flex: 1, gap: 5 },
    sentence: { color: C.text, fontSize: 15, lineHeight: 21, fontFamily: FONT.body },
    strong: { color: C.text, fontWeight: '800' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    date: { color: C.textDim, fontSize: 13, fontFamily: FONT.body },
    statusChip: { borderRadius: 100, paddingHorizontal: 9, paddingVertical: 2, borderWidth: 1 },
    statusText: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase' },
    reviewHint: { color: C.accent, fontSize: 13, fontWeight: '700', marginTop: 2 },
  })
}
