import { useState } from 'react'
import {
  Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions,
} from 'react-native'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'

const BUCKET = 'listing-photos'

// Public listing photos shared by the host. The bucket is public, so we resolve a plain
// public URL (no signing). Thumbnails open a fullscreen lightbox (same pattern as the
// private bike-photo viewer): dark backdrop, centered image, pinch-zoom on iOS, tap/✕ close.
function publicUrl(path: string): string {
  if (/^https?:\/\//.test(path)) return path
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

export function ListingGallery({ photos }: { photos: string[] | null | undefined }) {
  const C = useTheme()
  const { width, height } = useWindowDimensions()
  const [open, setOpen] = useState<number | null>(null)
  if (!photos || photos.length === 0) return null

  return (
    <View style={styles.row}>
      {photos.map((p, i) => (
        <TouchableOpacity key={i} activeOpacity={0.85} onPress={() => setOpen(i)} style={[styles.thumb, { borderColor: C.border }]}>
          <Image source={{ uri: publicUrl(p) }} style={styles.img} resizeMode="cover" />
        </TouchableOpacity>
      ))}

      <Modal visible={open != null} transparent animationType="fade" onRequestClose={() => setOpen(null)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(null)} />
          {open != null && (
            <ScrollView
              style={StyleSheet.absoluteFill}
              contentContainerStyle={styles.scroll}
              maximumZoomScale={4}
              minimumZoomScale={1}
              centerContent
              showsVerticalScrollIndicator={false}
              showsHorizontalScrollIndicator={false}
            >
              <Pressable onPress={() => setOpen(null)}>
                <Image source={{ uri: publicUrl(photos[open]) }} style={{ width, height: height * 0.86 }} resizeMode="contain" />
              </Pressable>
            </ScrollView>
          )}
          <TouchableOpacity style={styles.close} onPress={() => setOpen(null)} hitSlop={10} accessibilityRole="button" accessibilityLabel="Close photo">
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 76, height: 76, borderRadius: 12, overflow: 'hidden', borderWidth: 1 },
  img: { width: '100%', height: '100%' },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  close: { position: 'absolute', top: 44, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  closeText: { color: '#fff', fontSize: 20, fontWeight: '900' },
})
