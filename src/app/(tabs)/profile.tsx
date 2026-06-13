import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Image, Platform } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Feather } from '@expo/vector-icons'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../../lib/supabase'
import { router } from 'expo-router'
import { C } from '../../lib/theme'
import { SafetyBlock } from '../../components/SafetyBlock'

export default function ProfileScreen() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [hostLocations, setHostLocations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const [bikeModel, setBikeModel] = useState('')
  const [editingBike, setEditingBike] = useState(false)
  const [savingBike, setSavingBike] = useState(false)
  const [coverUrl, setCoverUrl] = useState<string | null>(null)
  const [uploadingCover, setUploadingCover] = useState(false)
  const [avatarError, setAvatarError] = useState<string | null>(null)
  const [reviews, setReviews] = useState<{ rating: number; body: string | null; reviewer_name: string | null; created_at: string }[]>([])

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/'); return }
    setUser(user)
    const [p, h, r] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('host_locations').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
      supabase.from('reviews').select('rating, body, created_at, reviewer:profiles!reviewer_id(full_name)').eq('reviewee_id', user.id).order('created_at', { ascending: false }),
    ])
    setProfile(p.data)
    setHostLocations(h.data || [])
    setNameInput(p.data?.full_name || '')
    setBikeModel(p.data?.bike_model || '')
    setCoverUrl(p.data?.cover_url || null)
    setReviews((r.data || []).map((rev: any) => ({
      rating: rev.rating,
      body: rev.body,
      reviewer_name: rev.reviewer?.full_name ?? null,
      created_at: rev.created_at,
    })))
    setLoading(false)
  }

  async function saveName() {
    if (!nameInput.trim()) return
    setSavingName(true)
    const { error } = await supabase.from('profiles').upsert({ id: user.id, full_name: nameInput.trim() })
    setSavingName(false)
    if (error) { setAvatarError(error.message); return }
    setProfile((p: any) => ({ ...p, full_name: nameInput.trim() }))
    setEditingName(false)
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
      if (upErr) { setAvatarError(upErr.message); return }
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = `${publicUrl}?t=${Date.now()}`
      const { error: dbErr } = await supabase.from('profiles').upsert({ id: user.id, avatar_url: url })
      if (dbErr) { setAvatarError(dbErr.message); return }
      setProfile((p: any) => ({ ...p, avatar_url: url }))
    } catch (e: unknown) {
      setAvatarError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploadingAvatar(false)
    }
  }

  async function uploadCover(file: File | Blob, extHint?: string) {
    if (!user) return
    setUploadingCover(true)
    try {
      const ext = extHint ?? ((file as File).name?.split('.').pop() || 'jpg')
      const path = `${user.id}/cover.${ext}`
      const { error } = await supabase.storage.from('profile-covers').upload(path, file, { upsert: true })
      if (error) return
      const { data: { publicUrl } } = supabase.storage.from('profile-covers').getPublicUrl(path)
      const url = `${publicUrl}?t=${Date.now()}`
      await supabase.from('profiles').upsert({ id: user.id, cover_url: url })
      setCoverUrl(url)
      setProfile((p: any) => ({ ...p, cover_url: url }))
    } finally {
      setUploadingCover(false)
    }
  }

  async function saveBike() {
    setSavingBike(true)
    await supabase.from('profiles').upsert({ id: user.id, bike_model: bikeModel.trim() })
    setProfile((p: any) => ({ ...p, bike_model: bikeModel.trim() }))
    setSavingBike(false)
    setEditingBike(false)
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/')
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
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hero section */}
      <View style={styles.hero}>
        {coverUrl ? (
          <Image source={{ uri: coverUrl }} style={styles.heroBg} resizeMode="cover" />
        ) : (
          <LinearGradient
            colors={['#1A2E1E', '#2A1C10', C.bg]}
            locations={[0, 0.6, 1]}
            style={styles.heroBg}
          />
        )}
        {coverUrl && <View style={[styles.heroBg, { backgroundColor: 'rgba(0,0,0,0.25)' }]} />}
        {Platform.OS === 'web' && (
          <div style={{ position: 'absolute', top: 14, right: 16, display: 'flex', gap: 8, zIndex: 20 } as any}>
            <button style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 100, padding: '6px 14px', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>Share</button>
            <button style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 100, padding: '6px 14px', color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>⚙ Settings</button>
          </div>
        )}
        {Platform.OS === 'web' && (
          <div style={{ position: 'absolute', bottom: 52, right: 14, zIndex: 20, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 } as any}>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', textAlign: 'right', maxWidth: 160 } as any}>Upload a photo of yourself with your bike</div>
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <button style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.18)', borderRadius: 100, padding: '5px 12px', color: 'white', fontSize: 11, cursor: 'pointer', opacity: uploadingCover ? 0.5 : 1 }}>
                {uploadingCover ? '...' : '📷 Cover'}
              </button>
              <input type="file" accept="image/*"
                style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' } as any}
                onChange={(e: any) => { const f = e.target.files?.[0]; if (f) uploadCover(f) }} />
            </div>
          </div>
        )}
        {Platform.OS === 'web' ? (
          <div style={{ position: 'relative', width: 84, height: 84, marginLeft: 24, marginBottom: -42, zIndex: 10, flexShrink: 0 } as any}>
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
      </View>

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

        {/* Bike model */}
        {editingBike ? (
          <View style={styles.nameEdit}>
            <TextInput
              style={styles.nameInput}
              value={bikeModel}
              onChangeText={setBikeModel}
              placeholder="e.g. Honda Africa Twin"
              placeholderTextColor={C.textFaint}
              autoFocus
            />
            <View style={styles.nameActions}>
              <TouchableOpacity style={styles.saveNameBtn} onPress={saveBike} disabled={savingBike}>
                <Text style={styles.saveNameBtnText}>{savingBike ? '...' : 'Save'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditingBike(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setEditingBike(true)} style={styles.nameRow}>
            <Text style={styles.bikeModel}>{bikeModel ? `🏍 ${bikeModel}` : '🏍 Add your bike model'}</Text>
            <Feather name="edit-2" size={12} color={C.textDim} style={{ marginLeft: 6, marginTop: 1 }} />
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
            <Text style={[styles.statNum, avgRating ? { color: C.buddy } : {}]}>
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

        {/* Your place card */}
        {isHost && (() => {
          const loc = hostLocations[0]
          const parkings: string[] = loc.parkings?.length ? loc.parkings : (loc.parking ? [loc.parking] : [])
          const pricings: string[] = loc.pricings?.length ? loc.pricings : (loc.pricing ? [loc.pricing] : ['free'])
          const sleepTypes: string[] = loc.sleep_types || []
          const isFree = pricings.includes('free')
          return (
            <View style={styles.placeCard}>
              <View style={styles.placeCardHeader}>
                <Text style={styles.placeCardTitle}>YOUR PLACE</Text>
                {loc.is_open && (
                  <View style={styles.openTag}>
                    <Text style={styles.openTagText}>Open</Text>
                  </View>
                )}
              </View>
              <SafetyBlock parkings={parkings} />
              <View style={styles.placeDetails}>
                {sleepTypes.length > 0 && (
                  <Text style={styles.placeDetailText}>
                    {sleepTypes.includes('room') ? '🛏 Private room' : sleepTypes.includes('roof') ? '🏠 Roof over head' : '⛺ Tent space'}
                    {loc.max_guests ? `  ·  max ${loc.max_guests} riders` : ''}
                  </Text>
                )}
                <Text style={styles.placeDetailText}>
                  {isFree ? '🤝 Free · beer welcome 🍺' : pricings.includes('tip') ? '🙏 Tip welcome' : '💶 Paid'}
                </Text>
              </View>
            </View>
          )
        })()}

        {/* Reviews */}
        {reviews.length > 0 && (
          <View style={styles.reviewsSection}>
            <Text style={styles.reviewsSectionTitle}>REVIEWS</Text>
            {reviews.map((rev, i) => (
              <View key={i} style={styles.reviewItem}>
                <View style={styles.reviewItemHeader}>
                  <Text style={styles.reviewItemName}>{rev.reviewer_name || 'Rider'}</Text>
                  <Text style={styles.reviewItemStars}>{'⭐'.repeat(rev.rating)}{'☆'.repeat(5 - rev.rating)}</Text>
                </View>
                {rev.body ? <Text style={styles.reviewItemBody}>"{rev.body}"</Text> : null}
              </View>
            ))}
          </View>
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

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuTextWrap}>
              <Text style={styles.menuTitle}>History</Text>
              <Text style={styles.menuSub}>View history</Text>
            </View>
            <View style={styles.menuIcon}>
              <Feather name="clock" size={18} color={C.accent} />
            </View>
          </TouchableOpacity>

          <TouchableOpacity style={styles.menuItem}>
            <View style={styles.menuTextWrap}>
              <Text style={styles.menuTitle}>Settings</Text>
              <Text style={styles.menuSub}>Edit profile</Text>
            </View>
            <View style={styles.menuIcon}>
              <Feather name="settings" size={18} color={C.accent} />
            </View>
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { paddingBottom: 40 },

  hero: {
    height: 180,
    position: 'relative',
    alignItems: 'flex-start',
    justifyContent: 'flex-end',
  },
  heroBg: {
    ...StyleSheet.absoluteFill,
  },
  avatarWrap: {
    width: 84, height: 84,
    marginLeft: 24, marginBottom: -42,
    zIndex: 10,
  },
  avatarCircle: {
    width: 84, height: 84, borderRadius: 42,
    backgroundColor: C.surface,
    borderWidth: 3, borderColor: C.accent,
    alignItems: 'center', justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarPhoto: { width: 84, height: 84, borderRadius: 42 },
  avatarText: { color: C.accent, fontSize: 32, fontWeight: '900' },
  avatarOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: C.accent,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: C.bg,
  },

  body: {
    paddingTop: 52,
    paddingHorizontal: 24,
    gap: 20,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center' },
  name: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: 0.3, fontFamily: 'Oswald_700Bold' },
  email: { color: C.textDim, fontSize: 13, marginTop: -12 },
  bikeModel: { color: C.textMuted, fontSize: 14, marginTop: -8 },
  placeCard: { backgroundColor: C.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: C.border },
  placeCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  placeCardTitle: { color: C.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 2, fontFamily: 'Oswald_700Bold' },
  openTag: { backgroundColor: C.successSoft, borderRadius: 100, borderWidth: 1, borderColor: C.successBorder, paddingHorizontal: 10, paddingVertical: 3 },
  openTagText: { color: C.success, fontSize: 11, fontWeight: '700' },
  placeDetails: { marginTop: 10, gap: 4 },
  placeDetailText: { color: C.textMuted, fontSize: 13 },

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
    borderRadius: 18,
    padding: 20,
    flexDirection: 'row',
    borderWidth: 1,
    borderColor: C.border,
  },
  statItem: { flex: 1, alignItems: 'center', gap: 4 },
  statNum: { color: C.text, fontSize: 26, fontWeight: '900' },
  statLabel: { color: C.textDim, fontSize: 12, letterSpacing: 0.5 },
  statDivider: { width: 1, backgroundColor: C.border, marginVertical: 4 },

  menuGroup: { gap: 10 },
  menuItem: {
    backgroundColor: C.surface,
    borderRadius: 18,
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
  reviewsSectionTitle: { color: C.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 2, fontFamily: 'Oswald_700Bold' },
  reviewItem: {
    backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border,
    padding: 14, gap: 6,
  },
  reviewItemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  reviewItemName: { color: C.text, fontSize: 14, fontWeight: '700' },
  reviewItemStars: { fontSize: 13 },
  reviewItemBody: { color: C.textMuted, fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
})
