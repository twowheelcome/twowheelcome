import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Image, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
import { FONT } from '../lib/theme'
import { AppHeader, HeaderBackButton } from '../components/AppHeader'
import { SafetyBlock } from '../components/SafetyBlock'
import { ContributionBadge } from '../components/ContributionBadge'
import { sortSleep } from '../lib/sleepOrder'

type Place = {
  id: string
  location_city: string | null
  location_country: string | null
  parking: string | null
  parkings: string[] | null
  sleep_types: string[] | null
  pricings: string[] | null
  pricing: string | null
  price_amount: number | null
  price_currency: string | null
  photos: string[] | null
  paused: boolean
  hasActiveRequest?: boolean   // a live PENDING/ACCEPTED stay — the only thing blocking delete
}

const LISTING_BUCKET = 'listing-photos'
function listingPhotoUrl(path: string): string {
  return supabase.storage.from(LISTING_BUCKET).getPublicUrl(path).data.publicUrl
}

const PARK_TITLE: Record<string, string> = {
  garage_locked: 'Garage', carport: 'Carport', yard: 'Yard', street: 'Street spot',
}
const SLEEP_LABELS: Record<string, string> = { tent: 'Tent space', roof: 'Roof over head', room: 'Private room' }

function placeParkings(p: Place): string[] {
  return p.parkings?.length ? p.parkings : (p.parking ? [p.parking] : [])
}
function placeTitle(p: Place): string {
  const primary = placeParkings(p)[0]
  const what = (primary && PARK_TITLE[primary]) || 'Place'
  return p.location_city ? `${what} in ${p.location_city}` : what
}

export default function MyPlacesScreen() {
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])
  const [loading, setLoading] = useState(true)
  const [places, setPlaces] = useState<Place[]>([])
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<Place | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setPlaces([]); setLoading(false); return }
    // Owner reads the base table directly, so paused places are included (they're only
    // hidden from the public view).
    const { data } = await supabase
      .from('host_locations')
      .select('id, location_city, location_country, parking, parkings, sleep_types, pricings, pricing, price_amount, price_currency, photos, paused')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    const list = (data as Place[]) || []
    // Delete is allowed for any place except one with a live request (PENDING/ACCEPTED, not
    // yet finished) — that must be resolved first. History doesn't block (it detaches on
    // delete). The owner can read their own stays (host_id) under RLS.
    const ids = list.map(p => p.id)
    let active = new Set<string>()
    if (ids.length) {
      const today = new Date().toISOString().split('T')[0]
      const { data: act } = await supabase
        .from('stay_requests')
        .select('location_id')
        .in('location_id', ids)
        .in('status', ['PENDING', 'ACCEPTED'])
        .gte('departure_date', today)
      active = new Set((act ?? []).map((r: { location_id: string }) => r.location_id))
    }
    setPlaces(list.map(p => ({ ...p, hasActiveRequest: active.has(p.id) })))
    setLoading(false)
  }, [])

  useFocusEffect(useCallback(() => { void load() }, [load]))

  async function togglePause(p: Place) {
    if (busy) return
    const next = !p.paused
    setBusy(p.id)
    setError(null)
    setPlaces(prev => prev.map(x => x.id === p.id ? { ...x, paused: next } : x))   // optimistic
    const { error: err } = await supabase.from('host_locations').update({ paused: next }).eq('id', p.id)
    if (err) {
      console.warn('toggle pause error:', err.message)
      setPlaces(prev => prev.map(x => x.id === p.id ? { ...x, paused: p.paused } : x))   // revert
      setError('Could not update availability. Please try again.')
    }
    setBusy(null)
  }

  // Owner-only delete via the SECURITY DEFINER RPC. It refuses (and we explain) while the
  // place still has stay requests, so no shared history is destroyed; on success it returns
  // the photo paths and we clear them from the listing-photos bucket. Coords cascade in DB.
  async function deletePlace(p: Place) {
    if (deleting) return
    setDeleting(true)
    setError(null)
    const { data, error: err } = await supabase.rpc('delete_host_location', { p_id: p.id })
    if (err) {
      console.warn('delete place error:', err.message)
      setDeleting(false)
      setConfirmDelete(null)
      setError(err.message?.includes('active stay request')
        ? 'This place has an active request. Resolve it first, then you can delete the place.'
        : 'Could not delete this place. Please try again.')
      return
    }
    const photos = (data as string[] | null) ?? []
    if (photos.length) await supabase.storage.from('listing-photos').remove(photos).catch(() => {})
    setPlaces(prev => prev.filter(x => x.id !== p.id))
    setDeleting(false)
    setConfirmDelete(null)
  }

  return (
    <View style={styles.container}>
      <AppHeader left={<HeaderBackButton />}>
        <Text style={styles.headerTitle}>My Places</Text>
      </AppHeader>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={C.accent} /></View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          {places.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🏠</Text>
              <Text style={styles.emptyTitle}>No places yet</Text>
              <Text style={styles.emptyText}>Open your door to fellow riders — add your first place.</Text>
            </View>
          ) : (
            places.map(p => {
              const sleep = sortSleep(p.sleep_types || []).filter(s => SLEEP_LABELS[s]).map(s => SLEEP_LABELS[s]).join(' · ')
              const isBusy = busy === p.id
              return (
                <TouchableOpacity key={p.id} style={styles.card} activeOpacity={0.85} onPress={() => router.push({ pathname: '/become-host', params: { place: p.id } })}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{placeTitle(p)}</Text>
                    <View style={[styles.badge, p.paused ? styles.badgePaused : styles.badgeOpen]}>
                      <Text style={[styles.badgeText, { color: p.paused ? C.warning : C.green }]}>{p.paused ? '⏸ PAUSED' : '🟢 OPEN'}</Text>
                    </View>
                  </View>

                  <SafetyBlock parkings={placeParkings(p)} />

                  {p.photos?.length ? (
                    <View style={styles.thumbRow}>
                      {p.photos.slice(0, 3).map(path => (
                        <Image key={path} source={{ uri: listingPhotoUrl(path) }} style={styles.thumb} resizeMode="cover" />
                      ))}
                    </View>
                  ) : null}

                  {sleep ? <Text style={styles.sleep}>🛏 {sleep}</Text> : null}
                  <ContributionBadge loc={p} compact />

                  {/* Availability toggle — right on the card, no need to open the editor */}
                  <TouchableOpacity
                    style={[styles.toggleBtn, p.paused ? styles.toggleResume : styles.togglePause]}
                    onPress={() => togglePause(p)}
                    disabled={isBusy}
                  >
                    {isBusy ? (
                      <ActivityIndicator size="small" color={p.paused ? C.green : C.warning} />
                    ) : (
                      <Text style={[styles.toggleText, { color: p.paused ? C.green : C.warning }]}>
                        {p.paused ? '🟢 Set as available' : '⏸ Pause (I’m away)'}
                      </Text>
                    )}
                  </TouchableOpacity>

                  {p.hasActiveRequest ? (
                    <>
                      <Text style={styles.editHint}>Tap the card to edit this place →</Text>
                      <Text style={styles.lockNote}>🔒 This place has an active request — resolve it first, then you can delete.</Text>
                    </>
                  ) : (
                    <View style={styles.cardFooter}>
                      <Text style={styles.editHint}>Tap the card to edit →</Text>
                      <TouchableOpacity
                        style={styles.deleteBtn}
                        onPress={() => { setError(null); setConfirmDelete(p) }}
                        accessibilityRole="button"
                        accessibilityLabel="Delete this place"
                        hitSlop={6}
                      >
                        <Feather name="trash-2" size={14} color={C.error} />
                        <Text style={styles.deleteText}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </TouchableOpacity>
              )
            })
          )}

          <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/become-host')}>
            <Text style={styles.addBtnText}>+ ADD ANOTHER PLACE</Text>
          </TouchableOpacity>
        </ScrollView>
      )}

      <Modal visible={!!confirmDelete} transparent animationType="fade" onRequestClose={() => !deleting && setConfirmDelete(null)}>
        <View style={styles.confirmOverlay}>
          <View style={styles.confirmSheet}>
            <Text style={styles.confirmTitle}>Delete this place?</Text>
            <Text style={styles.confirmBody}>
              This permanently removes the listing, its exact coordinates and its photos. Past stays and reviews stay on your profile but detach from this place. Riders will no longer see it on the map. This can’t be undone.
            </Text>
            <TouchableOpacity
              style={[styles.confirmDanger, deleting && { opacity: 0.6 }]}
              onPress={() => { if (confirmDelete) void deletePlace(confirmDelete) }}
              disabled={deleting}
            >
              <Text style={styles.confirmDangerText}>{deleting ? 'Deleting…' : 'Yes, delete it'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.confirmCancel} onPress={() => setConfirmDelete(null)} disabled={deleting}>
              <Text style={styles.confirmCancelText}>Keep it</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    headerTitle: { color: C.text, fontSize: 20, fontFamily: FONT.headBold, textAlign: 'center' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    list: { padding: 16, gap: 14, maxWidth: 700, width: '100%', alignSelf: 'center' },
    error: { color: C.error, fontSize: 13, fontFamily: FONT.body },
    empty: { alignItems: 'center', gap: 8, paddingVertical: 40 },
    emptyEmoji: { fontSize: 40 },
    emptyTitle: { color: C.text, fontSize: 18, fontWeight: '800' },
    emptyText: { color: C.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20, fontFamily: FONT.body },
    card: { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 16, gap: 12 },
    cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    cardTitle: { color: C.text, fontSize: 17, fontFamily: FONT.headBold, flex: 1 },
    badge: { borderRadius: 100, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
    badgeOpen: { backgroundColor: C.greenSoft, borderColor: C.green },
    badgePaused: { backgroundColor: C.warningSoft, borderColor: C.warningBorder },
    badgeText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },
    sleep: { color: C.textMuted, fontSize: 14, fontFamily: FONT.body },
    thumbRow: { flexDirection: 'row', gap: 8 },
    thumb: { width: 76, height: 76, borderRadius: 12, backgroundColor: C.elevated },
    toggleBtn: { height: 46, borderRadius: 100, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    togglePause: { backgroundColor: C.warningSoft, borderColor: C.warningBorder },
    toggleResume: { backgroundColor: C.greenSoft, borderColor: C.green },
    toggleText: { fontSize: 14, fontWeight: '800' },
    editHint: { color: C.textDim, fontSize: 12, fontFamily: FONT.body, flexShrink: 1 },
    // Delete sits apart from the tap-to-edit card: its own row under a divider, bordered,
    // right-aligned, destructive colour + trash icon — so it can't be hit by mistake.
    cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderTopWidth: 1, borderTopColor: C.border, paddingTop: 12 },
    deleteBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: C.errorBorder, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8 },
    deleteText: { color: C.error, fontSize: 13, fontWeight: '700' },
    lockNote: { color: C.textDim, fontSize: 12, textAlign: 'center', lineHeight: 17, fontFamily: FONT.body },
    addBtn: { borderWidth: 1, borderColor: C.accent, borderRadius: 100, padding: 14, alignItems: 'center', borderStyle: 'dashed', marginTop: 2 },
    addBtnText: { color: C.accent, fontWeight: '700', fontSize: 14, letterSpacing: 1 },
    confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
    confirmSheet: { backgroundColor: C.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, gap: 12, borderWidth: 1, borderColor: C.errorBorder },
    confirmTitle: { color: C.text, fontSize: 20, fontWeight: '900' },
    confirmBody: { color: C.textMuted, fontSize: 14, lineHeight: 21, fontFamily: FONT.body },
    confirmDanger: { backgroundColor: C.error, borderRadius: 100, paddingVertical: 13, alignItems: 'center' },
    confirmDangerText: { color: C.white, fontSize: 15, fontWeight: '800' },
    confirmCancel: { alignItems: 'center', paddingVertical: 8 },
    confirmCancelText: { color: C.textMuted, fontSize: 14, textDecorationLine: 'underline' },
  })
}
