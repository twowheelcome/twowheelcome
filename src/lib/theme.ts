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

  white: '#ffffff',
  black: '#000000',
} as const

export const DARK = {
  ...base,

  // ── Backgrounds ─────────────────────────────────────────────────
  bg:        '#2F3438',
  surface:   '#373D42',
  elevated:  '#42484E',
  border:    '#50585F',
  borderMid: '#687178',
  hover:     '#3C4247',

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

  // ── Backgrounds ─────────────────────────────────────────────────
  bg:        '#F2EBDD',
  surface:   '#E8DFCE',
  elevated:  '#FFF8EA',
  border:    '#D4C5AA',
  borderMid: '#BDAE93',
  hover:     '#ECE2D1',

  // ── Text ────────────────────────────────────────────────────────
  text:        '#2F3438',
  textMuted:   '#64605A',
  textDim:     '#8E8577',
  textFaint:   '#B8AD9C',
  placeholder: '#9A907F',

  // ── Accent — orange (PRIMARY action) ────────────────────────────
  accent:       '#C96E2A',
  accentSoft:   '#C96E2A18',
  accentBorder: '#C96E2A55',

  // ── Legacy aliases ────────────────────────────────────────────────
  forest:       '#F2EBDD',
  forestSoft:   '#F2EBDD30',
  forestBorder: '#F2EBDD80',

  leather:       '#FFF8EA',
  leatherSoft:   '#FFF8EA18',
  leatherBorder: '#FFF8EA55',

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
export const FONT = {
  display: 'System',
  head:    'System',
  body:    'System',
} as const
