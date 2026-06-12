import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native'
import { supabase } from '../lib/supabase'
import { router } from 'expo-router'
import type { Pin } from '../components/LocationPicker'
import { C } from '../lib/theme'

const VEHICLE_TYPES = [
  { value: 'moto', icon: '🏍', label: 'Moto' },
  { value: 'bicycle', icon: '🚴', label: 'Kolo' },
]

const PARKING = [
  { value: 'garage_locked', icon: '🔒', label: 'Uzamčená garáž', desc: 'Fort Knox — nejlepší ochrana', color: C.success },
  { value: 'carport', icon: '🔐', label: 'Přístřešek za plotem', desc: 'Krytý a za plotem', color: C.info },
  { value: 'yard', icon: '🛡', label: 'Dvůr za plotem', desc: 'Bezpečný dvůr', color: C.accent },
  { value: 'street', icon: '🛣', label: 'Ulice před domem', desc: 'Na vlastní riziko', color: '#94a3b8' },
]

const SLEEP = [
  { value: 'tent', icon: '⛺', label: 'Stan', desc: 'Přineseš si vlastní — místo je' },
  { value: 'roof', icon: '🏠', label: 'Střecha nad hlavou', desc: 'Gauč, karimatka, cokoliv suché' },
  { value: 'room', icon: '🛏', label: 'Pokoj', desc: 'Postel, soukromí, pořádný spánek' },
]

const AMENITIES = [
  { value: 'shower', icon: '🚿', label: 'Sprcha' },
  { value: 'toilet', icon: '🚽', label: 'Záchod' },
  { value: 'kitchen', icon: '🍳', label: 'Kuchyň' },
  { value: 'laundry', icon: '👕', label: 'Pračka' },
  { value: 'electricity', icon: '⚡', label: 'Elektrika' },
  { value: 'wifi', icon: '📶', label: 'WiFi' },
  { value: 'pub_nearby', icon: '🍺', label: 'Hospoda do 10 min' },
  { value: 'breakfast', icon: '☕', label: 'Snídaně' },
  { value: 'dinner', icon: '🍽', label: 'Večeře' },
  { value: 'local_routes', icon: '🗺', label: 'Lokální trasy' },
  { value: 'group_ride', icon: '🏍', label: 'Společná jízda' },
]

const PRICING = [
  { value: 'free', icon: '🤝', label: 'Zdarma', desc: 'Čistá pohostinnost' },
  { value: 'tip', icon: '🙏', label: 'Tip welcome', desc: 'Co dáš, to beru' },
  { value: 'fixed', icon: '💶', label: 'Placené', desc: 'Domluva předem' },
]

interface Location {
  pin: Pin | null
  vehicleTypes: string[]
  parkings: string[]
  sleepTypes: string[]
  amenities: string[]
  maxGuests: number
  pricings: string[]
  notes: string
}

function emptyLocation(): Location {
  return { pin: null, vehicleTypes: [], parkings: [], sleepTypes: [], amenities: [], maxGuests: 2, pricings: ['free'], notes: '' }
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
        vehicleTypes: d.vehicle_types || [],
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
      setSaveError('Klikni na mapu u místa č. 1 a vyber polohu.')
      return
    }
    if (!currentUser) {
      setSaveError('Nejsi přihlášen — přihlaš se a zkus to znovu.')
      return
    }
    setSaving(true)
    try {
      // Smaž stará místa a ulož nová
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
          vehicle_types: l.vehicleTypes,
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
      setSaveError(e?.message || 'Neočekávaná chyba, zkus to znovu.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {locations.map((loc, index) => (
        <View key={index} style={styles.locationCard}>
          {/* Hlavička místa */}
          <View style={styles.locationHeader}>
            <View style={styles.locationBadge}>
              <Text style={styles.locationBadgeText}>MÍSTO {index + 1}</Text>
            </View>
            {locations.length > 1 && (
              <TouchableOpacity onPress={() => removeLocation(index)}>
                <Text style={styles.removeLocation}>✕ Odebrat</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Mapa */}
          <Text style={styles.label}>📍 POLOHA</Text>
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

          {/* Typ vozidla */}
          <Text style={styles.label}>🛞 KOHO VÍTÁM?</Text>
          <View style={styles.chipsWrap}>
            {VEHICLE_TYPES.map(v => {
              const active = loc.vehicleTypes.includes(v.value)
              return (
                <TouchableOpacity
                  key={v.value}
                  style={[styles.chip, active && styles.chipActive]}
                  onPress={() => updateLocation(index, { vehicleTypes: toggle(loc.vehicleTypes, v.value) })}
                >
                  <Text style={styles.chipIcon}>{v.icon}</Text>
                  <Text style={[styles.chipLabel, active && styles.chipLabelActive]}>{v.label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>

          {/* Parkování */}
          <Text style={styles.label}>🅿️ PARKOVÁNÍ</Text>
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

          {/* Spaní */}
          <Text style={styles.label}>🛏 KDE BUDOU SPÁT?</Text>
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

          {/* Vybavení */}
          <Text style={styles.label}>🔧 CO MÁŠ K DISPOZICI?</Text>
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

          {/* Počet hostů */}
          <Text style={styles.label}>👥 MAXIMÁLNÍ POČET JEZDCŮ</Text>
          <View style={styles.counter}>
            <TouchableOpacity style={styles.cBtn} onPress={() => updateLocation(index, { maxGuests: Math.max(1, loc.maxGuests - 1) })}>
              <Text style={styles.cBtnText}>−</Text>
            </TouchableOpacity>
            <Text style={styles.cVal}>{loc.maxGuests}</Text>
            <TouchableOpacity style={styles.cBtn} onPress={() => updateLocation(index, { maxGuests: Math.min(10, loc.maxGuests + 1) })}>
              <Text style={styles.cBtnText}>+</Text>
            </TouchableOpacity>
            <Text style={styles.cDesc}>{loc.maxGuests === 1 ? 'jezdec najednou' : 'jezdci najednou'}</Text>
          </View>

          {/* Cena */}
          <Text style={styles.label}>💰 CO CHCEŠ ZA TO?</Text>
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

          {/* Poznámky */}
          <Text style={styles.label}>✍️ POPIS PRO JEZDCE</Text>
          <TextInput
            style={styles.textarea}
            placeholder={'Co nabízíš? Kde přesně parkovat?\nSprcha, wifi, večeře? Jak tě kontaktovat?'}
            placeholderTextColor="#666"
            value={loc.notes}
            onChangeText={text => updateLocation(index, { notes: text })}
            multiline
            numberOfLines={4}
          />
        </View>
      ))}

      {/* Přidat další místo */}
      <TouchableOpacity style={styles.addBtn} onPress={addLocation}>
        <Text style={styles.addBtnText}>+ PŘIDAT DALŠÍ MÍSTO</Text>
      </TouchableOpacity>

      {saveError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ {saveError}</Text>
        </View>
      ) : null}

      {saveOk ? (
        <View style={styles.successBox}>
          <Text style={styles.successText}>🎉 Jsi na mapě! Nabídka je viditelná pro všechny jezdce.</Text>
          <TouchableOpacity onPress={() => router.replace('/(tabs)/map')} style={styles.backBtn}>
            <Text style={styles.backBtnText}>← Zpět na mapu</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Uložit */}
      <TouchableOpacity style={styles.saveBtn} onPress={save} disabled={saving}>
        {saving
          ? <ActivityIndicator color={C.white} />
          : <Text style={styles.saveBtnText}>🏠 ULOŽIT A JÍT NA MAPU →</Text>
        }
      </TouchableOpacity>

      <Text style={styles.hint}>
        Tvoje nabídka se okamžitě zobrazí na mapě pro všechny registrované jezdce.
      </Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  content: { padding: 20, paddingBottom: 60, gap: 16 },

  locationCard: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 18, gap: 16 },
  locationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  locationBadge: { backgroundColor: C.accent, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 5 },
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
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.elevated, borderRadius: 22, paddingHorizontal: 14, paddingVertical: 9, borderWidth: 1, borderColor: C.border },
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

  addBtn: { borderWidth: 1, borderColor: C.accent, borderRadius: 14, padding: 14, alignItems: 'center', borderStyle: 'dashed' },
  addBtnText: { color: C.accent, fontWeight: '700', fontSize: 14, letterSpacing: 1 },

  saveBtn: { backgroundColor: C.accent, borderRadius: 14, padding: 17, alignItems: 'center', minHeight: 54, justifyContent: 'center' },
  saveBtnText: { color: C.white, fontWeight: '800', fontSize: 15, letterSpacing: 0.5 },
  hint: { color: C.textDim, fontSize: 12, textAlign: 'center', lineHeight: 19 },

  errorBox: { backgroundColor: C.errorSoft, borderWidth: 1, borderColor: C.errorBorder, borderRadius: 12, padding: 14 },
  errorText: { color: C.error, fontSize: 13, lineHeight: 18 },
  successBox: { backgroundColor: C.successSoft, borderWidth: 1, borderColor: C.successBorder, borderRadius: 12, padding: 16, gap: 12 },
  successText: { color: C.success, fontSize: 14, lineHeight: 21 },
  backBtn: { backgroundColor: C.success, borderRadius: 10, padding: 12, alignItems: 'center' },
  backBtnText: { color: C.white, fontWeight: '700', fontSize: 13 },
})
