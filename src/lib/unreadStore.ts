type Listener = (hasUnread: boolean) => void
let _value = false
const _listeners = new Set<Listener>()

export const unreadStore = {
  get: () => _value,
  set(v: boolean) {
    if (_value === v) return
    _value = v
    _listeners.forEach(l => l(v))
  },
  subscribe(l: Listener) {
    _listeners.add(l)
    l(_value)
    return () => { _listeners.delete(l) }
  },
}
