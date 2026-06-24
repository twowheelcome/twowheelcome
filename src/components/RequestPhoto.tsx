import { useEffect, useState } from 'react'
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native'
import type { StyleProp, ImageStyle } from 'react-native'
import { supabase } from '../lib/supabase'
import { useTheme } from '../lib/ThemeContext'

const BUCKET = 'request-photos'
const EXPIRY_SECONDS = 3600 // 1 h; regenerated each time the photo mounts

// request-photos is a private bucket. photo_url stores the object PATH; we mint a
// short-lived signed URL on mount (only conversation participants can — storage RLS).
// Falls back gracefully to a placeholder instead of a broken image.
function toObjectPath(stored: string): string {
  const marker = `/${BUCKET}/`
  const i = stored.indexOf(marker)
  return i >= 0 ? stored.slice(i + marker.length) : stored
}

export function RequestPhoto({ path, style }: { path: string; style: StyleProp<ImageStyle> }) {
  const C = useTheme()
  const [uri, setUri] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    setUri(null)
    setFailed(false)
    supabase.storage.from(BUCKET).createSignedUrl(toObjectPath(path), EXPIRY_SECONDS)
      .then(({ data, error }) => {
        if (!active) return
        if (error || !data?.signedUrl) { setFailed(true); return }
        setUri(data.signedUrl)
      })
      .catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [path])

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
  return <Image source={{ uri }} style={style} resizeMode="cover" onError={() => setFailed(true)} />
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
})
