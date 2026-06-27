import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Image, Platform, Modal } from 'react-native'
import { Feather } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import QRCode from 'react-native-qrcode-svg'
import { supabase } from '../../lib/supabase'
import { router } from 'expo-router'
import { useTheme, type ThemeColors } from '../../lib/ThemeContext'
import { UserChip, refreshUserChip } from '../../components/UserChip'
import { AppHeader, HeaderBackButton } from '../../components/AppHeader'

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
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [reviews, setReviews] = useState<{ rating: number; body: string | null; reviewer_name: string | null; created_at: string }[]>([])
  const [pendingReviews, setPendingReviews] = useState(0)
  const [showQR, setShowQR] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState('')
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
    setUploadingAvatar(false)
    setAvatarError(null)
    setReviews([])
    setPendingReviews(0)
    setShowQR(false)
    setShowDeleteConfirm(false)
    setDeleting(false)
    setDeleteError('')
    setLoading(true)
  }

  async function loadAll(authUser?: any) {
    const resolvedUser = authUser ?? (await supabase.auth.getUser()).data.user
    if (!resolvedUser) { router.replace('/'); return }
    userIdRef.current = resolvedUser.id
    setUser(resolvedUser)
    const [p, h, r] = await Promise.all([
      supabase.from('profiles').select('id, full_name, bio, avatar_url').eq('id', resolvedUser.id).maybeSingle(),
      supabase.from('host_locations').select('*').eq('user_id', resolvedUser.id).order('created_at', { ascending: true }),
      // Reviews received by this user. reviewer_id has no FK to profiles, so a PostgREST
      // embed fails — fetch the reviewers' names in a separate query (like the public profile).
      supabase.from('reviews').select('rating, body, created_at, reviewer_id').eq('reviewee_id', resolvedUser.id).order('created_at', { ascending: false }),
    ])
    if (userIdRef.current !== resolvedUser.id) return
    setProfile(p.data)
    setHostLocations(h.data || [])
    setNameInput(p.data?.full_name || '')
    setBioInput(p.data?.bio || '')
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

    // Pending reviews you can still leave — as a guest AND as a host (symmetric).
    const today = new Date().toISOString().split('T')[0]
    const [{ data: endedStays }, { data: myRevs }] = await Promise.all([
      supabase.from('stay_requests')
        .select('id')
        .or(`guest_id.eq.${resolvedUser.id},host_id.eq.${resolvedUser.id}`)
        .eq('status', 'ACCEPTED')
        .lte('departure_date', today),
      supabase.from('reviews').select('stay_request_id').eq('reviewer_id', resolvedUser.id),
    ])
    if (userIdRef.current !== resolvedUser.id) return
    const reviewedSet = new Set((myRevs || []).map((r2: any) => r2.stay_request_id))
    setPendingReviews((endedStays || []).filter((s: any) => !reviewedSet.has(s.id)).length)

    setLoading(false)
  }

  async function saveName() {
    if (!nameInput.trim()) return
    setSavingName(true)
    const { error } = await supabase.from('profiles').upsert({ id: user.id, full_name: nameInput.trim() })
    setSavingName(false)
    if (error) { console.warn('save name error:', error.message); setAvatarError('Could not save your name. Please try again.'); return }
    setProfile((p: any) => ({ ...p, full_name: nameInput.trim() }))
    setEditingName(false)
    refreshUserChip()
  }

  async function saveBio() {
    setSavingBio(true)
    const trimmed = bioInput.trim()
    const { error } = await supabase.from('profiles').upsert({ id: user.id, bio: trimmed || null })
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
      const ext = extHint ?? ((file as File).name?.split('.').pop() || 'jpg')
      const path = `${user.id}/avatar.${ext}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true, contentType: (file as File).type || `image/${ext}` })
      if (upErr) { console.warn('avatar upload error:', upErr.message); setAvatarError('Could not upload the photo. Please try again.'); return }
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = `${publicUrl}?t=${Date.now()}`
      const { error: dbErr } = await supabase.from('profiles').upsert({ id: user.id, avatar_url: url })
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

  async function deleteAccount() {
    setDeleting(true)
    setDeleteError('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await supabase.functions.invoke('delete-account', {
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      })
      if (res.error) throw res.error
      await supabase.auth.signOut()
      router.replace('/')
    } catch (e: any) {
      console.warn('delete account error:', e?.message)
      setDeleteError('Could not delete your account right now. Please try again.')
      setDeleting(false)
    }
  }

  if (loading) {
    return <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}><ActivityIndicator color={C.accent} size="large" /></View>
  }

  const initials = profile?.full_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?'
  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Rider'
  const isHost = hostLocations.length > 0
  const avgRating = reviews.length > 0
    ? (reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length).toFixed(1)
    : null

  return (
    <View style={styles.container}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content}>
      <AppHeader left={<HeaderBackButton />} right={<UserChip />} />

      {/* Avatar + QR */}
      <View style={styles.hero}>
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
        <TouchableOpacity style={styles.qrBtn} onPress={() => setShowQR(true)}>
          <Feather name="share-2" size={16} color={C.accent} />
          <Text style={styles.qrBtnText}>Share profile</Text>
        </TouchableOpacity>
      </View>

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
        {/* Name */}
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
            <Text style={styles.name}>{displayName}</Text>
            <Feather name="edit-2" size={14} color={C.textDim} style={{ marginLeft: 8, marginTop: 2 }} />
          </TouchableOpacity>
        )}
        <Text style={styles.email}>{user?.email}</Text>

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

        {/* Stats */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{hostLocations.length}</Text>
            <Text style={styles.statLabel}>locations</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={[styles.statNum, avgRating ? { color: C.accent } : {}]}>
              {avgRating ? `⭐ ${avgRating}` : '—'}
            </Text>
            <Text style={styles.statLabel}>rating</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{reviews.length || '—'}</Text>
            <Text style={styles.statLabel}>reviews</Text>
          </View>
        </View>

        {/* Listings are managed in "My Listings" (below) so multi-location hosts
            aren't shown a single confusing inline place. */}

        {/* Pending reviews prompt — symmetric for guests and hosts */}
        {pendingReviews > 0 && (
          <TouchableOpacity style={styles.reviewPrompt} onPress={() => router.push('/history')} activeOpacity={0.85}>
            <Text style={styles.reviewPromptText}>
              ⭐ You have {pendingReviews} {pendingReviews === 1 ? 'stay' : 'stays'} to review
            </Text>
            <Text style={styles.reviewPromptSub}>Tap to rate your hosts and guests →</Text>
          </TouchableOpacity>
        )}

        {/* Menu items */}
        <View style={styles.menuGroup}>
          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/become-host')}>
            <View style={styles.menuTextWrap}>
              <Text style={styles.menuTitle}>{isHost ? 'My Listings' : 'Become a Host'}</Text>
              <Text style={styles.menuSub}>{isHost ? `${hostLocations.length} active ${hostLocations.length === 1 ? 'location' : 'locations'}` : 'Add listing'}</Text>
            </View>
            <View style={styles.menuIcon}>
              <Feather name="home" size={18} color={C.accent} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/history')}>
            <View style={styles.menuTextWrap}>
              <Text style={styles.menuTitle}>History</Text>
              <Text style={styles.menuSub}>Your past stays</Text>
            </View>
            <View style={styles.menuIcon}>
              <Feather name="clock" size={18} color={C.accent} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/reviews')}>
            <View style={styles.menuTextWrap}>
              <Text style={styles.menuTitle}>Reviews</Text>
              <Text style={styles.menuSub}>
                {avgRating ? `⭐ ${avgRating} · ${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'}` : 'No reviews yet'}
              </Text>
            </View>
            <View style={styles.menuIcon}>
              <Feather name="star" size={18} color={C.accent} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/notifications')}>
            <View style={styles.menuTextWrap}>
              <Text style={styles.menuTitle}>Notifications</Text>
              <Text style={styles.menuSub}>Email and push alerts</Text>
            </View>
            <View style={styles.menuIcon}>
              <Feather name="bell" size={18} color={C.accent} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/privacy')}>
            <View style={styles.menuTextWrap}>
              <Text style={styles.menuTitle}>Privacy</Text>
              <Text style={styles.menuSub}>Data, exact location and account deletion</Text>
            </View>
            <View style={styles.menuIcon}>
              <Feather name="shield" size={18} color={C.accent} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem} onPress={() => router.push('/terms')}>
            <View style={styles.menuTextWrap}>
              <Text style={styles.menuTitle}>Terms</Text>
              <Text style={styles.menuSub}>Community rules and stay requests</Text>
            </View>
            <View style={styles.menuIcon}>
              <Feather name="file-text" size={18} color={C.accent} />
            </View>
          </TouchableOpacity>

        </View>

        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.deleteBtn} onPress={() => { setDeleteError(''); setShowDeleteConfirm(true) }}>
          <Text style={styles.deleteBtnText}>Delete account</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>

    {/* Delete account confirmation modal */}

    <Modal visible={showDeleteConfirm} transparent animationType="fade" onRequestClose={() => setShowDeleteConfirm(false)}>
      <View style={styles.deleteOverlay}>
        <View style={styles.deleteSheet}>
          <Text style={styles.deleteSheetTitle}>Delete account?</Text>
          <Text style={styles.deleteSheetBody}>
            This will permanently delete your profile, listings, all sent requests, messages and reviews. This cannot be undone.
          </Text>
          {deleteError ? (
            <Text style={styles.deleteSheetError}>{deleteError}</Text>
          ) : null}
          <TouchableOpacity
            style={[styles.deleteConfirmBtn, deleting && { opacity: 0.6 }]}
            onPress={deleteAccount}
            disabled={deleting}
          >
            <Text style={styles.deleteConfirmBtnText}>{deleting ? 'Deleting...' : 'Yes, permanently delete'}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteCancelBtn} onPress={() => setShowDeleteConfirm(false)} disabled={deleting}>
            <Text style={styles.deleteCancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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
    paddingBottom: 12,
    paddingHorizontal: 24,
    gap: 14,
    backgroundColor: C.bg,
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
  name: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: 0.3 },
  email: { color: C.textDim, fontSize: 13, marginTop: -12 },
  placeCard: { backgroundColor: C.surface, borderRadius: 22, padding: 16, borderWidth: 1, borderColor: C.border },
  placeCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  placeCardTitle: { color: C.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 2 },
  openTag: { backgroundColor: C.successSoft, borderRadius: 100, borderWidth: 1, borderColor: C.successBorder, paddingHorizontal: 10, paddingVertical: 3 },
  openTagText: { color: C.success, fontSize: 11, fontWeight: '700' },
  placeDetails: { marginTop: 10, gap: 4 },
  placeDetailText: { color: C.textMuted, fontSize: 13 },

  bioRow: { flexDirection: 'row', alignItems: 'flex-start', marginTop: 2 },
  bioText: { flex: 1, color: C.textMuted, fontSize: 14, lineHeight: 21 },
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
  menuGroup: { gap: 10 },
  menuItem: {
    backgroundColor: C.surface,
    borderRadius: 22,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: C.border,
  },
  menuTextWrap: { gap: 3 },
  menuTitle: { color: C.text, fontSize: 16, fontWeight: '700' },
  menuSub: { color: C.textDim, fontSize: 13 },
  menuIcon: {
    width: 42, height: 42, borderRadius: 21,
    backgroundColor: C.elevated,
    alignItems: 'center', justifyContent: 'center',
  },

  inlineError: { backgroundColor: C.errorSoft, borderRadius: 10, borderWidth: 1, borderColor: C.errorBorder, padding: 10 },
  inlineErrorText: { color: C.error, fontSize: 13 },
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
  reviewItemBody: { color: C.textMuted, fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
  reviewItemDate: { color: C.textDim, fontSize: 11, marginTop: 4 },

  deleteBtn: { alignItems: 'center', paddingVertical: 6, marginTop: 4 },
  deleteBtnText: { color: C.error, fontSize: 13, textDecorationLine: 'underline' },

  deleteOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  deleteSheet: { backgroundColor: C.bg, borderRadius: 20, padding: 24, width: '100%', maxWidth: 400, gap: 12, borderWidth: 1, borderColor: C.errorBorder },
  deleteSheetTitle: { color: C.text, fontSize: 20, fontWeight: '900' },
  deleteSheetBody: { color: C.textMuted, fontSize: 14, lineHeight: 21 },
  deleteSheetError: { color: C.error, fontSize: 13 },
  deleteConfirmBtn: { height: 50, borderRadius: 100, backgroundColor: C.error, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  deleteConfirmBtnText: { color: C.white, fontSize: 14, fontWeight: '800' },
  deleteCancelBtn: { alignItems: 'center', paddingVertical: 8 },
  deleteCancelBtnText: { color: C.textMuted, fontSize: 14, textDecorationLine: 'underline' },

}) }
