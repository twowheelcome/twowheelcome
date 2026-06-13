import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native'
import { supabase } from '../lib/supabase'
import { router } from 'expo-router'
import type { Pin } from '../components/LocationPicker'
import { C } from '../lib/theme'

const PARKING = [
  { value: 'garage_locked', icon: '🔒', label: 'Locked Garage', desc: 'Fort Knox — best protection', color: C.success },
  { value: 'carport', icon: '🔐', label: 'Covered Carport', desc: 'Covered and gated', color: C.info },
  { value: 'yard', icon: '🛡', label: 'Fenced Yard', desc: 'Secure yard', color: C.accent },
  { value: 'street', icon: '🛣', label: 'Street Parking', desc: 'At your own risk', color: '#94a3b8' },
]

const SLEEP = [
  { value: 'tent', icon: '⛺', label: 'Tent', desc: 'Bring your own — space available' },
  { value: 'roof', icon: '🏠', label: 'Roof Over Head', desc: 'Couch, mat, anything dry' },
  { value: 'room', icon: '🛏', label: 'Private Room', desc: 'Bed, privacy, proper sleep' },
]

const AMENITIES = [
  { value: 'shower', icon: '🚿', label: 'Shower' },
  { value: 'toilet', icon: '🚽', label: 'Toilet' },
  { value: 'kitchen', icon: '🍳', label: 'Kitchen' },
  { value: 'laundry', icon: '👕', label: 'Laundry' },
  { value: 'electricity', icon: '⚡', label: 'Electricity' },
  { value: 'wifi', icon: '📶', label: 'WiFi' },
  { value: 'pub_nearby', icon: '🍺', label: 'Pub within 10 min' },
  { value: 'breakfast', icon: '☕', label: 'Breakfast' },
  { value: 'dinner', icon: '🍽', label: 'Dinner' },
  { value: 'local_routes', icon: '🗺', label: 'Local routes' },
  { value: 'group_ride', icon: '🏍', label: 'Group ride' },
]

const PRICING = [
  { value: 'free', icon: '🤝', label: 'Free', desc: 'Pure hospitality' },
  { value: 'tip', icon: '🙏', label: 'Tip Welcome', desc: 'Give what you feel' },
  { value: 'fixed', icon: '💶', label: 'Paid', desc: 'Agreed upfront' },
]

interface Location {
  pin: Pin | null
  parkings: string[]
  sleepTypes: string[]
  amenities: string[]
  maxGuests: number
  pricings: string[]
  notes: string
}

function emptyLocation(): Location {
  return { pin: null, parkings: [], sleepTypes: [], amenities: [], maxGuests: 2, pricings: ['free'], notes: '' }
}

function toggle(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value]
}


export default function BecomeHostScreen() {
  const [locations, setLocations] = useState<Location[]>([emptyLocation()])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveOk, setSaveOk] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [LocationPicker, setLocationPicker] = useState<any>(null)

  useEffect(() => {
    import('../components/LocationPicker').then(m => setLocationPicker(() => m.default))
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) { setCurrentUser(user); loadExisting(user.id) }
    })
  }, [])

  async function loadExisting(userId: string) {
    const { data } = await supabase
      .from('host_locations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
    if (data && data.length > 0) {
      setLocations(data.map(d => ({
        pin: { lat: d.location_lat, lng: d.location_lng, city: d.location_city, country: d.location_country },
        parkings: d.parkings?.length ? d.parkings : (d.parking ? [d.parking] : []),
        sleepTypes: d.sleep_types || [],
        amenities: d.amenities || [],
        maxGuests: d.max_guests || 2,
        pricings: d.pricings?.length ? d.pricings : (d.pricing ? [d.pricing] : ['free']),
        notes: d.notes || '',
      })))
    }
  }

  function updateLocation(index: number, patch: Partial<Location>) {
    setLocations(prev => prev.map((loc, i) => i === index ? { ...loc, ...patch } : loc))
  }

  function addLocation() {
    setLocations(prev => [...prev, emptyLocation()])
  }

  function removeLocation(index: number) {
    setLocations(prev => prev.filter((_, i) => i !== index))
  }

  async function save() {
    setSaveError('')
    setSaveOk(false)
    const primary = locations[0]
    if (!primary.pin) {
      setSaveError('Click on the map at location #1 and select a position.')
      return
    }
    if (!currentUser) {
      setSaveError("You're not logged in — please sign in and try again.")
      return
    }
    setSaving(true)
    try {
      // Delete old locations and save new ones
      const { error: delError } = await supabase
        .from('host_locations')
        .delete()
        .eq('user_id', currentUser.id)
      if (delError) { setSaveError(delError.message); return }

      const rows = locations
        .filter(l => l.pin)
        .map(l => ({
          user_id: currentUser.id,
          location_lat: l.pin!.lat,
          location_lng: l.pin!.lng,
          location_city: l.pin!.city || '',
          location_country: l.pin!.country || '',
          parkings: l.parkings,
          parking: l.parkings[0] || 'yard',
          sleep_types: l.sleepTypes,
          amenities: l.amenities,
          max_guests: l.maxGuests,
          pricings: l.pricings,
          pricing: l.pricings[0] || 'free',
          notes: l.notes.trim(),
        }))

      const { error } = await supabase.from('host_locations').insert(rows)
      if (error) {
        setSaveError(error.message)
      } else {
        setSaveOk(true)
      }
    } catch (e: any) {
      setSaveError(e?.message || 'Unexpected error, please try again.')
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
            <View style={styles.locationBadge}>
              <Text style={styles.locationBadgeText}>LOCATION {index + 1}</Text>
            </View>
            {locations.length > 1 && (
              <TouchableOpacity onPress={() => removeLocation(index)}>
                <Text style={styles.removeLocation}>✕ Remove</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Mapa */}
          <Text style={styles.label}>📍 LOCATION</Text>
          {loc.pin && (
            <Text style={styles.pinLabel}>
              {loc.pin.city ? `${loc.pin.city}${loc.pin.country ? ', ' + loc.pin.country : ''}` : `${loc.pin.lat.toFixed(4)}, ${loc.pin.lng.toFixed(4)}`}
            </Text>
          )}
          <View style={styles.mapWrap}>
            {LocationPicker
              ? <LocationPicker pin={loc.pin} onChange={(pin: Pin) => updateLocation(index, { pin })} />
              : <View style={styles.mapLoading}><ActivityIndicator color={C.accent} /></View>
            }
          </View>

          {/* Parking */}
          <Text style={styles.label}>🅿️ PARKING</Text>
          {PARKING.map(p => {
            const active = loc.parkings.includes(p.value)
            return (
              <TouchableOpacity
                key={p.value}
                style={[styles.optCard, active && { borderColor: p.color, backgroundColor: p.color + '12' }]}
                onPress={() => updateLocation(index, { parkings: toggle(loc.parkings, p.value) })}
              >
                <Text style={styles.optIcon}>{p.icon}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.optLabel, active && { color: p.color }]}>{p.label}</Text>
                  <Text style={styles.optDesc}>{p.desc}</Text>
                </View>
                {active && <Text style={[styles.check, { color: p.color }]}>✓</Text>}
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
          <Text style={styles.label}>🔧 WHAT DO YOU OFFER?</Text>
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

          {/* Cena */}
          <Text style={styles.label}>💰 WHAT DO YOU WANT IN RETURN?</Text>
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

          {/* Notes */}
          <Text style={styles.label}>✍️ DESCRIPTION FOR RIDERS</Text>
          <TextInput
            style={styles.textarea}
            placeholder={'What do you offer? Where exactly to park?\nShower, wifi, dinner? How to contact you?'}
            placeholderTextColor="#666"
            value={loc.notes}
            onChangeText={text => updateLocation(index, { notes: text })}
            multiline
            numberOfLines={4}
          />
        </View>
      ))}

      {/* Add another location */}
      <TouchableOpacity style={styles.addBtn} onPress={addLocation}>
        <Text style={styles.addBtnText}>+ ADD ANOTHER LOCATION</Text>
      </TouchableOpacity>

      {saveError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ {saveError}</Text>
        </View>
      ) : null}

      {saveOk ? (
        <View style={styles.successBox}>
          <Text style={styles.successText}>🎉 You're on the map! Your listing is visible to all riders.</Text>
          <TouchableOpacity onPress={() => router.replace('/(tabs)/map')} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Back to map</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Save */}
      <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
        {saving
          ? <ActivityIndicator color={C.white} />
          : <Text style={styles.saveBtnText}>🏠 SAVE AND GO TO MAP →</Text>
        }
      </TouchableOpacity>

      <Text style={styles.hint}>
        Your listing will appear immediately on the map for all registered riders.
      </Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 60, gap: 16 },

  locationCard: { backgroundColor: C.surface, borderRadius: 20, borderWidth: 1, borderColor: C.border, padding: 18, gap: 16 },
  locationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  locationBadge: { backgroundColor: C.accent, borderRadius: 100, paddingHorizontal: 12, paddingVertical: 5 },
  locationBadgeText: { color: C.white, fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  removeLocation: { color: C.textDim, fontSize: 13 },

  label: { color: C.textDim, fontSize: 11, fontWeight: '700', letterSpacing: 2, textTransform: 'uppercase' },
  pinLabel: { color: C.accent, fontSize: 13, fontWeight: '600', marginTop: -8 },

  mapWrap: { height: 220, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: C.border },
  mapLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.elevated },

  optCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.elevated, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: C.border, gap: 12 },
  optIcon: { fontSize: 22, width: 32, textAlign: 'center' },
  optLabel: { color: C.text, fontWeight: '700', fontSize: 14 },
  optDesc: { color: C.textMuted, fontSize: 12, marginTop: 2 },
  check: { fontSize: 18, fontWeight: '900' },

  optCardSleep: { borderColor: C.secondaryBorder, backgroundColor: C.secondarySoft },
  optLabelSleep: { color: C.secondary },
  checkSleep: { fontSize: 18, fontWeight: '900', color: C.secondary },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.elevated, borderRadius: 100, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: C.border },
  chipActive: { borderColor: C.accent, backgroundColor: C.accentSoft },
  chipIcon: { fontSize: 15 },
  chipLabel: { color: C.textMuted, fontSize: 13, fontWeight: '600' },
  chipLabelActive: { color: C.accent },

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

  textarea: { backgroundColor: C.elevated, borderRadius: 12, padding: 14, color: C.text, fontSize: 14, borderWidth: 1, borderColor: C.border, minHeight: 110, textAlignVertical: 'top', lineHeight: 22 },

  addBtn: { borderWidth: 1, borderColor: C.accent, borderRadius: 100, padding: 14, alignItems: 'center', borderStyle: 'dashed' },
  addBtnText: { color: C.accent, fontWeight: '700', fontSize: 14, letterSpacing: 1 },

  saveBtn: { backgroundColor: C.accent, borderRadius: 100, padding: 17, alignItems: 'center', minHeight: 54, justifyContent: 'center' },
  saveBtnText: { color: C.white, fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
  hint: { color: C.textDim, fontSize: 12, textAlign: 'center', lineHeight: 19 },

  errorBox: { backgroundColor: C.errorSoft, borderWidth: 1, borderColor: C.errorBorder, borderRadius: 12, padding: 14 },
  errorText: { color: C.error, fontSize: 13, lineHeight: 18 },
  successBox: { backgroundColor: C.successSoft, borderWidth: 1, borderColor: C.successBorder, borderRadius: 12, padding: 16, gap: 12 },
  successText: { color: C.success, fontSize: 14, lineHeight: 21 },
  backBtn: { backgroundColor: C.success, borderRadius: 100, padding: 12, alignItems: 'center' },
  backBtnText: { color: C.white, fontWeight: '700', fontSize: 13 },
})
