// Public-facing name of a place: "[parking type] in [city] ([district])" (e.g.
// "Garage in Prague (Smíchov)"). City + district are coarser than the already-public
// ~1km coords, so nothing precise leaks; only the exact street/coords stay private.
// Falls back to the parking type alone when the city is missing, then to "Place N".

// Experimental: the (district) chip. Flip to false to drop it everywhere in one place.
export const SHOW_DISTRICT = true

type PlaceLike = {
  parkings?: string[] | null
  parking?: string | null
  location_city?: string | null
  location_country?: string | null
  location_district?: string | null
}

const PARK_TITLE: Record<string, string> = {
  garage_locked: 'Garage', locked_garage: 'Garage',
  carport: 'Carport',
  yard: 'Yard', fenced_yard: 'Yard',
  street: 'Street spot',
}

function primaryParking(loc: PlaceLike): string | undefined {
  return loc.parkings?.length ? loc.parkings[0] : (loc.parking ?? undefined)
}

// "Prague (Smíchov)" — the city with the optional experimental district chip.
function cityPart(loc: PlaceLike): string | null {
  const city = loc.location_city?.trim() || null
  if (!city) return null
  const district = SHOW_DISTRICT ? (loc.location_district?.trim() || null) : null
  return district ? `${city} (${district})` : city
}

export function placeName(loc: PlaceLike, index?: number): string {
  const p = primaryParking(loc)
  const type = (p && PARK_TITLE[p]) || null
  const city = cityPart(loc)
  if (type) return city ? `${type} in ${city}` : type
  if (city) return city
  return index != null ? `Place ${index}` : 'Place'
}

// "Garage in Prague (Smíchov), CZ" — the map/My Places name plus the country code. For the
// Messages list and chat header, where the place isn't shown anywhere nearby.
export function placeNameWithCountry(loc: PlaceLike, index?: number): string {
  const base = placeName(loc, index)
  const country = loc.location_country?.trim() || null
  return country ? `${base}, ${country}` : base
}

// "Prague (Smíchov), CZ" — city (+ district) + country code only, for places where the
// parking/safety is already shown on its own row (request cards, the accepted-stay recap).
export function cityCountry(loc: PlaceLike): string {
  const country = loc.location_country?.trim() || null
  return [cityPart(loc), country].filter(Boolean).join(', ')
}

// Appends the place rating as "★4.8" when present, e.g. "Garage in Prague, CZ ★4.8".
export function withRating(label: string, rating: number | null | undefined): string {
  return rating != null ? `${label} ★${rating.toFixed(1)}` : label
}

// Coarse area name from a Nominatim address object — the suburb/neighbourhood, never the
// street. Used when geocoding a listing so the public surface can show "(Smíchov)".
export function districtFromAddress(address: Record<string, unknown> | null | undefined): string {
  if (!address) return ''
  const a = address as Record<string, string | undefined>
  // Only genuine sub-city areas (a neighbourhood/quarter), never the administrative county.
  // Nominatim's `district`/`borough` map to "okres …" in CZ — too coarse for a place label,
  // so they're excluded; small towns simply get no district (better than a county name).
  const d = (a.suburb || a.neighbourhood || a.quarter || a.city_district || '').trim()
  return /^okres\b/i.test(d) ? '' : d
}
