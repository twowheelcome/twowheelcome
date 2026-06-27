import { useState } from 'react'
import {
  Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions,
} from 'react-native'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'

function initialsOf(name?: string | null): string {
  return (name || '?').split(' ').map(w => w[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || '?'
}

// Circular profile avatar: shows the real photo when there is one (tappable → fullscreen
// lightbox, same pattern as the listing/bike viewer), and falls back to initials otherwise.
export function Avatar({
  url,
  name,
  size = 48,
  fontSize,
  style,
}: {
  url?: string | null
  name?: string | null
  size?: number
  fontSize?: number
  style?: object
}) {
  const C = useTheme()
  const s = makeStyles(C)
  const { width, height } = useWindowDimensions()
  const [open, setOpen] = useState(false)
  const circle = { width: size, height: size, borderRadius: size / 2 }

  if (!url) {
    return (
      <View style={[s.fallback, circle, style]}>
        <Text style={[s.initials, { fontSize: fontSize ?? size * 0.4 }]}>{initialsOf(name)}</Text>
      </View>
    )
  }

  return (
    <>
      <TouchableOpacity activeOpacity={0.85} onPress={() => setOpen(true)} style={[circle, style]} accessibilityRole="imagebutton" accessibilityLabel={`${name || 'Rider'} photo`}>
        <Image source={{ uri: url }} style={[circle, s.img]} resizeMode="cover" />
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={s.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          <ScrollView
            style={StyleSheet.absoluteFill}
            contentContainerStyle={s.scroll}
            maximumZoomScale={4}
            minimumZoomScale={1}
            centerContent
            showsVerticalScrollIndicator={false}
            showsHorizontalScrollIndicator={false}
          >
            <Pressable onPress={() => setOpen(false)}>
              <Image source={{ uri: url }} style={{ width, height: height * 0.86 }} resizeMode="contain" />
            </Pressable>
          </ScrollView>
          <TouchableOpacity style={s.close} onPress={() => setOpen(false)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close photo">
            <Text style={s.closeText}>✕</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  )
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    fallback: { backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' },
    initials: { color: C.white, fontWeight: '800' },
    img: { backgroundColor: C.elevated },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
    scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
    close: { position: 'absolute', top: 44, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
    closeText: { color: '#fff', fontSize: 20, fontWeight: '900' },
  })
}
