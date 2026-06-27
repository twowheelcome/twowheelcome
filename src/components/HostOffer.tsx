import { View, Text, StyleSheet } from 'react-native'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
import { ListingGallery } from './ListingGallery'
import { ContributionBadge } from './ContributionBadge'

// The host's full public offer (everything except parking, which SafetyBlock shows on its
// own). Fed from host_locations_public — public fields only, never the exact address/GPS.
const SLEEP_LABELS: Record<string, string> = { tent: 'Tent space', roof: 'Roof over head', room: 'Private room' }
const VEHICLE_LABELS: Record<string, string> = { moto: 'Motorcycle', car: 'Car', bicycle: 'Bicycle', van: 'Van', scooter: 'Scooter' }
const AMENITY_ICON: Record<string, string> = {
  shower: '🚿', toilet: '🚽', kitchen: '🍳', laundry: '👕', electricity: '⚡', wifi: '📶',
  pub_nearby: '🍺',
}
const AMENITY_LABELS: Record<string, string> = {
  shower: 'Shower', toilet: 'Toilet', kitchen: 'Kitchen', laundry: 'Laundry', electricity: 'Power',
  wifi: 'WiFi', pub_nearby: 'Pub nearby',
}

type OfferLoc = {
  sleep_types?: string[] | null
  amenities?: string[] | null
  pricings?: string[] | null
  pricing?: string | null
  vehicle_types?: string[] | null
  notes?: string | null
  photos?: string[] | null
  price_amount?: number | null
  price_currency?: string | null
}

function mapLabels(values: string[], labels: Record<string, string>): string {
  // Drop values we no longer have a label for (retired amenities), no raw fallthrough.
  return values.filter(v => labels[v]).map(v => labels[v]).join(' · ')
}

export function HostOffer({ loc }: { loc: OfferLoc }) {
  const C = useTheme()
  const s = makeStyles(C)
  const sleep = loc.sleep_types ?? []
  // Only amenities we still offer (retired options in old data are dropped, not shown raw).
  const amenities = (loc.amenities ?? []).filter(a => AMENITY_LABELS[a])
  const pricings = loc.pricings?.length ? loc.pricings : (loc.pricing ? [loc.pricing] : [])
  const vehicles = loc.vehicle_types ?? []
  const notes = loc.notes?.trim()
  const photos = loc.photos ?? []

  if (!sleep.length && !amenities.length && !pricings.length && !vehicles.length && !notes && !photos.length) return null

  return (
    <View style={s.wrap}>
      <Text style={s.title}>WHAT THIS HOST OFFERS</Text>
      <ListingGallery photos={photos} />
      {sleep.length > 0 && (
        <View style={s.row}><Text style={s.icon}>🛏</Text><Text style={s.value}>{mapLabels(sleep, SLEEP_LABELS)}</Text></View>
      )}
      {pricings.length > 0 && (
        <ContributionBadge loc={loc} />
      )}
      {pricings.includes('fixed') && loc.price_amount != null && (
        <Text style={s.priceHint}>Indicative — the exact amount and currency are up to you two in chat (local cash is fine).</Text>
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
    priceHint: { color: C.textDim, fontSize: 12, lineHeight: 17, marginTop: -4 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    chip: { borderRadius: 100, borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, paddingHorizontal: 9, paddingVertical: 4 },
    chipText: { color: C.textMuted, fontSize: 12, fontWeight: '600' },
  })
}
