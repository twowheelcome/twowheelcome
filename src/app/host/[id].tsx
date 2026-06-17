import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useTheme, type ThemeColors } from '../../lib/ThemeContext'
import { SafetyBlock } from '../../components/SafetyBlock'
import { AppHeader, HeaderBackButton } from '../../components/AppHeader'
import { UserChip } from '../../components/UserChip'
import { getBuddyState, sendBuddyRequest, acceptBuddy, type BuddyState } from '../../lib/buddies'

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
  const { id, location: locationParam } = useLocalSearchParams<{ id: string; location?: string }>()
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])

  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [profile, setProfile] = useState<any>(null)
  const [location, setLocation] = useState<any>(null)
  const [avgRating, setAvgRating] = useState<number | null>(null)
  const [reviewCount, setReviewCount] = useState(0)
  const [reviews, setReviews] = useState<any[]>([])
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)
  const [myId, setMyId] = useState<string | null>(null)
  const [buddyState, setBuddyState] = useState<BuddyState | null>(null)
  const [buddyBusy, setBuddyBusy] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setIsLoggedIn(!!session); setMyId(session?.user?.id ?? null) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => { setIsLoggedIn(!!session); setMyId(session?.user?.id ?? null) })
    return () => subscription.unsubscribe()
  }, [])

  // Load buddy relationship between me and this profile (only when viewing someone else).
  useEffect(() => {
    if (!myId || !id || myId === id) { setBuddyState(null); return }
    getBuddyState(myId, id).then(setBuddyState)
  }, [myId, id])

  async function handleBuddyPress() {
    if (!myId || !id || buddyBusy) return
    setBuddyBusy(true)
    if (buddyState === 'none') {
      const { error } = await sendBuddyRequest(myId, id)
      if (!error) setBuddyState('requested')
    } else if (buddyState === 'incoming') {
      const { error } = await acceptBuddy(myId, id)
      if (!error) setBuddyState('buddies')
    }
    setBuddyBusy(false)
  }

  function goToSignup() {
    router.push({ pathname: '/', params: { signup: '1' } })
  }

  const load = useCallback(async (userId: string, locationId?: string) => {
    // Public profile reads the coarse-coordinate view; fall back to the base
    // table only if the view doesn't exist yet (before the DB migration runs).
    const locFrom = (table: string) => {
      const base = supabase.from(table).select('*').eq('user_id', userId)
      return locationId
        ? base.eq('id', locationId).maybeSingle()
        : base.order('created_at', { ascending: true }).limit(1).maybeSingle()
    }
    const [{ data: prof }, locRes, { data: revs }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, bio, bike_model, avatar_url').eq('id', userId).maybeSingle(),
      locFrom('host_locations_public'),
      supabase.from('reviews')
        .select('rating, body, reviewer_id')
        .eq('reviewee_id', userId)
        .order('created_at', { ascending: false })
    ])

    let loc = locRes.data
    if (locRes.error && /does not exist|find the table|42P01|PGRST205/i.test(`${locRes.error.code} ${locRes.error.message}`)) {
      loc = (await locFrom('host_locations')).data
    }

    if (!prof || !loc) { setNotFound(true); setLoading(false); return }

    setProfile(prof)
    setLocation(loc)

    if (revs?.length) {
      const reviewerIds = [...new Set(revs.map((r: any) => r.reviewer_id).filter(Boolean))]
      const { data: reviewerProfiles } = await supabase
        .from('profiles').select('id, full_name').in('id', reviewerIds)
      const reviewerMap: Record<string, string> = {}
      reviewerProfiles?.forEach((p: any) => { reviewerMap[p.id] = p.full_name })

      const sum = revs.reduce((acc: number, r: any) => acc + r.rating, 0)
      setAvgRating(sum / revs.length)
      setReviewCount(revs.length)
      setReviews(revs.slice(0, 5).map((r: any) => ({ ...r, reviewer_name: reviewerMap[r.reviewer_id] || null })))
    }

    setLoading(false)
  }, [])

  useEffect(() => {
    if (!id) return
    void Promise.resolve().then(() => load(id, locationParam))
  }, [id, locationParam, load])

  if (loading) {
    return (
      <View style={styles.container}>
        <AppHeader left={<HeaderBackButton />} right={<UserChip />} />
        <View style={styles.center}>
          <ActivityIndicator color={C.accent} />
        </View>
      </View>
    )
  }

  if (notFound) {
    return (
      <View style={styles.container}>
        <AppHeader left={<HeaderBackButton />} right={<UserChip />} />
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
      <AppHeader left={<HeaderBackButton />} right={<UserChip />} />
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
                {`${'★'.repeat(Math.round(avgRating))}${'☆'.repeat(5 - Math.round(avgRating))} ${avgRating.toFixed(1)} · ${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}`}
              </Text>
            )}
            {profile.bike_model && <Text style={styles.meta}>🏍 {profile.bike_model}</Text>}
            {location.location_city && (
              <Text style={styles.meta}>📍 {location.location_city}, {location.location_country}</Text>
            )}
          </View>
        </View>

        {/* Buddy button — only when logged in and viewing someone else */}
        {myId && id !== myId && buddyState && (
          <TouchableOpacity
            style={[styles.buddyBtn, buddyState === 'buddies' && styles.buddyBtnActive, buddyState === 'requested' && styles.buddyBtnMuted]}
            onPress={handleBuddyPress}
            disabled={buddyBusy || buddyState === 'requested' || buddyState === 'buddies'}
            activeOpacity={0.85}
          >
            <Text style={[styles.buddyBtnText, buddyState === 'buddies' && styles.buddyBtnTextActive]}>
              {buddyState === 'none' && '+ Add as buddy'}
              {buddyState === 'requested' && 'Buddy request sent'}
              {buddyState === 'incoming' && 'Accept buddy request'}
              {buddyState === 'buddies' && '⭐ Buddies'}
            </Text>
          </TouchableOpacity>
        )}

        {/* Sign-up CTA — only for logged-out visitors (acquisition surface) */}
        {isLoggedIn === false && (
          <View style={styles.joinBanner}>
            <Text style={styles.joinBannerTitle}>New here? Join the ride.</Text>
            <Text style={styles.joinBannerText}>
              twowheelcome connects riders on the road. Find a safe overnight spot for you and your bike — or open your own place to fellow riders. Free, rider to rider.
            </Text>
            <TouchableOpacity style={styles.joinBannerBtn} onPress={goToSignup}>
              <Text style={styles.joinBannerBtnText}>Create your free account</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push({ pathname: '/' })}>
              <Text style={styles.joinBannerLogin}>Already have an account? Log in</Text>
            </TouchableOpacity>
          </View>
        )}

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

        <View style={styles.section}>
          <Text style={styles.sectionLabel}>Reviews from riders</Text>
          {reviews.length > 0 ? (
            <>
              {reviews.map((r: any, i: number) => (
              <View key={i} style={styles.reviewCard}>
                <Text style={styles.reviewStars}>{`${'★'.repeat(r.rating)}${'☆'.repeat(5 - r.rating)}`}</Text>
                {r.body ? <Text style={styles.reviewBody}>{`“${r.body}”`}</Text> : null}
                {r.reviewer_name ? <Text style={styles.reviewAuthor}>{`— ${r.reviewer_name}`}</Text> : null}
              </View>
              ))}
            </>
          ) : (
            <View style={styles.reviewCard}>
              <Text style={styles.reviewEmpty}>No reviews yet.</Text>
            </View>
          )}
        </View>

        <View style={styles.divider} />
        <Text style={styles.joinCta}>Want to stay here?</Text>
        <Text style={styles.joinSub}>Send a stay request to {profile.full_name?.split(' ')[0] || 'this host'} and agree on the details in chat.</Text>
        <TouchableOpacity
          style={styles.ctaBtn}
          onPress={() => {
            if (isLoggedIn === false) { goToSignup(); return }
            router.replace({ pathname: '/(tabs)/map', params: { knockHost: profile.id, knockLocation: location.id } })
          }}
        >
          <Text style={styles.ctaBtnText}>{isLoggedIn === false ? 'Join to knock on the door' : 'Knock on the door'}</Text>
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

  buddyBtn:          { borderWidth: 1, borderColor: C.buddyBorder, backgroundColor: C.buddySoft, borderRadius: 100, paddingVertical: 12, alignItems: 'center', justifyContent: 'center' },
  buddyBtnActive:    { backgroundColor: C.buddy, borderColor: C.buddy },
  buddyBtnMuted:     { opacity: 0.7 },
  buddyBtnText:      { color: C.buddy, fontSize: 14, fontWeight: '800', letterSpacing: 0.5 },
  buddyBtnTextActive:{ color: C.white },

  joinBanner:        { backgroundColor: C.accentSoft, borderColor: C.accentBorder, borderWidth: 1, borderRadius: 22, padding: 18, gap: 10 },
  joinBannerTitle:   { color: C.text, fontSize: 18, fontWeight: '900' },
  joinBannerText:    { color: C.textMuted, fontSize: 14, lineHeight: 21 },
  joinBannerBtn:     { height: 50, borderRadius: 100, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  joinBannerBtnText: { color: C.white, fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  joinBannerLogin:   { color: C.accent, fontSize: 13, fontWeight: '700', textAlign: 'center' },

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
  reviewEmpty:  { color: C.textMuted, fontSize: 13, lineHeight: 20 },

  divider:      { height: 1, backgroundColor: C.border, marginVertical: 8 },
  joinCta:      { color: C.text, fontSize: 18, fontWeight: '900' },
  joinSub:      { color: C.textMuted, fontSize: 14, lineHeight: 21 },
  ctaBtn:       { height: 52, borderRadius: 100, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  ctaBtnText:   { color: C.white, fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },

  notFoundEmoji: { fontSize: 52, textAlign: 'center' },
  notFoundTitle: { color: C.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  notFoundSub:   { color: C.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
}) }
