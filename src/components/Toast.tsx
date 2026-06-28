import { useEffect, useMemo, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { toastStore } from '../lib/toastStore'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
import { FONT } from '../lib/theme'

// App-wide non-blocking toast. Mounted once in the root layout; shows a small bottom
// banner for ~3.5s when showToast() is called, then fades out. Never blocks input.
export function Toast() {
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])
  const [msg, setMsg] = useState<string | null>(null)
  const opacity = useMemo(() => new Animated.Value(0), [])

  useEffect(() => toastStore.subscribe(setMsg), [])

  useEffect(() => {
    Animated.timing(opacity, { toValue: msg ? 1 : 0, duration: 180, useNativeDriver: true }).start()
  }, [msg, opacity])

  if (!msg) return null
  return (
    <Animated.View pointerEvents="none" style={[styles.wrap, { opacity }]}>
      <View style={styles.toast}>
        <Text style={styles.text}>{msg}</Text>
      </View>
    </Animated.View>
  )
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    wrap: { position: 'absolute', left: 0, right: 0, bottom: 100, alignItems: 'center', zIndex: 9999 },
    // High-contrast inverse pill: a graphite chip on the light theme, a light chip on the
    // dark theme — clearly legible on either background.
    toast: {
      maxWidth: 480, marginHorizontal: 24,
      backgroundColor: C.text,
      borderRadius: 100, paddingHorizontal: 22, paddingVertical: 14,
      shadowColor: C.shadow, shadowOpacity: 0.3, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 10,
    },
    text: { color: C.bg, fontSize: 15, lineHeight: 20, fontWeight: '800', fontFamily: FONT.body, textAlign: 'center' },
  })
}
