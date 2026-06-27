import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useTheme, type ThemeColors } from '../../lib/ThemeContext'
import { SafetyBlock } from '../../components/SafetyBlock'
import { ListingGallery } from '../../components/ListingGallery'
import { AppHeader, HeaderBackButton } from '../../components/AppHeader'
import { UserChip } from '../../components/UserChip'

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
const PRICING_LABELS: Record<string, string> = { free: 'Free', tip: 'Tip welcome', fixed: 'Paid' }

function pricingText(loc: any): string {
  const pricings: string[] = loc?.pricings?.length ? loc.pricings : (loc?.pricing ? [loc.pricing] : [])
  const currency = loc?.price_currency || 'EUR'
  return pricings.map((v: string) => {
    if (v === 'fixed') {
      return loc?.price_amount != null ? `${loc.price_amount} ${currency} / night` : 'Paid'
    }
    return PRICING_LABELS[v] || v
  }).join(' · ')
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
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setIsLoggedIn(!!session) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => { setIsLoggedIn(!!session) })
    return () => subscription.unsubscribe()
  }, [])

  function goToSignup() {
    router.push({ pathname: '/', params: { signup: '1' } })
  }

  const load = useCallback(async (userId: string, locationId?: string) => {
    // Public profiles only read the coarse, privacy-safe view.
    const locFrom = (table: string) => {
      const base = supabase.from(table).select('*').eq('user_id', userId)
      return locationId
        ? base.eq('id', locationId).maybeSingle()
        : base.order('created_at', { ascending: true }).limit(1).maybeSingle()
    }
    const [{ data: prof }, locRes, { data: revs }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, bio, avatar_url').eq('id', userId).maybeSingle(),
      locFrom('host_locations_public'),
      supabase.from('reviews')
        .select('rating, body, reviewer_id')
        .eq('reviewee_id', userId)
        .order('created_at', { ascending: false })
    ])

    const loc = locRes.data

    // A profile is enough — riders with no listing still have a reputation to show.
    // The host-offer sections and the knock CTA below only render when there's a location.
    if (!prof) { setNotFound(true); setLoading(false); return }

    setProfile(prof)
    setLocation(loc)

    if (revs?.length) {
      // The full list lives on the /reviews screen now; here we only need the summary.
      const sum = revs.reduce((acc: number, r: any) => acc + r.rating, 0)
      setAvgRating(sum / revs.length)
      setReviewCount(revs.length)
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

  const parkings: string[] = location?.parkings?.length ? location.parkings : (location?.parking ? [location.parking] : [])
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
            {location?.location_city && (
              <Text style={styles.meta}>📍 {location.location_city}, {location.location_country}</Text>
            )}
          </View>
        </View>

        {/* Sign-up CTA — only for logged-out visitors (acquisition surface) */}
        {isLoggedIn === false && (
          <View style={styles.joinBanner}>
            <Text style={styles.joinBannerTitle}>New here? Join the ride.</Text>
            <Text style={styles.joinBannerText}>
              twowheelcome connects riders on the road. Find a safe overnight spot for you and your bike — or open your own place to fellow riders. Free to join. Any contribution is agreed directly in chat.
            </Text>
            <TouchableOpacity style={styles.joinBannerBtn} onPress={goToSignup}>
              <Text style={styles.joinBannerBtnText}>Create your free account</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => router.push({ pathname: '/' })}>
              <Text style={styles.joinBannerLogin}>Already have an account? Log in</Text>
            </TouchableOpacity>
            <View style={styles.legalLinks}>
              <TouchableOpacity onPress={() => router.push('/privacy')} hitSlop={8}>
                <Text style={styles.legalLinkText}>Privacy</Text>
              </TouchableOpacity>
              <Text style={styles.legalSeparator}>·</Text>
              <TouchableOpacity onPress={() => router.push('/terms')} hitSlop={8}>
                <Text style={styles.legalLinkText}>Terms</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Bike safety */}
        {parkings.length > 0 && <SafetyBlock parkings={parkings} />}

        {/* Bio */}
        {profile.bio ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>About {profile.full_name?.split(' ')[0] || 'this rider'}</Text>
            <Text style={styles.bio}>{profile.bio}</Text>
          </View>
        ) : null}

        {/* What the host wrote about this place (public description) */}
        {location?.notes ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>About this place</Text>
            <Text style={styles.bio}>{location.notes}</Text>
          </View>
        ) : null}

        {/* Sleep */}
        {location?.sleep_types?.length > 0 && (
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
        {location?.amenities?.length > 0 && (
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

        {/* What this host wants in return (incl. the amount for a Paid listing) */}
        {location && pricingText(location) ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>What this host wants in return</Text>
            <Text style={styles.bio}>💶 {pricingText(location)}</Text>
            {location.pricings?.includes('fixed') && location.price_amount != null ? (
              <Text style={styles.priceHint}>Indicative — the exact amount and currency are agreed in chat (local cash is fine).</Text>
            ) : null}
          </View>
        ) : null}

        {/* Listing photos (public) */}
        {location?.photos?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Photos of the place</Text>
            <ListingGallery photos={location.photos} />
          </View>
        )}

        {location && (
          <Text style={styles.maxGuests}>👥 Up to {location.max_guests} {location.max_guests === 1 ? 'rider' : 'riders'}</Text>
        )}

        {/* Reviews as a tappable folder, consistent with the profile menu. */}
        <TouchableOpacity
          style={styles.reviewsLink}
          activeOpacity={0.8}
          onPress={() => router.push({ pathname: '/reviews', params: { user: profile.id } })}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.reviewsLinkTitle}>Reviews from riders</Text>
            <Text style={styles.reviewsLinkSub}>
              {reviewCount > 0 && avgRating != null
                ? `⭐ ${avgRating.toFixed(1)} · ${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}`
                : 'No reviews yet'}
            </Text>
          </View>
          <Text style={styles.reviewsLinkChevron}>›</Text>
        </TouchableOpacity>

        {/* Knock CTA only makes sense for a host with a place. */}
        {location && (
          <>
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
          </>
        )}
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
  priceHint:    { color: C.textDim, fontSize: 12, lineHeight: 17, marginTop: 4 },

  joinBanner:        { backgroundColor: C.accentSoft, borderColor: C.accentBorder, borderWidth: 1, borderRadius: 22, padding: 18, gap: 10 },
  joinBannerTitle:   { color: C.text, fontSize: 18, fontWeight: '900' },
  joinBannerText:    { color: C.textMuted, fontSize: 14, lineHeight: 21 },
  joinBannerBtn:     { height: 50, borderRadius: 100, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  joinBannerBtnText: { color: C.white, fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  joinBannerLogin:   { color: C.accent, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  legalLinks:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  legalLinkText:      { color: C.textDim, fontSize: 12, fontWeight: '700' },
  legalSeparator:     { color: C.textFaint, fontSize: 12 },

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
  reviewsLink:  { flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingVertical: 14, paddingHorizontal: 16 },
  reviewsLinkTitle: { color: C.text, fontSize: 15, fontWeight: '800' },
  reviewsLinkSub: { color: C.textMuted, fontSize: 13, marginTop: 2 },
  reviewsLinkChevron: { color: C.textDim, fontSize: 24, fontWeight: '300', marginLeft: 8 },

  divider:      { height: 1, backgroundColor: C.border, marginVertical: 8 },
  joinCta:      { color: C.text, fontSize: 18, fontWeight: '900' },
  joinSub:      { color: C.textMuted, fontSize: 14, lineHeight: 21 },
  ctaBtn:       { height: 52, borderRadius: 100, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  ctaBtnText:   { color: C.white, fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },

  notFoundEmoji: { fontSize: 52, textAlign: 'center' },
  notFoundTitle: { color: C.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  notFoundSub:   { color: C.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
}) }
