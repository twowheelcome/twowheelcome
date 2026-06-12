import { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Alert, Image, Platform } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Feather } from '@expo/vector-icons'
import { supabase } from '../../lib/supabase'
import { router } from 'expo-router'
import { C } from '../../lib/theme'

export default function ProfileScreen() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [hostLocations, setHostLocations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [uploadingAvatar, setUploadingAvatar] = useState(false)
  const avatarInputRef = useRef<any>(null)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { router.replace('/'); return }
    setUser(user)
    const [p, h] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', user.id).single(),
      supabase.from('host_locations').select('*').eq('user_id', user.id).order('created_at', { ascending: true }),
    ])
    setProfile(p.data)
    setHostLocations(h.data || [])
    setNameInput(p.data?.full_name || '')
    setLoading(false)
  }

  async function saveName() {
    if (!nameInput.trim()) return
    setSavingName(true)
    const { error } = await supabase.from('profiles').upsert({ id: user.id, full_name: nameInput.trim() })
    setSavingName(false)
    if (error) { Alert.alert('Error', error.message); return }
    setProfile((p: any) => ({ ...p, full_name: nameInput.trim() }))
    setEditingName(false)
  }

  async function uploadAvatar(file: File) {
    if (!user) return
    setUploadingAvatar(true)
    try {
      const ext = file.name.split('.').pop() || 'jpg'
      const path = `${user.id}/avatar.${ext}`
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, file, { upsert: true })
      if (upErr) { Alert.alert('Upload error', upErr.message); return }
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      const url = `${publicUrl}?t=${Date.now()}`
      await supabase.from('profiles').upsert({ id: user.id, avatar_url: url })
      setProfile((p: any) => ({ ...p, avatar_url: url }))
    } finally {
      setUploadingAvatar(false)
    }
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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Hidden file input for web avatar upload */}
      {Platform.OS === 'web' && (
        <input
          ref={avatarInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={(e: any) => {
            const file = e.target.files?.[0]
            if (file) uploadAvatar(file)
          }}
        />
      )}

      {/* Hero section */}
      <View style={styles.hero}>
        <LinearGradient
          colors={['#1A2E1E', '#2A1C10', C.bg]}
          locations={[0, 0.6, 1]}
          style={styles.heroBg}
        />
        <TouchableOpacity
          style={styles.avatarWrap}
          onPress={() => Platform.OS === 'web' && avatarInputRef.current?.click()}
          activeOpacity={0.8}
        >
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
      </View>

      <View style={styles.body}>
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

        {/* Stats */}
        <View style={styles.statsCard}>
          <View style={styles.statItem}>
            <Text style={styles.statNum}>{hostLocations.length}</Text>
            <Text style={styles.statLabel}>locations</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>—</Text>
            <Text style={styles.statLabel}>nights</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statNum}>—</Text>
            <Text style={styles.statLabel}>trips</Text>
          </View>
        </View>

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
  name: { color: C.text, fontSize: 24, fontWeight: '800', letterSpacing: 0.3 },
  email: { color: C.textDim, fontSize: 13, marginTop: -12 },

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

  signOutBtn: { alignItems: 'center', paddingVertical: 8 },
  signOutText: { color: C.textFaint, fontSize: 14, textDecorationLine: 'underline' },
})
