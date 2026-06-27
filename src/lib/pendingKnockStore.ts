import AsyncStorage from '@react-native-async-storage/async-storage'

// A "finish this knock after you log in" hand-off.
//
// A logged-out rider can fill in the Request-a-stay form; when they hit Send we
// stash the host + their drafted message + dates here and send them to sign-up.
// After auth the Map tab consumes this (once) and reopens the form pre-filled, so
// the rider continues exactly where they left off instead of losing everything.
//
// Persisted to AsyncStorage (localStorage on web), so the promise — "we'll keep
// this host and your message ready" — survives a page reload and the round-trip
// through the confirmation email, not just an in-memory navigation. Cleared on use.

export type PendingKnock = {
  hostUserId: string
  locationId: string
  message: string
  arrivalDate: string
  departureDate: string
  arrivalChip: 'tonight' | 'tomorrow' | 'other'
  guestsCount: number
  arrivalTime: string | null
}

const KEY = 'twowheelcome.pendingKnock'

let _pending: PendingKnock | null = null

function isValid(p: any): p is PendingKnock {
  return p && typeof p.hostUserId === 'string' && typeof p.locationId === 'string'
}

export const pendingKnockStore = {
  set(p: PendingKnock) {
    _pending = p
    // Fire-and-forget; an in-memory copy covers the same-session path if storage is slow.
    void AsyncStorage.setItem(KEY, JSON.stringify(p)).catch(() => {})
  },
  // Returns the pending knock once (memory or persisted), then clears both.
  async consume(): Promise<PendingKnock | null> {
    let value = _pending
    if (!value) {
      try {
        const raw = await AsyncStorage.getItem(KEY)
        if (raw) {
          const parsed = JSON.parse(raw)
          if (isValid(parsed)) value = parsed
        }
      } catch {
        value = null
      }
    }
    _pending = null
    void AsyncStorage.removeItem(KEY).catch(() => {})
    return isValid(value) ? value : null
  },
}
