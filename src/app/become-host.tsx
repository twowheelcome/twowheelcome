import { useEffect, useState } from 'react'
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, ActivityIndicator, Platform, ViewStyle } from 'react-native'
import { supabase } from '../lib/supabase'
import { router } from 'expo-router'
import type { Pin } from '../components/LocationPicker'

const PARKING = [
  { value: 'garage_locked', icon: '🔒', label: 'Uzamčená garáž', desc: 'Fort Knox — nejlepší ochrana', color: '#22c55e' },
  { value: 'carport', icon: '🔐', label: 'Přístřešek za plotem', desc: 'Krytý a za plotem', color: '#3b82f6' },
  { value: 'yard', icon: '🛡', label: 'Dvůr za plotem', desc: 'Bezpečný dvůr', color: '#e8631a' },
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
  parking: string
  sleepTypes: string[]
  amenities: string[]
  availableFrom: string
  availableTo: string
  maxGuests: number
  pricing: string
  notes: string
}

function emptyLocation(): Location {
  return { pin: null, parking: 'yard', sleepTypes: [], amenities: [], availableFrom: '', availableTo: '', maxGuests: 2, pricing: 'free', notes: '' }
}

function toggle(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value]
}

function DateInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  if (Platform.OS === 'web') {
    return (
      <input
        type="date"
        value={value}
        onChange={e => onChange((e.target as HTMLInputElement).value)}
        placeholder={placeholder}
        style={{
          flex: 1,
          backgroundColor: '#2d2d2d',
          border: '1px solid #333',
          borderRadius: 10,
          padding: '12px 14px',
          color: value ? '#eee' : '#555',
          fontSize: 14,
          colorScheme: 'dark',
          outline: 'none',
        } as React.CSSProperties}
      />
    )
  }
  return (
    <TextInput
      style={styles.dateInput}
      placeholder={placeholder}
      placeholderTextColor="#555"
      value={value}
      onChangeText={onChange}
      keyboardType="numbers-and-punctuation"
    />
  )
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
        parking: d.parking || 'yard',
        sleepTypes: d.sleep_types || [],
        amenities: d.amenities || [],
        availableFrom: d.available_from || '',
        availableTo: d.available_to || '',
        maxGuests: d.max_guests || 2,
        pricing: d.pricing || 'free',
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
          parking: l.parking,
          sleep_types: l.sleepTypes,
          amenities: l.amenities,
          available_from: l.availableFrom || null,
          available_to: l.availableTo || null,
          max_guests: l.maxGuests,
          pricing: l.pricing,
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
              : <View style={styles.mapLoading}><ActivityIndicator color="#e8631a" /></View>
            }
          </View>

          {/* Parkování */}
          <Text style={styles.label}>🏍 PARKOVÁNÍ PRO MOTORKY</Text>
          {PARKING.map(p => (
            <TouchableOpacity
              key={p.value}
              style={[styles.optCard, loc.parking === p.value && { borderColor: p.color, backgroundColor: p.color + '12' }]}
              onPress={() => updateLocation(index, { parking: p.value })}
            >
              <Text style={styles.optIcon}>{p.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.optLabel, loc.parking === p.value && { color: p.color }]}>{p.label}</Text>
                <Text style={styles.optDesc}>{p.desc}</Text>
              </View>
              {loc.parking === p.value && <Text style={[styles.check, { color: p.color }]}>✓</Text>}
            </TouchableOpacity>
          ))}

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

          {/* Dostupnost */}
          <Text style={styles.label}>📅 KDY JSI DOMA?</Text>
          <Text style={styles.availHint}>Nech prázdné = kdykoli. Vyplň jen když přijíždíš nebo odjíždíš.</Text>
          <View style={styles.dateRow}>
            <View style={styles.dateFld}>
              <Text style={styles.dateLabel}>OD</Text>
              <DateInput
                value={loc.availableFrom}
                onChange={v => updateLocation(index, { availableFrom: v })}
                placeholder="rrrr-mm-dd"
              />
            </View>
            <View style={styles.dateFld}>
              <Text style={styles.dateLabel}>DO</Text>
              <DateInput
                value={loc.availableTo}
                onChange={v => updateLocation(index, { availableTo: v })}
                placeholder="rrrr-mm-dd"
              />
            </View>
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
            {PRICING.map(p => (
              <TouchableOpacity
                key={p.value}
                style={[styles.pCard, loc.pricing === p.value && styles.pCardActive]}
                onPress={() => updateLocation(index, { pricing: p.value })}
              >
                <Text style={styles.pIcon}>{p.icon}</Text>
                <Text style={[styles.pLabel, loc.pricing === p.value && styles.pLabelActive]}>{p.label}</Text>
                <Text style={styles.pDesc}>{p.desc}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Poznámky */}
          <Text style={styles.label}>✍️ POPIS PRO JEZDCE</Text>
          <TextInput
            style={styles.textarea}
            placeholder={'Co nabízíš? Kde přesně parkovat?\nSprcha, wifi, večeře? Jak tě kontaktovat?'}
            placeholderTextColor="#444"
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
          ? <ActivityIndicator color="#fff" />
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
  container: { flex: 1, backgroundColor: '#1a1a1a' },
  content: { padding: 20, paddingBottom: 60, gap: 16 },

  locationCard: { backgroundColor: '#222', borderRadius: 14, borderWidth: 1, borderColor: '#333', padding: 16, gap: 14 },
  locationHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  locationBadge: { backgroundColor: '#e8631a', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 4 },
  locationBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800', letterSpacing: 1.5 },
  removeLocation: { color: '#555', fontSize: 13 },

  label: { color: '#777', fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase' },
  pinLabel: { color: '#e8631a', fontSize: 13, fontWeight: '600', marginTop: -8 },

  mapWrap: { height: 220, borderRadius: 10, overflow: 'hidden', borderWidth: 1, borderColor: '#333' },
  mapLoading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#2d2d2d' },

  optCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#2d2d2d', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#333', gap: 12 },
  optIcon: { fontSize: 22, width: 32, textAlign: 'center' },
  optLabel: { color: '#eee', fontWeight: '700', fontSize: 14 },
  optDesc: { color: '#888', fontSize: 12, marginTop: 2 },
  check: { fontSize: 18, fontWeight: '900' },

  optCardSleep: { borderColor: '#a855f7', backgroundColor: '#a855f712' },
  optLabelSleep: { color: '#a855f7' },
  checkSleep: { fontSize: 18, fontWeight: '900', color: '#a855f7' },

  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#2d2d2d', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#333' },
  chipActive: { borderColor: '#e8631a', backgroundColor: '#e8631a15' },
  chipIcon: { fontSize: 15 },
  chipLabel: { color: '#666', fontSize: 13, fontWeight: '600' },
  chipLabelActive: { color: '#e8631a' },

  counter: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 4 },
  cBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#2d2d2d', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#333' },
  cBtnText: { color: '#eee', fontSize: 22, fontWeight: '700', lineHeight: 26 },
  cVal: { color: '#eee', fontSize: 32, fontWeight: '900', minWidth: 40, textAlign: 'center' },
  cDesc: { color: '#888', fontSize: 13 },

  pricingRow: { flexDirection: 'row', gap: 8 },
  pCard: { flex: 1, backgroundColor: '#2d2d2d', borderRadius: 10, padding: 12, borderWidth: 1, borderColor: '#333', alignItems: 'center', gap: 4 },
  pCardActive: { borderColor: '#e8631a', backgroundColor: '#e8631a15' },
  pIcon: { fontSize: 24 },
  pLabel: { color: '#666', fontSize: 12, fontWeight: '700' },
  pLabelActive: { color: '#e8631a' },
  pDesc: { color: '#777', fontSize: 10, textAlign: 'center' },

  textarea: { backgroundColor: '#2d2d2d', borderRadius: 10, padding: 14, color: '#eee', fontSize: 14, borderWidth: 1, borderColor: '#333', minHeight: 110, textAlignVertical: 'top', lineHeight: 20 },

  addBtn: { borderWidth: 1, borderColor: '#e8631a', borderRadius: 12, padding: 14, alignItems: 'center', borderStyle: 'dashed' },
  addBtnText: { color: '#e8631a', fontWeight: '700', fontSize: 14, letterSpacing: 1 },

  saveBtn: { backgroundColor: '#e8631a', borderRadius: 12, padding: 16, alignItems: 'center', minHeight: 52, justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15, letterSpacing: 0.5 },
  hint: { color: '#666', fontSize: 12, textAlign: 'center', lineHeight: 18 },

  availHint: { color: '#777', fontSize: 12, lineHeight: 17, marginTop: -8 },
  dateRow: { flexDirection: 'row', gap: 10 },
  dateFld: { flex: 1, gap: 6 },
  dateLabel: { color: '#777', fontSize: 10, fontWeight: '700', letterSpacing: 1.5 },
  dateInput: { backgroundColor: '#2d2d2d', borderRadius: 10, padding: 14, color: '#eee', fontSize: 14, borderWidth: 1, borderColor: '#333' },
  errorBox: { backgroundColor: '#ef444415', borderWidth: 1, borderColor: '#ef444450', borderRadius: 10, padding: 14 },
  errorText: { color: '#ef4444', fontSize: 13, lineHeight: 18 },
  successBox: { backgroundColor: '#22c55e15', borderWidth: 1, borderColor: '#22c55e50', borderRadius: 10, padding: 16, gap: 12 },
  successText: { color: '#22c55e', fontSize: 14, lineHeight: 20 },
  backBtn: { backgroundColor: '#22c55e', borderRadius: 8, padding: 12, alignItems: 'center' },
  backBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
})
