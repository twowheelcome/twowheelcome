import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { router, useFocusEffect } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
import { FONT } from '../lib/theme'
import { AppHeader, HeaderBackButton } from '../components/AppHeader'
import { SafetyBlock } from '../components/SafetyBlock'
import { ContributionBadge } from '../components/ContributionBadge'

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
  paused: boolean
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

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setPlaces([]); setLoading(false); return }
    // Owner reads the base table directly, so paused places are included (they're only
    // hidden from the public view).
    const { data } = await supabase
      .from('host_locations')
      .select('id, location_city, location_country, parking, parkings, sleep_types, pricings, pricing, price_amount, price_currency, paused')
      .eq('user_id', user.id)
      .order('created_at', { ascending: true })
    setPlaces((data as Place[]) || [])
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
              const sleep = (p.sleep_types || []).filter(s => SLEEP_LABELS[s]).map(s => SLEEP_LABELS[s]).join(' · ')
              const isBusy = busy === p.id
              return (
                <TouchableOpacity key={p.id} style={styles.card} activeOpacity={0.85} onPress={() => router.push('/become-host')}>
                  <View style={styles.cardTop}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{placeTitle(p)}</Text>
                    <View style={[styles.badge, p.paused ? styles.badgePaused : styles.badgeOpen]}>
                      <Text style={[styles.badgeText, { color: p.paused ? C.warning : C.green }]}>{p.paused ? '⏸ PAUSED' : '🟢 OPEN'}</Text>
                    </View>
                  </View>

                  <SafetyBlock parkings={placeParkings(p)} />

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

                  <Text style={styles.editHint}>Tap the card to edit this place →</Text>
                </TouchableOpacity>
              )
            })
          )}

          <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/become-host')}>
            <Text style={styles.addBtnText}>+ ADD ANOTHER PLACE</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
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
    toggleBtn: { height: 46, borderRadius: 100, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    togglePause: { backgroundColor: C.warningSoft, borderColor: C.warningBorder },
    toggleResume: { backgroundColor: C.greenSoft, borderColor: C.green },
    toggleText: { fontSize: 14, fontWeight: '800' },
    editHint: { color: C.textDim, fontSize: 12, textAlign: 'center', fontFamily: FONT.body },
    addBtn: { borderWidth: 1, borderColor: C.accent, borderRadius: 100, padding: 14, alignItems: 'center', borderStyle: 'dashed', marginTop: 2 },
    addBtnText: { color: C.accent, fontWeight: '700', fontSize: 14, letterSpacing: 1 },
  })
}
