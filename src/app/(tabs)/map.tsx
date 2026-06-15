import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Platform, Modal } from 'react-native'
import { supabase } from '../../lib/supabase'
import { router } from 'expo-router'
import { useTheme, type ThemeColors } from '../../lib/ThemeContext'
import { UserChip } from '../../components/UserChip'
import { SafetyBlock, getSafetyKey } from '../../components/SafetyBlock'


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
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])
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
  const [showFilters, setShowFilters] = useState(false)
  const [filterParkings, setFilterParkings] = useState<string[]>([])
  const [filterSleep, setFilterSleep] = useState<string[]>([])
  const [filterAmenities, setFilterAmenities] = useState<string[]>([])
  const [filterMinGuests, setFilterMinGuests] = useState(0)
  const [filterPricings, setFilterPricings] = useState<string[]>([])
  const [satelliteMap, setSatelliteMap] = useState(false)

  const activeCount = filterParkings.length + filterSleep.length + filterAmenities.length + (filterMinGuests > 0 ? 1 : 0) + filterPricings.length

  function toggleFilter<T>(arr: T[], val: T): T[] {
    return arr.includes(val) ? arr.filter(v => v !== val) : [...arr, val]
  }

  function resetFilters() {
    setFilterParkings([]); setFilterSleep([]); setFilterAmenities([])
    setFilterMinGuests(0); setFilterPricings([])
  }

  const filteredHosts = hosts.filter(h => {
    if (filterParkings.length) {
      const hp: string[] = h.parkings?.length ? h.parkings : (h.parking ? [h.parking] : [])
      const hpKeys = hp.map(getSafetyKey)
      const filterKeys = filterParkings.map(getSafetyKey)
      if (!filterKeys.some(k => hpKeys.includes(k))) return false
    }
    if (filterSleep.length) {
      const st: string[] = h.sleep_types || []
      if (!filterSleep.some(s => st.includes(s))) return false
    }
    if (filterAmenities.length) {
      const am: string[] = h.amenities || []
      if (!filterAmenities.every(a => am.includes(a))) return false
    }
    if (filterMinGuests > 0 && (h.max_guests || 0) < filterMinGuests) return false
    if (filterPricings.length) {
      const hp: string[] = h.pricings?.length ? h.pricings : (h.pricing ? [h.pricing] : ['free'])
      if (!filterPricings.some(p => hp.includes(p))) return false
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
    const [{ data: profilesData }, { data: reviewsData }, { data: lastReviewsData }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, avatar_url, bio').in('id', userIds),
      supabase.from('reviews').select('reviewee_id, rating').in('reviewee_id', userIds),
      supabase.from('reviews')
        .select('reviewee_id, rating, body, reviewer:profiles!reviewer_id(full_name)')
        .in('reviewee_id', userIds)
        .order('created_at', { ascending: false }),
    ])

    const profileMap: Record<string, any> = {}
    profilesData?.forEach(p => { profileMap[p.id] = p })

    const ratingMap: Record<string, { sum: number; count: number }> = {}
    reviewsData?.forEach((r: any) => {
      if (!ratingMap[r.reviewee_id]) ratingMap[r.reviewee_id] = { sum: 0, count: 0 }
      ratingMap[r.reviewee_id].sum += r.rating
      ratingMap[r.reviewee_id].count += 1
    })

    const lastReviewMap: Record<string, { rating: number; body: string | null; reviewer_name: string | null }> = {}
    lastReviewsData?.forEach((r: any) => {
      if (!lastReviewMap[r.reviewee_id]) {
        lastReviewMap[r.reviewee_id] = { rating: r.rating, body: r.body, reviewer_name: r.reviewer?.full_name ?? null }
      }
    })

    setHosts(data.map((h: any) => {
      const fuzzed = fuzzCoords(h.id, h.location_lat, h.location_lng)
      const rev = ratingMap[h.user_id]
      return {
        ...h,
        profiles: profileMap[h.user_id] || null,
        location_lat: fuzzed.lat,
        location_lng: fuzzed.lng,
        avg_rating: rev ? rev.sum / rev.count : null,
        review_count: rev ? rev.count : 0,
        last_review: lastReviewMap[h.user_id] ?? null,
      }
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
          <Text style={styles.headerTitle}>Request a stay</Text>
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
                    <Text style={{ color: C.success, fontWeight: '700', fontSize: 14 }}>Photo added</Text>
                    <TouchableOpacity onPress={() => { setPhotoFile(null); setPhotoPreview(null) }}>
                      <Text style={{ color: C.textDim, fontSize: 12 }}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <Text style={styles.photoBtnText}>📷 Add photo</Text>
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
              <Text style={[styles.infoText, { color: C.success, fontSize: 15, fontWeight: '700' }]}>Request sent. Waiting for a reply.</Text>
            </View>
          ) : null}
          {sendError ? (
            <View style={[styles.infoBox, { borderColor: C.errorBorder, backgroundColor: C.errorSoft }]}>
              <Text style={[styles.infoText, { color: C.error }]}>⚠️ {sendError}</Text>
            </View>
          ) : null}
          <TouchableOpacity style={styles.button} onPress={sendRequest} disabled={sending || sendSuccess}>
            <Text style={styles.buttonText}>{sending ? 'Sending...' : 'Send request'}</Text>
          </TouchableOpacity>
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
            <Text style={styles.hostsTitle}><Text style={styles.hostsTitleAccent}>TWO</Text>WHEEL<Text style={styles.hostsTitleAccent}>COME</Text></Text>
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
            <UserChip />
          </View>
        </View>
      </View>

      <View style={styles.filterBar}>
        <TouchableOpacity style={[styles.filterBtn, activeCount > 0 && styles.filterBtnActive]} onPress={() => setShowFilters(true)}>
          <Text style={[styles.filterBtnText, activeCount > 0 && styles.filterBtnTextActive]}>
            🔽 Filters{activeCount > 0 ? ` (${activeCount})` : ''}
          </Text>
        </TouchableOpacity>
        {activeCount > 0 && (
          <TouchableOpacity style={styles.resetBtn} onPress={resetFilters}>
            <Text style={styles.resetBtnText}>✕ Reset</Text>
          </TouchableOpacity>
        )}
      </View>

      <Modal visible={showFilters} animationType="slide" transparent onRequestClose={() => setShowFilters(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filters</Text>
              <TouchableOpacity onPress={resetFilters}><Text style={styles.modalReset}>Reset all</Text></TouchableOpacity>
              <TouchableOpacity style={styles.modalClose} onPress={() => setShowFilters(false)}>
                <Text style={styles.modalCloseText}>Done</Text>
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalBody}>

              {/* BIKE SAFETY */}
              <Text style={styles.filterSection}>Bike safety</Text>
              {([
                { value: 'garage_locked', icon: '🔒', label: 'Locked garage',   desc: 'Best overnight protection' },
                { value: 'carport',       icon: '🏠', label: 'Covered parking', desc: 'Off-street and under cover' },
                { value: 'yard',          icon: '🚧', label: 'Fenced yard',     desc: 'Behind a gate or fence' },
                { value: 'street',        icon: '🛣️', label: 'Street parking',  desc: 'Public parking nearby' },
              ] as const).map(o => {
                const on = filterParkings.includes(o.value)
                return (
                  <TouchableOpacity key={o.value} style={[styles.optRow, on && styles.optRowOn]} onPress={() => setFilterParkings(p => toggleFilter(p, o.value))}>
                    <Text style={styles.optRowIcon}>{o.icon}</Text>
                    <View style={{ flex: 1 }}><Text style={[styles.optRowLabel, on && styles.optRowLabelOn]}>{o.label}</Text><Text style={styles.optRowDesc}>{o.desc}</Text></View>
                    {on && <Text style={styles.optRowCheck}>✓</Text>}
                  </TouchableOpacity>
                )
              })}

              {/* SLEEP */}
              <Text style={styles.filterSection}>Where to sleep</Text>
              {([
                { value: 'tent', icon: '⛺', label: 'Tent', desc: 'Bring your own — space available' },
                { value: 'roof', icon: '🏠', label: 'Roof Over Head', desc: 'Couch, mat, anything dry' },
                { value: 'room', icon: '🛏', label: 'Private Room', desc: 'Bed, privacy, proper sleep' },
              ] as const).map(o => {
                const on = filterSleep.includes(o.value)
                return (
                  <TouchableOpacity key={o.value} style={[styles.optRow, on && styles.optRowOn]} onPress={() => setFilterSleep(p => toggleFilter(p, o.value))}>
                    <Text style={styles.optRowIcon}>{o.icon}</Text>
                    <View style={{ flex: 1 }}><Text style={[styles.optRowLabel, on && styles.optRowLabelOn]}>{o.label}</Text><Text style={styles.optRowDesc}>{o.desc}</Text></View>
                    {on && <Text style={styles.optRowCheck}>✓</Text>}
                  </TouchableOpacity>
                )
              })}

              {/* AMENITIES */}
              <Text style={styles.filterSection}>Amenities</Text>
              <View style={styles.chipsWrap}>
                {([
                  { value: 'shower', icon: '🚿', label: 'Shower' },
                  { value: 'toilet', icon: '🚽', label: 'Toilet' },
                  { value: 'kitchen', icon: '🍳', label: 'Kitchen' },
                  { value: 'laundry', icon: '👕', label: 'Laundry' },
                  { value: 'electricity', icon: '⚡', label: 'Electricity' },
                  { value: 'wifi', icon: '📶', label: 'WiFi' },
                  { value: 'pub_nearby', icon: '🍺', label: 'Pub nearby' },
                  { value: 'breakfast', icon: '☕', label: 'Breakfast' },
                  { value: 'dinner', icon: '🍽', label: 'Dinner' },
                  { value: 'local_routes', icon: '🗺', label: 'Local routes' },
                  { value: 'group_ride', icon: '🏍', label: 'Group ride' },
                ] as const).map(o => {
                  const on = filterAmenities.includes(o.value)
                  return (
                    <TouchableOpacity key={o.value} style={[styles.fChip, on && styles.fChipOn]} onPress={() => setFilterAmenities(p => toggleFilter(p, o.value))}>
                      <Text style={{ fontSize: 16 }}>{o.icon}</Text>
                      <Text style={[styles.fChipLabel, on && styles.fChipLabelOn]}>{o.label}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

              {/* GUESTS */}
              <Text style={styles.filterSection}>Min. number of riders</Text>
              <View style={styles.guestsRow}>
                <TouchableOpacity style={styles.guestBtn} onPress={() => setFilterMinGuests(v => Math.max(0, v - 1))}>
                  <Text style={styles.guestBtnText}>−</Text>
                </TouchableOpacity>
                <Text style={styles.guestVal}>{filterMinGuests === 0 ? 'Any' : `${filterMinGuests}+`}</Text>
                <TouchableOpacity style={styles.guestBtn} onPress={() => setFilterMinGuests(v => Math.min(10, v + 1))}>
                  <Text style={styles.guestBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              {/* PRICING */}
              <Text style={styles.filterSection}>Pricing</Text>
              <View style={styles.pricingRow}>
                {([
                  { value: 'free', icon: '🤝', label: 'Free', desc: 'Pure hospitality' },
                  { value: 'tip',  icon: '🙏', label: 'Tip Welcome', desc: 'Give what you feel' },
                  { value: 'fixed', icon: '💶', label: 'Paid', desc: 'Agreed upfront' },
                ] as const).map(o => {
                  const on = filterPricings.includes(o.value)
                  return (
                    <TouchableOpacity key={o.value} style={[styles.pCard, on && styles.pCardOn]} onPress={() => setFilterPricings(p => toggleFilter(p, o.value))}>
                      <Text style={{ fontSize: 22 }}>{o.icon}</Text>
                      <Text style={[styles.pCardLabel, on && styles.pCardLabelOn]}>{o.label}</Text>
                      <Text style={styles.pCardDesc}>{o.desc}</Text>
                    </TouchableOpacity>
                  )
                })}
              </View>

            </ScrollView>
          </View>
        </View>
      </Modal>

      {showMap && HostMap ? (
        <View style={{ flex: 1 }}>
          <HostMap
            hosts={filteredHosts}
            onHostSelect={(host: any) => { setSelected(host); setRequesting(true) }}
            mode={mode}
            buddyIds={[]}
            satellite={satelliteMap}
            onSatelliteToggle={() => setSatelliteMap(v => !v)}
          />
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
              <SafetyBlock parkings={hostParkings} />
              <View style={[styles.cardRow, { marginTop: 12 }]}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{host.profiles?.full_name?.charAt(0) || '?'}</Text>
                </View>
                <View style={styles.cardInfo}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.cardName}>
                      {host.profiles?.full_name || 'Anonymous Rider'}
                      {isOwn && <Text style={styles.ownBadge}> (you)</Text>}
                    </Text>
                    {host.avg_rating != null && (
                      <Text style={styles.cardRating}>★ {host.avg_rating.toFixed(1)} <Text style={styles.cardRatingCount}>({host.review_count})</Text></Text>
                    )}
                  </View>
                  <Text style={styles.cardLocation}>📍 {host.location_city}, {host.location_country}</Text>
                </View>
                {hostPricings.includes('free') && (
                  <View style={[styles.pricePill, { borderColor: C.successBorder, backgroundColor: C.successSoft }]}>
                    <Text style={[styles.pricePillText, { color: C.success }]}>Free</Text>
                  </View>
                )}
              </View>
              {selected?.id === host.id && (
                <View style={styles.detail}>
                  {host.notes ? <Text style={styles.detailBio}>{host.notes}</Text> : null}
                  <Text style={styles.detailInfo}>👥 Max. {host.max_guests} riders</Text>
                  {host.sleep_types?.length > 0 && (
                    <Text style={styles.detailInfo}>
                      🛏 {(host.sleep_types as string[]).map(s => ({ tent: 'Tent', roof: 'Roof over head', room: 'Private room' }[s] || s)).join(' · ')}
                    </Text>
                  )}
                  {host.amenities?.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                      {(host.amenities as string[]).map(a => {
                        const icons: Record<string, string> = { shower: '🚿', toilet: '🚽', kitchen: '🍳', laundry: '👕', electricity: '⚡', wifi: '📶', pub_nearby: '🍺', breakfast: '☕', dinner: '🍽', local_routes: '🗺', group_ride: '🏍' }
                        const labels: Record<string, string> = { shower: 'Shower', toilet: 'Toilet', kitchen: 'Kitchen', laundry: 'Laundry', electricity: 'Power', wifi: 'WiFi', pub_nearby: 'Pub nearby', breakfast: 'Breakfast', dinner: 'Dinner', local_routes: 'Local routes', group_ride: 'Group ride' }
                        return <Text key={a} style={styles.amenityTag}>{icons[a] || '•'} {labels[a] || a}</Text>
                      })}
                    </View>
                  )}
                  {host.last_review && (
                    <View style={styles.lastReview}>
                      <Text style={styles.lastReviewStars}>{'★'.repeat(host.last_review.rating)}{'☆'.repeat(5 - host.last_review.rating)}</Text>
                      {host.last_review.body ? <Text style={styles.lastReviewBody}>"{host.last_review.body}"</Text> : null}
                      {host.last_review.reviewer_name ? <Text style={styles.lastReviewAuthor}>— {host.last_review.reviewer_name}</Text> : null}
                    </View>
                  )}
                  {!isOwn ? (
                    <TouchableOpacity style={styles.requestButton} onPress={() => setRequesting(true)}>
                      <Text style={styles.requestButtonText}>Ask to stay</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.editButton} onPress={() => router.push('/become-host')}>
                      <Text style={styles.editButtonText}>Edit listing</Text>
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

function makeStyles(C: ThemeColors) { return StyleSheet.create({
  container:        { flex: 1, backgroundColor: C.bg },
  header:           { paddingHorizontal: 20, paddingTop: 52, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.surface },
  headerRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerRight:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hostsTitle:       { color: C.text, fontSize: 22, fontWeight: '900', letterSpacing: 0.5 },
  hostsTitleAccent: { color: C.accent },
  tabPills:         { flexDirection: 'row', backgroundColor: C.elevated, borderRadius: 100, padding: 3, borderWidth: 1, borderColor: C.border },
  tabPill:          { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 100 },
  tabPillActive:    { backgroundColor: C.accent },
  tabPillText:      { color: C.textDim, fontSize: 12, fontWeight: '600' },
  tabPillTextActive:{ color: C.white, fontWeight: '700' },
  filterBar:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: C.surface, borderBottomWidth: 1, borderBottomColor: C.border },
  filterBtn:        { flexDirection: 'row', alignItems: 'center', backgroundColor: C.elevated, borderRadius: 100, paddingHorizontal: 16, paddingVertical: 8, borderWidth: 1, borderColor: C.border },
  filterBtnActive:  { backgroundColor: C.accent, borderColor: C.accent },
  filterBtnText:    { color: C.textDim, fontSize: 13, fontWeight: '700' },
  filterBtnTextActive: { color: C.white },
  resetBtn:         { paddingHorizontal: 12, paddingVertical: 8 },
  resetBtnText:     { color: C.textDim, fontSize: 13 },
  modalOverlay:     { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet:       { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '90%' },
  modalHeader:      { flexDirection: 'row', alignItems: 'center', padding: 18, borderBottomWidth: 1, borderBottomColor: C.border },
  modalTitle:       { flex: 1, color: C.text, fontSize: 17, fontWeight: '800' },
  modalReset:       { color: C.textDim, fontSize: 13, marginRight: 16 },
  modalClose:       { backgroundColor: C.accent, borderRadius: 100, paddingHorizontal: 16, paddingVertical: 7 },
  modalCloseText:   { color: C.white, fontWeight: '700', fontSize: 13 },
  modalBody:        { padding: 18, gap: 8, paddingBottom: 40 },
  filterSection:    { color: C.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5, marginTop: 16, marginBottom: 8 },
  optRow:           { flexDirection: 'row', alignItems: 'center', backgroundColor: C.elevated, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.border, gap: 10 },
  optRowOn:         { borderColor: C.accent, backgroundColor: C.accentSoft },
  optRowIcon:       { fontSize: 20, width: 28, textAlign: 'center' },
  optRowLabel:      { color: C.text, fontWeight: '700', fontSize: 13 },
  optRowLabelOn:    { color: C.accent },
  optRowDesc:       { color: C.textDim, fontSize: 11, marginTop: 1 },
  optRowCheck:      { color: C.accent, fontSize: 16, fontWeight: '900' },
  chipsWrap:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fChip:            { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.elevated, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: C.border },
  fChipOn:          { backgroundColor: C.accent, borderColor: C.accent },
  fChipLabel:       { color: C.textDim, fontSize: 12, fontWeight: '600' },
  fChipLabelOn:     { color: C.white },
  guestsRow:        { flexDirection: 'row', alignItems: 'center', gap: 16 },
  guestBtn:         { width: 40, height: 40, borderRadius: 20, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  guestBtnText:     { color: C.text, fontSize: 20, fontWeight: '700' },
  guestVal:         { color: C.text, fontSize: 26, fontWeight: '900', minWidth: 50, textAlign: 'center' },
  pricingRow:       { flexDirection: 'row', gap: 8 },
  pCard:            { flex: 1, backgroundColor: C.elevated, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center', gap: 4 },
  pCardOn:          { borderColor: C.accent, backgroundColor: C.accentSoft },
  pCardLabel:       { color: C.textDim, fontSize: 12, fontWeight: '700' },
  pCardLabelOn:     { color: C.accent },
  pCardDesc:        { color: C.textDim, fontSize: 10, textAlign: 'center' },
  satelliteBtn:       { backgroundColor: C.elevated, borderWidth: 1, borderColor: C.border, borderRadius: 100, paddingHorizontal: 10, paddingVertical: 6 },
  satelliteBtnActive: { backgroundColor: C.accent, borderColor: C.accent },
  satWrap:       { position: 'absolute', top: 16, right: 16, zIndex: 10 },
  satBtn:        { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.surface, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1.5, borderColor: C.border, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 6, elevation: 6 },
  satBtnActive:  { backgroundColor: C.accent, borderColor: C.accent },
  satIcon:       { fontSize: 16 },
  satLabel:      { color: C.textMuted, fontSize: 13, fontWeight: '700' },
  satLabelActive:{ color: C.white },
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
  headerTitle:      { color: C.text, fontSize: 18, fontWeight: '800', letterSpacing: 1 },
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
  cardRating:       { color: C.buddy, fontWeight: '700', fontSize: 13 },
  cardRatingCount:  { color: C.textDim, fontWeight: '400', fontSize: 12 },
  amenityTag:       { color: C.textDim, fontSize: 11, backgroundColor: C.elevated, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  lastReview:       { marginTop: 10, backgroundColor: C.elevated, borderRadius: 10, padding: 10, borderLeftWidth: 3, borderLeftColor: C.buddy },
  lastReviewStars:  { color: C.buddy, fontSize: 12, marginBottom: 3 },
  lastReviewBody:   { color: C.text, fontSize: 13, fontStyle: 'italic', lineHeight: 18 },
  lastReviewAuthor: { color: C.textDim, fontSize: 11, marginTop: 4 },
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
}) }
