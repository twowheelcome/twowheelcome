import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useTheme, type ThemeColors } from '../../lib/ThemeContext'
import { SafetyBlock } from '../../components/SafetyBlock'
import { AppHeader } from '../../components/AppHeader'

const AMENITY_ICONS: Record<string, string> = {
  shower: '🚿', toilet: '🚽', kitchen: '🍳', laundry: '👕',
  electricity: '⚡', wifi: '📶', pub_nearby: '🍺', breakfast: '☕',
  dinner: '🍽', local_routes: '🗺', group_ride: '🏍',
}
const AMENITY_LABELS: Record<string, string> = {
  shower: 'Shower', toilet: 'Toilet', kitchen: 'Kitchen', laundry: 'Laundry',
  electricity: 'Power', wifi: 'WiFi', pub_nearby: 'Pub nearby', breakfast: 'Breakfast',
  dinner: 'Dinner', local_routes: 'Local routes', group_ride: 'Group ride',
}
const SLEEP_LABELS: Record<string, string> = {
  tent: '⛺ Tent', roof: '🏠 Roof over head', room: '🛏 Private room',
}

export default function PublicHostProfile() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [location, setLocation] = useState<any>(null)
  const [avgRating, setAvgRating] = useState<number | null>(null)
  const [reviewCount, setReviewCount] = useState(0)
  const [reviews, setReviews] = useState<any[]>([])

  const load = useCallback(async (userId: string) => {
    const [{ data: prof }, { data: locs }, { data: revs }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, bio, bike_model, avatar_url').eq('id', userId).maybeSingle(),
      supabase.from('host_locations').select('*').eq('user_id', userId).limit(1).maybeSingle(),
      supabase.from('reviews')
        .select('rating, body, reviewer_id')
        .eq('reviewee_id', userId)
        .order('created_at', { ascending: false })
        .limit(5),
    ])

    if (!prof || !locs) { setNotFound(true); setLoading(false); return }

    setProfile(prof)
    setLocation(locs)

    if (revs?.length) {
      const reviewerIds = [...new Set(revs.map((r: any) => r.reviewer_id).filter(Boolean))]
      const { data: reviewerProfiles } = await supabase
        .from('profiles').select('id, full_name').in('id', reviewerIds)
      const reviewerMap: Record<string, string> = {}
      reviewerProfiles?.forEach((p: any) => { reviewerMap[p.id] = p.full_name })

      const sum = revs.reduce((acc: number, r: any) => acc + r.rating, 0)
      setAvgRating(sum / revs.length)
      setReviewCount(revs.length)
      setReviews(revs.map((r: any) => ({ ...r, reviewer_name: reviewerMap[r.reviewer_id] || null })))
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    if (!id) return
    void Promise.resolve().then(() => load(id))
  }, [id, load])

  if (loading) {
    return (
      <View style={styles.container}>
        <AppHeader />
        <View style={styles.center}>
          <ActivityIndicator color={C.accent} />
        </View>
      </View>
    )
  }

  if (notFound) {
    return (
      <View style={styles.container}>
        <AppHeader />
        <View style={styles.center}>
          <Text style={styles.notFoundEmoji}>🏍</Text>
          <Text style={styles.notFoundTitle}>Rider not found</Text>
          <Text style={styles.notFoundSub}>This profile does not exist or is no longer active.</Text>
          <TouchableOpacity style={styles.ctaBtn} onPress={() => router.replace('/')}>
            <Text style={styles.ctaBtnText}>Go to app</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  const parkings: string[] = location.parkings?.length ? location.parkings : (location.parking ? [location.parking] : [])
  const initials = (profile.full_name || '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  return (
    <View style={styles.container}>
      <AppHeader />
      <ScrollView contentContainerStyle={styles.content}>

        {/* Avatar + name */}
        <View style={styles.heroRow}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <View style={styles.heroInfo}>
            <Text style={styles.name}>{profile.full_name || 'Anonymous Rider'}</Text>
            {avgRating != null && (
              <Text style={styles.rating}>
                {`${'★'.repeat(Math.round(avgRating))}${'☆'.repeat(5 - Math.round(avgRating))} ${avgRating.toFixed(1)} · ${reviewCount} ${reviewCount === 1 ? 'stay' : 'stays'}`}
              </Text>
            )}
            {profile.bike_model && <Text style={styles.meta}>🏍 {profile.bike_model}</Text>}
            {location.location_city && (
              <Text style={styles.meta}>📍 {location.location_city}, {location.location_country}</Text>
            )}
          </View>
        </View>

        {/* Bike safety */}
        {parkings.length > 0 && <SafetyBlock parkings={parkings} />}

        {/* Bio */}
        {(location.notes || profile.bio) && (
          <Text style={styles.bio}>{location.notes || profile.bio}</Text>
        )}

        {/* Sleep */}
        {location.sleep_types?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Where you sleep</Text>
            <View style={styles.chips}>
              {(location.sleep_types as string[]).map((s: string) => (
                <View key={s} style={styles.chip}>
                  <Text style={styles.chipText}>{SLEEP_LABELS[s] || s}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* Amenities */}
        {location.amenities?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Amenities</Text>
            <View style={styles.chips}>
              {(location.amenities as string[]).map((a: string) => (
                <View key={a} style={styles.chip}>
                  <Text style={styles.chipText}>{AMENITY_ICONS[a] || '•'} {AMENITY_LABELS[a] || a}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <Text style={styles.maxGuests}>👥 Up to {location.max_guests} {location.max_guests === 1 ? 'rider' : 'riders'}</Text>

        {/* Reviews */}
        {reviews.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Reviews from riders</Text>
            {reviews.map((r: any, i: number) => (
              <View key={i} style={styles.reviewCard}>
                <Text style={styles.reviewStars}>{`${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}`}</Text>
                {r.body ? <Text style={styles.reviewBody}>{`”${r.body}”`}</Text> : null}
                {r.reviewer_name ? <Text style={styles.reviewAuthor}>{`— ${r.reviewer_name}`}</Text> : null}
              </View>
            ))}
          </View>
        )}

        <View style={styles.divider} />
        <Text style={styles.joinCta}>Want to stay here?</Text>
        <Text style={styles.joinSub}>Download the Twowheelcome app or log in to send a stay request to {profile.full_name?.split(' ')[0] || 'this host'}.</Text>
        <TouchableOpacity style={styles.ctaBtn} onPress={() => router.replace('/(tabs)/map')}>
          <Text style={styles.ctaBtnText}>Open in app</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

function makeStyles(C: ThemeColors) { return StyleSheet.create({
  container:    { flex: 1, backgroundColor: C.bg },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 32 },
  content:      { padding: 20, gap: 16, paddingBottom: 60, maxWidth: 640, width: '100%', alignSelf: 'center' },

  heroRow:      { flexDirection: 'row', alignItems: 'center', gap: 16 },
  avatar:       { width: 76, height: 76, borderRadius: 38, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  avatarText:   { color: C.white, fontWeight: '800', fontSize: 28 },
  heroInfo:     { flex: 1, gap: 3 },
  name:         { color: C.text, fontSize: 24, fontWeight: '900' },
  rating:       { color: C.accent, fontSize: 14, fontWeight: '700' },
  meta:         { color: C.textMuted, fontSize: 13 },

  bio:          { color: C.text, fontSize: 15, lineHeight: 23 },

  section:      { gap: 8 },
  sectionLabel: { color: C.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  chips:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip:         { backgroundColor: C.surface, borderRadius: 100, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12, paddingVertical: 6 },
  chipText:     { color: C.text, fontSize: 13, fontWeight: '600' },

  maxGuests:    { color: C.textMuted, fontSize: 13 },

  reviewCard:   { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14, gap: 5 },
  reviewStars:  { color: C.accent, fontSize: 14 },
  reviewBody:   { color: C.text, fontSize: 14, lineHeight: 20 },
  reviewAuthor: { color: C.textMuted, fontSize: 12 },

  divider:      { height: 1, backgroundColor: C.border, marginVertical: 8 },
  joinCta:      { color: C.text, fontSize: 18, fontWeight: '900' },
  joinSub:      { color: C.textMuted, fontSize: 14, lineHeight: 21 },
  ctaBtn:       { height: 52, borderRadius: 100, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  ctaBtnText:   { color: C.white, fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },

  notFoundEmoji: { fontSize: 52, textAlign: 'center' },
  notFoundTitle: { color: C.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  notFoundSub:   { color: C.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
}) }
