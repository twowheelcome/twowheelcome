// TWOWHEELCOME — design system
// Rider-to-rider shelter: charcoal, warm cream, burnt orange.
// Green is reserved for status/success only.

export type ThemeColors = { readonly [K in keyof typeof DARK]: string }

const base = {
  // ── Semantic (same across modes) ─────────────────────────────────
  success:       '#4A9E5C',
  successSoft:   '#4A9E5C1F',
  successBorder: '#4A9E5C66',

  error:       '#CB4636',
  errorSoft:   '#CB46361A',
  errorBorder: '#CB463655',

  warning:     '#D08049',
  warningSoft: '#D0804918',
  warningBorder:'#D0804955',

  info:       '#5A8FAE',
  infoSoft:   '#5A8FAE18',
  infoBorder: '#5A8FAE55',

  purple:       '#8A6A8A',
  purpleSoft:   '#8A6A8A18',
  purpleBorder: '#8A6A8A55',

  // ── Road & Trail: green = secondary / open / "trail" ──────────────
  green:       '#3E7D4F',
  greenSoft:   '#3E7D4F18',
  greenBorder: '#3E7D4F55',
  greenDim:    '#2F6240',

  // ── Bike-safety colours (green = safest … red = basic) ────────────
  safe:  '#4A9E5C',
  good:  '#5A8FAE',
  okay:  '#D08049',
  basic: '#CB4636',

  white: '#ffffff',
  black: '#000000',
} as const

export const DARK = {
  ...base,

  // ── Backgrounds ─────────────────────────────────────────────────
  bg:        '#2F3438',
  surface:   '#373D42',
  elevated:  '#42484E',
  sunken:    '#262B2E',
  border:    '#50585F',
  borderMid: '#687178',
  hover:     '#3C4247',

  // ── Map tints ───────────────────────────────────────────────────
  mapBg:    '#20262A',
  mapLand:  '#262C30',
  mapWater: '#1E2A2C',
  mapRoad:  '#3A4248',

  // ── Text ────────────────────────────────────────────────────────
  text:        '#F2EBDD',
  textMuted:   '#C9BFAE',
  textDim:     '#9D9283',
  textFaint:   '#746B60',
  placeholder: '#9D9283',

  // ── Accent — orange (PRIMARY action) ────────────────────────────
  accent:       '#C96E2A',
  accentSoft:   '#C96E2A18',
  accentBorder: '#C96E2A55',

  // ── Legacy aliases (keep shape for existing screens) ──────────────
  forest:       '#2F3438',
  forestSoft:   '#2F343830',
  forestBorder: '#2F343880',

  leather:       '#38404A',
  leatherSoft:   '#38404A18',
  leatherBorder: '#38404A55',

  secondary:       '#7A8A96',
  secondarySoft:   '#7A8A9618',
  secondaryBorder: '#7A8A9655',
} as const

export const LIGHT = {
  ...base,

  // ── Backgrounds (Road & Trail, light) ───────────────────────────
  bg:        '#F7F1E6',
  surface:   '#FBF7EE',
  elevated:  '#FFFFFF',
  sunken:    '#EDE6D6',
  border:    '#DCCFB8',   // hairline
  borderMid: '#C3B79C',
  hover:     '#F0E9DA',

  // ── Map tints ───────────────────────────────────────────────────
  mapBg:    '#E7E0CF',
  mapLand:  '#EDE7D7',
  mapWater: '#D7DBC9',
  mapRoad:  '#C8BCA2',

  // ── Text ────────────────────────────────────────────────────────
  text:        '#2B2C2E',
  textMuted:   '#5E5F63',
  textDim:     '#90897C',
  textFaint:   '#B3AC9E',
  placeholder: '#A39B8C',

  // ── Accent — terracotta (PRIMARY action / "road") ───────────────
  accent:       '#D9621F',
  accentSoft:   '#D9621F18',
  accentBorder: '#D9621F55',

  // ── Legacy aliases ────────────────────────────────────────────────
  forest:       '#F7F1E6',
  forestSoft:   '#F7F1E630',
  forestBorder: '#F7F1E680',

  leather:       '#FFFFFF',
  leatherSoft:   '#FFFFFF18',
  leatherBorder: '#DCCFB855',

  secondary:       '#8A7A6A',
  secondarySoft:   '#8A7A6A18',
  secondaryBorder: '#8A7A6A55',
} as const

// Backward-compat default (dark)
export const C = DARK

// ── Bike-safety scale ─────────────────────────────────────────────
export const SAFETY = {
  locked_garage: { icon: '🔒', label: 'Locked garage',   sub: 'Behind a locked door. Best option for overnight stays.', color: '#C96E2A',    rank: 'Safest' },
  carport:       { icon: '🏠', label: 'Covered parking',  sub: 'Off-street and under cover.',                           color: base.info,    rank: 'Good'   },
  fenced_yard:   { icon: '🚧', label: 'Fenced yard',      sub: 'Behind a gate or fence.',                               color: base.warning, rank: 'Okay'   },
  street:        { icon: '🛣️', label: 'Street parking',    sub: 'Public street parking nearby. Ask about visibility.',   color: base.error,   rank: 'Basic'  },
} as const

// ── Shape & type constants ─────────────────────────────────────────
export const RADIUS = { pill: 100, card: 22, lg: 18, md: 14, sm: 12 } as const
// Oswald = wordmark + headings/labels/buttons (UPPERCASE + tracking). No serif/western.
// Body stays the system sans for readability.
export const FONT = {
  display:  'Oswald_700Bold',   // colour-split wordmark
  head:     'Oswald_600SemiBold',
  headBold: 'Oswald_700Bold',
  headMed:  'Oswald_500Medium',
  body:     'System',
} as const
