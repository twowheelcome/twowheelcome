import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

// Web: lift the toast into a <body> portal so it sits ABOVE react-native-web Modal
// overlays (which portal to <body> at z-index 9999). Without this a toast fired while a
// modal is open — e.g. the map host sheet / navigate picker — renders behind it.
export function toastPortal(node: ReactNode): ReactNode {
  if (typeof document === 'undefined') return node
  return createPortal(node, document.body)
}
