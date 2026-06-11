import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, TextInput, Alert } from 'react-native'
import { supabase } from '../../lib/supabase'
import { router } from 'expo-router'

const VEHICLE_TYPES = [
  { value: 'moto', icon: '🏍', label: 'Motorka' },
  { value: 'adv', icon: '🏕', label: 'ADV / Enduro' },
  { value: 'bicycle', icon: '🚴', label: 'Kolo' },
  { value: 'gravel', icon: '🪨', label: 'Gravel / MTB' },
]

export default function ProfileScreen() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [hostLocations, setHostLocations] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const [savingName, setSavingName] = useState(false)

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
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: user.id, full_name: nameInput.trim() })
    setSavingName(false)
    if (error) { Alert.alert('Chyba', error.message); return }
    setProfile((p: any) => ({ ...p, full_name: nameInput.trim() }))
    setEditingName(false)
  }

  async function toggleVehicleType(value: string) {
    const current: string[] = profile?.vehicle_types || []
    const next = current.includes(value) ? current.filter((v: string) => v !== value) : [...current, value]
    await supabase.from('profiles').upsert({ id: user.id, vehicle_types: next })
    setProfile((p: any) => ({ ...p, vehicle_types: next }))
  }

  async function signOut() {
    await supabase.auth.signOut()
    router.replace('/')
  }

  if (loading) {
    return <View style={[styles.container, styles.center]}><ActivityIndicator color="#e8631a" size="large" /></View>
  }

  const initials = profile?.full_name?.charAt(0)?.toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || '?'

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {/* Avatar + jméno */}
      <View style={styles.avatarSection}>
        <View style={styles.avatarCircle}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>

        {editingName ? (
          <View style={styles.nameEdit}>
            <TextInput
              style={styles.nameInput}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="Tvoje jméno"
              placeholderTextColor="#555"
              autoFocus
            />
            <View style={styles.nameActions}>
              <TouchableOpacity style={styles.saveNameBtn} onPress={saveName} disabled={savingName}>
                <Text style={styles.saveNameBtnText}>{savingName ? '...' : 'Uložit'}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setEditingName(false)}>
                <Text style={styles.cancelText}>Zrušit</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <TouchableOpacity onPress={() => setEditingName(true)}>
            <Text style={styles.name}>{profile?.full_name || 'Klikni a nastav jméno ✏️'}</Text>
          </TouchableOpacity>
        )}

        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.divider} />

      {/* Typ vozidla */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🛞 CO JEDEŠ?</Text>
        <View style={styles.chipsWrap}>
          {VEHICLE_TYPES.map(v => {
            const active = (profile?.vehicle_types || []).includes(v.value)
            return (
              <TouchableOpacity
                key={v.value}
                style={[styles.chip, active && styles.chipActive]}
                onPress={() => toggleVehicleType(v.value)}
              >
                <Text style={styles.chipIcon}>{v.icon}</Text>
                <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{v.label}</Text>
              </TouchableOpacity>
            )
          })}
        </View>
      </View>

      <View style={styles.divider} />

      {/* Hostitelský profil */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>🏠 MŮJ PROFIL HOSTITELE</Text>

        {hostLocations.length > 0 ? (
          <View style={{ gap: 10 }}>
            {hostLocations.map((loc, i) => (
              <View key={loc.id} style={styles.hostCard}>
                <View style={styles.hostCardRow}>
                  <Text style={styles.hostCardCity}>📍 {loc.location_city}, {loc.location_country}</Text>
                </View>
                <Text style={styles.hostCardDetail}>
                  👥 Max. {loc.max_guests} hostů  ·  {
                    loc.pricing === 'free' ? '🤝 Zdarma' :
                    loc.pricing === 'tip' ? '🙏 Tip welcome' : '💶 Placené'
                  }
                </Text>
                {loc.notes ? (
                  <Text style={styles.hostCardNotes} numberOfLines={2}>{loc.notes}</Text>
                ) : null}
              </View>
            ))}
            <TouchableOpacity style={styles.editBtn} onPress={() => router.push('/become-host')}>
              <Text style={styles.editBtnText}>UPRAVIT NABÍDKU</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.noHostCard}>
            <Text style={styles.noHostText}>
              Otevři dveře komunitě. Nastav svojí nabídku a začni přijímat jezdce.
            </Text>
            <TouchableOpacity style={styles.becomeHostBtn} onPress={() => router.push('/become-host')}>
              <Text style={styles.becomeHostBtnText}>🏠 STÁT SE HOSTITELEM →</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      <View style={styles.divider} />

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutBtn} onPress={signOut}>
        <Text style={styles.signOutText}>Odhlásit se</Text>
      </TouchableOpacity>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { padding: 24, paddingTop: 56, paddingBottom: 40, gap: 24 },
  avatarSection: { alignItems: 'center', gap: 10 },
  avatarCircle: { width: 80, height: 80, borderRadius: 40, backgroundColor: '#e8631a', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 32, fontWeight: '900' },
  name: { color: '#eee', fontSize: 22, fontWeight: '700', textAlign: 'center' },
  email: { color: '#555', fontSize: 13 },
  nameEdit: { width: '100%', gap: 8 },
  nameInput: { backgroundColor: '#2d2d2d', borderRadius: 10, padding: 12, color: '#eee', fontSize: 16, borderWidth: 1, borderColor: '#e8631a', textAlign: 'center' },
  nameActions: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 16 },
  saveNameBtn: { backgroundColor: '#e8631a', borderRadius: 8, paddingHorizontal: 20, paddingVertical: 8 },
  saveNameBtnText: { color: '#fff', fontWeight: '700' },
  cancelText: { color: '#555', fontSize: 14 },
  divider: { height: 1, backgroundColor: '#2d2d2d' },
  section: { gap: 12 },
  sectionTitle: { color: '#555', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  hostCard: { backgroundColor: '#2d2d2d', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#333', gap: 8 },
  hostCardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  hostCardCity: { color: '#eee', fontSize: 16, fontWeight: '700' },
  activeBadge: { backgroundColor: '#22c55e20', borderRadius: 6, borderWidth: 1, borderColor: '#22c55e50', paddingHorizontal: 8, paddingVertical: 3 },
  activeBadgeText: { color: '#22c55e', fontSize: 10, fontWeight: '700', letterSpacing: 1 },
  hostCardDetail: { color: '#888', fontSize: 13 },
  hostCardNotes: { color: '#666', fontSize: 12, lineHeight: 18 },
  editBtn: { borderWidth: 1, borderColor: '#e8631a', borderRadius: 8, padding: 10, alignItems: 'center', marginTop: 4 },
  editBtnText: { color: '#e8631a', fontWeight: '700', fontSize: 12, letterSpacing: 1 },
  noHostCard: { backgroundColor: '#2d2d2d', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#333', gap: 14 },
  noHostText: { color: '#777', fontSize: 14, lineHeight: 20 },
  becomeHostBtn: { backgroundColor: '#e8631a', borderRadius: 10, padding: 14, alignItems: 'center' },
  becomeHostBtnText: { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 0.5 },
  signOutBtn: { alignItems: 'center', padding: 12 },
  signOutText: { color: '#444', fontSize: 14, textDecorationLine: 'underline' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#2d2d2d', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: '#333' },
  chipActive: { borderColor: '#e8631a', backgroundColor: '#e8631a15' },
  chipIcon: { fontSize: 16 },
  chipLabel: { color: '#aaa', fontSize: 13, fontWeight: '600' },
  chipLabelActive: { color: '#e8631a' },
})
