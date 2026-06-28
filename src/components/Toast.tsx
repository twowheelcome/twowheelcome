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
    wrap: { position: 'absolute', left: 0, right: 0, bottom: 90, alignItems: 'center', zIndex: 9999 },
    toast: {
      maxWidth: 480, marginHorizontal: 24,
      backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
      borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11,
      shadowColor: C.shadow, shadowOpacity: 0.18, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 6,
    },
    text: { color: C.text, fontSize: 13, lineHeight: 18, fontFamily: FONT.body, textAlign: 'center' },
  })
}
