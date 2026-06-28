// Canonical DISPLAY order for sleep options: best → most basic (Private room → Roof
// over head → Tent), matching the bike-safety ordering. This only affects display
// order — stored values / enum semantics are unchanged, so existing data is safe.
export const SLEEP_ORDER = ['room', 'roof', 'tent'] as const

export function sortSleep<T extends string>(values: T[] | null | undefined): T[] {
  const rank = (v: string) => {
    const i = (SLEEP_ORDER as readonly string[]).indexOf(v)
    return i === -1 ? SLEEP_ORDER.length : i
  }
  return [...(values ?? [])].sort((a, b) => rank(a) - rank(b))
}
