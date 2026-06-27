import Svg, { Path, Rect } from 'react-native-svg'
import { SAFETY } from '../lib/theme'

// The four bike-safety levels as clean line icons (same shapes as the map pins), used
// everywhere safety/parking is shown so the emoji disappear app-wide:
//   locked_garage → padlock · carport → open roof on posts · fenced_yard → fence · street → road
export function SafetyIcon({
  level,
  size = 22,
  color,
  strokeWidth = 2,
}: {
  level: keyof typeof SAFETY
  size?: number
  color?: string
  strokeWidth?: number
}) {
  const stroke = color ?? SAFETY[level].color
  const p = { stroke, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' }

  switch (level) {
    case 'locked_garage':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Rect x={4} y={11} width={16} height={9} rx={2} {...p} />
          <Path d="M8 11V8a4 4 0 0 1 8 0v3" {...p} />
        </Svg>
      )
    case 'carport':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M3 11l9-6 9 6" {...p} />
          <Path d="M6 11v8" {...p} />
          <Path d="M18 11v8" {...p} />
        </Svg>
      )
    case 'fenced_yard':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M5 20V8l2-2 2 2v12" {...p} />
          <Path d="M15 20V8l2-2 2 2v12" {...p} />
          <Path d="M3 12h18" {...p} />
          <Path d="M3 16h18" {...p} />
        </Svg>
      )
    case 'street':
    default:
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24">
          <Path d="M7 20 9.5 4" {...p} />
          <Path d="M17 20 14.5 4" {...p} />
          <Path d="M12 6v2.5" {...p} />
          <Path d="M12 11v2.5" {...p} />
          <Path d="M12 16v2.5" {...p} />
        </Svg>
      )
  }
}
