import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Modal } from 'react-native'
import { useLocalSearchParams, router } from 'expo-router'
import { supabase } from '../../lib/supabase'
import { useTheme, type ThemeColors } from '../../lib/ThemeContext'
import { FONT } from '../../lib/theme'
import { SafetyBlock } from '../../components/SafetyBlock'
import { ContributionBadge } from '../../components/ContributionBadge'
import { ReportButton } from '../../components/ReportButton'
import { Avatar } from '../../components/Avatar'
import { ListingGallery } from '../../components/ListingGallery'
import { AppHeader, HeaderBackButton } from '../../components/AppHeader'
import { UserChip } from '../../components/UserChip'

const AMENITY_ICONS: Record<string, string> = {
  shower: '🚿', toilet: '🚽', kitchen: '🍳', laundry: '👕',
  electricity: '⚡', wifi: '📶', pub_nearby: '🍺', tools: '🔧',
}
const AMENITY_LABELS: Record<string, string> = {
  shower: 'Shower', toilet: 'Toilet', kitchen: 'Kitchen', laundry: 'Laundry',
  electricity: 'Power', wifi: 'WiFi', pub_nearby: 'Pub nearby', tools: 'Tools',
}
const SLEEP_LABELS: Record<string, string> = {
  tent: '⛺ Tent', roof: '🏠 Roof over head', room: '🛏 Private room',
}
const PRICING_LABELS: Record<string, string> = { free: 'Free', tip: 'Tip welcome', fixed: 'Agreed contribution' }

function pricingText(loc: any): string {
  const pricings: string[] = loc?.pricings?.length ? loc.pricings : (loc?.pricing ? [loc.pricing] : [])
  const currency = loc?.price_currency || 'EUR'
  return pricings.map((v: string) => {
    if (v === 'fixed') {
      return loc?.price_amount != null ? `${loc.price_amount} ${currency} / night` : 'Agreed contribution'
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
  const [locations, setLocations] = useState<any[]>([])
  const [avgRating, setAvgRating] = useState<number | null>(null)
  const [reviewCount, setReviewCount] = useState(0)
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [isBlocked, setIsBlocked] = useState(false)
  const [blockBusy, setBlockBusy] = useState(false)
  const [showBlockConfirm, setShowBlockConfirm] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => { setIsLoggedIn(!!session); setCurrentUserId(session?.user?.id ?? null) })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => { setIsLoggedIn(!!session); setCurrentUserId(session?.user?.id ?? null) })
    return () => subscription.unsubscribe()
  }, [])

  // Am I blocking this person? (Only the blocker can read their own block rows.)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!currentUserId || !id || currentUserId === id) { setIsBlocked(false); return }
    let active = true
    supabase.from('blocks').select('blocked_id').eq('blocker_id', currentUserId).eq('blocked_id', id).maybeSingle()
      .then(({ data }) => { if (active) setIsBlocked(!!data) })
    return () => { active = false }
  }, [currentUserId, id])

  async function blockUser() {
    if (!currentUserId || !id || blockBusy) return
    setBlockBusy(true)
    const { error } = await supabase.from('blocks').insert({ blocker_id: currentUserId, blocked_id: id })
    setBlockBusy(false)
    setShowBlockConfirm(false)
    if (error) { console.warn('block error:', error.message); return }
    setIsBlocked(true)
  }

  async function unblockUser() {
    if (!currentUserId || !id || blockBusy) return
    setBlockBusy(true)
    const { error } = await supabase.from('blocks').delete().eq('blocker_id', currentUserId).eq('blocked_id', id)
    setBlockBusy(false)
    if (error) { console.warn('unblock error:', error.message); return }
    setIsBlocked(false)
  }

  function goToSignup() {
    router.push({ pathname: '/', params: { signup: '1' } })
  }

  const load = useCallback(async (userId: string, locationId?: string) => {
    // Public profiles only read the coarse, privacy-safe view. Load ALL of the host's
    // places (a host can offer several), approximate coords only.
    const [{ data: prof }, { data: locs }, { data: revs }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, bio, avatar_url, nationality').eq('id', userId).maybeSingle(),
      supabase.from('host_locations_public').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
      supabase.from('reviews')
        .select('rating, body, reviewer_id')
        .eq('reviewee_id', userId)
        .order('created_at', { ascending: false })
    ])

    // A profile is enough — riders with no listing still have a reputation to show.
    if (!prof) { setNotFound(true); setLoading(false); return }

    // If we arrived for a specific place (e.g. from a pin), show it first.
    let ordered = locs || []
    if (locationId) {
      const idx = ordered.findIndex((l: any) => l.id === locationId)
      if (idx > 0) ordered = [ordered[idx], ...ordered.filter((_: any, i: number) => i !== idx)]
    }

    setProfile(prof)
    setLocations(ordered)

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

  const firstName = profile.full_name?.split(' ')[0] || 'this host'

  return (
    <View style={styles.container}>
      <AppHeader left={<HeaderBackButton />} right={<UserChip />} />
      <ScrollView contentContainerStyle={styles.content}>

        {/* Avatar + name */}
        <View style={styles.heroRow}>
          <Avatar url={profile.avatar_url} name={profile.full_name} size={76} />
          <View style={styles.heroInfo}>
            <Text style={styles.name}>{profile.full_name || 'Anonymous Rider'}</Text>
            {avgRating != null && (
              <Text style={styles.rating}>
                {`${'★'.repeat(Math.round(avgRating))}${'☆'.repeat(5 - Math.round(avgRating))} ${avgRating.toFixed(1)} · ${reviewCount} ${reviewCount === 1 ? 'review' : 'reviews'}`}
              </Text>
            )}
            {(profile.nationality || locations.length > 1) && (
              <Text style={styles.meta}>
                {profile.nationality ? `🌍 ${profile.nationality}` : ''}
                {profile.nationality && locations.length > 1 ? ' · ' : ''}
                {locations.length > 1 ? `${locations.length} places` : ''}
              </Text>
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

        {/* Bio (profile-level) */}
        {profile.bio ? (
          <View style={styles.section}>
            <Text style={styles.sectionLabel}>About {firstName}</Text>
            <Text style={styles.bio}>{profile.bio}</Text>
          </View>
        ) : null}

        {/* Reviews first — riders care about the person's track record before the place. */}
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

        {/* Every place this host offers */}
        {locations.map((loc, idx) => {
          const parkings: string[] = loc.parkings?.length ? loc.parkings : (loc.parking ? [loc.parking] : [])
          const amen = (loc.amenities as string[] | undefined)?.filter(a => AMENITY_LABELS[a]) ?? []
          return (
            <View key={loc.id} style={styles.placeCard}>
              {locations.length > 1 ? (
                <Text style={styles.placeHeader}>{loc.location_city || `Place ${idx + 1}`}{loc.location_country ? `, ${loc.location_country}` : ''}</Text>
              ) : null}

              {parkings.length > 0 && <SafetyBlock parkings={parkings} />}

              {loc.notes ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>About this place</Text>
                  <Text style={styles.bio}>{loc.notes}</Text>
                </View>
              ) : null}

              {loc.sleep_types?.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Where you sleep</Text>
                  <View style={styles.chips}>
                    {(loc.sleep_types as string[]).map((s: string) => (
                      <View key={s} style={styles.chip}><Text style={styles.chipText}>{SLEEP_LABELS[s] || s}</Text></View>
                    ))}
                  </View>
                </View>
              )}

              {amen.length ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Amenities</Text>
                  <View style={styles.chips}>
                    {amen.map((a: string) => (
                      <View key={a} style={styles.chip}><Text style={styles.chipText}>{AMENITY_ICONS[a]} {AMENITY_LABELS[a]}</Text></View>
                    ))}
                  </View>
                </View>
              ) : null}

              {pricingText(loc) ? (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>What this host wants in return</Text>
                  <ContributionBadge loc={loc} />
                  {loc.pricings?.includes('fixed') && loc.price_amount != null ? (
                    <Text style={styles.priceHint}>Indicative — the exact amount and currency are agreed in chat (local cash is fine).</Text>
                  ) : null}
                </View>
              ) : null}

              {loc.photos?.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>Photos of the place</Text>
                  <ListingGallery photos={loc.photos} />
                </View>
              )}

              <Text style={styles.maxGuests}>👥 Up to {loc.max_guests} {loc.max_guests === 1 ? 'rider' : 'riders'}</Text>

              <TouchableOpacity
                style={styles.ctaBtn}
                onPress={() => {
                  if (isLoggedIn === false) { goToSignup(); return }
                  router.replace({ pathname: '/(tabs)/map', params: { knockHost: profile.id, knockLocation: loc.id } })
                }}
              >
                <Text style={styles.ctaBtnText}>{isLoggedIn === false ? 'Join to knock on the door' : 'Knock on the door'}</Text>
              </TouchableOpacity>

              {isLoggedIn && currentUserId && currentUserId !== id ? (
                <ReportButton targetType="listing" targetId={loc.id} label="Report this listing" style={{ alignSelf: 'center', marginTop: 2 }} />
              ) : null}
            </View>
          )
        })}

        {/* Block / unblock — only for a logged-in viewer looking at someone else */}
        {isLoggedIn && currentUserId && currentUserId !== id ? (
          isBlocked ? (
            <View style={styles.blockRow}>
              <Text style={styles.blockedNote}>You blocked this person. They can’t message or knock you.</Text>
              <TouchableOpacity onPress={unblockUser} disabled={blockBusy}>
                <Text style={styles.unblockText}>{blockBusy ? '…' : 'Unblock'}</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity style={styles.blockBtn} onPress={() => setShowBlockConfirm(true)}>
              <Text style={styles.blockText}>Block user</Text>
            </TouchableOpacity>
          )
        ) : null}

        {/* Report — DSA notice. Logged-in viewers, someone else's profile/listing.
            Copy is contextual: a profile with a listing is a host, otherwise a rider. */}
        {isLoggedIn && currentUserId && currentUserId !== id ? (
          <View style={styles.reportRow}>
            <ReportButton targetType="user" targetId={id} label={locations.length ? 'Report this host' : 'Report this rider'} />
          </View>
        ) : null}
      </ScrollView>

      {/* Block confirmation */}
      <Modal visible={showBlockConfirm} transparent animationType="fade" onRequestClose={() => setShowBlockConfirm(false)}>
        <View style={styles.blockOverlay}>
          <View style={styles.blockSheet}>
            <Text style={styles.blockSheetTitle}>Block this person?</Text>
            <Text style={styles.blockSheetBody}>
              They won’t be able to message or knock you, and you won’t see them. You can unblock anytime from their profile.
            </Text>
            <TouchableOpacity style={[styles.blockSheetDanger, blockBusy && { opacity: 0.6 }]} onPress={blockUser} disabled={blockBusy}>
              <Text style={styles.blockSheetDangerText}>{blockBusy ? 'Blocking…' : 'Block'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.blockSheetCancel} onPress={() => setShowBlockConfirm(false)} disabled={blockBusy}>
              <Text style={styles.blockSheetCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
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

  bio:          { color: C.text, fontSize: 15, lineHeight: 23, fontFamily: FONT.body },
  priceHint:    { color: C.textDim, fontSize: 12, lineHeight: 17, marginTop: 4, fontFamily: FONT.body },

  joinBanner:        { backgroundColor: C.accentSoft, borderColor: C.accentBorder, borderWidth: 1, borderRadius: 22, padding: 18, gap: 10 },
  joinBannerTitle:   { color: C.text, fontSize: 18, fontWeight: '900' },
  joinBannerText:    { color: C.textMuted, fontSize: 14, lineHeight: 21, fontFamily: FONT.body },
  joinBannerBtn:     { height: 50, borderRadius: 100, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  joinBannerBtnText: { color: C.white, fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },
  joinBannerLogin:   { color: C.accent, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  legalLinks:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  legalLinkText:      { color: C.textDim, fontSize: 12, fontWeight: '700' },
  legalSeparator:     { color: C.textFaint, fontSize: 12 },

  section:      { gap: 8 },
  sectionLabel: { color: C.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  placeCard:    { backgroundColor: C.surface, borderRadius: 22, borderWidth: 1, borderColor: C.border, padding: 16, gap: 14 },
  placeHeader:  { color: C.text, fontSize: 16, fontFamily: FONT.headBold, letterSpacing: 0.3 },
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
  joinSub:      { color: C.textMuted, fontSize: 14, lineHeight: 21, fontFamily: FONT.body },
  ctaBtn:       { height: 52, borderRadius: 100, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
  ctaBtnText:   { color: C.white, fontSize: 15, fontWeight: '800', letterSpacing: 0.5 },

  reportRow:    { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 18, marginTop: 6 },
  blockBtn:     { alignSelf: 'center', marginTop: 18, paddingVertical: 8, paddingHorizontal: 16 },
  blockText:    { color: C.error, fontSize: 13, fontWeight: '700', textDecorationLine: 'underline' },
  blockRow:     { marginTop: 18, alignItems: 'center', gap: 6 },
  blockedNote:  { color: C.textDim, fontSize: 12, textAlign: 'center', lineHeight: 17 },
  unblockText:  { color: C.accent, fontSize: 13, fontWeight: '700' },
  blockOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  blockSheet:   { backgroundColor: C.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, gap: 12, borderWidth: 1, borderColor: C.errorBorder },
  blockSheetTitle: { color: C.text, fontSize: 20, fontWeight: '900' },
  blockSheetBody:  { color: C.textMuted, fontSize: 14, lineHeight: 21 },
  blockSheetDanger: { height: 50, borderRadius: 100, backgroundColor: C.error, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  blockSheetDangerText: { color: C.white, fontSize: 14, fontWeight: '800' },
  blockSheetCancel: { alignItems: 'center', paddingVertical: 8 },
  blockSheetCancelText: { color: C.textMuted, fontSize: 14, textDecorationLine: 'underline' },
  notFoundEmoji: { fontSize: 52, textAlign: 'center' },
  notFoundTitle: { color: C.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
  notFoundSub:   { color: C.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
}) }
