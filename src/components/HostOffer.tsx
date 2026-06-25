import { View, Text, StyleSheet } from 'react-native'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'

// The host's full public offer (everything except parking, which SafetyBlock shows on its
// own). Fed from host_locations_public — public fields only, never the exact address/GPS.
const SLEEP_LABELS: Record<string, string> = { tent: 'Tent space', roof: 'Roof over head', room: 'Private room' }
const PRICING_LABELS: Record<string, string> = { free: 'Free', tip: 'Tip welcome', fixed: 'Paid' }
const VEHICLE_LABELS: Record<string, string> = { moto: 'Motorcycle', car: 'Car', bicycle: 'Bicycle', van: 'Van', scooter: 'Scooter' }
const AMENITY_ICON: Record<string, string> = {
  shower: '🚿', toilet: '🚽', kitchen: '🍳', laundry: '👕', electricity: '⚡', wifi: '📶',
  pub_nearby: '🍺', breakfast: '☕', dinner: '🍽', local_routes: '🗺', group_ride: '🏍',
}
const AMENITY_LABELS: Record<string, string> = {
  shower: 'Shower', toilet: 'Toilet', kitchen: 'Kitchen', laundry: 'Laundry', electricity: 'Power',
  wifi: 'WiFi', pub_nearby: 'Pub nearby', breakfast: 'Breakfast', dinner: 'Dinner',
  local_routes: 'Local routes', group_ride: 'Group ride',
}

type OfferLoc = {
  sleep_types?: string[] | null
  amenities?: string[] | null
  pricings?: string[] | null
  pricing?: string | null
  vehicle_types?: string[] | null
  notes?: string | null
}

function mapLabels(values: string[], labels: Record<string, string>): string {
  return values.map(v => labels[v] || v).join(' · ')
}

export function HostOffer({ loc }: { loc: OfferLoc }) {
  const C = useTheme()
  const s = makeStyles(C)
  const sleep = loc.sleep_types ?? []
  const amenities = loc.amenities ?? []
  const pricings = loc.pricings?.length ? loc.pricings : (loc.pricing ? [loc.pricing] : [])
  const vehicles = loc.vehicle_types ?? []
  const notes = loc.notes?.trim()

  if (!sleep.length && !amenities.length && !pricings.length && !vehicles.length && !notes) return null

  return (
    <View style={s.wrap}>
      <Text style={s.title}>WHAT THIS HOST OFFERS</Text>
      {sleep.length > 0 && (
        <View style={s.row}><Text style={s.icon}>🛏</Text><Text style={s.value}>{mapLabels(sleep, SLEEP_LABELS)}</Text></View>
      )}
      {pricings.length > 0 && (
        <View style={s.row}><Text style={s.icon}>💶</Text><Text style={s.value}>{mapLabels(pricings, PRICING_LABELS)}</Text></View>
      )}
      {vehicles.length > 0 && (
        <View style={s.row}><Text style={s.icon}>🏍</Text><Text style={s.value}>{mapLabels(vehicles, VEHICLE_LABELS)}</Text></View>
      )}
      {amenities.length > 0 && (
        <View style={s.chips}>
          {amenities.map(a => (
            <View key={a} style={s.chip}>
              <Text style={s.chipText}>{AMENITY_ICON[a] || '•'} {AMENITY_LABELS[a] || a}</Text>
            </View>
          ))}
        </View>
      )}
      {notes ? (
        <View style={s.row}><Text style={s.icon}>📝</Text><Text style={s.value}>{notes}</Text></View>
      ) : null}
    </View>
  )
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    wrap: { backgroundColor: C.surface, borderRadius: 16, borderWidth: 1, borderColor: C.border, padding: 14, gap: 9 },
    title: { color: C.textMuted, fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
    row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    icon: { fontSize: 15, width: 20, textAlign: 'center' },
    value: { flex: 1, color: C.text, fontSize: 14, lineHeight: 20 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { borderRadius: 100, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, paddingHorizontal: 9, paddingVertical: 4 },
    chipText: { color: C.textMuted, fontSize: 12, fontWeight: '600' },
  })
}
