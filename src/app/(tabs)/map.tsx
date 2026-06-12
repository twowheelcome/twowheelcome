import { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Alert, Platform } from 'react-native'
import { supabase } from '../../lib/supabase'
import { router } from 'expo-router'
import { C } from '../../lib/theme'
import { UserChip } from '../../components/UserChip'

const parkingMeta: Record<string, { icon: string; label: string; color: string }> = {
  garage_locked: { icon: '🔒', label: 'Locked Garage', color: C.success },
  carport: { icon: '🔐', label: 'Covered Carport', color: C.info },
  yard: { icon: '🛡', label: 'Fenced Yard', color: C.accent },
  street: { icon: '🛣', label: 'Street Parking', color: '#94a3b8' },
}

const pricingMeta: Record<string, { icon: string; label: string; color: string }> = {
  free: { icon: '🤝', label: 'Free', color: '#22c55e' },
  tip: { icon: '🙏', label: 'Tip Welcome', color: '#f59e0b' },
  fixed: { icon: '💶', label: 'Paid', color: '#3b82f6' },
}

const FILTER_VEHICLES = [
  { value: 'moto', icon: '🏍', label: 'Moto' },
  { value: 'bicycle', icon: '🚴', label: 'Bicycle' },
]
const FILTER_PARKING = [
  { value: 'garage_locked', icon: '🔒', label: 'Garage' },
  { value: 'carport', icon: '🔐', label: 'Carport' },
  { value: 'yard', icon: '🛡', label: 'Yard' },
  { value: 'street', icon: '🛣', label: 'Street' },
]
const FILTER_SLEEP = [
  { value: 'tent', icon: '⛺', label: 'Tent' },
  { value: 'roof', icon: '🏠', label: 'Roof' },
  { value: 'room', icon: '🛏', label: 'Room' },
]
const FILTER_PRICING = [
  { value: 'free', icon: '🤝', label: 'Free' },
  { value: 'tip', icon: '🙏', label: 'Tip' },
  { value: 'fixed', icon: '💶', label: 'Paid' },
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

const FILTER_GROUPS = [
  { key: 'vehicles', items: FILTER_VEHICLES },
  { key: 'parking',  items: FILTER_PARKING },
  { key: 'sleep',    items: FILTER_SLEEP },
  { key: 'pricing',  items: FILTER_PRICING },
]

function defaultArrivalTime() {
  const d = new Date(Date.now() + 3600000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function MapScreen() {
  const [hosts, setHosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)
  const [requesting, setRequesting] = useState(false)
  const [message, setMessage] = useState('')
  const [guests, setGuests] = useState(1)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [sendSuccess, setSendSuccess] = useState(false)
  const [guestVehicle, setGuestVehicle] = useState('')
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const fileInputRef = useRef<any>(null)
  const [arrivalDate, setArrivalDate] = useState(() => new Date().toISOString().split('T')[0])
  const [departureDate, setDepartureDate] = useState(() => new Date(Date.now() + 86400000).toISOString().split('T')[0])
  const [arrivalTime, setArrivalTime] = useState(() => defaultArrivalTime())
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [showMap, setShowMap] = useState(Platform.OS === 'web')
  const [HostMap, setHostMap] = useState<any>(null)
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
      setArrivalTime(defaultArrivalTime())
      setPhotoFile(null)
      setPhotoPreview(null)
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
      setSendError('Write the host a message. At least a few words. 😄')
      return
    }
    setSendError('')
    setSending(true)
    try {
      // 1. Upload photo
      let uploadedPhotoUrl: string | null = null
      if (photoFile) {
        const ext = photoFile.name.split('.').pop() || 'jpg'
        const name = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: upErr } = await supabase.storage.from('request-photos').upload(name, photoFile)
        if (!upErr) {
          uploadedPhotoUrl = supabase.storage.from('request-photos').getPublicUrl(name).data.publicUrl
        }
      }

      // 2. Find or create conversation (user_a = lexicographically smaller ID)
      const [ua, ub] = [currentUser.id, selected.user_id].sort()
      let convId: string
      const { data: existing } = await supabase
        .from('conversations')
        .select('id')
        .eq('user_a', ua)
        .eq('user_b', ub)
        .maybeSingle()

      if (existing) {
        convId = existing.id
        await supabase.from('conversations').update({ last_message_at: new Date().toISOString() }).eq('id', convId)
      } else {
        const { data: newConv, error: convErr } = await supabase
          .from('conversations')
          .insert({ user_a: ua, user_b: ub })
          .select('id')
          .single()
        if (convErr || !newConv) { setSendError(convErr?.message || 'Conversation error'); setSending(false); return }
        convId = newConv.id
      }

      // 3. Insert stay_request
      const { data: reqData, error: reqErr } = await supabase
        .from('stay_requests')
        .insert({
          guest_id: currentUser.id,
          host_id: selected.user_id,
          status: 'PENDING',
          guests_count: guests,
          message: message.trim(),
          arrival_date: arrivalDate,
          departure_date: departureDate,
          arrival_time: arrivalTime.trim() || null,
          guest_vehicle: guestVehicle || null,
          conversation_id: convId,
          photo_url: uploadedPhotoUrl,
        })
        .select('id')
        .single()
      if (reqErr || !reqData) { setSendError(reqErr?.message || 'Request error'); setSending(false); return }

      // 4. Insert message linked to request
      await supabase.from('messages').insert({
        conversation_id: convId,
        sender_id: currentUser.id,
        body: message.trim(),
        request_id: reqData.id,
      })

      supabase.functions.invoke('notify-request', {
        body: { request_id: reqData.id, event: 'new_request' },
      }).catch(() => {})

      setSendSuccess(true)
      setTimeout(() => {
        setSendSuccess(false)
        setRequesting(false)
        setMessage('')
        setSelected(null)
        router.push({ pathname: '/(tabs)/requests', params: { openConv: convId } })
      }, 1500)
    } catch (e: any) {
      setSendError(e?.message || 'Unexpected error')
    } finally {
      setSending(false)
    }
  }

  // --- Request form ---
  if (requesting && selected) {
    const selectedParkings: string[] = selected.parkings?.length ? selected.parkings : (selected.parking ? [selected.parking] : [])
    const selectedPricings: string[] = selected.pricings?.length ? selected.pricings : (selected.pricing ? [selected.pricing] : ['free'])
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => setRequesting(false)}>
            <Text style={styles.back}>← Back</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>KNOCKING ON THE DOOR 🤞</Text>
        </View>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{selected.profiles?.full_name?.charAt(0) || '?'}</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{selected.profiles?.full_name || 'Anonymous Rider'}</Text>
                <Text style={styles.cardLocation}>📍 {selected.location_city}, {selected.location_country}</Text>
              </View>
            </View>
            <View style={styles.tags}>
              {selectedParkings.map(pv => {
                const pm = parkingMeta[pv] || parkingMeta.street
                return (
                  <View key={pv} style={[styles.tag, { borderColor: pm.color + '50', backgroundColor: pm.color + '15' }]}>
                    <Text style={[styles.tagText, { color: pm.color }]}>{pm.label}</Text>
                  </View>
                )
              })}
              {selectedPricings.map(pv => {
                const pr = pricingMeta[pv] || pricingMeta.free
                return (
                  <View key={pv} style={[styles.tag, { borderColor: pr.color + '50', backgroundColor: pr.color + '15' }]}>
                    <Text style={[styles.tagText, { color: pr.color }]}>{pr.label}</Text>
                  </View>
                )
              })}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>NUMBER OF RIDERS</Text>
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
            <Text style={styles.sectionLabel}>YOUR VEHICLE</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {[{ value: 'moto', icon: '🏍', label: 'Moto' }, { value: 'bicycle', icon: '🚴', label: 'Kolo' }].map(v => (
                <TouchableOpacity
                  key={v.value}
                  style={[{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg },
                    guestVehicle === v.value && { borderColor: C.accent, backgroundColor: C.accentSoft }]}
                  onPress={() => setGuestVehicle(guestVehicle === v.value ? '' : v.value)}
                >
                  <Text style={{ fontSize: 22 }}>{v.icon}</Text>
                  <Text style={[{ color: C.textMuted, fontWeight: '700', fontSize: 15 }, guestVehicle === v.value && { color: C.accent }]}>{v.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>WHEN ARE YOU ARRIVING?</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.dateFieldLabel}>ARRIVAL</Text>
                {Platform.OS === 'web' ? (
                  <input type="date" value={arrivalDate}
                    onChange={(e: any) => setArrivalDate(e.target.value)}
                    style={{ background: C.bg, border: `1px solid ${C.borderMid}`, borderRadius: 8, padding: '10px 12px', color: C.text, fontSize: 13, colorScheme: 'dark', outline: 'none', width: '100%', boxSizing: 'border-box' } as any} />
                ) : (
                  <TextInput style={styles.dateInput} value={arrivalDate} onChangeText={setArrivalDate} placeholderTextColor={C.textDim} />
                )}
              </View>
              <View style={{ flex: 1, gap: 6 }}>
                <Text style={styles.dateFieldLabel}>DEPARTURE</Text>
                {Platform.OS === 'web' ? (
                  <input type="date" value={departureDate}
                    onChange={(e: any) => setDepartureDate(e.target.value)}
                    style={{ background: C.bg, border: `1px solid ${C.borderMid}`, borderRadius: 8, padding: '10px 12px', color: C.text, fontSize: 13, colorScheme: 'dark', outline: 'none', width: '100%', boxSizing: 'border-box' } as any} />
                ) : (
                  <TextInput style={styles.dateInput} value={departureDate} onChangeText={setDepartureDate} placeholderTextColor={C.textDim} />
                )}
              </View>
            </View>
            <View style={{ gap: 6, marginTop: 4 }}>
              <Text style={styles.dateFieldLabel}>EST. ARRIVAL TIME</Text>
              {Platform.OS === 'web' ? (
                <input type="time" value={arrivalTime}
                  onChange={(e: any) => setArrivalTime(e.target.value)}
                  style={{ background: C.bg, border: `1px solid ${C.borderMid}`, borderRadius: 8, padding: '10px 12px', color: arrivalTime ? C.text : C.textFaint, fontSize: 13, colorScheme: 'dark', outline: 'none', width: '100%', boxSizing: 'border-box' } as any} />
              ) : (
                <TextInput style={styles.dateInput} value={arrivalTime} onChangeText={setArrivalTime} placeholder="e.g. 17:00" placeholderTextColor="#777" />
              )}
            </View>
          </View>

          {Platform.OS === 'web' && (
            <View style={styles.card}>
              <Text style={styles.sectionLabel}>PHOTO OF YOUR BIKE (optional)</Text>
              {/* hidden file input */}
              {(Platform.OS as string) === 'web' && (
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e: any) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    setPhotoFile(file)
                    setPhotoPreview(URL.createObjectURL(file))
                  }}
                />
              )}
              <TouchableOpacity
                style={[styles.photoBtn, photoPreview ? styles.photoBtnFilled : null]}
                onPress={() => fileInputRef.current?.click()}
              >
                {photoPreview ? (
                  <View style={{ alignItems: 'center', gap: 8 }}>
                    <img src={photoPreview} style={{ width: 200, height: 140, objectFit: 'cover', borderRadius: 10 } as any} alt="preview" />
                    <Text style={{ color: C.accent, fontSize: 12, fontWeight: '600' }}>Change photo</Text>
                  </View>
                ) : (
                  <Text style={styles.photoBtnText}>📷 Add bike / bicycle photo</Text>
                )}
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>MESSAGE TO HOST</Text>
            <TextInput
              style={styles.textarea}
              placeholder="Hey, I'm riding through your town, got space?..."
              placeholderTextColor={C.placeholder}
              value={message}
              onChangeText={setMessage}
              multiline
              numberOfLines={4}
            />
          </View>

          {selectedPricings.includes('tip') && (
            <View style={[styles.infoBox, { borderColor: C.warningBorder, backgroundColor: C.warningSoft }]}>
              <Text style={[styles.infoText, { color: C.warning }]}>🙏 A tip is optional, but a beer or a campfire story is always welcome. 🍺</Text>
            </View>
          )}
          {selectedPricings.includes('fixed') && (
            <View style={[styles.infoBox, { borderColor: C.infoBorder, backgroundColor: C.infoSoft }]}>
              <Text style={[styles.infoText, { color: C.info }]}>💶 Arrange directly with the host — no commission.</Text>
            </View>
          )}

          {sendSuccess ? (
            <View style={[styles.infoBox, { borderColor: C.successBorder, backgroundColor: C.successSoft }]}>
              <Text style={[styles.infoText, { color: C.success, fontSize: 15, fontWeight: '700' }]}>🤞 Request sent! Now ride and hope they're home.</Text>
            </View>
          ) : null}
          {sendError ? (
            <View style={[styles.infoBox, { borderColor: C.errorBorder, backgroundColor: C.errorSoft }]}>
              <Text style={[styles.infoText, { color: C.error }]}>⚠️ {sendError}</Text>
            </View>
          ) : null}
          <TouchableOpacity style={styles.button} onPress={sendRequest} disabled={sending || sendSuccess}>
            <Text style={styles.buttonText}>{sending ? 'SENDING... 🤞' : 'SEND REQUEST →'}</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    )
  }

  function isChipActive(key: string, value: string): boolean {
    if (key === 'vehicles') return filterVehicles.includes(value)
    if (key === 'parking') return filterParking.includes(value)
    if (key === 'sleep') return filterSleep.includes(value)
    return filterPricing.includes(value)
  }

  function toggleChip(key: string, value: string) {
    if (key === 'vehicles') setFilterVehicles(toggleFilter(filterVehicles, value))
    else if (key === 'parking') setFilterParking(toggleFilter(filterParking, value))
    else if (key === 'sleep') setFilterSleep(toggleFilter(filterSleep, value))
    else setFilterPricing(toggleFilter(filterPricing, value))
  }

  function clearAllFilters() {
    setFilterVehicles([]); setFilterParking([]); setFilterSleep([]); setFilterPricing([])
  }

  function FilterChips({ floating = false }: { floating?: boolean }) {
    const wrapStyle = floating ? styles.floatingFilterWrap : styles.filterWrap
    return (
      <View style={wrapStyle}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {FILTER_GROUPS.map(group =>
            group.items.map(item => {
              const on = isChipActive(group.key, item.value)
              return (
                <TouchableOpacity
                  key={`${group.key}-${item.value}`}
                  style={[styles.fChip, on && styles.fChipOn, floating && styles.fChipFloating]}
                  onPress={() => toggleChip(group.key, item.value)}
                >
                  <Text style={[styles.fChipLabel, on && styles.fChipLabelOn]}>{item.label}</Text>
                </TouchableOpacity>
              )
            })
          )}
          {activeCount > 0 && (
            <TouchableOpacity style={[styles.fChip, styles.fChipClear]} onPress={clearAllFilters}>
              <Text style={styles.fChipClearText}>✕ Reset</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    )
  }

  // --- Main screen ---
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.hostsTitle}>Hosts</Text>
            <Text style={styles.sub}>
              {loading ? 'Loading...' : `${filteredHosts.length} hosts on the road`}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.tabPills}>
              <TouchableOpacity style={[styles.tabPill, !showMap && styles.tabPillActive]} onPress={() => setShowMap(false)}>
                <Text style={[styles.tabPillText, !showMap && styles.tabPillTextActive]}>List</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabPill, showMap && styles.tabPillActive]}
                onPress={() => setShowMap(true)}
                disabled={Platform.OS !== 'web'}
              >
                <Text style={[styles.tabPillText, showMap && styles.tabPillTextActive]}>
                  Map{Platform.OS !== 'web' ? ' (web)' : ''}
                </Text>
              </TouchableOpacity>
            </View>
            <UserChip />
          </View>
        </View>
      </View>

      {!showMap && <FilterChips />}

      {showMap && HostMap ? (
        <View style={{ flex: 1 }}>
          <HostMap
            hosts={filteredHosts}
            onHostSelect={(host: any) => { setSelected(host); setRequesting(true) }}
          />
          <View style={styles.mapFilterOverlay} pointerEvents="box-none">
            <FilterChips floating />
          </View>
        </View>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={{ padding: 16, gap: 12 }}>
          {filteredHosts.length === 0 && !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🏍</Text>
              <Text style={styles.emptyTitle}>{activeCount > 0 ? 'Nothing found' : 'No hosts yet'}</Text>
              <Text style={styles.emptyText}>{activeCount > 0 ? 'Try changing or clearing filters.' : 'Be the first! Go to the Profile tab and open your doors to the community.'}</Text>
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
                        {host.profiles?.full_name || 'Anonymous Rider'}
                        {isOwn && <Text style={styles.ownBadge}> (you)</Text>}
                      </Text>
                      <Text style={styles.cardLocation}>📍 {host.location_city}, {host.location_country}</Text>
                    </View>
                  </View>
                  <View style={styles.tags}>
                    {hostParkings.map(pv => {
                      const pm = parkingMeta[pv] || parkingMeta.street
                      return (
                        <View key={pv} style={[styles.tag, { borderColor: pm.color + '50', backgroundColor: pm.color + '15' }]}>
                          <Text style={[styles.tagText, { color: pm.color }]}>{pm.label}</Text>
                        </View>
                      )
                    })}
                    {hostPricings.map(pv => {
                      const pr = pricingMeta[pv] || pricingMeta.free
                      return (
                        <View key={pv} style={[styles.tag, { borderColor: pr.color + '50', backgroundColor: pr.color + '15' }]}>
                          <Text style={[styles.tagText, { color: pr.color }]}>{pr.label}</Text>
                        </View>
                      )
                    })}
                  </View>
                  {selected?.id === host.id && (
                    <View style={styles.detail}>
                      {host.notes ? <Text style={styles.detailBio}>{host.notes}</Text> : null}
                      <Text style={styles.detailInfo}>👥 Max. {host.max_guests} riders</Text>
                      {host.vehicle_types?.length > 0 && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                          {(host.vehicle_types as string[]).map(v => {
                            const meta = FILTER_VEHICLES.find(f => f.value === v)
                            if (!meta) return null
                            return (
                              <View key={v} style={[styles.tag, { borderColor: C.accentBorder, backgroundColor: C.accentSoft }]}>
                                <Text style={[styles.tagText, { color: C.accent }]}>{meta.icon} {meta.label}</Text>
                              </View>
                            )
                          })}
                        </View>
                      )}
                      {!isOwn ? (
                        <TouchableOpacity style={styles.requestButton} onPress={() => setRequesting(true)}>
                          <Text style={styles.requestButtonText}>KNOCK ON THE DOOR →</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity style={styles.editButton} onPress={() => router.push('/become-host')}>
                          <Text style={styles.editButtonText}>EDIT LISTING</Text>
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
  container: { flex: 1, backgroundColor: C.bg },
  header: { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hostsTitle: { color: C.text, fontSize: 26, fontWeight: '900', letterSpacing: 0.5 },
  sub: { color: C.textDim, fontSize: 11, marginTop: 2 },
  tabPills: { flexDirection: 'row', backgroundColor: C.elevated, borderRadius: 100, padding: 3, borderWidth: 1, borderColor: C.border },
  tabPill: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 100 },
  tabPillActive: { backgroundColor: C.accent },
  tabPillText: { color: C.textDim, fontSize: 12, fontWeight: '600' },
  tabPillTextActive: { color: C.white, fontWeight: '700' },
  filterWrap: { height: 50, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  floatingFilterWrap: { position: 'absolute', top: 12, left: 0, right: 0, zIndex: 10, height: 50 },
  filterScrollContent: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, alignItems: 'center', height: 50 },
  fChip: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.elevated, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 6, borderWidth: 1, borderColor: C.border },
  fChipFloating: { backgroundColor: C.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 6 },
  fChipOn: { backgroundColor: C.accent, borderColor: C.accent },
  fChipLabel: { color: C.textDim, fontSize: 13, fontWeight: '600' },
  fChipLabelOn: { color: C.white },
  fChipClear: { backgroundColor: 'transparent', borderColor: C.textDim },
  fChipClearText: { color: C.textDim, fontSize: 13, fontWeight: '600' },
  mapFilterOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  back: { color: C.accent, fontSize: 16, marginBottom: 8 },
  headerTitle: { color: C.text, fontSize: 18, fontWeight: '800', letterSpacing: 1 },
  list: { flex: 1 },
  empty: { alignItems: 'center', justifyContent: 'center', padding: 48 },
  emptyEmoji: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { color: C.text, fontSize: 20, fontWeight: '800', marginBottom: 8, letterSpacing: 0.5 },
  emptyText: { color: C.textDim, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  card: { backgroundColor: C.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  cardSelected: { borderColor: C.accent },
  cardRow: { flexDirection: 'row', gap: 12, alignItems: 'center', marginBottom: 10 },
  avatar: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.secondaryBorder },
  avatarText: { color: C.white, fontWeight: '800', fontSize: 18 },
  cardInfo: { flex: 1 },
  cardName: { color: C.text, fontWeight: '700', fontSize: 15 },
  ownBadge: { color: C.accent, fontSize: 13 },
  cardLocation: { color: C.textDim, fontSize: 12, marginTop: 3 },
  tags: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  tag: { borderRadius: 100, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 },
  tagText: { fontSize: 11, fontWeight: '600' },
  detail: { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border, gap: 10 },
  detailBio: { color: C.textMuted, fontSize: 13, lineHeight: 20 },
  detailInfo: { color: C.textDim, fontSize: 12 },
  requestButton: { backgroundColor: C.accent, borderRadius: 100, padding: 14, alignItems: 'center' },
  requestButtonText: { color: C.white, fontWeight: '800', fontSize: 13, letterSpacing: 1 },
  editButton: { borderWidth: 1, borderColor: C.accent, borderRadius: 100, padding: 14, alignItems: 'center' },
  editButtonText: { color: C.accent, fontWeight: '700', fontSize: 13, letterSpacing: 1 },
  button: { backgroundColor: C.accent, borderRadius: 100, padding: 16, alignItems: 'center' },
  buttonText: { color: C.white, fontWeight: '800', fontSize: 14, letterSpacing: 1 },
  sectionLabel: { color: C.textMuted, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10, fontWeight: '700' },
  dateFieldLabel: { color: C.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  dateInput: { backgroundColor: C.elevated, borderRadius: 10, padding: 12, color: C.text, fontSize: 13, borderWidth: 1, borderColor: C.border },
  counter: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  counterBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  counterBtnText: { color: C.text, fontSize: 20, fontWeight: '700' },
  counterValue: { color: C.text, fontSize: 22, fontWeight: '800', minWidth: 24, textAlign: 'center' },
  counterMax: { color: C.textDim, fontSize: 12 },
  textarea: { backgroundColor: C.elevated, borderRadius: 12, padding: 14, color: C.text, fontSize: 14, minHeight: 100, borderWidth: 1, borderColor: C.border, textAlignVertical: 'top', lineHeight: 22 },
  infoBox: { borderRadius: 12, borderWidth: 1, padding: 14 },
  infoText: { fontSize: 13, lineHeight: 19 },
  photoBtn: {
    borderWidth: 1, borderColor: C.border, borderRadius: 12,
    borderStyle: 'dashed', padding: 24, alignItems: 'center', justifyContent: 'center',
  },
  photoBtnFilled: { borderStyle: 'solid', borderColor: C.accent },
  photoBtnText: { color: C.textMuted, fontSize: 13, fontWeight: '600' },
})
