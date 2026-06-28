import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, Image, Platform } from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { supabase } from '../lib/supabase'
import { router, useLocalSearchParams } from 'expo-router'
import type { Pin } from '../components/LocationPicker'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
import { compressBikePhoto } from '../lib/compressImage'
import { FONT } from '../lib/theme'
import { SafetyIcon } from '../components/SafetyIcon'
import { getSafetyKey } from '../components/SafetyBlock'
import { AddressSearch } from '../components/AddressSearch'

const LISTING_BUCKET = 'listing-photos'
const MAX_LISTING_PHOTOS = 3
const CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'JPY', 'CAD', 'AUD', 'CZK']

function makePARKING(C: ThemeColors) {
  return [
    { value: 'garage_locked', icon: '🔒', label: 'Locked garage', desc: 'Locked indoor parking — highest protection', color: C.success },
    { value: 'carport', icon: '🔐', label: 'Covered carport', desc: 'Covered and gated', color: C.info },
    { value: 'yard', icon: '🛡', label: 'Fenced yard', desc: 'Secure yard', color: C.accent },
    { value: 'street', icon: '🛣', label: 'Street parking', desc: 'At your own risk', color: '#94a3b8' },
  ]
}

const SLEEP = [
  { value: 'tent', icon: '⛺', label: 'Tent', desc: 'Bring your own — space available' },
  { value: 'roof', icon: '🏠', label: 'Roof over head', desc: 'Couch, mat, anything dry' },
  { value: 'room', icon: '🛏', label: 'Private room', desc: 'Bed, privacy, proper sleep' },
]

const AMENITIES = [
  { value: 'shower', icon: '🚿', label: 'Shower' },
  { value: 'toilet', icon: '🚽', label: 'Toilet' },
  { value: 'kitchen', icon: '🍳', label: 'Kitchen' },
  { value: 'laundry', icon: '👕', label: 'Laundry' },
  { value: 'electricity', icon: '⚡', label: 'Electricity' },
  { value: 'wifi', icon: '📶', label: 'WiFi' },
  { value: 'pub_nearby', icon: '🍺', label: 'Pub within 10 min' },
  { value: 'tools', icon: '🔧', label: 'Tools to wrench' },
]

const PRICING = [
  { value: 'free', icon: '🤝', label: 'Free', desc: 'Pure hospitality' },
  { value: 'tip', icon: '🙏', label: 'Tip welcome', desc: 'Give what you feel' },
  { value: 'fixed', icon: '💶', label: 'Agreed contribution', desc: 'Agreed upfront' },
]

interface Location {
  id?: string
  paused: boolean   // coarse "away" pause — hidden from the public map/search until back
  pin: Pin | null
  parkings: string[]
  sleepTypes: string[]
  amenities: string[]
  maxGuests: number
  pricings: string[]
  notes: string
  photos: string[]        // public listing-photos object paths (max 3)
  priceAmount: string     // kept as a string for the input; numeric on save
  priceCurrency: string   // EUR default; the period is implicitly "per night"
}

function makeId(): string {
  const g: any = globalThis as any
  if (g.crypto?.randomUUID) return g.crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// New locations get a client-generated id up front so a mixed save batch (existing
// rows with ids + new rows) stays uniform — PostgREST would otherwise send id:null
// for the new rows and violate the NOT NULL constraint. A stable id also prevents
// duplicate inserts on a second save.
function emptyLocation(): Location {
  return { id: makeId(), paused: false, pin: null, parkings: [], sleepTypes: [], amenities: [], maxGuests: 2, pricings: ['free'], notes: '', photos: [], priceAmount: '', priceCurrency: 'EUR' }
}

function toggle(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value]
}

// Light guard on the PUBLIC description: cut obvious contact leaks (GPS coordinate
// pairs, emails, phone numbers) before saving — the precise meeting point belongs in
// chat after accepting. Addresses-in-words are not detectable, hence the warning copy.
function stripContacts(text: string): string {
  let t = (text || '')
    // GPS coordinate pairs (e.g. "50.0871, 14.4210")
    .replace(/-?[0-9]{1,3}\.[0-9]{3,}[\s,;]+-?[0-9]{1,3}\.[0-9]{3,}/g, '')
    // emails
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, '')
  // phone-like runs (7+ digits, optional +, spaces/dashes/parens)
  t = t.replace(/\+?\d[\d\s().-]{5,}\d/g, m => (m.replace(/\D/g, '').length >= 7 ? '' : m))
  return t.replace(/\s{2,}/g, ' ').trim()
}


export default function BecomeHostScreen() {
  const C = useTheme()
  const PARKING = useMemo(() => makePARKING(C), [C])
  const styles = useMemo(() => makeStyles(C), [C])
  // Single-place editor: `place` = edit that one listing; no param = add a brand-new place.
  const { place: placeParam } = useLocalSearchParams<{ place?: string }>()
  const [locations, setLocations] = useState<Location[]>([emptyLocation()])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [LocationPicker, setLocationPicker] = useState<any>(null)
  const currentUserIdRef = useRef<string | null>(null)

  const loadExisting = useCallback(async (userId: string) => {
    // No `place` param → adding a new place; keep the empty card.
    if (!placeParam) return
    const { data: d } = await supabase
      .from('host_locations')
      .select('*')
      .eq('user_id', userId)
      .eq('id', placeParam)
      .maybeSingle()
    if (currentUserIdRef.current !== userId || !d) return
    setLocations([{
      id: d.id,
      paused: !!d.paused,
      pin: { lat: d.location_lat, lng: d.location_lng, city: d.location_city, country: d.location_country },
      parkings: d.parkings?.length ? d.parkings : (d.parking ? [d.parking] : []),
      sleepTypes: d.sleep_types || [],
      amenities: d.amenities || [],
      maxGuests: d.max_guests || 2,
      pricings: d.pricings?.length ? d.pricings : (d.pricing ? [d.pricing] : ['free']),
      notes: d.notes || '',
      photos: Array.isArray(d.photos) ? d.photos : [],
      priceAmount: d.price_amount != null ? String(d.price_amount) : '',
      priceCurrency: d.price_currency || 'EUR',
    }])
  }, [placeParam])

  useEffect(() => {
    import('../components/LocationPicker').then(m => setLocationPicker(() => m.default))
    supabase.auth.getUser().then(({ data: { user } }) => {
      currentUserIdRef.current = user?.id ?? null
      setAuthChecked(true)
      if (user) { setCurrentUser(user); loadExisting(user.id) }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUser = session?.user ?? null
      const nextUserId = nextUser?.id ?? null
      if (currentUserIdRef.current === nextUserId) return
      currentUserIdRef.current = nextUserId
      setCurrentUser(nextUser)
      setLocations([emptyLocation()])
      setSaveError('')
      setSaving(false)
      if (nextUser) loadExisting(nextUser.id)
      else router.replace('/')
    })
    return () => subscription.unsubscribe()
  }, [loadExisting])

  function updateLocation(index: number, patch: Partial<Location>) {
    setLocations(prev => prev.map((loc, i) => i === index ? { ...loc, ...patch } : loc))
  }

  const [uploadingPhotoFor, setUploadingPhotoFor] = useState<string | null>(null)

  function listingPhotoUrl(path: string): string {
    return supabase.storage.from(LISTING_BUCKET).getPublicUrl(path).data.publicUrl
  }

  async function pickImageBlob(): Promise<Blob | null> {
    if (Platform.OS === 'web') {
      return new Promise(resolve => {
        const input = (globalThis as any).document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.onchange = () => resolve(input.files?.[0] ?? null)
        input.click()
      })
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (perm.status !== 'granted') return null
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9 })
    if (res.canceled || !res.assets[0]) return null
    return await (await fetch(res.assets[0].uri)).blob()
  }

  async function addPhoto(index: number) {
    const loc = locations[index]
    if (!loc || loc.photos.length >= MAX_LISTING_PHOTOS) return
    const uid = currentUserIdRef.current
    if (!uid) {
      // Logged out: no silent click — send them to sign up instead.
      if (authChecked) router.push({ pathname: '/', params: { signup: '1' } })
      return
    }
    setSaveError('')
    setUploadingPhotoFor(loc.id ?? String(index))
    try {
      const raw = await pickImageBlob()
      if (!raw) return
      const blob = await compressBikePhoto(raw as File)   // web compresses; native falls back to original
      const path = `${uid}/${makeId()}.jpg`
      const { error } = await supabase.storage.from(LISTING_BUCKET).upload(path, blob, { contentType: (blob as Blob).type || 'image/jpeg' })
      if (error) { console.warn('listing photo upload error:', error.message); setSaveError('Could not upload the photo. Please try again.'); return }
      setLocations(prev => prev.map((l, i) => i === index ? { ...l, photos: [...l.photos, path].slice(0, MAX_LISTING_PHOTOS) } : l))
    } catch (e: any) {
      console.warn('listing photo exception:', e?.message)
      setSaveError('Could not upload the photo. Please try again.')
    } finally {
      setUploadingPhotoFor(null)
    }
  }

  function removePhoto(index: number, path: string) {
    setLocations(prev => prev.map((l, i) => i === index ? { ...l, photos: l.photos.filter(p => p !== path) } : l))
    void supabase.storage.from(LISTING_BUCKET).remove([path]).catch(() => {})
  }

  // Single place: validate and upsert just this one row (never touches the host's
  // other places), then go back to the My Places list.
  async function save() {
    setSaveError('')
    const loc = locations[0]
    if (!loc.pin) {
      setSaveError('This place has no pin yet — search an address or tap the map to set its position.')
      return
    }
    if (loc.parkings.length === 0) {
      setSaveError('Pick at least one parking option — it’s the first thing riders look for.')
      return
    }
    if (loc.sleepTypes.length === 0) {
      setSaveError('Pick at least one sleeping option so guests know what to expect.')
      return
    }
    if (!currentUser) {
      setSaveError('You are not logged in — please sign in and try again.')
      return
    }
    const userId = currentUser.id
    if (currentUserIdRef.current !== userId) {
      setSaveError('Your session changed. Please reopen this screen and try again.')
      return
    }
    setSaving(true)
    try {
      const row = {
        id: loc.id || makeId(),
        user_id: userId,
        paused: loc.paused,
        location_name: null,
        location_lat: loc.pin.lat,
        location_lng: loc.pin.lng,
        location_city: loc.pin.city || '',
        location_country: loc.pin.country || '',
        parkings: loc.parkings,
        parking: loc.parkings[0] || 'yard',
        sleep_types: loc.sleepTypes,
        amenities: loc.amenities,
        max_guests: loc.maxGuests,
        pricings: loc.pricings,
        pricing: loc.pricings[0] || 'free',
        notes: stripContacts(loc.notes),
        photos: loc.photos.slice(0, MAX_LISTING_PHOTOS),
        // Price only applies to a Paid listing; otherwise stored as null.
        price_amount: loc.pricings.includes('fixed') && loc.priceAmount.trim() !== '' ? Number(loc.priceAmount) : null,
        price_currency: loc.pricings.includes('fixed') ? (loc.priceCurrency || 'EUR') : null,
        price_unit: null,
      }
      const { error } = await supabase.from('host_locations').upsert(row, { onConflict: 'id' })
      if (error) {
        console.warn('save listing error:', error.message)
        setSaveError('Could not save your place. Please check your connection and try again.')
      } else {
        router.replace('/my-places' as never)
      }
    } catch (e: any) {
      console.warn('save listing exception:', e?.message)
      setSaveError('Could not save your place. Please check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {locations.map((loc, index) => (
        <View key={index} style={styles.locationCard}>
          {/* Location header */}
          <View style={styles.locationHeader}>
            <View style={styles.locationHeaderLeft}>
              <View style={styles.locationBadge}>
                <Text style={styles.locationBadgeText}>{placeParam ? 'EDIT PLACE' : 'NEW PLACE'}</Text>
              </View>
              {loc.pin?.city ? <Text style={styles.locationNameTag} numberOfLines={1}>{loc.pin.city}</Text> : null}
              {loc.paused ? <View style={styles.pausedTag}><Text style={styles.pausedTagText}>⏸ PAUSED</Text></View> : null}
            </View>
          </View>

          {/* Availability — coarse "away" pause; a paused place leaves the public map */}
          <View style={styles.availRow}>
            <TouchableOpacity
              style={[styles.availOpt, !loc.paused && styles.availOptOnActive]}
              onPress={() => updateLocation(index, { paused: false })}
            >
              <Text style={[styles.availOptText, !loc.paused && styles.availOptTextActive]}>🟢 Available</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.availOpt, loc.paused && styles.availOptOffActive]}
              onPress={() => updateLocation(index, { paused: true })}
            >
              <Text style={[styles.availOptText, loc.paused && styles.availOptTextActive]}>⏸ Paused (away)</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.privateNote}>{loc.paused ? '⏸ Paused — this place is hidden from the map and search, and riders can’t knock. Flip back to Available when you’re home.' : '🟢 Available — riders can find this place on the map and knock.'}</Text>

          {/* Location — search by address or drop a pin on the map */}
          <Text style={styles.label}>📍 WHERE IS IT?</Text>
          <AddressSearch onPick={pin => updateLocation(index, { pin })} />
          {loc.pin && (
            <Text style={styles.pinLabel}>
              📌 {loc.pin.city ? `${loc.pin.city}${loc.pin.country ? ', ' + loc.pin.country : ''}` : `${loc.pin.lat.toFixed(4)}, ${loc.pin.lng.toFixed(4)}`}
            </Text>
          )}
          <View style={styles.mapWrap}>
            {LocationPicker
              ? <LocationPicker pin={loc.pin} onChange={(pin: Pin) => updateLocation(index, { pin })} />
              : <View style={styles.mapLoading}><ActivityIndicator color={C.accent} /></View>
            }
          </View>
          <Text style={styles.privateNote}>🔒 Riders only ever see an approximate area — your pin is shown fuzzed on the public map, never the exact spot. You send the precise coordinates yourself in chat, as a next step, after you accept a request.</Text>

          {/* Parking — radio cards, coloured by safety level */}
          <Text style={styles.label}>🅿️ HOW SAFE IS THE PARKING?</Text>
          {PARKING.map(p => {
            const active = loc.parkings.includes(p.value)
            return (
              <TouchableOpacity
                key={p.value}
                style={[styles.optCard, active && { borderColor: p.color, backgroundColor: p.color + '12' }]}
                onPress={() => updateLocation(index, { parkings: toggle(loc.parkings, p.value) })}
              >
                <View style={styles.optIconWrap}><SafetyIcon level={getSafetyKey(p.value)} size={24} color={active ? p.color : C.textDim} strokeWidth={2.2} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optLabelUpper, active && { color: p.color }]}>{p.label}</Text>
                  <Text style={styles.optDesc}>{p.desc}</Text>
                </View>
                <View style={[styles.radio, { borderColor: active ? p.color : C.borderMid }]}>
                  {active ? <View style={[styles.radioDot, { backgroundColor: p.color }]} /> : null}
                </View>
              </TouchableOpacity>
            )
          })}

          {/* Sleeping */}
          <Text style={styles.label}>🛏 WHERE WILL THEY SLEEP?</Text>
          {SLEEP.map(s => (
            <TouchableOpacity
              key={s.value}
              style={[styles.optCard, loc.sleepTypes.includes(s.value) && styles.optCardSleep]}
              onPress={() => updateLocation(index, { sleepTypes: toggle(loc.sleepTypes, s.value) })}
            >
              <Text style={styles.optIcon}>{s.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optLabel, loc.sleepTypes.includes(s.value) && styles.optLabelSleep]}>{s.label}</Text>
                <Text style={styles.optDesc}>{s.desc}</Text>
              </View>
              {loc.sleepTypes.includes(s.value) && <Text style={styles.checkSleep}>✓</Text>}
            </TouchableOpacity>
          ))}

          {/* Amenities */}
          <Text style={styles.label}>🔧 WHAT CAN GUESTS USE?</Text>
          <View style={styles.chipsWrap}>
            {AMENITIES.map(a => {
              const active = loc.amenities.includes(a.value)
              return (
                <TouchableOpacity
                  key={a.value}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => updateLocation(index, { amenities: toggle(loc.amenities, a.value) })}
                >
                  <Text style={styles.chipIcon}>{a.icon}</Text>
                  <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{a.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Guest count */}
          <Text style={styles.label}>👥 MAXIMUM NUMBER OF RIDERS</Text>
          <View style={styles.counter}>
            <TouchableOpacity style={styles.cBtn} onPress={() => updateLocation(index, { maxGuests: Math.max(1, loc.maxGuests - 1) })}>
              <Text style={styles.cBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.cVal}>{loc.maxGuests}</Text>
            <TouchableOpacity style={styles.cBtn} onPress={() => updateLocation(index, { maxGuests: Math.min(10, loc.maxGuests + 1) })}>
              <Text style={styles.cBtnText}>+</Text>
            </TouchableOpacity>
            <Text style={styles.cDesc}>rider{loc.maxGuests !== 1 ? 's' : ''} at a time</Text>
          </View>

          {/* The vibe */}
          <Text style={styles.label}>💰 THE VIBE (ALWAYS FREE)</Text>
          <View style={styles.pricingRow}>
            {PRICING.map(p => {
              const active = loc.pricings.includes(p.value)
              return (
                <TouchableOpacity
                  key={p.value}
                  style={[styles.pCard, active && styles.pCardActive]}
                  onPress={() => updateLocation(index, { pricings: toggle(loc.pricings, p.value) })}
                >
                  <Text style={styles.pIcon}>{p.icon}</Text>
                  <Text style={[styles.pLabel, active && styles.pLabelActive]}>{p.label}</Text>
                  <Text style={styles.pDesc}>{p.desc}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          <Text style={styles.privateNote}>🤝 twowheelcome is free — a bed for the night is hospitality, not business. Anything beyond that (a beer, a tip, an agreed contribution) is settled directly in chat.</Text>

          {/* Price — only for a Paid listing, so riders know the cost before they knock */}
          {loc.pricings.includes('fixed') && (
            <View style={{ gap: 8 }}>
              <View style={styles.priceRow}>
                <TextInput
                  style={[styles.input, { flex: 1 }]}
                  placeholder="500"
                  placeholderTextColor={C.placeholder}
                  keyboardType="numeric"
                  value={loc.priceAmount}
                  onChangeText={t => updateLocation(index, { priceAmount: t.replace(/[^0-9.]/g, '') })}
                  maxLength={9}
                />
                <Text style={styles.priceUnitHint}>{loc.priceCurrency} / night</Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                {CURRENCIES.map(cur => {
                  const active = loc.priceCurrency === cur
                  return (
                    <TouchableOpacity key={cur} style={[styles.curChip, active && styles.curChipActive]} onPress={() => updateLocation(index, { priceCurrency: cur })}>
                      <Text style={[styles.curChipText, active && styles.curChipTextActive]}>{cur}</Text>
                    </TouchableOpacity>
                  )
                })}
              </ScrollView>
              <Text style={styles.privateNote}>💬 Just a rough guide so riders know what to expect — you settle the exact amount and currency together in chat (local cash is fine).</Text>
            </View>
          )}

          {/* Listing photos (public, max 3) */}
          <Text style={styles.label}>📸 PHOTOS OF THE PLACE (optional, up to {MAX_LISTING_PHOTOS})</Text>
          <View style={styles.photoRow}>
            {loc.photos.map(path => (
              <View key={path} style={styles.photoThumb}>
                <Image source={{ uri: listingPhotoUrl(path) }} style={styles.photoImg} resizeMode="cover" />
                <TouchableOpacity style={styles.photoRemove} onPress={() => removePhoto(index, path)} hitSlop={6} accessibilityLabel="Remove photo">
                  <Text style={styles.photoRemoveText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
            {loc.photos.length < MAX_LISTING_PHOTOS && (
              <TouchableOpacity
                style={styles.photoAdd}
                onPress={() => addPhoto(index)}
                disabled={uploadingPhotoFor === (loc.id ?? String(index))}
              >
                {uploadingPhotoFor === (loc.id ?? String(index))
                  ? <ActivityIndicator color={C.accent} />
                  : <Text style={styles.photoAddText}>＋</Text>}
              </TouchableOpacity>
            )}
          </View>
          {authChecked && !currentUser ? (
            <TouchableOpacity onPress={() => router.push({ pathname: '/', params: { signup: '1' } })}>
              <Text style={[styles.privateNote, { color: C.accent, fontWeight: '700' }]}>🔒 Create a free account to add photos →</Text>
            </TouchableOpacity>
          ) : null}
          <Text style={styles.privateNote}>🔒 Privacy — these are public, so avoid shots that reveal your exact address or your house from the street. Show where the bike sleeps (yard, garage…). You share the precise spot only after you accept a request.</Text>

          {/* Public description */}
          <Text style={styles.label}>✍️ DESCRIPTION FOR RIDERS</Text>
          <TextInput
            style={styles.textarea}
            placeholder={'What should riders know about this place? e.g. "Quiet fenced yard, dog on site, late arrivals okay. Exact meeting point stays in chat after I accept." Riders read this before they knock.'}
            placeholderTextColor={C.placeholder}
            value={loc.notes}
            onChangeText={text => updateLocation(index, { notes: text })}
            multiline
            numberOfLines={4}
            maxLength={800}
          />
          <Text style={styles.privateNote}>👀 Public — riders see this before they knock. Do not include your exact address, gate code, phone, email, social handle or GPS coordinates. Share the meeting point only in chat after you accept.</Text>
        </View>
      ))}

      {saveError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ {saveError}</Text>
        </View>
      ) : null}

      {/* Save — logged-out riders are nudged to create an account first */}
      {authChecked && !currentUser ? (
        <>
          <TouchableOpacity
            style={styles.saveBtn}
            onPress={() => router.push({ pathname: '/', params: { signup: '1' } })}
          >
            <Text style={styles.saveBtnText}>Create a free account to publish your safe spot</Text>
          </TouchableOpacity>
          <Text style={styles.hint}>
            You need an account to publish a listing. It’s free — your spot then appears on the map for riders browsing TWOWHEELCOME.
          </Text>
        </>
      ) : (
        <>
          <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
            {saving
              ? <ActivityIndicator color={C.white} />
              : <Text style={styles.saveBtnText}>{placeParam ? 'SAVE PLACE' : 'ADD PLACE'}</Text>
            }
          </TouchableOpacity>

          <Text style={styles.hint}>
            Your listing appears on the map for riders browsing TWOWHEELCOME.
          </Text>
        </>
      )}
    </ScrollView>
  )
}

function makeStyles(C: ThemeColors) { return StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 60, gap: 16 },

  locationCard: { backgroundColor: C.surface, borderRadius: 22, borderWidth: 1, borderColor: C.border, padding: 18, gap: 16 },
  locationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  locationHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  locationNameTag: { color: C.text, fontSize: 14, fontWeight: '700', flexShrink: 1 },
  pausedTag: { backgroundColor: C.warningSoft, borderWidth: 1, borderColor: C.warningBorder, borderRadius: 100, paddingHorizontal: 9, paddingVertical: 3 },
  pausedTagText: { color: C.warning, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  availRow: { flexDirection: 'row', gap: 8 },
  availOpt: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 11, borderRadius: 12, borderWidth: 1, borderColor: C.border, backgroundColor: C.elevated },
  availOptOnActive: { borderColor: C.green, backgroundColor: C.greenSoft },
  availOptOffActive: { borderColor: C.warningBorder, backgroundColor: C.warningSoft },
  availOptText: { color: C.textMuted, fontSize: 13, fontWeight: '700' },
  availOptTextActive: { color: C.text },
  locationBadge: { backgroundColor: C.accent, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5 },
  locationBadgeText: { color: C.white, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },

  label: { color: C.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
  pinLabel: { color: C.accent, fontSize: 13, fontWeight: '600' },

  mapWrap: { height: 400, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  mapLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.elevated },

  optCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.elevated, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border, gap: 12 },
  optIcon: { fontSize: 22, width: 32, textAlign: 'center' },
  optIconWrap: { width: 32, alignItems: 'center', justifyContent: 'center' },
  optLabel: { color: C.text, fontWeight: '700', fontSize: 14 },
  optLabelUpper: { color: C.text, fontWeight: '800', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  radioDot: { width: 11, height: 11, borderRadius: 6 },
  optDesc: { color: C.textMuted, fontSize: 12, marginTop: 2, fontFamily: FONT.body },
  check: { fontSize: 18, fontWeight: '900' },

  optCardSleep: { borderColor: C.secondaryBorder, backgroundColor: C.secondarySoft },
  optLabelSleep: { color: C.secondary },
  checkSleep: { fontSize: 18, fontWeight: '900', color: C.secondary },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.elevated, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: C.border },
  chipActive: { borderColor: C.green, backgroundColor: C.greenSoft },
  chipIcon: { fontSize: 15 },
  chipLabel: { color: C.textMuted, fontSize: 13, fontWeight: '600' },
  chipLabelActive: { color: C.green },

  counter: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 4 },
  cBtn: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.elevated, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border },
  cBtnText: { color: C.text, fontSize: 22, fontWeight: '700', lineHeight: 26 },
  cVal: { color: C.text, fontSize: 34, fontWeight: '900', minWidth: 40, textAlign: 'center' },
  cDesc: { color: C.textMuted, fontSize: 13 },

  pricingRow: { flexDirection: 'row', gap: 8 },
  pCard: { flex: 1, backgroundColor: C.elevated, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border, alignItems: 'center', gap: 5 },
  pCardActive: { borderColor: C.accent, backgroundColor: C.accentSoft },
  pIcon: { fontSize: 24 },
  pLabel: { color: C.textMuted, fontSize: 12, fontWeight: '700' },
  pLabelActive: { color: C.accent },
  pDesc: { color: C.textDim, fontSize: 10, textAlign: 'center' },

  textarea: { backgroundColor: C.elevated, borderRadius: 12, padding: 14, color: C.text, fontSize: 16, borderWidth: 1, borderColor: C.border, minHeight: 110, textAlignVertical: 'top', lineHeight: 22, fontFamily: FONT.body },
  privateNote: { color: C.textDim, fontSize: 12, lineHeight: 18, fontFamily: FONT.body },
  input: { backgroundColor: C.elevated, borderRadius: 12, padding: 14, color: C.text, fontSize: 16, borderWidth: 1, borderColor: C.border },
  priceRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  priceUnitHint: { color: C.textMuted, fontSize: 15, fontWeight: '700', minWidth: 96 },
  curChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 100, borderWidth: 1, borderColor: C.border, backgroundColor: C.elevated },
  curChipActive: { borderColor: C.accent, backgroundColor: C.accentSoft },
  curChipText: { color: C.textMuted, fontSize: 13, fontWeight: '700' },
  curChipTextActive: { color: C.accent },
  photoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  photoThumb: { width: 88, height: 88, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  photoImg: { width: '100%', height: '100%' },
  photoRemove: { position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center' },
  photoRemoveText: { color: '#fff', fontSize: 12, fontWeight: '900' },
  photoAdd: { width: 88, height: 88, borderRadius: 12, borderWidth: 1.5, borderColor: C.border, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: C.elevated },
  photoAddText: { color: C.accent, fontSize: 30, fontWeight: '300' },

  saveBtn: { backgroundColor: C.accent, borderRadius: 100, padding: 17, alignItems: 'center', minHeight: 54, justifyContent: 'center' },
  saveBtnText: { color: C.white, fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
  hint: { color: C.textDim, fontSize: 12, textAlign: 'center', lineHeight: 19 },

  errorBox: { backgroundColor: C.errorSoft, borderWidth: 1, borderColor: C.errorBorder, borderRadius: 12, padding: 14 },
  errorText: { color: C.error, fontSize: 13, lineHeight: 18 },
}) }
