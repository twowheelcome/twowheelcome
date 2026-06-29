import type { ReactNode } from 'react'

// Native: no portal needed — render the toast in place. (The web variant lives in
// toastPortal.web.ts and lifts it into a <body> portal above modal overlays.)
export function toastPortal(node: ReactNode): ReactNode {
  return node
}
