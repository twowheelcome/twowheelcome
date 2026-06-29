// Public-facing name of a place: "[parking type] in [city]" (e.g. "Garage in Guímar").
// City is public; only the precise street/coords stay private. Falls back to the parking
// type alone when the city is missing, then to "Place N" for disambiguation.
type PlaceLike = { parkings?: string[] | null; parking?: string | null; location_city?: string | null }

const PARK_TITLE: Record<string, string> = {
  garage_locked: 'Garage', locked_garage: 'Garage',
  carport: 'Carport',
  yard: 'Yard', fenced_yard: 'Yard',
  street: 'Street spot',
}

function primaryParking(loc: PlaceLike): string | undefined {
  return loc.parkings?.length ? loc.parkings[0] : (loc.parking ?? undefined)
}

export function placeName(loc: PlaceLike, index?: number): string {
  const p = primaryParking(loc)
  const type = (p && PARK_TITLE[p]) || null
  const city = loc.location_city?.trim() || null
  if (type) return city ? `${type} in ${city}` : type
  if (city) return city
  return index != null ? `Place ${index}` : 'Place'
}
