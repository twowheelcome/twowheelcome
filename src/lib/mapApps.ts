import { Feather } from '@expo/vector-icons'
import { Linking, Platform } from 'react-native'
import { showToast } from './toastStore'

export type MapApp = {
  key: string
  label: string
  icon: keyof typeof Feather.glyphMap
  url: (lat: number, lng: number) => string
}

// The map apps offered in the navigation picker. The SAME list backs both navigate
// buttons (the approximate-area one and the exact "Address unlocked" point) — only the
// coordinates passed in differ. Each builds a destination/point deep link; opened in a
// new tab on web, via Linking on native.
export const MAP_APPS: MapApp[] = [
  { key: 'google', label: 'Google Maps', icon: 'navigation', url: (lat, lng) => `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}` },
  { key: 'waze', label: 'Waze', icon: 'navigation', url: (lat, lng) => `https://waze.com/ul?ll=${lat},${lng}&navigate=yes` },
  // Mapy.cz documented URL (new fnc API). Note the lon,lat order; shows a marker at the
  // point — no origin needed, the rider routes from there in-app.
  { key: 'mapycz', label: 'Mapy.cz', icon: 'map-pin', url: (lat, lng) => `https://mapy.com/fnc/v1/showmap?center=${lng},${lat}&zoom=16&marker=true` },
  { key: 'osmand', label: 'OsmAnd', icon: 'map', url: (lat, lng) => `https://osmand.net/map?pin=${lat},${lng}#16/${lat}/${lng}` },
  // 5th slot — Sygic — parked pending confirmation. Sygic has no clean web deep link
  // (only the native `com.sygic.aura://coordinate|LNG|LAT|drive` scheme, app-only).
  // To enable, add the entry here:
  // { key: 'sygic', label: 'Sygic', icon: 'navigation', url: (lat, lng) => `com.sygic.aura://coordinate|${lng}|${lat}|drive` },
]

export function openMapApp(url: string) {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer')
  } else {
    void Linking.openURL(url)
  }
}

// Copy coordinates to the clipboard (web). Native has no built-in clipboard without an
// extra dependency, so it falls back to showing the value in the toast.
export function copyCoords(lat: number, lng: number) {
  const text = `${lat}, ${lng}`
  if (Platform.OS === 'web' && typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => showToast('Copied')).catch(() => showToast("Couldn't copy"))
  } else {
    showToast(text)
  }
}
