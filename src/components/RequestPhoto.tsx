import { useEffect, useState } from 'react'
import {
  ActivityIndicator, Image, Modal, Pressable, ScrollView, StyleSheet,
  Text, TouchableOpacity, View, useWindowDimensions,
} from 'react-native'
import type { StyleProp, ImageStyle } from 'react-native'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'

const BUCKET = 'request-photos'
const EXPIRY_SECONDS = 3600 // 1 h; regenerated each time it's signed

// request-photos is a private bucket. photo_url stores the object PATH; we mint a
// short-lived signed URL on demand (only conversation participants can — storage RLS).
// The preview is tappable and opens a fullscreen lightbox with a freshly signed URL.
function toObjectPath(stored: string): string {
  const marker = `/${BUCKET}/`
  const i = stored.indexOf(marker)
  return i >= 0 ? stored.slice(i + marker.length) : stored
}

async function sign(path: string): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(toObjectPath(path), EXPIRY_SECONDS)
    if (error || !data?.signedUrl) return null
    return data.signedUrl
  } catch {
    return null
  }
}

export function RequestPhoto({ path, style }: { path: string; style: StyleProp<ImageStyle> }) {
  const C = useTheme()
  const { width, height } = useWindowDimensions()
  const [uri, setUri] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  const [fullUri, setFullUri] = useState<string | null>(null)
  const [fullFailed, setFullFailed] = useState(false)

  useEffect(() => {
    let active = true
    // Reset when the photo path changes, then resolve a fresh signed URL.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUri(null)
    setFailed(false)
    sign(path).then(u => { if (!active) return; if (u) setUri(u); else setFailed(true) })
    return () => { active = false }
  }, [path])

  function openFull() {
    setOpen(true)
    setFullUri(null)
    setFullFailed(false)
    // Fresh signed URL for the fullscreen view (the preview's may be near expiry).
    sign(path).then(u => { if (u) setFullUri(u); else setFullFailed(true) })
  }

  if (failed) {
    return (
      <View style={[style, styles.box, { backgroundColor: C.surface, borderColor: C.border }]}>
        <Text style={{ fontSize: 20 }}>📷</Text>
        <Text style={{ color: C.textMuted, fontSize: 12, marginTop: 4 }}>Photo unavailable</Text>
      </View>
    )
  }
  if (!uri) {
    return (
      <View style={[style, styles.box, { backgroundColor: C.surface, borderColor: C.border }]}>
        <ActivityIndicator color={C.accent} />
      </View>
    )
  }

  return (
    <>
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={openFull}
        accessibilityRole="imagebutton"
        accessibilityLabel="Open photo full screen"
      >
        <Image source={{ uri }} style={style} resizeMode="cover" onError={() => setFailed(true)} />
        <View style={styles.expandBadge}>
          <Text style={styles.expandIcon}>⤢</Text>
        </View>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} />
          {fullFailed ? (
            <View style={styles.center}>
              <Text style={{ fontSize: 44 }}>📷</Text>
              <Text style={styles.fullMsg}>Photo unavailable</Text>
            </View>
          ) : !fullUri ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <ScrollView
              style={StyleSheet.absoluteFill}
              contentContainerStyle={styles.scrollContent}
              maximumZoomScale={4}
              minimumZoomScale={1}
              centerContent
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
            >
              <Pressable onPress={() => setOpen(false)}>
                <Image
                  source={{ uri: fullUri }}
                  style={{ width, height: height * 0.86 }}
                  resizeMode="contain"
                  onError={() => setFullFailed(true)}
                />
              </Pressable>
            </ScrollView>
          )}
          <TouchableOpacity
            style={styles.closeBtn}
            onPress={() => setOpen(false)}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            hitSlop={10}
          >
            <Text style={styles.closeIcon}>✕</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  )
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  expandBadge: {
    position: 'absolute', right: 8, bottom: 8,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.55)', alignItems: 'center', justifyContent: 'center',
  },
  expandIcon: { color: '#fff', fontSize: 14, fontWeight: '900' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  scrollContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  center: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  fullMsg: { color: '#ddd', fontSize: 15 },
  closeBtn: {
    position: 'absolute', top: 44, left: 20,
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center',
  },
  closeIcon: { color: '#fff', fontSize: 20, fontWeight: '900' },
})
