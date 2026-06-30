import { useMemo, useRef, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
import { FONT } from '../lib/theme'
import type { Pin } from './LocationPicker'
import { districtFromAddress } from '../lib/placeName'

// Inline address/city geocoder — type an address, pick a result, drop the pin.
// Same Nominatim source as the map picker, so a host can set a spot by address
// (works on web and native, even where the inline map preview isn't interactive).
interface Result {
  display_name: string
  lat: string
  lon: string
  address?: { city?: string; town?: string; village?: string; county?: string; country_code?: string; suburb?: string; neighbourhood?: string; city_district?: string; quarter?: string; borough?: string; district?: string }
}

async function searchAddress(query: string): Promise<Result[]> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=5&addressdetails=1`
    )
    return await res.json()
  } catch {
    return []
  }
}

export function AddressSearch({ onPick }: { onPick: (pin: Pin) => void }) {
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [searching, setSearching] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onChange(value: string) {
    setQuery(value)
    if (timer.current) clearTimeout(timer.current)
    if (!value.trim()) { setResults([]); return }
    timer.current = setTimeout(async () => {
      setSearching(true)
      setResults(await searchAddress(value))
      setSearching(false)
    }, 400)
  }

  function pick(r: Result) {
    const a = r.address || {}
    onPick({
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      city: a.city || a.town || a.village || a.county || '',
      country: a.country_code?.toUpperCase() || '',
      district: districtFromAddress(a),
    })
    setQuery(r.display_name.split(',').slice(0, 2).join(','))
    setResults([])
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.inputRow}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.input}
          placeholder="Search an address or city…"
          placeholderTextColor={C.placeholder}
          value={query}
          onChangeText={onChange}
          autoCorrect={false}
        />
        {searching ? <ActivityIndicator size="small" color={C.accent} style={{ marginRight: 10 }} /> : null}
        {query && !searching ? (
          <TouchableOpacity onPress={() => { setQuery(''); setResults([]) }} hitSlop={8}>
            <Text style={styles.clear}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      {results.length > 0 ? (
        <View style={styles.results}>
          {results.map((r, i) => (
            <TouchableOpacity key={i} style={[styles.resultRow, i > 0 && styles.resultBorder]} onPress={() => pick(r)}>
              <Text style={styles.resultText} numberOfLines={2}>{r.display_name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}
    </View>
  )
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    wrap: { gap: 0 },
    inputRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.elevated, borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 12 },
    searchIcon: { fontSize: 14, marginRight: 8, color: C.textFaint },
    input: { flex: 1, color: C.text, fontSize: 16, paddingVertical: 12, fontFamily: FONT.body },
    clear: { color: C.textFaint, fontSize: 14, paddingHorizontal: 4 },
    results: { marginTop: 6, backgroundColor: C.elevated, borderRadius: 12, borderWidth: 1, borderColor: C.borderMid, overflow: 'hidden' },
    resultRow: { paddingHorizontal: 14, paddingVertical: 11 },
    resultBorder: { borderTopWidth: 1, borderTopColor: C.border },
    resultText: { color: C.text, fontSize: 13, lineHeight: 18, fontFamily: FONT.body },
  })
}
