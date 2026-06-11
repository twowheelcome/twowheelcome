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

const FILTER_VEHICLES = [
  { value: 'moto', icon: '🏍', label: 'Moto' },
  { value: 'bicycle', icon: '🚴', label: 'Kolo' },
]
const FILTER_PARKING = [
  { value: 'garage_locked', icon: '🔒', label: 'Garáž' },
  { value: 'carport', icon: '🔐', label: 'Přístřešek' },
  { value: 'yard', icon: '🛡', label: 'Dvůr' },
  { value: 'street', icon: '🛣', label: 'Ulice' },
]
const FILTER_SLEEP = [
  { value: 'tent', icon: '⛺', label: 'Stan' },
  { value: 'roof', icon: '🏠', label: 'Střecha' },
  { value: 'room', icon: '🛏', label: 'Pokoj' },
]
const FILTER_PRICING = [
  { value: 'free', icon: '🤝', label: 'Zdarma' },
  { value: 'tip', icon: '🙏', label: 'Tip' },
  { value: 'fixed', icon: '💶', label: 'Placené' },
]

function toggleFilter(arr: string[], val: string): string[] {
  return arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]
}

// Deterministic ~500m offset from host ID so markers don't jump on refresh
function fuzzCoords(id: string, lat: number, lng: number): { lat: number; lng: number } {
  let h = 0
  for (let i = 0; i < id.length; i++) { h = Math.imul(h ^ id.charCodeAt(i), 0x9e3779b1) }
  const latOff = ((h & 0xfff) - 0x7ff) / 150000   // ±0.0054° ≈ ±500m
  const lngOff = (((h >> 12) & 0xfff) - 0x7ff) / 150000
  return { lat: lat + latOff, lng: lng + lngOff }
}

function FilterRow({ label, items, active, onToggle }: {
  label: string
  items: { value: string; icon: string; label: string }[]
  active: string[]
  onToggle: (v: string) => void
}) {
  return (
    <View style={filterStyles.row}>
      <Text style={filterStyles.rowLabel}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={filterStyles.chips}>
        {items.map(item => {
          const on = active.includes(item.value)
          return (
            <TouchableOpacity
              key={item.value}
              style={[filterStyles.chip, on && filterStyles.chipOn]}
              onPress={() => onToggle(item.value)}
            >
              <Text style={filterStyles.chipIcon}>{item.icon}</Text>
              <Text style={[filterStyles.chipLabel, on && filterStyles.chipLabelOn]}>{item.label}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>
    </View>
  )
}

const filterStyles = StyleSheet.create({
  row: { gap: 6 },
  rowLabel: { color: '#999', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  chips: { flexDirection: 'row', gap: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#2d2d2d', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#333' },
  chipOn: { borderColor: '#e8631a', backgroundColor: '#e8631a20' },
  chipIcon: { fontSize: 13 },
  chipLabel: { color: '#999', fontSize: 12, fontWeight: '600' },
  chipLabelOn: { color: '#e8631a' },
})

export default function MapScreen() {
  const [hosts, setHosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [requesting, setRequesting] = useState(false)
  const [message, setMessage] = useState('')
  const [guests, setGuests] = useState(1)
  const [sending, setSending] = useState(false)
  const [guestVehicle, setGuestVehicle] = useState('')
  const [arrivalDate, setArrivalDate] = useState(() => new Date().toISOString().split('T')[0])
  const [departureDate, setDepartureDate] = useState(() => new Date(Date.now() + 86400000).toISOString().split('T')[0])
  const [arrivalTime, setArrivalTime] = useState('')
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [showMap, setShowMap] = useState(Platform.OS === 'web')
  const [HostMap, setHostMap] = useState<any>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filterVehicles, setFilterVehicles] = useState<string[]>([])
  const [filterParking, setFilterParking] = useState<string[]>([])
  const [filterSleep, setFilterSleep] = useState<string[]>([])
  const [filterPricing, setFilterPricing] = useState<string[]>([])

  const activeCount = filterVehicles.length + filterParking.length + filterSleep.length + filterPricing.length
  const filteredHosts = hosts.filter(h => {
    if (filterVehicles.length > 0 && !filterVehicles.some(v => (h.vehicle_types || []).includes(v))) return false
    if (filterParking.length > 0) {
      const hp: string[] = h.parkings?.length ? h.parkings : (h.parking ? [h.parking] : [])
      if (!filterParking.some(p => hp.includes(p))) return false
    }
    if (filterSleep.length > 0 && !(h.sleep_types || []).some((s: string) => filterSleep.includes(s))) return false
    if (filterPricing.length > 0) {
      const hp: string[] = h.pricings?.length ? h.pricings : (h.pricing ? [h.pricing] : [])
      if (!filterPricing.some(p => hp.includes(p))) return false
    }
    return true
  })

  useEffect(() => {
    fetchHosts()
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user))
    if (Platform.OS === 'web') {
      import('../../components/HostMap').then(m => setHostMap(() => m.default))
    }
  }, [])

  useEffect(() => {
    if (requesting) {
      setGuestVehicle('')
      setArrivalDate(new Date().toISOString().split('T')[0])
      setDepartureDate(new Date(Date.now() + 86400000).toISOString().split('T')[0])
      setArrivalTime('')
    }
  }, [requesting])

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

    setHosts(data.map((h: any) => {
      const fuzzed = fuzzCoords(h.id, h.location_lat, h.location_lng)
      return { ...h, profiles: profileMap[h.user_id] || null, location_lat: fuzzed.lat, location_lng: fuzzed.lng }
    }))
    setLoading(false)
  }

  async function sendRequest() {
    if (!currentUser || !selected) return
    if (!message.trim()) {
      Alert.alert('Hej!', 'Napiš hostiteli zprávu. Aspoň pár slov. 😄')
      return
    }
    setSending(true)
    const { data: insertData, error } = await supabase.from('stay_requests').insert({
      guest_id: currentUser.id,
      host_id: selected.user_id,
      status: 'PENDING',
      guests_count: guests,
      message: message.trim(),
      arrival_date: arrivalDate,
      departure_date: departureDate,
      arrival_time: arrivalTime.trim() || null,
      guest_vehicle: guestVehicle || null,
    }).select('id')
    setSending(false)
    if (error) {
      Alert.alert('Chyba', error.message)
    } else {
      supabase.functions.invoke('notify-request', {
        body: { request_id: insertData?.[0]?.id, event: 'new_request' },
      }).catch(() => {})
      Alert.alert('🤞 Žádost letí!', 'Teď jeď a doufej že má otevřeno.', [
        { text: 'OK', onPress: () => { setRequesting(false); setMessage(''); setSelected(null) } }
      ])
    }
  }

  // --- Formulář žádosti ---
  if (requesting && selected) {
    const selectedParkings: string[] = selected.parkings?.length ? selected.parkings : (selected.parking ? [selected.parking] : [])
    const selectedPricings: string[] = selected.pricings?.length ? selected.pricings : (selected.pricing ? [selected.pricing] : ['free'])
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
              {selectedParkings.map(pv => {
                const pm = parkingMeta[pv] || parkingMeta.street
                return (
                  <View key={pv} style={[styles.tag, { borderColor: pm.color + '50', backgroundColor: pm.color + '15' }]}>
                    <Text style={[styles.tagText, { color: pm.color }]}>{pm.icon} {pm.label}</Text>
                  </View>
                )
              })}
              {selectedPricings.map(pv => {
                const pr = pricingMeta[pv] || pricingMeta.free
                return (
                  <View key={pv} style={[styles.tag, { borderColor: pr.color + '50', backgroundColor: pr.color + '15' }]}>
                    <Text style={[styles.tagText, { color: pr.color }]}>{pr.icon} {pr.label}</Text>
                  </View>
                )
              })}
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
            <Text style={styles.sectionLabel}>CO JEDEŠ?</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[{ value: 'moto', icon: '🏍', label: 'Moto' }, { value: 'bicycle', icon: '🚴', label: 'Kolo' }].map(v => (
                <TouchableOpacity
                  key={v.value}
                  style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: '#333', backgroundColor: '#1a1a1a' },
                    guestVehicle === v.value && { borderColor: '#e8631a', backgroundColor: '#e8631a15' }]}
                  onPress={() => setGuestVehicle(guestVehicle === v.value ? '' : v.value)}
                >
                  <Text style={{ fontSize: 22 }}>{v.icon}</Text>
                  <Text style={[{ color: '#aaa', fontWeight: '700', fontSize: 15 }, guestVehicle === v.value && { color: '#e8631a' }]}>{v.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>KDY PŘIJEDEŠ?</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.dateFieldLabel}>PŘÍJEZD</Text>
                {Platform.OS === 'web' ? (
                  <input type="date" value={arrivalDate}
                    onChange={(e: any) => setArrivalDate(e.target.value)}
                    style={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: 8, padding: '10px 12px', color: '#eee', fontSize: 13, colorScheme: 'dark', outline: 'none', width: '100%', boxSizing: 'border-box' } as any} />
                ) : (
                  <TextInput style={styles.dateInput} value={arrivalDate} onChangeText={setArrivalDate} placeholderTextColor="#555" />
                )}
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.dateFieldLabel}>ODJEZD</Text>
                {Platform.OS === 'web' ? (
                  <input type="date" value={departureDate}
                    onChange={(e: any) => setDepartureDate(e.target.value)}
                    style={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: 8, padding: '10px 12px', color: '#eee', fontSize: 13, colorScheme: 'dark', outline: 'none', width: '100%', boxSizing: 'border-box' } as any} />
                ) : (
                  <TextInput style={styles.dateInput} value={departureDate} onChangeText={setDepartureDate} placeholderTextColor="#555" />
                )}
              </View>
            </View>
            <View style={{ gap: 6, marginTop: 4 }}>
              <Text style={styles.dateFieldLabel}>CCA PŘÍJEZD <Text style={{ color: '#555', fontWeight: '400', letterSpacing: 0 }}>(volitelné)</Text></Text>
              {Platform.OS === 'web' ? (
                <input type="time" value={arrivalTime}
                  onChange={(e: any) => setArrivalTime(e.target.value)}
                  style={{ background: '#1a1a1a', border: '1px solid #444', borderRadius: 8, padding: '10px 12px', color: arrivalTime ? '#eee' : '#555', fontSize: 13, colorScheme: 'dark', outline: 'none', width: '100%', boxSizing: 'border-box' } as any} />
              ) : (
                <TextInput style={styles.dateInput} value={arrivalTime} onChangeText={setArrivalTime} placeholder="např. 17:00" placeholderTextColor="#555" />
              )}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>ZPRÁVA HOSTITELI</Text>
            <TextInput
              style={styles.textarea}
              placeholder="Ahoj, jedu přes tvoje město, máš místo?..."
              placeholderTextColor="#666"
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={4}
            />
          </View>

          {selectedPricings.includes('tip') && (
            <View style={[styles.infoBox, { borderColor: '#f59e0b50', backgroundColor: '#f59e0b10' }]}>
              <Text style={[styles.infoText, { color: '#f59e0b' }]}>🙏 Tip není povinný, ale pivo nebo příběh u táboráku potěší. 🍺</Text>
            </View>
          )}
          {selectedPricings.includes('fixed') && (
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
        <Text style={styles.logo}><Text style={styles.accent}>TWO</Text>WHEEL<Text style={styles.accent}>COME</Text></Text>
        <Text style={styles.sub}>
          {loading ? 'Hledám parťáky... 🔍' : `${hosts.length} ${hosts.length === 1 ? 'hostitel' : 'hostitelé'} na trase`}
        </Text>
        <View style={styles.tabsRow}>
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
          <TouchableOpacity
            style={[styles.filterToggle, activeCount > 0 && styles.filterToggleActive]}
            onPress={() => setFiltersOpen(v => !v)}
          >
            <Text style={[styles.filterToggleText, activeCount > 0 && styles.filterToggleTextActive]}>
              ⚙ FILTROVAT{activeCount > 0 ? ` (${activeCount})` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {filtersOpen && (
          <View style={styles.filterPanel}>
            <FilterRow label="TYP VOZIDLA" items={FILTER_VEHICLES} active={filterVehicles} onToggle={v => setFilterVehicles(toggleFilter(filterVehicles, v))} />
            <FilterRow label="PARKOVÁNÍ" items={FILTER_PARKING} active={filterParking} onToggle={v => setFilterParking(toggleFilter(filterParking, v))} />
            <FilterRow label="SPANÍ" items={FILTER_SLEEP} active={filterSleep} onToggle={v => setFilterSleep(toggleFilter(filterSleep, v))} />
            <FilterRow label="CENA" items={FILTER_PRICING} active={filterPricing} onToggle={v => setFilterPricing(toggleFilter(filterPricing, v))} />
            {activeCount > 0 && (
              <TouchableOpacity onPress={() => { setFilterVehicles([]); setFilterParking([]); setFilterSleep([]); setFilterPricing([]) }}>
                <Text style={styles.clearFilters}>✕ Zrušit filtry</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </View>

      {showMap && HostMap ? (
        <View style={{ flex: 1, position: 'relative' }}>
          <HostMap
            hosts={filteredHosts}
            onHostSelect={(host: any) => { setSelected(host); setRequesting(true) }}
          />
        </View>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={{ padding: 16, gap: 12 }}>
          {filteredHosts.length === 0 && !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🏍</Text>
              <Text style={styles.emptyTitle}>{activeCount > 0 ? 'Nic nenalezeno' : 'Zatím žádní hostitelé'}</Text>
              <Text style={styles.emptyText}>{activeCount > 0 ? 'Zkus změnit nebo zrušit filtry.' : 'Buď první! Jdi do záložky Profil a otevři dveře komunitě.'}</Text>
            </View>
          ) : (
            filteredHosts.map((host) => {
              const hostParkings: string[] = host.parkings?.length ? host.parkings : (host.parking ? [host.parking] : [])
              const hostPricings: string[] = host.pricings?.length ? host.pricings : (host.pricing ? [host.pricing] : ['free'])
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
                    {hostParkings.map(pv => {
                      const pm = parkingMeta[pv] || parkingMeta.street
                      return (
                        <View key={pv} style={[styles.tag, { borderColor: pm.color + '50', backgroundColor: pm.color + '15' }]}>
                          <Text style={[styles.tagText, { color: pm.color }]}>{pm.icon} {pm.label}</Text>
                        </View>
                      )
                    })}
                    {hostPricings.map(pv => {
                      const pr = pricingMeta[pv] || pricingMeta.free
                      return (
                        <View key={pv} style={[styles.tag, { borderColor: pr.color + '50', backgroundColor: pr.color + '15' }]}>
                          <Text style={[styles.tagText, { color: pr.color }]}>{pr.icon} {pr.label}</Text>
                        </View>
                      )
                    })}
                  </View>
                  {selected?.id === host.id && (
                    <View style={styles.detail}>
                      {host.notes ? <Text style={styles.detailBio}>{host.notes}</Text> : null}
                      <Text style={styles.detailInfo}>👥 Max. {host.max_guests} jezdci</Text>
                      {host.vehicle_types?.length > 0 && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {(host.vehicle_types as string[]).map(v => {
                            const meta = FILTER_VEHICLES.find(f => f.value === v)
                            if (!meta) return null
                            return (
                              <View key={v} style={[styles.tag, { borderColor: '#e8631a50', backgroundColor: '#e8631a10' }]}>
                                <Text style={[styles.tagText, { color: '#e8631a' }]}>{meta.icon} {meta.label}</Text>
                              </View>
                            )
                          })}
                        </View>
                      )}
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
  sub: { color: '#999', fontSize: 12, letterSpacing: 1.5, textTransform: 'uppercase', marginTop: 4 },
  back: { color: '#e8631a', fontSize: 16, marginBottom: 8 },
  headerTitle: { color: '#eee', fontSize: 18, fontWeight: '700' },
  tabsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  tabs: { flexDirection: 'row', gap: 8 },
  filterToggle: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: '#333' },
  filterToggleActive: { borderColor: '#e8631a', backgroundColor: '#e8631a20' },
  filterToggleText: { color: '#999', fontSize: 11, fontWeight: '700', letterSpacing: 1 },
  filterToggleTextActive: { color: '#e8631a' },
  filterPanel: { marginTop: 12, gap: 10, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#2d2d2d' },
  clearFilters: { color: '#999', fontSize: 12, textAlign: 'right', marginTop: 2 },
  tab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: '#333' },
  tabActive: { backgroundColor: '#e8631a', borderColor: '#e8631a' },
  tabText: { color: '#999', fontSize: 13 },
  tabTextActive: { color: '#fff', fontWeight: '700' },
  list: { flex: 1 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { color: '#eee', fontSize: 20, fontWeight: '700', marginBottom: 8 },
  emptyText: { color: '#999', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  card: { backgroundColor: '#2d2d2d', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#333', marginBottom: 12 },
  cardSelected: { borderColor: '#e8631a' },
  cardRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 10 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#e8631a', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  cardInfo: { flex: 1 },
  cardName: { color: '#eee', fontWeight: '700', fontSize: 15 },
  ownBadge: { color: '#e8631a', fontSize: 13 },
  cardLocation: { color: '#999', fontSize: 12, marginTop: 2 },
  tags: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tag: { borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 4 },
  tagText: { fontSize: 11 },
  detail: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#333', gap: 8 },
  detailBio: { color: '#aaa', fontSize: 13, lineHeight: 18 },
  detailInfo: { color: '#999', fontSize: 12 },
  requestButton: { backgroundColor: '#e8631a', borderRadius: 10, padding: 12, alignItems: 'center' },
  requestButtonText: { color: '#fff', fontWeight: '700', fontSize: 13, letterSpacing: 1 },
  editButton: { borderWidth: 1, borderColor: '#e8631a', borderRadius: 10, padding: 12, alignItems: 'center' },
  editButtonText: { color: '#e8631a', fontWeight: '700', fontSize: 13, letterSpacing: 1 },
  button: { backgroundColor: '#e8631a', borderRadius: 10, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 14, letterSpacing: 1 },
  sectionLabel: { color: '#999', fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 },
  dateFieldLabel: { color: '#999', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  dateInput: { backgroundColor: '#1a1a1a', borderRadius: 8, padding: 12, color: '#eee', fontSize: 13, borderWidth: 1, borderColor: '#444' },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  counterBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#333', alignItems: 'center', justifyContent: 'center' },
  counterBtnText: { color: '#eee', fontSize: 18, fontWeight: '700' },
  counterValue: { color: '#eee', fontSize: 20, fontWeight: '700', minWidth: 20, textAlign: 'center' },
  counterMax: { color: '#999', fontSize: 12 },
  textarea: { backgroundColor: '#1a1a1a', borderRadius: 8, padding: 12, color: '#eee', fontSize: 14, minHeight: 100, borderWidth: 1, borderColor: '#333', textAlignVertical: 'top' },
  infoBox: { borderRadius: 10, borderWidth: 1, padding: 12 },
  infoText: { fontSize: 13, lineHeight: 18 },
})
