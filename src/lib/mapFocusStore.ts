// A one-shot request to centre the in-app Map on a point, used when navigating to
// the Map tab from another tab (e.g. a chat's "Show on map"). The Map tab stays
// mounted across tab switches, so a module store consumed in useFocusEffect (which
// fires on every focus) is more reliable than a route param.
//
// Only ever set this with an APPROXIMATE location (rounded + fuzzed coords) — the
// same coarse point the map already shows. Never pass exact GPS.

export type MapFocus = { lat: number; lng: number }

let _focus: MapFocus | null = null

export const mapFocusStore = {
  set(f: MapFocus) { _focus = f },
  consume(): MapFocus | null { const v = _focus; _focus = null; return v },
}
