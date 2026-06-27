import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { useLocalSearchParams } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
import { AppHeader, HeaderBackButton } from '../components/AppHeader'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
function fmtReviewDate(iso: string): string {
  const d = new Date(iso)
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

type Review = {
  id: string
  rating: number
  body: string | null
  created_at: string
  reviewer_name: string | null
  reply_body: string | null
  reply_created_at: string | null
}

// Received reviews for one user. Defaults to the signed-in user (own reputation); pass
// ?user=<id> to view anyone's (e.g. a host checking a rider before accepting). Reviews are
// world-readable (rev_select = true), so this works for self, foreign, and logged-out.
// The reviewed person (isSelf) can post one public reply per review (set_review_reply RPC).
export default function ReviewsScreen() {
  const { user: userParam } = useLocalSearchParams<{ user?: string }>()
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])
  const [loading, setLoading] = useState(true)
  const [reviews, setReviews] = useState<Review[]>([])
  const [avg, setAvg] = useState<number | null>(null)
  const [name, setName] = useState<string | null>(null)
  const [isSelf, setIsSelf] = useState(false)
  const [replyingId, setReplyingId] = useState<string | null>(null)
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({})
  const [submittingReplyId, setSubmittingReplyId] = useState<string | null>(null)
  const [replyError, setReplyError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    const targetId = userParam || user?.id
    if (!targetId) { setLoading(false); return }
    setIsSelf(!!user && user.id === targetId)
    const [{ data: prof }, { data: revs }] = await Promise.all([
      supabase.from('profiles').select('full_name').eq('id', targetId).maybeSingle(),
      supabase.from('reviews').select('id, rating, body, created_at, reviewer_id, reply_body, reply_created_at').eq('reviewee_id', targetId).order('created_at', { ascending: false }),
    ])
    setName(prof?.full_name ?? null)
    const rows = (revs || []) as any[]
    if (rows.length) {
      const reviewerIds = [...new Set(rows.map(r => r.reviewer_id).filter(Boolean))]
      const { data: reviewerProfiles } = await supabase.from('profiles').select('id, full_name').in('id', reviewerIds)
      const reviewerMap: Record<string, string> = {}
      reviewerProfiles?.forEach((p: any) => { reviewerMap[p.id] = p.full_name })
      setReviews(rows.map(r => ({
        id: r.id,
        rating: r.rating,
        body: r.body,
        created_at: r.created_at,
        reviewer_name: reviewerMap[r.reviewer_id] ?? null,
        reply_body: r.reply_body ?? null,
        reply_created_at: r.reply_created_at ?? null,
      })))
      setAvg(rows.reduce((sum, r) => sum + r.rating, 0) / rows.length)
    } else {
      setReviews([])
      setAvg(null)
    }
    setLoading(false)
  }, [userParam])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  async function submitReply(reviewId: string) {
    const text = (replyDraft[reviewId] || '').trim()
    if (!text || submittingReplyId) return
    setSubmittingReplyId(reviewId)
    setReplyError(null)
    const { error } = await supabase.rpc('set_review_reply', { p_review_id: reviewId, p_reply: text })
    if (error) {
      console.warn('set_review_reply error:', error.message)
      setReplyError("Couldn't post your reply. Please try again.")
      setSubmittingReplyId(null)
      return
    }
    setSubmittingReplyId(null)
    setReplyingId(null)
    setReplyDraft(prev => ({ ...prev, [reviewId]: '' }))
    // Re-load so the reply shows exactly as stored (coordinates are scrubbed server-side).
    await load()
  }

  const heading = isSelf ? 'Your reviews' : `${name || 'Rider'}'s reviews`
  const replyAuthor = name || 'host'

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
          reviews.map((rev) => (
            <View key={rev.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardName}>{rev.reviewer_name || 'Rider'}</Text>
                <Text style={styles.cardStars}>{'⭐'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}</Text>
              </View>
              {rev.body ? <Text style={styles.cardBody}>“{rev.body}”</Text> : null}
              <Text style={styles.cardDate}>{fmtReviewDate(rev.created_at)}</Text>

              {/* Public reply from the reviewed person */}
              {rev.reply_body ? (
                <View style={styles.replyBlock}>
                  <Text style={styles.replyAuthor}>Reply from {replyAuthor}</Text>
                  <Text style={styles.replyBody}>{rev.reply_body}</Text>
                  {rev.reply_created_at ? <Text style={styles.replyDate}>{fmtReviewDate(rev.reply_created_at)}</Text> : null}
                </View>
              ) : isSelf ? (
                replyingId === rev.id ? (
                  <View style={styles.replyEditor}>
                    <TextInput
                      style={styles.replyInput}
                      placeholder="Reply publicly — thank them, or add your side. Keep exact addresses out."
                      placeholderTextColor={C.placeholder}
                      value={replyDraft[rev.id] || ''}
                      onChangeText={t => setReplyDraft(prev => ({ ...prev, [rev.id]: t }))}
                      multiline
                      maxLength={2000}
                      autoFocus
                    />
                    {replyError ? <Text style={styles.replyErrorText}>{replyError}</Text> : null}
                    <View style={styles.replyActions}>
                      <TouchableOpacity
                        style={[styles.replySubmit, (!(replyDraft[rev.id] || '').trim() || submittingReplyId === rev.id) && styles.replySubmitDisabled]}
                        onPress={() => submitReply(rev.id)}
                        disabled={!(replyDraft[rev.id] || '').trim() || submittingReplyId === rev.id}
                      >
                        <Text style={styles.replySubmitText}>{submittingReplyId === rev.id ? 'Posting…' : 'Post reply'}</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setReplyingId(null); setReplyError(null) }}>
                        <Text style={styles.replyCancel}>Cancel</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <TouchableOpacity style={styles.replyBtn} onPress={() => { setReplyError(null); setReplyingId(rev.id) }}>
                    <Text style={styles.replyBtnText}>↩ Reply</Text>
                  </TouchableOpacity>
                )
              ) : null}
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

    replyBlock: { marginTop: 4, borderLeftWidth: 3, borderLeftColor: C.accent, paddingLeft: 12, gap: 3 },
    replyAuthor: { color: C.accent, fontSize: 12, fontWeight: '800' },
    replyBody: { color: C.text, fontSize: 14, lineHeight: 20 },
    replyDate: { color: C.textDim, fontSize: 11 },

    replyBtn: { alignSelf: 'flex-start', marginTop: 2, paddingVertical: 7, paddingHorizontal: 14, borderRadius: 100, borderWidth: 1, borderColor: C.border },
    replyBtnText: { color: C.textMuted, fontSize: 13, fontWeight: '700' },
    replyEditor: { marginTop: 4, gap: 8 },
    replyInput: { backgroundColor: C.elevated, borderRadius: 12, padding: 12, color: C.text, fontSize: 15, lineHeight: 21, minHeight: 72, borderWidth: 1, borderColor: C.accent, textAlignVertical: 'top' },
    replyErrorText: { color: C.error, fontSize: 12 },
    replyActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
    replySubmit: { backgroundColor: C.accent, borderRadius: 100, paddingHorizontal: 20, paddingVertical: 9 },
    replySubmitDisabled: { opacity: 0.5 },
    replySubmitText: { color: C.white, fontSize: 13, fontWeight: '800' },
    replyCancel: { color: C.textDim, fontSize: 13 },
  })
}
