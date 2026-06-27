import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
import { AppHeader, HeaderBackButton } from '../components/AppHeader'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function fmtReviewDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

type Review = { rating: number; body: string | null; created_at: string; reviewer_name: string | null }

// Received reviews for one user. Defaults to the signed-in user (own reputation); pass
// ?user=<id> to view anyone's (e.g. a host checking a rider before accepting). Reviews are
// world-readable (rev_select = true), so this works for self, foreign, and logged-out.
export default function ReviewsScreen() {
  const { user: userParam } = useLocalSearchParams<{ user?: string }>()
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])
  const [loading, setLoading] = useState(true)
  const [reviews, setReviews] = useState<Review[]>([])
  const [avg, setAvg] = useState<number | null>(null)
  const [name, setName] = useState<string | null>(null)
  const [isSelf, setIsSelf] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const targetId = userParam || user?.id
    if (!targetId) { setLoading(false); return }
    setIsSelf(!!user && user.id === targetId)
    const [{ data: prof }, { data: revs }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', targetId).maybeSingle(),
      supabase.from('reviews').select('rating, body, created_at, reviewer_id').eq('reviewee_id', targetId).order('created_at', { ascending: false }),
    ])
    setName(prof?.full_name ?? null)
    const rows = (revs || []) as any[]
    if (rows.length) {
      const reviewerIds = [...new Set(rows.map(r => r.reviewer_id).filter(Boolean))]
      const { data: reviewerProfiles } = await supabase.from('profiles').select('id, full_name').in('id', reviewerIds)
      const reviewerMap: Record<string, string> = {}
      reviewerProfiles?.forEach((p: any) => { reviewerMap[p.id] = p.full_name })
      setReviews(rows.map(r => ({ rating: r.rating, body: r.body, created_at: r.created_at, reviewer_name: reviewerMap[r.reviewer_id] ?? null })))
      setAvg(rows.reduce((sum, r) => sum + r.rating, 0) / rows.length)
    } else {
      setReviews([])
      setAvg(null)
    }
    setLoading(false)
  }, [userParam])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const heading = isSelf ? 'Your reviews' : `${name || 'Rider'}'s reviews`

  return (
    <View style={styles.container}>
      <AppHeader left={<HeaderBackButton />} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>REPUTATION</Text>
        <Text style={styles.title}>{heading}</Text>
        {avg != null && (
          <Text style={styles.summary}>
            {'★'.repeat(Math.round(avg))}{'☆'.repeat(5 - Math.round(avg))}  {avg.toFixed(1)} · {reviews.length} {reviews.length === 1 ? 'review' : 'reviews'}
          </Text>
        )}

        {loading ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 24 }} />
        ) : reviews.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>No reviews yet.</Text>
          </View>
        ) : (
          reviews.map((rev, i) => (
            <View key={i} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardName}>{rev.reviewer_name || 'Rider'}</Text>
                <Text style={styles.cardStars}>{'⭐'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}</Text>
              </View>
              {rev.body ? <Text style={styles.cardBody}>“{rev.body}”</Text> : null}
              <Text style={styles.cardDate}>{fmtReviewDate(rev.created_at)}</Text>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  )
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 24, paddingBottom: 60, gap: 12 },
    kicker: { color: C.accent, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
    title: { color: C.text, fontSize: 28, fontWeight: '900', lineHeight: 34 },
    summary: { color: C.accent, fontSize: 15, fontWeight: '700', marginTop: -4, marginBottom: 6 },
    card: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14, gap: 6 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    cardName: { color: C.text, fontSize: 14, fontWeight: '700' },
    cardStars: { fontSize: 13 },
    cardBody: { color: C.textMuted, fontSize: 14, lineHeight: 20, fontStyle: 'italic' },
    cardDate: { color: C.textDim, fontSize: 11 },
    emptyCard: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 18, alignItems: 'center' },
    emptyText: { color: C.textMuted, fontSize: 14 },
  })
}
