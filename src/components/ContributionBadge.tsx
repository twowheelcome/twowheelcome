import { useMemo } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
import { FONT } from '../lib/theme'

// Prominent contribution badges (Free / Beer welcome / Paid + amount) — what the host
// wants in return, legible at a glance on cards and detail. One badge per chosen option.
type Loc = {
  pricings?: string[] | null
  pricing?: string | null
  price_amount?: number | null
  price_currency?: string | null
}

export function ContributionBadge({ loc, compact = false }: { loc: Loc; compact?: boolean }) {
  const C = useTheme()
  const s = useMemo(() => makeStyles(C), [C])
  const pricings = loc.pricings?.length ? loc.pricings : (loc.pricing ? [loc.pricing] : ['free'])

  const items: { key: string; icon: string; label: string; color: string; bg: string; border: string }[] = []
  if (pricings.includes('free')) {
    items.push({ key: 'free', icon: '🤝', label: 'Free', color: C.green, bg: C.greenSoft, border: C.greenBorder })
  }
  if (pricings.includes('tip')) {
    items.push({ key: 'tip', icon: '🍺', label: 'Beer welcome', color: C.info, bg: C.infoSoft, border: C.infoBorder })
  }
  if (pricings.includes('fixed')) {
    const amt = loc.price_amount != null ? `${loc.price_amount} ${loc.price_currency || 'EUR'}` : null
    items.push({ key: 'fixed', icon: '💶', label: amt ? `Paid · ${amt}` : 'Paid', color: C.accent, bg: C.accentSoft, border: C.accentBorder })
  }
  if (!items.length) return null

  return (
    <View style={s.row}>
      {items.map(it => (
        <View key={it.key} style={[s.badge, compact && s.badgeCompact, { backgroundColor: it.bg, borderColor: it.border }]}>
          <Text style={[s.icon, compact && s.iconCompact]}>{it.icon}</Text>
          <Text style={[s.label, compact && s.labelCompact, { color: it.color }]}>{it.label}</Text>
        </View>
      ))}
    </View>
  )
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    badge: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      borderRadius: 100, borderWidth: 1.5,
      paddingHorizontal: 13, paddingVertical: 7,
    },
    badgeCompact: { paddingHorizontal: 10, paddingVertical: 4, gap: 4 },
    icon: { fontSize: 15 },
    iconCompact: { fontSize: 12 },
    label: { fontSize: 13, fontWeight: '800', letterSpacing: 0.3, fontFamily: FONT.body },
    labelCompact: { fontSize: 11, fontWeight: '700' },
  })
}
