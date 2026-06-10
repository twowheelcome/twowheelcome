import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Platform } from 'react-native'
import { supabase } from '../../lib/supabase'
import { router } from 'expo-router'

const parkingMeta: Record<string, { icon: string; label: string; color: string }> = {
  garage_locked: { icon: '🔒', label: 'Uzamčená garáž', color: '#22c55e' },
  carport: { icon: '🔐', label: 'Přístřešek za plotem', color: '#3b82f6' },
  yard: { icon: '🛡', label: 'Dvůr za plotem', color: '#e8631a' },
  street: { icon: '🛣', label: 'Ulice před domem', color: '#94a3b8' },
}

const pricingMeta: Record<string, { icon: string; label: string; color: string }> = {
  free: { icon: '🤝', label: 'Zdarma', color: '#22c55e' },
  tip: { icon: '🙏', label: 'Tip welcome', color: '#f59e0b' },
  fixed: { icon: '💶', label: 'Placené', color: '#3b82f6' },
}

export default function MapScreen() {
  const [hosts, setHosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [requesting, setRequesting] = useState(false)
  const [message, setMessage] = useState('')
  const [guests, setGuests] = useState(1)
  const [sending, setSending] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [showMap, setShowMap] = useState(false)
  const [HostMap, setHostMap] = useState<any>(null)

  useEffect(() => {
    fetchHosts()
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user))
    if (Platform.OS === 'web') {
      import('../../components/HostMap').then(m => setHostMap(() => m.default))
    }
  }, [])

  async function fetchHosts() {
    const { data, error } = await supabase.from('host_locations').select('*')
    if (error) { console.error(error); setLoading(false); return }
    if (!data || data.length === 0) { setHosts([]); setLoading(false); return }

    const userIds = [...new Set(data.map((h: any) => h.user_id))]
    const { data: profilesData } = await supabase
      .from('profiles')
      .select('id, full_name, avatar_url, bio')
      .in('id', userIds)

    const profileMap: Record<string, any> = {}
    profilesData?.forEach(p => { profileMap[p.id] = p })

    setHosts(data.map((h: any) => ({ ...h, profiles: profileMap[h.user_id] || null })))
    setLoading(false)
  }

  async function sendRequest() {
    if (!currentUser || !selected) return
    if (!message.trim()) {
      Alert.alert('Hej!', 'Napiš hostiteli zprávu. Aspoň pár slov. 😄')
      return
    }
    setSending(true)
    const { error } = await supabase.from('stay_requests').insert({
      guest_id: currentUser.id,
      host_id: selected.user_id,
      status: 'PENDING',
      guests_count: guests,
      message: message.trim(),
      arrival_date: new Date().toISOString().split('T')[0],
      departure_date: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    })
    setSending(false)
    if (error) {
      Alert.alert('Chyba', error.message)
    } else {
      Alert.alert('🤞 Žádost letí!', 'Teď jeď a doufej že má otevřeno.', [
        { text: 'OK', onPress: () => { setRequesting(false); setMessage(''); setSelected(null) } }
      ])
    }
  }

  // --- Formulář žádosti ---
  if (requesting && selected) {
    const pm = parkingMeta[selected.parking] || parkingMeta.street
    const pricing = pricingMeta[selected.pricing] || pricingMeta.free
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setRequesting(false)}>
            <Text style={styles.back}>← Zpět</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>KLEPU NA DVEŘE 🤞</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{selected.profiles?.full_name?.charAt(0) || '?'}</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{selected.profiles?.full_name || 'Anonymní jezdec'}</Text>
                <Text style={styles.cardLocation}>📍 {selected.location_city}, {selected.location_country}</Text>
              </View>
            </View>
            <View style={styles.tags}>
              <View style={[styles.tag, { borderColor: pm.color + '50', backgroundColor: pm.color + '15' }]}>
                <Text style={[styles.tagText, { color: pm.color }]}>{pm.icon} {pm.label}</Text>
              </View>
              <View style={[styles.tag, { borderColor: pricing.color + '50', backgroundColor: pricing.color + '15' }]}>
                <Text style={[styles.tagText, { color: pricing.color }]}>{pricing.icon} {pricing.label}</Text>
              </View>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>POČET JEZDCŮ</Text>
            <View style={styles.counter}>
              <TouchableOpacity style={styles.counterBtn} onPress={() => setGuests(Math.max(1, guests - 1))}>
                <Text style={styles.counterBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.counterValue}>{guests}</Text>
              <TouchableOpacity style={styles.counterBtn} onPress={() => setGuests(Math.min(selected.max_guests || 4, guests + 1))}>
                <Text style={styles.counterBtnText}>+</Text>
              </TouchableOpacity>
              <Text style={styles.counterMax}>max {selected.max_guests}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>ZPRÁVA HOSTITELI</Text>
            <TextInput
              style={styles.textarea}
              placeholder="Ahoj, jedu přes tvoje město, máš místo?..."
              placeholderTextColor="#555"
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={4}
            />
          </View>

          {selected.pricing === 'tip' && (
            <View style={[styles.infoBox, { borderColor: '#f59e0b50', backgroundColor: '#f59e0b10' }]}>
              <Text style={[styles.infoText, { color: '#f59e0b' }]}>🙏 Tip není povinný, ale pivo nebo příběh u táboráku potěší. 🍺</Text>
            </View>
          )}
          {selected.pricing === 'fixed' && (
            <View style={[styles.infoBox, { borderColor: '#3b82f650', backgroundColor: '#3b82f610' }]}>
              <Text style={[styles.infoText, { color: '#3b82f6' }]}>💶 Domluv se s hostitelem přímo — žádná provize.</Text>
            </View>
          )}

          <TouchableOpacity style={styles.button} onPress={sendRequest} disabled={sending}>
            <Text style={styles.buttonText}>{sending ? 'ODESÍLÁM... 🤞' : 'ODESLAT ŽÁDOST →'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    )
  }

  // --- Hlavní obrazovka ---
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.logo}>TWOWHEEL<Text style={styles.accent}>COME</Text></Text>
        <Text style={styles.sub}>
          {loading ? 'Hledám parťáky... 🔍' : `${hosts.length} ${hosts.length === 1 ? 'hostitel' : 'hostitelé'} na trase`}
        </Text>
        <View style={styles.tabs}>
          <TouchableOpacity style={[styles.tab, !showMap && styles.tabActive]} onPress={() => setShowMap(false)}>
            <Text style={[styles.tabText, !showMap && styles.tabTextActive]}>☰ Seznam</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, showMap && styles.tabActive]}
            onPress={() => setShowMap(true)}
            disabled={Platform.OS !== 'web'}
          >
            <Text style={[styles.tabText, showMap && styles.tabTextActive]}>
              🗺 Mapa{Platform.OS !== 'web' ? ' (web)' : ''}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {showMap && HostMap ? (
        <View style={{ flex: 1, position: 'relative' }}>
          <HostMap
            hosts={hosts}
            onHostSelect={(host: any) => { setSelected(host); setShowMap(false) }}
          />
        </View>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={{ padding: 16, gap: 12 }}>
          {hosts.length === 0 && !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🏍</Text>
              <Text style={styles.emptyTitle}>Zatím žádní hostitelé</Text>
              <Text style={styles.emptyText}>Buď první! Jdi do záložky Profil a otevři dveře komunitě.</Text>
            </View>
          ) : (
            hosts.map((host) => {
              const pm = parkingMeta[host.parking] || parkingMeta.street
              const pricing = pricingMeta[host.pricing] || pricingMeta.free
              const isOwn = host.user_id === currentUser?.id
              return (
                <TouchableOpacity
                  key={host.id}
                  style={[styles.card, selected?.id === host.id && styles.cardSelected]}
                  onPress={() => setSelected(selected?.id === host.id ? null : host)}
                >
                  <View style={styles.cardRow}>
                    <View style={styles.avatar}>
                      <Text style={styles.avatarText}>{host.profiles?.full_name?.charAt(0) || '?'}</Text>
                    </View>
                    <View style={styles.cardInfo}>
                      <Text style={styles.cardName}>
                        {host.profiles?.full_name || 'Anonymní jezdec'}
                        {isOwn && <Text style={styles.ownBadge}> (ty)</Text>}
                      </Text>
                      <Text style={styles.cardLocation}>📍 {host.location_city}, {host.location_country}</Text>
                    </View>
                  </View>
                  <View style={styles.tags}>
                    <View style={[styles.tag, { borderColor: pm.color + '50', backgroundColor: pm.color + '15' }]}>
                      <Text style={[styles.tagText, { color: pm.color }]}>{pm.icon} {pm.label}</Text>
                    </View>
                    <View style={[styles.tag, { borderColor: pricing.color + '50', backgroundColor: pricing.color + '15' }]}>
                      <Text style={[styles.tagText, { color: pricing.color }]}>{pricing.icon} {pricing.label}</Text>
                    </View>
                  </View>
                  {selected?.id === host.id && (
                    <View style={styles.detail}>
                      {host.notes ? <Text style={styles.detailBio}>{host.notes}</Text> : null}
                      <Text style={styles.detailInfo}>👥 Max. {host.max_guests} jezdci</Text>
                      {!isOwn ? (
                        <TouchableOpacity style={styles.requestButton} onPress={() => setRequesting(true)}>
                          <Text style={styles.requestButtonText}>KLEPU NA DVEŘE →</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity style={styles.editButton} onPress={() => router.push('/become-host')}>
                          <Text style={styles.editButtonText}>UPRAVIT NABÍDKU</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              )
            })
          )}
        </ScrollView>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  header: { padding: 20, paddingTop: 52, borderBottomWidth: 1, borderBottomColor: '#2d2d2d' },
  logo: { fontSize: 22, fontWeight: '900', color: '#eee', letterSpacing: 2 },
  accent: { color: '#e8631a' },
  sub: { color: '#666', fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 4 },
  back: { color: '#e8631a', fontSize: 16, marginBottom: 8 },
  headerTitle: { color: '#eee', fontSize: 18, fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: 8, marginTop: 12 },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#333' },
  tabActive: { backgroundColor: '#e8631a', borderColor: '#e8631a' },
  tabText: { color: '#555', fontSize: 13 },
  tabTextActive: { color: '#fff', fontWeight: '700' },
  list: { flex: 1 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { color: '#eee', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptyText: { color: '#666', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  card: { backgroundColor: '#2d2d2d', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#333', marginBottom: 12 },
  cardSelected: { borderColor: '#e8631a' },
  cardRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e8631a', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  cardInfo: { flex: 1 },
  cardName: { color: '#eee', fontWeight: '700', fontSize: 15 },
  ownBadge: { color: '#e8631a', fontSize: 13 },
  cardLocation: { color: '#666', fontSize: 12, marginTop: 2 },
  tags: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tag: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  tagText: { fontSize: 11 },
  detail: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#333', gap: 8 },
  detailBio: { color: '#aaa', fontSize: 13, lineHeight: 18 },
  detailInfo: { color: '#666', fontSize: 12 },
  requestButton: { backgroundColor: '#e8631a', borderRadius: 10, padding: 12, alignItems: 'center' },
  requestButtonText: { color: '#fff', fontWeight: '700', fontSize: 13, letterSpacing: 1 },
  editButton: { borderWidth: 1, borderColor: '#e8631a', borderRadius: 10, padding: 12, alignItems: 'center' },
  editButtonText: { color: '#e8631a', fontWeight: '700', fontSize: 13, letterSpacing: 1 },
  button: { backgroundColor: '#e8631a', borderRadius: 10, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 1 },
  sectionLabel: { color: '#666', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  counterBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' },
  counterBtnText: { color: '#eee', fontSize: 18, fontWeight: '700' },
  counterValue: { color: '#eee', fontSize: 20, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  counterMax: { color: '#555', fontSize: 12 },
  textarea: { backgroundColor: '#1a1a1a', borderRadius: 8, padding: 12, color: '#eee', fontSize: 14, minHeight: 100, borderWidth: 1, borderColor: '#333', textAlignVertical: 'top' },
  infoBox: { borderRadius: 10, borderWidth: 1, padding: 12 },
  infoText: { fontSize: 13, lineHeight: 18 },
})
