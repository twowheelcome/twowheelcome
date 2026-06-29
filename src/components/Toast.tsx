import { useEffect, useMemo, useState } from 'react'
import { Animated, Platform, StyleSheet, Text, View } from 'react-native'
import { toastStore } from '../lib/toastStore'
import { toastPortal } from '../lib/toastPortal'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
import { FONT } from '../lib/theme'

// App-wide non-blocking toast. Mounted once in the root layout; shows a small bottom
// pill for ~4.5s when showToast() is called, then fades out. Never blocks input.
//
// On web it renders through a <body> portal: react-native-web Modals (e.g. the map host
// sheet, the navigate picker) portal to <body> with z-index 9999, so a toast rendered in
// the normal tree would appear BEHIND any open modal — which is exactly why "Copied" was
// invisible from the map sheet. The portal sits above modals; pointerEvents stays 'none'
// so it never blocks the screen underneath.
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
  const node = (
    <Animated.View pointerEvents="none" style={[styles.wrap, { opacity }]}>
      <View style={styles.backdrop} />
      <View style={styles.toast}>
        <Text style={styles.text}>{msg}</Text>
      </View>
    </Animated.View>
  )
  return toastPortal(node)
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    // Full-screen overlay, centered. 'fixed' (web) pins it to the viewport from the body
    // portal; native uses 'absolute'. zIndex tops the react-native-web Modal layer (9999).
    wrap: {
      position: (Platform.OS === 'web' ? 'fixed' : 'absolute') as 'absolute',
      top: 0, left: 0, right: 0, bottom: 0,
      alignItems: 'center', justifyContent: 'center', zIndex: 100000,
    },
    // Faint dim so the centered pill stands out; pointerEvents on the wrap stays 'none'.
    backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.12)' },
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
