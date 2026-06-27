import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, TextInput, Platform, Modal } from 'react-native'
import { supabase } from '../../lib/supabase'
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useTheme, type ThemeColors } from '../../lib/ThemeContext'
import { pendingChatStore } from '../../lib/pendingChatStore'
import { mapFocusStore } from '../../lib/mapFocusStore'
import { fuzzCoords } from '../../lib/geo'
import { SafetyBlock, getSafetyKey } from '../../components/SafetyBlock'
import { HostOffer } from '../../components/HostOffer'
import { compressBikePhoto } from '../../lib/compressImage'
import { AppHeader, HeaderBackButton } from '../../components/AppHeader'
import { UserChip } from '../../components/UserChip'


function placeLabel(city?: string | null, country?: string | null): string {
  return [city, country].filter(Boolean).join(', ') || 'Location on the map'
}

export default function MapScreen() {
  const { knockHost, knockLocation } = useLocalSearchParams<{ knockHost?: string; knockLocation?: string }>()
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])
  const [hosts, setHosts] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [selected, setSelected] = useState<any>(null)
  const [showHostProfile, setShowHostProfile] = useState(false)
  const [requesting, setRequesting] = useState(false)
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [sendSuccess, setSendSuccess] = useState(false)
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const fileInputRef = useRef<any>(null)
  const handledKnockHostRef = useRef<string | null>(null)
  const currentUserIdRef = useRef<string | null>(null)
  // Set true before leaving the host sheet for /reviews, so we reopen it on return
  // instead of dropping the user onto the bare map.
  const reopenHostSheetRef = useRef(false)
  const sendingRef = useRef(false)
  const [arrivalChip, setArrivalChip] = useState<'tonight' | 'tomorrow' | 'other'>('tonight')
  const [arrivalDate, setArrivalDate] = useState(() => new Date().toISOString().split('T')[0])
  const [departureDate, setDepartureDate] = useState(() => new Date(Date.now() + 86400000).toISOString().split('T')[0])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [HostMap, setHostMap] = useState<any>(null)
  const [showFilters, setShowFilters] = useState(false)
  const [filterParkings, setFilterParkings] = useState<string[]>([])
  const [filterSleep, setFilterSleep] = useState<string[]>([])
  const [filterAmenities, setFilterAmenities] = useState<string[]>([])
  const [filterMinGuests, setFilterMinGuests] = useState(0)
  const [filterPricings, setFilterPricings] = useState<string[]>([])
  const [satelliteMap, setSatelliteMap] = useState(false)
  // location_id -> my active request status ('PENDING' | 'ACCEPTED') as the guest,
  // so we never offer a second knock for a stay that is already in progress.
  const [myActiveByLocation, setMyActiveByLocation] = useState<Record<string, string>>({})
  // Mirror of the map above for reads inside callbacks that fire before a re-render
  // (e.g. the knock deep-link sets `selected` and acts in the same tick).
  const myActiveByLocationRef = useRef<Record<string, string>>({})
  // location_id -> conversation_id, so "Open your chat" deep-links to that exact thread.
  const [myConvByLocation, setMyConvByLocation] = useState<Record<string, string>>({})
  // An approximate point to centre the map on, requested from a chat's "Show on map"
  // (via mapFocusStore). One-shot: cleared once HostMap has centred on it.
  const [focusPoint, setFocusPoint] = useState<{ lat: number; lng: number } | null>(null)

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

  const fetchHosts = useCallback(async () => {
    // Public surfaces must only read the coarse, privacy-safe view. Never fall
    // back to the exact-coordinate owner table.
    const res = await supabase.from('host_locations_public').select('*')
    const { data, error } = res
    if (error) { console.error(error); setLoadError(true); setLoading(false); return }
    setLoadError(false)
    if (!data || data.length === 0) { setHosts([]); setLoading(false); return }

    const userIds = [...new Set(data.map((h: any) => h.user_id))]
    const [{ data: profilesData }, { data: reviewsData }, { data: lastReviewsData }] = await Promise.all([
      supabase.from('profiles').select('id, full_name, avatar_url, bio').in('id', userIds),
      supabase.from('reviews').select('reviewee_id, rating').in('reviewee_id', userIds),
      supabase.from('reviews')
        .select('reviewee_id, rating, body, reviewer_id')
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
        lastReviewMap[r.reviewee_id] = { rating: r.rating, body: r.body, reviewer_name: null }
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
  }, [])

  // My active (pending/accepted) requests, keyed by location, so the host card can
  // show the stay's status instead of a duplicate "Knock on the door".
  const loadMyRequests = useCallback(async (userId: string) => {
    // Only stays that haven't ended block a new knock — a past accepted stay can't
    // overlap a future one, which mirrors what the DB exclusion constraint enforces.
    const today = new Date().toISOString().split('T')[0]
    const { data } = await supabase
      .from('stay_requests')
      .select('location_id, status, conversation_id')
      .eq('guest_id', userId)
      .in('status', ['PENDING', 'ACCEPTED'])
      .gte('departure_date', today)
    if (currentUserIdRef.current !== userId) return
    const map: Record<string, string> = {}
    const convMap: Record<string, string> = {}
    data?.forEach((r: any) => {
      // An accepted stay outranks a still-pending one for the same place.
      if (map[r.location_id] !== 'ACCEPTED') map[r.location_id] = r.status
      // One conversation per (rider pair, location), so any active request points to it.
      if (r.conversation_id) convMap[r.location_id] = r.conversation_id
    })
    myActiveByLocationRef.current = map
    setMyActiveByLocation(map)
    setMyConvByLocation(convMap)
  }, [])

  useEffect(() => {
    void Promise.resolve().then(fetchHosts)
    supabase.auth.getUser().then(({ data: { user } }) => {
      currentUserIdRef.current = user?.id ?? null
      setCurrentUser(user)
      if (user) void loadMyRequests(user.id)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null
      const nextUserId = nextUser?.id ?? null
      if (currentUserIdRef.current === nextUserId) return
      currentUserIdRef.current = nextUserId
      setCurrentUser(nextUser)
      setSelected(null)
      setShowHostProfile(false)
      setRequesting(false)
      setMessage('')
      setSending(false)
      setSendError('')
      setSendSuccess(false)
      setPhotoFile(null)
      handledKnockHostRef.current = null
      if (nextUser) void loadMyRequests(nextUser.id)
      else setMyActiveByLocation({})
    })
    if (Platform.OS === 'web') {
      import('../../components/HostMap').then(m => setHostMap(() => m.default))
    }
    return () => subscription.unsubscribe()
  }, [fetchHosts, loadMyRequests])

  // Refresh my request statuses when returning to the map (e.g. the host just
  // accepted in chat), so the host card reflects the latest state.
  useFocusEffect(
    useCallback(() => {
      const uid = currentUserIdRef.current
      if (uid) void loadMyRequests(uid)
      // Honour a "Show on map" request from a chat. Consumed on every focus, so it
      // works whether the Map tab was already mounted or just re-focused.
      const focus = mapFocusStore.consume()
      if (focus) setFocusPoint(focus)
      // Coming back from the host's /reviews screen — restore the host detail sheet
      // (the selected host is still set) instead of leaving the user on the bare map.
      if (reopenHostSheetRef.current) {
        reopenHostSheetRef.current = false
        setShowHostProfile(true)
      }
    }, [loadMyRequests])
  )

  // Keep the ref in sync after optimistic in-place updates (send success / dup error).
  useEffect(() => { myActiveByLocationRef.current = myActiveByLocation }, [myActiveByLocation])

  // Whenever a host is opened (map marker, list, or deep-link, on web or native),
  // refresh my request statuses so the card shows the right state, not a stale one.
  useEffect(() => {
    const uid = currentUserIdRef.current
    if (selected && uid) void loadMyRequests(uid)
  }, [selected, loadMyRequests])

  useEffect(() => {
    if (!knockHost || handledKnockHostRef.current === knockHost || hosts.length === 0) return
    const host = (knockLocation ? hosts.find(h => h.id === knockLocation && h.user_id === knockHost) : null)
      ?? hosts.find(h => h.user_id === knockHost)
    if (!host) return
    handledKnockHostRef.current = knockHost
    void Promise.resolve().then(() => {
      setSelected(host)
      setShowHostProfile(false)
      beginRequest(host.id)
    })
    // beginRequest is intentionally excluded; this runs only on a new knock target.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hosts, knockHost, knockLocation])

  function beginRequest(_targetLocationId?: string) {
    // A rider may have an active request here already and still knock for OTHER, non-
    // overlapping dates (matches the DB: only date-overlapping active requests are
    // blocked, and that's enforced at submit). So we always open the form.
    setArrivalChip('tonight')
    setArrivalDate(new Date().toISOString().split('T')[0])
    setDepartureDate(new Date(Date.now() + 86400000).toISOString().split('T')[0])
    setPhotoFile(null)
    setRequesting(true)
  }

  async function sendRequest() {
    if (sendingRef.current) return  // guard against a double-tap creating two requests
    if (!currentUser || !selected) return
    const userId = currentUser.id
    if (currentUserIdRef.current !== userId) {
      setSendError('Your session changed. Please start the request again.')
      return
    }
    if (!message.trim()) {
      setSendError('Write the host a message. At least a few words. 😄')
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(arrivalDate) || !/^\d{4}-\d{2}-\d{2}$/.test(departureDate) || departureDate <= arrivalDate) {
      setSendError('Choose a valid stay period. Checkout must be after arrival.')
      return
    }
    // Model A: a rider may knock freely (overlapping, adjacent, multiple places). The DB
    // only blocks an exact-duplicate pending request and double-booking a host's bed; both
    // surface as friendly messages after the create_knock call below.
    setSendError('')
    sendingRef.current = true
    setSending(true)
    try {
      let uploadedPhotoUrl: string | null = null
      if (photoFile) {
        // Downscale + compress before upload (best-effort; falls back to the original).
        const uploadBlob = await compressBikePhoto(photoFile)
        const ext = uploadBlob === photoFile ? (photoFile.name.split('.').pop() || 'jpg') : 'jpg'
        const contentType = (uploadBlob as Blob).type || 'image/jpeg'
        let upErr: unknown = null
        for (let attempt = 0; attempt < 2; attempt++) {
          const name = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
          const { error } = await supabase.storage.from('request-photos').upload(name, uploadBlob, { contentType })
          if (!error) {
            // request-photos is a private bucket — store the object PATH, not a public URL.
            // The photo is rendered via a short-lived signed URL (see RequestPhoto).
            uploadedPhotoUrl = name
            upErr = null
            break
          }
          upErr = error
        }
        if (upErr) {
          setSendError("Couldn't upload your bike photo. Check your connection and try again — or remove the photo to send without it.")
          setSending(false)
          return
        }
      }

      if (currentUserIdRef.current !== userId) {
        setSendError('Your session changed. Please start the request again.')
        setSending(false)
        return
      }
      // One atomic DB call: find/create the conversation, insert the stay request, and
      // insert the first message — all-or-nothing, so a mid-way failure can't leave an
      // orphan conversation or a request with no message.
      const { data: knock, error: knockErr } = await supabase.rpc('create_knock', {
        p_host_id: selected.user_id,
        p_location_id: selected.id,
        p_guests: 1,
        p_message: message.trim(),
        p_arrival: arrivalDate,
        p_departure: departureDate,
        p_arrival_time: null,
        p_photo_url: uploadedPhotoUrl,
      })
      const row = Array.isArray(knock) ? knock[0] : knock
      if (knockErr || !row?.conversation_id) {
        // The only DB block on knocking now is an exact-duplicate pending request (23505).
        const dupe = knockErr?.code === '23505'
        if (dupe) setMyActiveByLocation(prev => ({ ...prev, [selected.id]: prev[selected.id] || 'PENDING' }))
        // create_knock raises its own user-friendly messages (validation, rate limit) with
        // errcode P0001/check_violation — surface those; hide any raw Postgres error.
        const serverFriendly = knockErr?.code === 'P0001' || knockErr?.code === '23514'
        if (knockErr) console.warn('create_knock error:', knockErr.code, knockErr.message)
        setSendError(dupe
          ? "You've already sent this exact request. Open your chat to follow up."
          : serverFriendly
          ? (knockErr?.message || 'Could not send your request right now. Please try again.')
          : 'Could not send your request right now. Please check your connection and try again.')
        setSending(false)
        return
      }
      const convId: string = row.conversation_id

      supabase.functions.invoke('notify-request', {
        body: { request_id: row.request_id, event: 'new_request' },
      }).catch(() => {})

      setMyActiveByLocation(prev => ({ ...prev, [selected.id]: 'PENDING' }))
      setSendSuccess(true)
      setTimeout(() => {
        setSendSuccess(false)
        setRequesting(false)
        setMessage('')
        setSelected(null)
        pendingChatStore.set({ convId })
        router.push('/(tabs)/requests')
      }, 1500)
    } catch (e: any) {
      console.warn('sendRequest exception:', e?.message)
      setSendError('Could not send your request right now. Please check your connection and try again.')
    } finally {
      sendingRef.current = false
      setSending(false)
    }
  }

  // --- Request form (Knock on the door) ---
  if (requesting && selected) {
    const selectedParkings: string[] = selected.parkings?.length ? selected.parkings : (selected.parking ? [selected.parking] : [])
    const selectedPricings: string[] = selected.pricings?.length ? selected.pricings : (selected.pricing ? [selected.pricing] : ['free'])
    return (
      <View style={styles.container}>
        <AppHeader left={<HeaderBackButton onPress={() => { setRequesting(false); setShowHostProfile(true) }} />}>
          <Text style={styles.headerTitle}>Request a stay</Text>
        </AppHeader>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={styles.card}>
            <View style={styles.cardRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{selected.profiles?.full_name?.charAt(0) || '?'}</Text>
              </View>
              <View style={styles.cardInfo}>
                <Text style={styles.cardName}>{selected.profiles?.full_name || 'Anonymous Rider'}</Text>
                <Text style={styles.cardLocation}>📍 {placeLabel(selected.location_city, selected.location_country)}</Text>
              </View>
            </View>
            <SafetyBlock parkings={selectedParkings} />
            <HostOffer loc={selected} />
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
                    style={{ background: C.bg, border: `1px solid ${C.borderMid}`, borderRadius: 8, padding: '10px 12px', color: C.text, fontSize: 16, colorScheme: 'dark', outline: 'none', width: '100%', boxSizing: 'border-box' } as any}
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
                    if (!file.type?.startsWith('image/')) {
                      setSendError('Please choose an image file.')
                      e.target.value = ''
                      return
                    }
                    if (file.size > 10 * 1024 * 1024) {
                      setSendError('That photo is too large (max 10 MB). Please pick a smaller one.')
                      e.target.value = ''
                      return
                    }
                    setSendError('')
                    setPhotoFile(file)
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
                    <TouchableOpacity onPress={() => setPhotoFile(null)}>
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
              maxLength={1000}
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
      <AppHeader right={<UserChip />} />

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

      {/* Host mini bottom sheet */}
      <Modal visible={showHostProfile && !!selected} animationType="slide" transparent onRequestClose={() => setShowHostProfile(false)}>
        <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowHostProfile(false)} />
        {selected && (() => {
          const isOwn = selected.user_id === currentUser?.id
          const myStatus = myActiveByLocation[selected.id]   // 'PENDING' | 'ACCEPTED' | undefined
          const parkings: string[] = selected.parkings?.length ? selected.parkings : (selected.parking ? [selected.parking] : [])
          const initials = (selected.profiles?.full_name || '?').split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
          return (
            <View style={{ backgroundColor: C.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 34, gap: 14, borderTopWidth: 1, borderTopColor: C.border }}>
              {/* Drag handle */}
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: C.border, alignSelf: 'center', marginBottom: 4 }} />

              {/* Close — return to the map (the backdrop tap can be hard to reach when the
                  sheet is tall on a phone). */}
              <TouchableOpacity
                onPress={() => setShowHostProfile(false)}
                style={{ position: 'absolute', top: 14, right: 14, width: 32, height: 32, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center', zIndex: 2 }}
                accessibilityRole="button"
                accessibilityLabel="Close"
                hitSlop={8}
              >
                <Text style={{ color: C.text, fontSize: 15, fontWeight: '800' }}>✕</Text>
              </TouchableOpacity>

              {/* Avatar + info */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={[styles.avatar, { width: 56, height: 56, borderRadius: 28 }]}>
                  <Text style={[styles.avatarText, { fontSize: 20 }]}>{initials}</Text>
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={{ color: C.text, fontSize: 18, fontWeight: '900' }}>{selected.profiles?.full_name || 'Anonymous Rider'}</Text>
                  <Text style={{ color: C.textMuted, fontSize: 13 }}>📍 {placeLabel(selected.location_city, selected.location_country)}</Text>
                  {selected.avg_rating != null && (
                    <Text style={{ color: C.accent, fontSize: 13, fontWeight: '700' }}>
                      {'★'.repeat(Math.round(selected.avg_rating))}{'☆'.repeat(5 - Math.round(selected.avg_rating))} {selected.avg_rating.toFixed(1)} · {selected.review_count} {selected.review_count === 1 ? 'stay' : 'stays'}
                    </Text>
                  )}
                </View>
              </View>

              {!isOwn && (
                <Text style={{ color: C.textDim, fontSize: 12, lineHeight: 17 }}>
                  📍 Approximate area only — the host shares the exact spot in chat after accepting your request.
                </Text>
              )}

              <SafetyBlock parkings={parkings} />
              <HostOffer loc={selected} />

              {/* Reviews folder — opens this host's reviews (same style as the profile menu) */}
              {selected.review_count > 0 ? (
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingVertical: 14, paddingHorizontal: 16 }}
                  activeOpacity={0.8}
                  onPress={() => {
                    // Close the modal so /reviews is visible above the map, but flag a reopen
                    // so back returns to this host detail, not the bare map.
                    reopenHostSheetRef.current = true
                    setShowHostProfile(false)
                    router.push({ pathname: '/reviews', params: { user: selected.user_id } })
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: C.text, fontSize: 15, fontWeight: '800' }}>Reviews</Text>
                    <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 2 }}>
                      ⭐ {selected.avg_rating != null ? selected.avg_rating.toFixed(1) : '—'} · {selected.review_count} {selected.review_count === 1 ? 'review' : 'reviews'}
                    </Text>
                  </View>
                  <Text style={{ color: C.textDim, fontSize: 24, fontWeight: '300', marginLeft: 8 }}>›</Text>
                </TouchableOpacity>
              ) : (
                <View style={{ backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, paddingVertical: 14, paddingHorizontal: 16 }}>
                  <Text style={{ color: C.text, fontSize: 15, fontWeight: '800' }}>Reviews</Text>
                  <Text style={{ color: C.textMuted, fontSize: 13, marginTop: 2 }}>No reviews yet</Text>
                </View>
              )}

              {/* CTAs */}
              {!isOwn ? (
                <>
                  {myStatus ? (
                    // Existing stay here is just context now — the rider can still knock
                    // again for other, non-overlapping dates (overlap is caught at submit).
                    <View style={{
                      borderRadius: 16, paddingVertical: 13, paddingHorizontal: 16, alignItems: 'center', gap: 3,
                      backgroundColor: myStatus === 'ACCEPTED' ? C.successSoft : C.warningSoft,
                      borderWidth: 1, borderColor: myStatus === 'ACCEPTED' ? C.successBorder : C.warningBorder,
                    }}>
                      <Text style={{ color: myStatus === 'ACCEPTED' ? C.success : C.warning, fontSize: 14, fontWeight: '900', letterSpacing: 0.5 }}>
                        {myStatus === 'ACCEPTED' ? "✅ ACCEPTED — YOU'RE BOOKED" : '⏳ REQUEST SENT — PENDING'}
                      </Text>
                      <Text style={{ color: C.textMuted, fontSize: 12, textAlign: 'center' }}>
                        {myStatus === 'ACCEPTED'
                          ? 'The host shares the exact meeting point in your chat.'
                          : 'Waiting for the host to reply. Follow up in your chat.'}
                      </Text>
                    </View>
                  ) : null}
                  <TouchableOpacity
                    style={{ height: 54, borderRadius: 100, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 10 }}
                    onPress={() => { setShowHostProfile(false); beginRequest() }}
                  >
                    <Text style={{ fontSize: 17 }}>🏠</Text>
                    <Text style={{ color: C.white, fontSize: 15, fontWeight: '900', letterSpacing: 1 }}>
                      {myStatus ? 'KNOCK AGAIN — OTHER DATES' : 'KNOCK ON THE DOOR'}
                    </Text>
                  </TouchableOpacity>
                  {myStatus ? (
                    <TouchableOpacity
                      style={{ height: 46, borderRadius: 100, backgroundColor: C.surface, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
                      onPress={() => {
                        setShowHostProfile(false)
                        const convId = myConvByLocation[selected.id]
                        if (convId) pendingChatStore.set({ convId })
                        router.push('/(tabs)/requests')
                      }}
                    >
                      <Text style={{ color: C.text, fontSize: 14, fontWeight: '700' }}>Open your chat</Text>
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : (
                <TouchableOpacity
                  style={{ height: 54, borderRadius: 100, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' }}
                  onPress={() => { setShowHostProfile(false); router.push('/become-host') }}
                >
                  <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>Edit your listing</Text>
                </TouchableOpacity>
              )}
            </View>
          )
        })()}
      </Modal>

      {HostMap ? (
        <View style={{ flex: 1 }}>
          <HostMap
            hosts={filteredHosts}
            onHostSelect={(host: any) => {
              setSelected(host); setShowHostProfile(true)
              if (currentUserIdRef.current) void loadMyRequests(currentUserIdRef.current)
            }}
            satellite={satelliteMap}
            onSatelliteToggle={() => setSatelliteMap(v => !v)}
            focusPoint={focusPoint}
            onFocusHandled={() => setFocusPoint(null)}
          />
          {loadError && (
            <View style={styles.loadErrorBanner}>
              <Text style={styles.loadErrorText}>Could not load hosts. Check your connection.</Text>
              <TouchableOpacity onPress={() => { setLoading(true); void fetchHosts() }}>
                <Text style={styles.loadErrorRetry}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      ) : (
        // Map not available on this platform — fall through to list
        <ScrollView style={styles.list} contentContainerStyle={{ padding: 16, gap: 12 }}>
          <View style={[styles.infoBox, { borderColor: C.border, backgroundColor: C.surface }]}>
            <Text style={[styles.infoText, { color: C.textDim }]}>🗺 Map view is available on web. Showing list instead.</Text>
          </View>
          {renderList()}
        </ScrollView>
      )}
    </View>
  )

  function renderList() {
    if (loadError && filteredHosts.length === 0) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>📡</Text>
          <Text style={styles.emptyTitle}>Could not load hosts</Text>
          <Text style={styles.emptyText}>Check your connection and try again.</Text>
          <TouchableOpacity style={[styles.button, { marginTop: 16, paddingHorizontal: 28 }]} onPress={() => { setLoading(true); void fetchHosts() }}>
            <Text style={styles.buttonText}>RETRY</Text>
          </TouchableOpacity>
        </View>
      )
    }
    if (filteredHosts.length === 0 && !loading) {
      return (
        <View style={styles.empty}>
          <Text style={styles.emptyEmoji}>🏍</Text>
          <Text style={styles.emptyTitle}>{activeCount > 0 ? 'Nothing found' : 'No hosts yet'}</Text>
          <Text style={styles.emptyText}>{activeCount > 0 ? 'Try changing or clearing filters.' : 'Be the first! Open your profile and offer a safe spot to the community.'}</Text>
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
                  <Text style={styles.cardLocation}>📍 {placeLabel(host.location_city, host.location_country)}</Text>
                </View>
                {hostPricings.includes('free') && (
                  <View style={[styles.pricePill, { borderColor: C.successBorder, backgroundColor: C.successSoft }]}>
                    <Text style={[styles.pricePillText, { color: C.success }]}>Free</Text>
                  </View>
                )}
              </View>
              {selected?.id === host.id && (
                <View style={styles.detail}>
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
                      {host.last_review.body ? <Text style={styles.lastReviewBody}>“{host.last_review.body}”</Text> : null}
                      {host.last_review.reviewer_name ? <Text style={styles.lastReviewAuthor}>— {host.last_review.reviewer_name}</Text> : null}
                    </View>
                  )}
                  {!isOwn ? (
                    <TouchableOpacity style={styles.requestButton} onPress={() => { setSelected(host); beginRequest(host.id) }}>
                      <Text style={styles.requestButtonText}>{myActiveByLocation[host.id] ? 'Knock again' : 'Ask to stay'}</Text>
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
  headerRow:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerRight:      { flexDirection: 'row', alignItems: 'center', gap: 10 },
  hostsTitle:       { color: C.text, fontSize: 22, fontWeight: '900', letterSpacing: 0 },
  hostsTitleAccent: { color: C.accent },
  filterBar:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.border },
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
  headerTitle:      { color: C.text, fontSize: 20, fontWeight: '800', textAlign: 'center' },
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
  cardRating:       { color: C.accent, fontWeight: '700', fontSize: 13 },
  cardRatingCount:  { color: C.textDim, fontWeight: '400', fontSize: 12 },
  amenityTag:       { color: C.textDim, fontSize: 11, backgroundColor: C.elevated, borderRadius: 100, paddingHorizontal: 8, paddingVertical: 3 },
  lastReview:       { marginTop: 10, backgroundColor: C.elevated, borderRadius: 10, padding: 10, borderLeftWidth: 3, borderLeftColor: C.accent },
  lastReviewStars:  { color: C.accent, fontSize: 12, marginBottom: 3 },
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
  dateInput:        { backgroundColor: C.elevated, borderRadius: 10, padding: 12, color: C.text, fontSize: 16, borderWidth: 1, borderColor: C.border },
  counter:          { flexDirection: 'row', alignItems: 'center', gap: 16 },
  counterBtn:       { width: 36, height: 36, borderRadius: 18, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  counterBtnText:   { color: C.text, fontSize: 20, fontWeight: '700' },
  counterValue:     { color: C.text, fontSize: 22, fontWeight: '800', minWidth: 24, textAlign: 'center' },
  counterMax:       { color: C.textDim, fontSize: 12 },
  loadErrorBanner:  { position: 'absolute', top: 16, left: 16, right: 16, zIndex: 1100, backgroundColor: C.errorSoft, borderColor: C.errorBorder, borderWidth: 1, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  loadErrorText:    { color: C.error, fontSize: 13, fontWeight: '600', flex: 1 },
  loadErrorRetry:   { color: C.accent, fontSize: 13, fontWeight: '800' },
  textarea:         { backgroundColor: C.elevated, borderRadius: 12, padding: 14, color: C.text, fontSize: 16, minHeight: 100, borderWidth: 1, borderColor: C.border, textAlignVertical: 'top', lineHeight: 22 },
  infoBox:          { borderRadius: 12, borderWidth: 1, padding: 14 },
  infoText:         { fontSize: 13, lineHeight: 19 },
  photoBtn:         { borderWidth: 1, borderColor: C.border, borderRadius: 12, borderStyle: 'dashed', padding: 24, alignItems: 'center', justifyContent: 'center' },
  photoBtnFilled:   { borderStyle: 'solid', borderColor: C.accent },
  photoBtnText:     { color: C.textMuted, fontSize: 13, fontWeight: '600' },
}) }
