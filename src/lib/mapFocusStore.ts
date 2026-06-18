// A one-shot request to centre the in-app Map on a specific point (e.g. the exact
// meeting point shared in an accepted chat). Set right before navigating to the Map
// tab; the Map screen consumes it on focus. Same rationale as pendingChatStore: the
// Map tab stays mounted across tab switches, so a module store + useFocusEffect is
// more reliable than a route param.
//
// Only ever set this with coordinates the user is allowed to see — i.e. the exact
// meeting point AFTER a request is accepted. Approximate listing pins on the map are
// already coarse (rounded view + fuzzed marker); never pass exact GPS pre-acceptance.

export type MapFocus = { lat: number; lng: number; label?: string }

let _focus: MapFocus | null = null

export const mapFocusStore = {
  set(f: MapFocus) { _focus = f },
  consume(): MapFocus | null { const v = _focus; _focus = null; return v },
}
