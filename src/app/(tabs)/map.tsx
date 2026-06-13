import { useEffect, useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Platform } from 'react-native'
import { supabase } from '../../lib/supabase'
import { router } from 'expo-router'
import { C } from '../../lib/theme'
import { UserChip } from '../../components/UserChip'
import { SafetyBlock, getSafetyKey } from '../../components/SafetyBlock'

const pricingMeta: Record<string, { icon: string; label: string; color: string }> = {
  free:  { icon: '🤝', label: 'Free',        color: '#22c55e' },
  tip:   { icon: '🙏', label: 'Tip Welcome', color: '#f59e0b' },
  fixed: { icon: '💶', label: 'Paid',        color: '#3b82f6' },
}

// Deterministic ~500m offset from host ID so markers don't jump on refresh
function fuzzCoords(id: string, lat: number, lng: number): { lat: number; lng: number } {
  let h = 0
  for (let i = 0; i < id.length; i++) { h = Math.imul(h ^ id.charCodeAt(i), 0x9e3779b1) }
  const latOff = ((h & 0xfff) - 0x7ff) / 150000   // ±0.0054° ≈ ±500m
  const lngOff = (((h >> 12) & 0xfff) - 0x7ff) / 150000
  return { lat: lat + latOff, lng: lng + lngOff }
}

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
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const fileInputRef = useRef<any>(null)
  const [arrivalChip, setArrivalChip] = useState<'tonight' | 'tomorrow' | 'other'>('tonight')
  const [arrivalDate, setArrivalDate] = useState(() => new Date().toISOString().split('T')[0])
  const [departureDate, setDepartureDate] = useState(() => new Date(Date.now() + 86400000).toISOString().split('T')[0])
  const [arrivalTime, setArrivalTime] = useState(() => defaultArrivalTime())
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [showMap, setShowMap] = useState(true)
  const [HostMap, setHostMap] = useState<any>(null)
  const [mode, setMode] = useState<'road' | 'trail'>('road')
  const [filterMoto, setFilterMoto] = useState(false)
  const [filterBike, setFilterBike] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [filterFree, setFilterFree] = useState(false)
  const [satelliteMap, setSatelliteMap] = useState(false)

  const activeCount = (filterMoto ? 1 : 0) + (filterBike ? 1 : 0) + (filterOpen ? 1 : 0) + (filterFree ? 1 : 0)

  const filteredHosts = hosts.filter(h => {
    if (filterMoto) {
      const vt: string[] = h.vehicle_types?.length ? h.vehicle_types : ['moto']
      if (!vt.includes('moto')) return false
    }
    if (filterBike) {
      const vt: string[] = h.vehicle_types?.length ? h.vehicle_types : []
      if (!vt.includes('bicycle')) return false
    }
    if (filterOpen && !h.is_open) return false
    if (filterFree) {
      const hp: string[] = h.pricings?.length ? h.pricings : (h.pricing ? [h.pricing] : ['free'])
      if (!hp.includes('free')) return false
    }
    return true
  })

  // Count hosts with secure (non-street) parking for the subtitle
  const secureCount = hosts.filter(h => {
    const hp: string[] = h.parkings?.length ? h.parkings : (h.parking ? [h.parking] : [])
    return hp.map(getSafetyKey).some(k => k !== 'street')
  }).length

  useEffect(() => {
    fetchHosts()
    supabase.auth.getUser().then(({ data: { user } }) => setCurrentUser(user))
    if (Platform.OS === 'web') {
      import('../../components/HostMap').then(m => setHostMap(() => m.default))
    }
  }, [])

  useEffect(() => {
    if (requesting) {
      setArrivalChip('tonight')
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
      let uploadedPhotoUrl: string | null = null
      if (photoFile) {
        const ext = photoFile.name.split('.').pop() || 'jpg'
        const name = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
        const { error: upErr } = await supabase.storage.from('request-photos').upload(name, photoFile)
        if (!upErr) {
          uploadedPhotoUrl = supabase.storage.from('request-photos').getPublicUrl(name).data.publicUrl
        }
      }

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
          conversation_id: convId,
          photo_url: uploadedPhotoUrl,
        })
        .select('id')
        .single()
      if (reqErr || !reqData) { setSendError(reqErr?.message || 'Request error'); setSending(false); return }

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

  // --- Request form (Knock on the door) ---
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
            <SafetyBlock parkings={selectedParkings} />
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
            <Text style={styles.sectionLabel}>WHEN ARE YOU ARRIVING?</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              {([
                { chip: 'tonight' as const, label: '🌙 Tonight', offset: 0 },
                { chip: 'tomorrow' as const, label: '☀️ Tomorrow', offset: 1 },
                { chip: 'other' as const, label: '📅 Other day', offset: null },
              ] as const).map(({ chip, label, offset }) => {
                const active = arrivalChip === chip
                return (
                  <TouchableOpacity
                    key={chip}
                    style={[{ flex: 1, padding: 12, borderRadius: 100, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, alignItems: 'center' },
                      active && { borderColor: C.accent, backgroundColor: C.accentSoft }]}
                    onPress={() => {
                      setArrivalChip(chip)
                      if (offset !== null) {
                        const d = new Date(Date.now() + offset * 86400000).toISOString().split('T')[0]
                        setArrivalDate(d)
                        setDepartureDate(new Date(Date.now() + (offset + 1) * 86400000).toISOString().split('T')[0])
                      }
                    }}
                  >
                    <Text style={[{ color: C.textMuted, fontWeight: '700', fontSize: 13 }, active && { color: C.accent }]}>{label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>
            {arrivalChip === 'other' && (
              <View style={{ marginBottom: 10, gap: 4 }}>
                {Platform.OS === 'web' ? (
                  <input type="date" value={arrivalDate}
                    min={new Date().toISOString().split('T')[0]}
                    onChange={(e: any) => {
                      const d = e.target.value
                      setArrivalDate(d)
                      const dep = new Date(new Date(d).getTime() + 86400000).toISOString().split('T')[0]
                      setDepartureDate(dep)
                    }}
                    style={{ background: C.bg, border: `1px solid ${C.borderMid}`, borderRadius: 8, padding: '10px 12px', color: C.text, fontSize: 13, colorScheme: 'dark', outline: 'none', width: '100%', boxSizing: 'border-box' } as any}
                  />
                ) : (
                  <TextInput
                    style={styles.dateInput}
                    value={arrivalDate}
                    onChangeText={d => {
                      setArrivalDate(d)
                      const dep = new Date(new Date(d).getTime() + 86400000).toISOString().split('T')[0]
                      setDepartureDate(dep)
                    }}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="#777"
                  />
                )}
              </View>
            )}
            <View style={{ gap: 6 }}>
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
                style={[styles.photoBtn, photoFile ? styles.photoBtnFilled : null]}
                onPress={() => fileInputRef.current?.click()}
              >
                {photoFile ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text style={{ fontSize: 20 }}>✅</Text>
                    <Text style={{ color: C.success, fontWeight: '700', fontSize: 14 }}>Bike photo added</Text>
                    <TouchableOpacity onPress={() => { setPhotoFile(null); setPhotoPreview(null) }}>
                      <Text style={{ color: C.textDim, fontSize: 12 }}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.photoBtnText}>📷 Add bike photo</Text>
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

  function FilterChips({ floating = false }: { floating?: boolean }) {
    const chips = [
      { key: 'moto', emoji: '🏍', label: 'Moto',    active: filterMoto, onPress: () => setFilterMoto(v => !v) },
      { key: 'bike', emoji: '🚲', label: 'Bicycle',  active: filterBike, onPress: () => setFilterBike(v => !v) },
      { key: 'open', emoji: '🟢', label: 'Open',     active: filterOpen, onPress: () => setFilterOpen(v => !v) },
      { key: 'free', emoji: '🤝', label: 'Free',     active: filterFree, onPress: () => setFilterFree(v => !v) },
    ]
    return (
      <View style={floating ? styles.floatingFilterWrap : styles.filterWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterScrollContent}
        >
          {chips.map(chip => (
            <TouchableOpacity
              key={chip.key}
              style={[styles.fChip, chip.active && styles.fChipOn, floating && styles.fChipFloating]}
              onPress={chip.onPress}
            >
              <Text style={{ fontSize: 18, lineHeight: 22 }}>{chip.emoji}</Text>
              <Text style={[styles.fChipLabel, chip.active && styles.fChipLabelOn]}>{chip.label}</Text>
            </TouchableOpacity>
          ))}
          {activeCount > 0 && (
            <TouchableOpacity
              style={[styles.fChip, styles.fChipClear]}
              onPress={() => { setFilterMoto(false); setFilterBike(false); setFilterOpen(false); setFilterFree(false) }}
            >
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
            <Text style={styles.hostsTitle}>Find a host</Text>
            <Text style={styles.sub}>
              {loading ? 'Loading...' : `${secureCount} garages & yards near you`}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <View style={styles.tabPills}>
              <TouchableOpacity style={[styles.tabPill, showMap && styles.tabPillActive]} onPress={() => setShowMap(true)}>
                <Text style={[styles.tabPillText, showMap && styles.tabPillTextActive]}>Map</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.tabPill, !showMap && styles.tabPillActive]} onPress={() => setShowMap(false)}>
                <Text style={[styles.tabPillText, !showMap && styles.tabPillTextActive]}>List</Text>
              </TouchableOpacity>
            </View>
            {showMap && (
              <TouchableOpacity
                style={[styles.satelliteBtn, satelliteMap && styles.satelliteBtnActive]}
                onPress={() => setSatelliteMap(v => !v)}
              >
                <Text style={{ fontSize: 16 }}>🛰</Text>
              </TouchableOpacity>
            )}
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
            mode={mode}
            buddyIds={[]}
            satellite={satelliteMap}
          />
          {/* Filter chips overlay — top */}
          <View style={styles.mapFilterOverlay} pointerEvents="box-none">
            <FilterChips floating />
          </View>
          {/* FAB + */}
          <View style={styles.fabWrap} pointerEvents="box-none">
            <TouchableOpacity style={styles.fab} onPress={() => router.push('/become-host')}>
              <Text style={styles.fabText}>+</Text>
            </TouchableOpacity>
          </View>
          {/* Road / Trail toggle — bottom-left */}
          <View style={styles.modeToggleWrap} pointerEvents="box-none">
            <View style={styles.modeToggle}>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'road' && styles.modeBtnActive]}
                onPress={() => setMode('road')}
              >
                <Text style={[styles.modeBtnText, mode === 'road' && styles.modeBtnTextActive]}>🛣 Road</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modeBtn, mode === 'trail' && styles.modeBtnActive]}
                onPress={() => setMode('trail')}
              >
                <Text style={[styles.modeBtnText, mode === 'trail' && styles.modeBtnTextActive]}>⛰ Trail</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      ) : showMap && !HostMap ? (
        // Map not available on this platform — fall through to list
        <ScrollView style={styles.list} contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={[styles.infoBox, { borderColor: C.border, backgroundColor: C.surface }]}>
            <Text style={[styles.infoText, { color: C.textDim }]}>🗺 Map view is available on web. Showing list instead.</Text>
          </View>
          {renderList()}
        </ScrollView>
      ) : (
        <ScrollView style={styles.list} contentContainerStyle={{ padding: 16, gap: 12 }}>
          {renderList()}
        </ScrollView>
      )}
    </View>
  )

  function renderList() {
    if (filteredHosts.length === 0 && !loading) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🏍</Text>
          <Text style={styles.emptyTitle}>{activeCount > 0 ? 'Nothing found' : 'No hosts yet'}</Text>
          <Text style={styles.emptyText}>{activeCount > 0 ? 'Try changing or clearing filters.' : 'Be the first! Go to the Profile tab and open your doors to the community.'}</Text>
        </View>
      )
    }
    return (
      <>
        {filteredHosts.map((host) => {
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
                {hostPricings.includes('free') && (
                  <View style={[styles.pricePill, { borderColor: C.successBorder, backgroundColor: C.successSoft }]}>
                    <Text style={[styles.pricePillText, { color: C.success }]}>Free</Text>
                  </View>
                )}
              </View>
              <SafetyBlock parkings={hostParkings} />
              {selected?.id === host.id && (
                <View style={styles.detail}>
                  {host.notes ? <Text style={styles.detailBio}>{host.notes}</Text> : null}
                  <Text style={styles.detailInfo}>👥 Max. {host.max_guests} riders</Text>
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
        })}
      </>
    )
  }
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: C.bg },
  header:           { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface },
  headerRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerRight:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hostsTitle:       { color: C.text, fontSize: 26, fontWeight: '900', letterSpacing: 0.5, fontFamily: 'Oswald_700Bold' },
  sub:              { color: C.textDim, fontSize: 11, marginTop: 2 },
  tabPills:         { flexDirection: 'row', backgroundColor: C.elevated, borderRadius: 100, padding: 3, borderWidth: 1, borderColor: C.border },
  tabPill:          { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 100 },
  tabPillActive:    { backgroundColor: C.accent },
  tabPillText:      { color: C.textDim, fontSize: 12, fontWeight: '600' },
  tabPillTextActive:{ color: C.white, fontWeight: '700' },
  filterWrap:         { height: 66, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  floatingFilterWrap: { position: 'absolute', top: 12, left: 0, right: 0, zIndex: 10, height: 66 },
  filterScrollContent:{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, alignItems: 'center', height: 66 },
  fChip:            { alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 2, backgroundColor: C.elevated, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: C.border },
  fChipFloating:    { backgroundColor: C.surface, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.3, shadowRadius: 4, elevation: 6 },
  fChipOn:          { backgroundColor: C.accent, borderColor: C.accent },
  fChipLabel:       { color: C.textDim, fontSize: 13, fontWeight: '600' },
  fChipLabelOn:     { color: C.white },
  fChipClear:       { backgroundColor: 'transparent', borderColor: C.textDim },
  fChipClearText:   { color: C.textDim, fontSize: 13, fontWeight: '600' },
  mapFilterOverlay: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 },
  satelliteBtn:       { backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 6 },
  satelliteBtnActive: { backgroundColor: C.accent, borderColor: C.accent },
  fabWrap:          { position: 'absolute', bottom: 24, left: 0, right: 0, alignItems: 'center', zIndex: 10 },
  fab:              { width: 72, height: 72, borderRadius: 36, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.5, shadowRadius: 8, elevation: 10 },
  fabText:          { color: C.white, fontSize: 36, fontWeight: '700', lineHeight: 38, marginTop: -2 },
  modeToggleWrap:   { position: 'absolute', bottom: 24, left: 16, zIndex: 10 },
  modeToggle:       { flexDirection: 'row', backgroundColor: C.surface, borderRadius: 100, padding: 3, borderWidth: 1, borderColor: C.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.4, shadowRadius: 6, elevation: 8 },
  modeBtn:          { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 100 },
  modeBtnActive:    { backgroundColor: C.accent },
  modeBtnText:      { color: C.textDim, fontSize: 13, fontWeight: '600' },
  modeBtnTextActive:{ color: C.white, fontWeight: '700' },
  back:             { color: C.accent, fontSize: 16, marginBottom: 8 },
  headerTitle:      { color: C.text, fontSize: 18, fontWeight: '800', letterSpacing: 1, fontFamily: 'Oswald_700Bold' },
  list:             { flex: 1 },
  empty:            { alignItems: 'center', justifyContent: 'center', padding: 48 },
  emptyEmoji:       { fontSize: 64, marginBottom: 16 },
  emptyTitle:       { color: C.text, fontSize: 20, fontWeight: '800', marginBottom: 8, letterSpacing: 0.5 },
  emptyText:        { color: C.textDim, fontSize: 14, textAlign: 'center', lineHeight: 22 },
  card:             { backgroundColor: C.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: C.border, marginBottom: 12 },
  cardSelected:     { borderColor: C.accent },
  cardRow:          { flexDirection: 'row', gap: 12, alignItems: 'center' },
  avatar:           { width: 46, height: 46, borderRadius: 23, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.secondaryBorder },
  avatarText:       { color: C.white, fontWeight: '800', fontSize: 18 },
  cardInfo:         { flex: 1 },
  cardName:         { color: C.text, fontWeight: '700', fontSize: 15 },
  ownBadge:         { color: C.accent, fontSize: 13 },
  cardLocation:     { color: C.textDim, fontSize: 12, marginTop: 3 },
  pricePill:        { borderRadius: 100, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 4 },
  pricePillText:    { fontSize: 11, fontWeight: '600' },
  detail:           { marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: C.border, gap: 10 },
  detailBio:        { color: C.textMuted, fontSize: 13, lineHeight: 20 },
  detailInfo:       { color: C.textDim, fontSize: 12 },
  requestButton:    { backgroundColor: C.accent, borderRadius: 100, padding: 14, alignItems: 'center' },
  requestButtonText:{ color: C.white, fontWeight: '800', fontSize: 13, letterSpacing: 1 },
  editButton:       { borderWidth: 1, borderColor: C.accent, borderRadius: 100, padding: 14, alignItems: 'center' },
  editButtonText:   { color: C.accent, fontWeight: '700', fontSize: 13, letterSpacing: 1 },
  button:           { backgroundColor: C.accent, borderRadius: 100, padding: 16, alignItems: 'center' },
  buttonText:       { color: C.white, fontWeight: '800', fontSize: 14, letterSpacing: 1 },
  sectionLabel:     { color: C.textMuted, fontSize: 11, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10, fontWeight: '700' },
  dateFieldLabel:   { color: C.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5 },
  dateInput:        { backgroundColor: C.elevated, borderRadius: 10, padding: 12, color: C.text, fontSize: 13, borderWidth: 1, borderColor: C.border },
  counter:          { flexDirection: 'row', alignItems: 'center', gap: 16 },
  counterBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  counterBtnText:   { color: C.text, fontSize: 20, fontWeight: '700' },
  counterValue:     { color: C.text, fontSize: 22, fontWeight: '800', minWidth: 24, textAlign: 'center' },
  counterMax:       { color: C.textDim, fontSize: 12 },
  textarea:         { backgroundColor: C.elevated, borderRadius: 12, padding: 14, color: C.text, fontSize: 14, minHeight: 100, borderWidth: 1, borderColor: C.border, textAlignVertical: 'top', lineHeight: 22 },
  infoBox:          { borderRadius: 12, borderWidth: 1, padding: 14 },
  infoText:         { fontSize: 13, lineHeight: 19 },
  photoBtn:         { borderWidth: 1, borderColor: C.border, borderRadius: 12, borderStyle: 'dashed', padding: 24, alignItems: 'center', justifyContent: 'center' },
  photoBtnFilled:   { borderStyle: 'solid', borderColor: C.accent },
  photoBtnText:     { color: C.textMuted, fontSize: 13, fontWeight: '600' },
})
