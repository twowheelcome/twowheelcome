// Minimal non-blocking toast: a tiny pub/sub the <Toast> component subscribes to.
// Used for soft, non-fatal notices (e.g. a background notification failing) without
// interrupting the user's action.
type Listener = (msg: string | null) => void

let listeners: Listener[] = []
let timer: ReturnType<typeof setTimeout> | null = null

export const toastStore = {
  show(msg: string) {
    listeners.forEach(l => l(msg))
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => listeners.forEach(l => l(null)), 3500)
  },
  subscribe(l: Listener) {
    listeners.push(l)
    return () => { listeners = listeners.filter(x => x !== l) }
  },
}

export function showToast(msg: string) {
  toastStore.show(msg)
}
