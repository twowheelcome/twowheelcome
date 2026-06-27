import { View, Text, StyleSheet } from 'react-native'
import { SAFETY, FONT } from '../lib/theme'
import { useTheme } from '../lib/ThemeContext'
import { SafetyIcon } from './SafetyIcon'

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
  const order: (keyof typeof SAFETY)[] = ['locked_garage', 'carport', 'fenced_yard', 'street']
  const keys = [...new Set(parkings.map(getSafetyKey))]
  const best = order.find(k => keys.includes(k)) ?? 'street'
  const s = SAFETY[best]
  const secondary = order.filter(k => k !== best && keys.includes(k))

  return (
    <View style={[sb.block, { backgroundColor: s.color + '10', borderColor: s.color + '66' }]}>
      <Text style={[sb.bikeLabel, { color: s.color }]}>Your bike sleeps here</Text>
      <View style={sb.mainRow}>
        <View style={sb.iconWrap}><SafetyIcon level={best} size={26} color={s.color} strokeWidth={2.2} /></View>
        <View style={sb.info}>
          <View style={sb.labelRow}>
            <Text style={[sb.label, { color: s.color }]}>{s.label}</Text>
            <View style={[sb.rankPill, { borderColor: s.color + '70', backgroundColor: s.color + '18' }]}>
              <Text style={[sb.rankText, { color: s.color }]}>{s.rank}</Text>
            </View>
          </View>
          <Text style={[sb.sub, { color: C.textMuted }]}>{s.sub}</Text>
        </View>
      </View>
      {secondary.length > 0 && (
        <View style={[sb.secondaryRow, { borderTopColor: C.border }]}>
          {/* Other parking the host also has — shown muted/neutral so they don't compete
              with the headline level. One place = one clear level at a glance. */}
          <Text style={[sb.alsoLabel, { color: C.textDim }]}>Also here:</Text>
          {secondary.map(k => (
            <View key={k} style={[sb.chip, { borderColor: C.border, backgroundColor: C.elevated }]}>
              <SafetyIcon level={k} size={13} color={C.textDim} strokeWidth={2} />
              <Text style={[sb.chipText, { color: C.textDim }]}>{SAFETY[k].label}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  )
}

const sb = StyleSheet.create({
  block:        { borderRadius: 20, borderWidth: 1.5, padding: 16 },
  bikeLabel:    { fontSize: 10, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 10 },
  mainRow:      { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  iconWrap:     { marginTop: 1 },
  info:         { flex: 1, gap: 4 },
  labelRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  label:        { fontSize: 16, fontWeight: '800' },
  rankPill:     { borderRadius: 100, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  rankText:     { fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  sub:          { fontSize: 13, lineHeight: 19, fontFamily: FONT.body },
  secondaryRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1 },
  alsoLabel:    { fontSize: 11, fontWeight: '700', marginRight: 2 },
  chip:         { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 100, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 4 },
  chipText:     { fontSize: 11, fontWeight: '600' },
})
