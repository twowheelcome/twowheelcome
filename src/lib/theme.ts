// TWOWHEELCOME — design system
// Two modes: DARK (#2F3438 base) + LIGHT (#F7F1E6 base)
// Accent orange: #C96E2A (dark) / #E06A23 (light)

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

  // Buddy pin — host you've stayed with and rated (gold, both modes)
  buddy:       '#E0A23C',
  buddySoft:   '#E0A23C1F',
  buddyBorder: '#E0A23C66',

  white: '#ffffff',
  black: '#000000',
} as const

export const DARK = {
  ...base,

  // ── Backgrounds ─────────────────────────────────────────────────
  bg:        '#2F3438',
  surface:   '#38404A',
  elevated:  '#424C56',
  border:    '#525D68',
  borderMid: '#65717D',
  hover:     '#3A4248',

  // ── Text ────────────────────────────────────────────────────────
  text:        '#F2EBDD',
  textMuted:   '#A89880',
  textDim:     '#7A7060',
  textFaint:   '#504840',
  placeholder: '#7A7060',

  // ── Accent — orange (PRIMARY action) ────────────────────────────
  accent:       '#C96E2A',
  accentSoft:   '#C96E2A18',
  accentBorder: '#C96E2A55',

  // ── Legacy aliases (used in a few gradients) ─────────────────────
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
  bg:        '#F7F1E6',
  surface:   '#EDE6D3',
  elevated:  '#E4D9C5',
  border:    '#C8BAA0',
  borderMid: '#B0A082',
  hover:     '#E8DFD0',

  // ── Text ────────────────────────────────────────────────────────
  text:        '#2D2F33',
  textMuted:   '#636670',
  textDim:     '#9A9DA5',
  textFaint:   '#C0C2C8',
  placeholder: '#9A9DA5',

  // ── Accent — orange (PRIMARY action) ────────────────────────────
  accent:       '#E06A23',
  accentSoft:   '#E06A2318',
  accentBorder: '#E06A2355',

  // ── Legacy aliases ────────────────────────────────────────────────
  forest:       '#F7F1E6',
  forestSoft:   '#F7F1E630',
  forestBorder: '#F7F1E680',

  leather:       '#EDE6D3',
  leatherSoft:   '#EDE6D318',
  leatherBorder: '#EDE6D355',

  secondary:       '#8A7A6A',
  secondarySoft:   '#8A7A6A18',
  secondaryBorder: '#8A7A6A55',
} as const

// Backward-compat default (dark)
export const C = DARK

// ── Bike-safety scale ─────────────────────────────────────────────
export const SAFETY = {
  locked_garage: { icon: '🔒', label: 'Locked garage',   sub: 'Safest — behind a locked door', color: base.success, rank: 'Safest' },
  carport:       { icon: '🏠', label: 'Covered carport',  sub: 'Covered & off the street',      color: base.info,    rank: 'Good'   },
  fenced_yard:   { icon: '🚧', label: 'Fenced yard',      sub: 'Behind a locked gate',          color: base.warning, rank: 'Okay'   },
  street:        { icon: '🛣️', label: 'Street parking',    sub: 'Visible — keep an eye on it',   color: base.error,   rank: 'Basic'  },
} as const

// ── Shape & type constants ─────────────────────────────────────────
export const RADIUS = { pill: 100, card: 20, lg: 18, md: 14, sm: 12 } as const
export const FONT = {
  display: 'Rye',
  head:    'Oswald',
  body:    'System',
} as const

export const SPEED = { road: 72, trail: 27 } as const
