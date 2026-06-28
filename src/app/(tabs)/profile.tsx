import { useEffect, useMemo, useRef, useState, type ComponentProps } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Image, Platform, Modal, Linking } from 'react-native'
import { Feather } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import QRCode from 'react-native-qrcode-svg'
import { supabase } from '../../lib/supabase'
import { router } from 'expo-router'
import { useTheme, type ThemeColors } from '../../lib/ThemeContext'
import { UserChip, refreshUserChip } from '../../components/UserChip'
import { AppHeader, HeaderBackButton } from '../../components/AppHeader'
import { compressBikePhoto } from '../../lib/compressImage'
import { FONT } from '../../lib/theme'
import { getLocalYMD } from '../../lib/date'
import { SUPPORT_URL, hasSupportLink } from '../../lib/support'
import { LinearGradient } from 'expo-linear-gradient'

export default function ProfileScreen() {
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [hostLocations, setHostLocations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [editingBio, setEditingBio] = useState(false)
  const [bioInput, setBioInput] = useState('')
  const [savingBio, setSavingBio] = useState(false)
  const [editingNat, setEditingNat] = useState(false)
  const [natInput, setNatInput] = useState('')
  const [savingNat, setSavingNat] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [reviews, setReviews] = useState<{ rating: number; body: string | null; reviewer_name: string | null; created_at: string }[]>([])
  const [pendingReviews, setPendingReviews] = useState(0)
  const [stats, setStats] = useState({ trips: 0, nights: 0 })
  const [showQR, setShowQR] = useState(false)
  const [supportNote, setSupportNote] = useState(false)
  const userIdRef = useRef<string | null>(null)

  useEffect(() => {
    loadAll()
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id ?? null
      if (userIdRef.current === nextUserId) return
      resetLocalState()
      if (session?.user) loadAll(session.user)
      else router.replace('/')
    })
    return () => subscription.unsubscribe()
  }, [])

  function resetLocalState() {
    userIdRef.current = null
    setUser(null)
    setProfile(null)
    setHostLocations([])
    setEditingName(false)
    setNameInput('')
    setSavingName(false)
    setEditingBio(false)
    setBioInput('')
    setSavingBio(false)
    setEditingNat(false)
    setNatInput('')
    setSavingNat(false)
    setUploadingAvatar(false)
    setAvatarError(null)
    setReviews([])
    setPendingReviews(0)
    setShowQR(false)
    setLoading(true)
  }

  async function loadAll(authUser?: any) {
    const resolvedUser = authUser ?? (await supabase.auth.getUser()).data.user
    if (!resolvedUser) { router.replace('/'); return }
    userIdRef.current = resolvedUser.id
    setUser(resolvedUser)
    const [p, h, r] = await Promise.all([
      supabase.from('profiles').select('id, full_name, bio, avatar_url, nationality').eq('id', resolvedUser.id).maybeSingle(),
      supabase.from('host_locations').select('id, paused').eq('user_id', resolvedUser.id).order('created_at', { ascending: true }),
      // Reviews received by this user. reviewer_id has no FK to profiles, so a PostgREST
      // embed fails — fetch the reviewers' names in a separate query (like the public profile).
      supabase.from('reviews').select('rating, body, created_at, reviewer_id').eq('reviewee_id', resolvedUser.id).order('created_at', { ascending: false }),
    ])
    if (userIdRef.current !== resolvedUser.id) return
    setProfile(p.data)
    setHostLocations(h.data || [])
    setNameInput(p.data?.full_name || '')
    setBioInput(p.data?.bio || '')
    setNatInput(p.data?.nationality || '')
    const revRows = (r.data || []) as any[]
    const reviewerIds = [...new Set(revRows.map(rev => rev.reviewer_id).filter(Boolean))]
    const reviewerMap: Record<string, string> = {}
    if (reviewerIds.length) {
      const { data: reviewerProfiles } = await supabase.from('profiles').select('id, full_name').in('id', reviewerIds)
      if (userIdRef.current !== resolvedUser.id) return
      reviewerProfiles?.forEach((rp: any) => { reviewerMap[rp.id] = rp.full_name })
    }
    setReviews(revRows.map(rev => ({
      rating: rev.rating,
      body: rev.body,
      reviewer_name: reviewerMap[rev.reviewer_id] ?? null,
      created_at: rev.created_at,
    })))

    // Accepted stays drive both the review prompt and the Trips/Nights stats.
    const today = getLocalYMD()
    const [{ data: acceptedStays }, { data: myRevs }] = await Promise.all([
      supabase.from('stay_requests')
        .select('id, arrival_date, departure_date')
        .or(`guest_id.eq.${resolvedUser.id},host_id.eq.${resolvedUser.id}`)
        .eq('status', 'ACCEPTED'),
      supabase.from('reviews').select('stay_request_id').eq('reviewer_id', resolvedUser.id),
    ])
    if (userIdRef.current !== resolvedUser.id) return
    const accepted = acceptedStays || []
    const reviewedSet = new Set((myRevs || []).map((r2: any) => r2.stay_request_id))
    const ended = accepted.filter((s: any) => s.departure_date && s.departure_date <= today)
    setPendingReviews(ended.filter((s: any) => !reviewedSet.has(s.id)).length)
    const nights = accepted.reduce((sum: number, s: any) => {
      const a = new Date(s.arrival_date).getTime(), d = new Date(s.departure_date).getTime()
      const n = Math.round((d - a) / 86400000)
      return sum + (n > 0 ? n : 0)
    }, 0)
    setStats({ trips: accepted.length, nights })

    setLoading(false)
  }

  async function saveName() {
    if (!nameInput.trim()) return
    setSavingName(true)
    const { error } = await supabase.from('profiles').update({ full_name: nameInput.trim() }).eq('id', user.id)
    setSavingName(false)
    if (error) { console.warn('save name error:', error.message); setAvatarError('Could not save your name. Please try again.'); return }
    setProfile((p: any) => ({ ...p, full_name: nameInput.trim() }))
    setEditingName(false)
    refreshUserChip()
  }

  async function saveNationality() {
    setSavingNat(true)
    const trimmed = natInput.trim()
    const { error } = await supabase.from('profiles').update({ nationality: trimmed || null }).eq('id', user.id)
    setSavingNat(false)
    if (error) { console.warn('save nationality error:', error.message); setAvatarError('Could not save your nationality. Please try again.'); return }
    setProfile((p: any) => ({ ...p, nationality: trimmed || null }))
    setEditingNat(false)
  }

  async function saveBio() {
    setSavingBio(true)
    const trimmed = bioInput.trim()
    const { error } = await supabase.from('profiles').update({ bio: trimmed || null }).eq('id', user.id)
    setSavingBio(false)
    if (error) { console.warn('save bio error:', error.message); setAvatarError('Could not save your bio. Please try again.'); return }
    setProfile((p: any) => ({ ...p, bio: trimmed || null }))
    setEditingBio(false)
  }

  async function pickAvatar() {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') {
      setAvatarError('Please grant photo library access to upload an avatar.')
      return
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    })
    if (result.canceled) return
    const asset = result.assets[0]
    const ext = asset.uri.split('.').pop()?.toLowerCase() || 'jpg'
    const response = await fetch(asset.uri)
    const blob = await response.blob()
    await uploadAvatar(blob, ext)
  }

  async function uploadAvatar(file: File | Blob, extHint?: string) {
    if (!user) return
    setUploadingAvatar(true)
    setAvatarError(null)
    try {
      // Downscale + compress before upload (web compresses; native falls back to original),
      // so avatars don't bloat storage — same treatment as bike/listing photos.
      const uploadBlob = await compressBikePhoto(file as File)
      const compressed = uploadBlob !== file
      const ext = compressed ? 'jpg' : (extHint ?? ((file as File).name?.split('.').pop() || 'jpg'))
      const path = `${user.id}/avatar.${ext}`
      const contentType = compressed ? 'image/jpeg' : ((file as File).type || `image/${ext}`)
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, uploadBlob, { upsert: true, contentType })
      if (upErr) { console.warn('avatar upload error:', upErr.message); setAvatarError('Could not upload the photo. Please try again.'); return }
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = `${publicUrl}?t=${Date.now()}`
      const { error: dbErr } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', user.id)
      if (dbErr) { console.warn('avatar save error:', dbErr.message); setAvatarError('Could not update your profile photo. Please try again.'); return }
      setProfile((p: any) => ({ ...p, avatar_url: url }))
      refreshUserChip()
    } catch (e: unknown) {
      console.warn('avatar exception:', e instanceof Error ? e.message : e)
      setAvatarError('Could not upload the photo. Please try again.')
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/')
  }

  function openSupport() {
    // Log the interest (fire-and-forget; drives the weekly developer digest).
    if (user?.id) void supabase.from('support_clicks').insert({ user_id: user.id }).then(({ error }) => {
      if (error) console.warn('support click log error:', error.message)
    })
    if (hasSupportLink()) { Linking.openURL(SUPPORT_URL).catch(() => {}); return }
    setSupportNote(true)
  }

  if (loading) {
    return <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={C.accent} size="large" /></View>
  }

  const initials = profile?.full_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?'
  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Rider'
  const isHost = hostLocations.length > 0
  const pausedCount = hostLocations.filter((l: any) => l.paused).length
  const activeCount = hostLocations.length - pausedCount
  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : null

  return (
    <View style={styles.container}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
      <AppHeader left={<HeaderBackButton />} right={<UserChip />} />

      {/* Avatar + QR — warm Road→Trail gradient band */}
      <LinearGradient colors={[C.accentSoft, C.greenSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <View style={styles.heroRow}>
        {Platform.OS === 'web' ? (
          <div style={{ position: 'relative', width: 96, height: 96, flexShrink: 0 } as any}>
            <View style={styles.avatarCircle}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatarPhoto} />
              ) : (
                <Text style={styles.avatarText}>{initials}</Text>
              )}
              {uploadingAvatar && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color={C.white} size="small" />
                </View>
              )}
            </View>
            <View style={styles.avatarEditBadge}>
              <Feather name="camera" size={10} color={C.white} />
            </View>
            <input
              type="file"
              accept="image/*"
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' } as any}
              onChange={(e: any) => {
                const file = e.target.files?.[0]
                if (file) uploadAvatar(file)
              }}
            />
          </div>
        ) : (
          <TouchableOpacity style={styles.avatarWrap} onPress={pickAvatar} activeOpacity={0.8}>
            <View style={styles.avatarCircle}>
              {profile?.avatar_url ? (
                <Image source={{ uri: profile.avatar_url }} style={styles.avatarPhoto} />
              ) : (
                <Text style={styles.avatarText}>{initials}</Text>
              )}
              {uploadingAvatar && (
                <View style={styles.avatarOverlay}>
                  <ActivityIndicator color={C.white} size="small" />
                </View>
              )}
            </View>
            <View style={styles.avatarEditBadge}>
              <Feather name="camera" size={10} color={C.white} />
            </View>
          </TouchableOpacity>
        )}
          {/* Name + rating · nationality + email, beside the avatar */}
          <View style={styles.heroInfo}>
            {editingName ? (
              <View style={styles.nameEdit}>
                <TextInput
                  style={styles.nameInput}
                  value={nameInput}
                  onChangeText={setNameInput}
                  placeholder="Your name"
                  placeholderTextColor={C.textFaint}
                  autoFocus
                />
                <View style={styles.nameActions}>
                  <TouchableOpacity style={styles.saveNameBtn} onPress={saveName} disabled={savingName}>
                    <Text style={styles.saveNameBtnText}>{savingName ? '...' : 'Save'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setEditingName(false)}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity onPress={() => setEditingName(true)} style={styles.nameRow}>
                <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
                <Feather name="edit-2" size={14} color={C.textDim} style={{ marginLeft: 8 }} />
              </TouchableOpacity>
            )}

            {editingNat ? (
              <View style={[styles.nameEdit, { marginTop: 6 }]}>
                <TextInput
                  style={styles.nameInput}
                  value={natInput}
                  onChangeText={setNatInput}
                  placeholder="Your nationality — e.g. Czech, German"
                  placeholderTextColor={C.textFaint}
                  maxLength={60}
                  autoFocus
                />
                <View style={styles.nameActions}>
                  <TouchableOpacity style={styles.saveNameBtn} onPress={saveNationality} disabled={savingNat}>
                    <Text style={styles.saveNameBtnText}>{savingNat ? '...' : 'Save'}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => { setNatInput(profile?.nationality || ''); setEditingNat(false) }}>
                    <Text style={styles.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.metaRow}>
                {avgRating ? <Text style={styles.profileMeta}>⭐ {avgRating}</Text> : null}
                {avgRating && profile?.nationality ? <Text style={styles.profileMeta}>  ·  </Text> : null}
                {profile?.nationality ? (
                  <TouchableOpacity style={styles.metaRow} onPress={() => setEditingNat(true)} activeOpacity={0.7}>
                    <Text style={styles.profileMeta}>🌍 {profile.nationality}</Text>
                    <Feather name="edit-2" size={11} color={C.textDim} style={{ marginLeft: 5 }} />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={styles.natAddBtn} onPress={() => setEditingNat(true)} activeOpacity={0.7}>
                    <Feather name="plus" size={12} color={C.accent} />
                    <Text style={styles.natAddText}>Add nationality</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            <Text style={styles.email} numberOfLines={1}>{user?.email}</Text>
          </View>
        </View>

        <TouchableOpacity style={styles.qrBtn} onPress={() => setShowQR(true)}>
          <Feather name="share-2" size={16} color={C.accent} />
          <Text style={styles.qrBtnText}>Share profile</Text>
        </TouchableOpacity>
      </LinearGradient>

      {/* QR Modal */}
      <Modal visible={showQR} transparent animationType="fade" onRequestClose={() => setShowQR(false)}>
        <TouchableOpacity style={styles.qrOverlay} activeOpacity={1} onPress={() => setShowQR(false)}>
          <View style={styles.qrSheet}>
            <Text style={styles.qrTitle}>Share your host profile</Text>
            <Text style={styles.qrSub}>Let riders scan this on the road</Text>
            <View style={styles.qrBox}>
              <QRCode
                value={`https://www.twowheelcome.com/host/${user?.id}`}
                size={200}
                color={C.text}
                backgroundColor={C.bg}
              />
            </View>
            <Text style={styles.qrName}>{profile?.full_name || 'Your profile'}</Text>
            <TouchableOpacity style={styles.qrClose} onPress={() => setShowQR(false)}>
              <Text style={styles.qrCloseText}>Close</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <View style={styles.body}>
        {avatarError && (
          <View style={[styles.inlineError, { marginTop: -8 }]}>
            <Text style={styles.inlineErrorText}>⚠️ {avatarError}</Text>
          </View>
        )}
        {/* Bio — what riders see on your public profile */}
        {editingBio ? (
          <View style={styles.bioEdit}>
            <TextInput
              style={styles.bioInput}
              value={bioInput}
              onChangeText={setBioInput}
              placeholder="Tell other riders about yourself — what you ride, where you're based, what you're happy to share."
              placeholderTextColor={C.textFaint}
              multiline
              maxLength={500}
              autoFocus
            />
            <View style={styles.nameActions}>
              <TouchableOpacity style={styles.saveNameBtn} onPress={saveBio} disabled={savingBio}>
                <Text style={styles.saveNameBtnText}>{savingBio ? '...' : 'Save'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setBioInput(profile?.bio || ''); setEditingBio(false) }}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : profile?.bio ? (
          <TouchableOpacity style={styles.bioRow} onPress={() => setEditingBio(true)} activeOpacity={0.7}>
            <Text style={styles.bioText}>{profile.bio}</Text>
            <Feather name="edit-2" size={13} color={C.textDim} style={{ marginLeft: 8, marginTop: 3 }} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.bioAddBtn} onPress={() => setEditingBio(true)} activeOpacity={0.7}>
            <Feather name="plus" size={14} color={C.accent} />
            <Text style={styles.bioAddText}>Tell others about yourself</Text>
          </TouchableOpacity>
        )}

        {/* Stats — Spots / Nights / Trips */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{hostLocations.length}</Text>
            <Text style={styles.statLabel}>Spots</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{stats.nights || '—'}</Text>
            <Text style={styles.statLabel}>Nights</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{stats.trips || '—'}</Text>
            <Text style={styles.statLabel}>Trips</Text>
          </View>
        </View>

        {/* Places are managed in "My Places" (below) so multi-location hosts
            aren't shown a single confusing inline place. */}

        {/* Pending reviews prompt — symmetric for guests and hosts */}
        {pendingReviews > 0 && (
          <TouchableOpacity style={styles.reviewPrompt} onPress={() => router.push('/history')} activeOpacity={0.85}>
            <Text style={styles.reviewPromptText}>
              ⭐ You have {pendingReviews} {pendingReviews === 1 ? 'stay' : 'stays'} to review
            </Text>
            <Text style={styles.reviewPromptSub}>Tap to rate your hosts and riders →</Text>
          </TouchableOpacity>
        )}

        {/* Menu — compact grouped rows (iOS-settings style) instead of 8 big cards */}
        {([
          { title: 'Your place', rows: [
            { icon: 'home', label: isHost ? 'My Places' : 'Become a Host', sub: isHost ? `${activeCount} active${pausedCount ? ` · ${pausedCount} paused` : ''}` : 'Add a place', onPress: () => router.push((isHost ? '/my-places' : '/become-host') as never) },
            { icon: 'clock', label: 'History', sub: 'Your past stays', onPress: () => router.push('/history') },
            { icon: 'star', label: 'Reviews', sub: avgRating ? `⭐ ${avgRating} · ${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'}` : 'No reviews yet', onPress: () => router.push('/reviews') },
          ] },
          { title: 'App', rows: [
            { icon: 'settings', label: 'Settings', sub: 'Language, notifications, privacy, account', onPress: () => router.push('/settings' as never) },
          ] },
        ] as { title: string; rows: { icon: ComponentProps<typeof Feather>['name']; label: string; sub: string; onPress: () => void }[] }[]).map(group => (
          <View key={group.title} style={styles.menuSection}>
            <Text style={styles.menuSectionTitle}>{group.title}</Text>
            <View style={styles.menuCard}>
              {group.rows.map((it, i) => (
                <TouchableOpacity key={it.label} style={[styles.menuRow, i > 0 && styles.menuRowBorder]} onPress={it.onPress} activeOpacity={0.6}>
                  <View style={styles.menuRowIcon}><Feather name={it.icon} size={17} color={C.accent} /></View>
                  <View style={styles.menuRowText}>
                    <Text style={styles.menuRowTitle}>{it.label}</Text>
                    <Text style={styles.menuRowSub} numberOfLines={1}>{it.sub}</Text>
                  </View>
                  <Feather name="chevron-right" size={20} color={C.textDim} />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        {/* Low-key, optional — never a paywall */}
        <TouchableOpacity style={styles.supportRow} onPress={openSupport} activeOpacity={0.7}>
          <Text style={styles.supportText}>🍺 Support twowheelcome — buy the dev a beer</Text>
          <Text style={styles.supportSub}>{supportNote ? 'Coming soon — thanks for the thought 🙏' : 'Contribute to development · optional'}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
    </View>
  )
}

function makeStyles(C: ThemeColors) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: 40 },
  headerRow:    { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 46, paddingBottom: 14, backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle:  { color: C.text, fontSize: 22, fontWeight: '900', letterSpacing: 0, flex: 1 },
  headerAccent: { color: C.accent },

  hero: {
    alignItems: 'center',
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingTop: 28,
    paddingBottom: 14,
    paddingHorizontal: 24,
    gap: 14,
    backgroundColor: C.bg,
  },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    width: '100%',
  },
  heroInfo: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  avatarWrap: {
    width: 96, height: 96,
    position: 'relative',
  },
  avatarCircle: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: C.elevated,
    borderWidth: 3, borderColor: C.accent,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarPhoto: { width: 96, height: 96, borderRadius: 48 },
  avatarText: { color: C.accent, fontSize: 36, fontWeight: '900' },
  avatarOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute', bottom: 2, right: 2,
    width: 24, height: 24, borderRadius: 12,
    backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.bg,
  },
  qrBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.elevated, borderRadius: 100,
    borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 16, paddingVertical: 8,
  },
  qrBtnText: { color: C.accent, fontSize: 13, fontWeight: '700' },

  qrOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center',
  },
  qrSheet: {
    backgroundColor: C.bg, borderRadius: 24,
    padding: 28, alignItems: 'center', gap: 10,
    marginHorizontal: 24, width: 300,
  },
  qrTitle: { color: C.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  qrSub: { color: C.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 4 },
  qrBox: {
    padding: 16, backgroundColor: C.bg,
    borderRadius: 16, borderWidth: 1, borderColor: C.border,
  },
  qrName: { color: C.textMuted, fontSize: 13, marginTop: 4 },
  qrClose: {
    marginTop: 8, backgroundColor: C.accent,
    borderRadius: 100, paddingHorizontal: 28, paddingVertical: 10,
  },
  qrCloseText: { color: C.white, fontWeight: '700', fontSize: 14 },

  body: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    paddingTop: 10,
    paddingHorizontal: 24,
    gap: 14,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: { color: C.text, fontSize: 22, fontWeight: '800', letterSpacing: 0.3, flexShrink: 1 },
  email: { color: C.textDim, fontSize: 13, marginTop: 2, fontFamily: FONT.body },
  profileMeta: { color: C.accent, fontSize: 13, fontWeight: '700', marginTop: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center' },
  natAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', marginTop: 2, backgroundColor: C.accentSoft, borderRadius: 100, borderWidth: 1, borderColor: C.accentBorder, paddingHorizontal: 12, paddingVertical: 6 },
  natAddText: { color: C.accent, fontSize: 12, fontWeight: '700' },
  placeCard: { backgroundColor: C.surface, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: C.border },
  placeCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  placeCardTitle: { color: C.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  openTag: { backgroundColor: C.successSoft, borderRadius: 100, borderWidth: 1, borderColor: C.successBorder, paddingHorizontal: 10, paddingVertical: 3 },
  openTagText: { color: C.success, fontSize: 11, fontWeight: '700' },
  placeDetails: { marginTop: 10, gap: 4 },
  placeDetailText: { color: C.textMuted, fontSize: 13 },

  bioRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 2 },
  bioText: { flex: 1, color: C.textMuted, fontSize: 14, lineHeight: 21, fontFamily: FONT.body },
  bioAddBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 2, backgroundColor: C.accentSoft, borderRadius: 100, borderWidth: 1, borderColor: C.accentBorder, paddingHorizontal: 14, paddingVertical: 8 },
  bioAddText: { color: C.accent, fontSize: 13, fontWeight: '700' },
  bioEdit: { gap: 10, marginTop: 2 },
  bioInput: { backgroundColor: C.elevated, borderRadius: 14, padding: 14, color: C.text, fontSize: 15, lineHeight: 22, minHeight: 92, borderWidth: 1, borderColor: C.accent, textAlignVertical: 'top' },
  nameEdit: { gap: 10 },
  nameInput: {
    backgroundColor: C.elevated, borderRadius: 14, padding: 14,
    color: C.text, fontSize: 16, borderWidth: 1, borderColor: C.accent,
  },
  nameActions: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  saveNameBtn: { backgroundColor: C.accent, borderRadius: 100, paddingHorizontal: 22, paddingVertical: 10 },
  saveNameBtnText: { color: C.white, fontWeight: '700' },
  cancelText: { color: C.textDim, fontSize: 14 },

  statsCard: {
    backgroundColor: C.surface,
    borderRadius: 22,
    padding: 20,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: C.border,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statNum: { color: C.text, fontSize: 26, fontWeight: '900' },
  statLabel: { color: C.textDim, fontSize: 12, letterSpacing: 0.5 },
  statDivider: { width: 1, backgroundColor: C.border, marginVertical: 4 },

  reviewPrompt: { backgroundColor: C.accentSoft, borderColor: C.accentBorder, borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12, gap: 3 },
  reviewPromptText: { color: C.text, fontSize: 15, fontWeight: '800' },
  reviewPromptSub: { color: C.textMuted, fontSize: 13 },
  menuSection: { gap: 8 },
  menuSectionTitle: { color: C.textDim, fontSize: 11, fontFamily: FONT.head, letterSpacing: 1.5, textTransform: 'uppercase', marginLeft: 4 },
  menuCard: { backgroundColor: C.surface, borderRadius: 18, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 12 },
  menuRowBorder: { borderTopWidth: 1, borderTopColor: C.border },
  menuRowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center' },
  menuRowText: { flex: 1, gap: 1 },
  menuRowTitle: { color: C.text, fontSize: 15, fontWeight: '700' },
  menuRowSub: { color: C.textDim, fontSize: 12, fontFamily: FONT.body },

  inlineError: { backgroundColor: C.errorSoft, borderRadius: 10, borderWidth: 1, borderColor: C.errorBorder, padding: 10 },
  inlineErrorText: { color: C.error, fontSize: 13 },
  supportRow: { alignItems: 'center', gap: 2, paddingVertical: 10, marginTop: 4 },
  supportText: { color: C.accent, fontSize: 14, fontWeight: '700', fontFamily: FONT.body },
  supportSub: { color: C.textFaint, fontSize: 12, fontFamily: FONT.body },
  signOutBtn: { alignItems: 'center', paddingVertical: 8 },
  signOutText: { color: C.textFaint, fontSize: 14, textDecorationLine: 'underline' },

  reviewsSection: { gap: 10 },
  reviewsSectionTitle: { color: C.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  reviewItem: {
    backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border,
    padding: 14, gap: 6,
  },
  reviewItemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewItemName: { color: C.text, fontSize: 14, fontWeight: '700' },
  reviewItemStars: { fontSize: 13 },
  reviewItemBody: { color: C.textMuted, fontSize: 13, lineHeight: 19, fontStyle: 'italic', fontFamily: FONT.body },
  reviewItemDate: { color: C.textDim, fontSize: 11, marginTop: 4 },

}) }
