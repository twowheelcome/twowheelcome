// TWOWHEELCOME — design system  ·  "Living Green" scheme
// Olive-warm earth + vibrant moss green. Terracotta = the only action
// colour; moss green = availability / community; gold = "buddy on the route".
//
// DROP-IN REPLACEMENT for src/lib/theme.ts — same `C` shape, new values.
// (A few new keys at the bottom: buddy + the bike-safety levels.)

export const C = {
  // ── Backgrounds ────────────────────────────────────────────────
  bg:        '#0E0D09',  // near-black olive-brown — app canvas
  surface:   '#201E15',  // cards, panels (lifted for separation)
  elevated:  '#2D2A1B',  // inputs, chips, wells
  border:    '#463F2B',  // default hairline (stronger now)
  borderMid: '#5A5135',  // outline buttons, dividers
  hover:     '#29261A',

  // ── Text ───────────────────────────────────────────────────────
  text:        '#F0E8D7',  // warm cream
  textMuted:   '#C0B08B',  // secondary
  textDim:     '#897C5C',  // labels, meta
  textFaint:   '#5A4F38',  // disabled
  placeholder: '#847651',

  // ── Accent — terracotta rust (PRIMARY action — every CTA) ───────
  accent:       '#C47050',
  accentSoft:   '#C4705018',
  accentBorder: '#C4705055',

  // ── Forest green (structural depth, hero gradients) ─────────────
  forest:       '#234A2C',
  forestSoft:   '#234A2C30',
  forestBorder: '#234A2C80',

  // ── Leather brown ───────────────────────────────────────────────
  leather:       '#3D2314',
  leatherSoft:   '#3D231418',
  leatherBorder: '#3D231455',

  // ── Earth (saddle) ──────────────────────────────────────────────
  secondary:       '#7A5C40',
  secondarySoft:   '#7A5C4018',
  secondaryBorder: '#7A5C4055',

  // ── Semantic ────────────────────────────────────────────────────
  // success / moss = accepted, locked garage, AND availability ("Open").
  success:       '#76C085',
  successSoft:   '#76C0851F',
  successBorder: '#76C08566',

  error:       '#CB4636',
  errorSoft:   '#CB46361A',
  errorBorder: '#CB463655',

  warning:       '#D08049',
  warningSoft:   '#D0804918',
  warningBorder: '#D0804955',

  info:       '#5A8FAE',
  infoSoft:   '#5A8FAE18',
  infoBorder: '#5A8FAE55',

  purple:       '#8A6A8A',
  purpleSoft:   '#8A6A8A18',
  purpleBorder: '#8A6A8A55',

  // ── NEW · buddy on the route (gold) ─────────────────────────────
  // A host you've stayed with & rated OK. Highlighted pin on the map.
  buddy:       '#E0A23C',
  buddySoft:   '#E0A23C1F',
  buddyBorder: '#E0A23C66',

  // ── Base ────────────────────────────────────────────────────────
  white: '#ffffff',
  black: '#000000',
} as const

// ── Bike-safety scale ─────────────────────────────────────────────
// The heart of the product. Every host's parking maps to one level;
// the level's colour + rank is shown as the hero block on each host.
export const SAFETY = {
  locked_garage: { icon: '🔒', label: 'Locked garage',  sub: 'Safest — behind a locked door', color: C.success, rank: 'Safest' },
  carport:       { icon: '🏠', label: 'Covered carport', sub: 'Covered & off the street',      color: C.info,    rank: 'Good' },
  fenced_yard:   { icon: '🚧', label: 'Fenced yard',     sub: 'Behind a locked gate',          color: C.warning, rank: 'Okay' },
  street:        { icon: '🛣️', label: 'Street parking',   sub: 'Visible — keep an eye on it',    color: C.error,   rank: 'Basic' },
} as const

// ── Shape & type constants (match the prototype) ──────────────────
export const RADIUS = { pill: 100, card: 20, lg: 18, md: 14, sm: 12 } as const
export const FONT = {
  display: 'Rye',          // logo / hero only
  head:    'Oswald',       // headings, labels, buttons (700–900, uppercase, tracked)
  body:    'System',       // body, chat, inputs
} as const

// ── Terrain-aware ETA — distance shown as TIME, not km ────────────
// Same distance is ~10 min on road, ~27 min on trail. Riders pick mode.
export const SPEED = { road: 72, trail: 27 } as const // km/h
