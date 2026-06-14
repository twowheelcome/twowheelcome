import { View, Text, StyleSheet } from 'react-native'
import { SAFETY } from '../lib/theme'
import { useTheme } from '../lib/ThemeContext'

export function getSafetyKey(parking: string): keyof typeof SAFETY {
  const map: Record<string, keyof typeof SAFETY> = {
    garage_locked: 'locked_garage',
    locked_garage: 'locked_garage',
    carport:       'carport',
    yard:          'fenced_yard',
    fenced_yard:   'fenced_yard',
    street:        'street',
  }
  return map[parking] ?? 'street'
}

export function bestSafety(parkings: string[]): keyof typeof SAFETY {
  const order: (keyof typeof SAFETY)[] = ['locked_garage', 'carport', 'fenced_yard', 'street']
  const keys = parkings.map(getSafetyKey)
  return order.find(k => keys.includes(k)) ?? 'street'
}

export function SafetyBlock({ parkings }: { parkings: string[] }) {
  const C = useTheme()
  const s = SAFETY[bestSafety(parkings)]
  return (
    <View style={[sb.block, { backgroundColor: s.color + '1F', borderColor: s.color + '70' }]}>
      <Text style={sb.icon}>{s.icon}</Text>
      <View style={sb.info}>
        <View style={sb.labelRow}>
          <Text style={[sb.label, { color: s.color }]}>{s.label.toUpperCase()}</Text>
          <View style={[sb.rankPill, { borderColor: s.color + '70' }]}>
            <Text style={[sb.rankText, { color: s.color }]}>{s.rank}</Text>
          </View>
        </View>
        <Text style={[sb.sub, { color: C.textDim }]}>{s.sub}</Text>
        <Text style={[sb.parking, { color: C.textFaint }]}>🏍 parking</Text>
      </View>
    </View>
  )
}

const sb = StyleSheet.create({
  block:    { borderRadius: 14, borderWidth: 1, padding: 12, flexDirection: 'row', gap: 10, alignItems: 'flex-start', marginTop: 8 },
  icon:     { fontSize: 22, marginTop: 2 },
  info:     { flex: 1, gap: 2 },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  label:    { fontSize: 13, fontWeight: '700', letterSpacing: 0.5, fontFamily: 'Oswald_700Bold' },
  rankPill: { borderRadius: 100, borderWidth: 1, paddingHorizontal: 7, paddingVertical: 2 },
  rankText: { fontSize: 11, fontWeight: '600' },
  sub:      { fontSize: 12, marginTop: 1 },
  parking:  { fontSize: 11, marginTop: 2 },
})
