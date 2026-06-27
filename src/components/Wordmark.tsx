import { Text, type StyleProp, type TextStyle } from 'react-native'
import { useTheme } from '../lib/ThemeContext'
import { FONT } from '../lib/theme'

// The single source of truth for the TWOWHEELCOME wordmark. Colour-split on terracotta +
// ink only (no green — green isn't used elsewhere in the app), Oswald bold uppercase.
// Used everywhere the brand name appears as a logo (onboarding, login, headers).
export function Wordmark({ size = 22, style }: { size?: number; style?: StyleProp<TextStyle> }) {
  const C = useTheme()
  return (
    <Text
      numberOfLines={1}
      style={[
        { color: C.text, fontFamily: FONT.headBold, fontSize: size, letterSpacing: 0.5, textTransform: 'uppercase' },
        style,
      ]}
    >
      <Text style={{ color: C.accent }}>TWO</Text>WHEEL<Text style={{ color: C.accent }}>COME</Text>
    </Text>
  )
}
