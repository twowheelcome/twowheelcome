import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import type { ErrorBoundaryProps } from 'expo-router'

// Root error boundary (wired via `export { ErrorBoundary }` in app/_layout.tsx). A render
// crash in any screen shows this friendly fallback with a Try again button instead of a
// blank white screen / dead app. It renders outside ThemeProvider, so colors are static
// and match the app's dark theme rather than using the theme hook.
const BG = '#141414'
const SURFACE = '#1e1e1e'
const BORDER = '#2e2e2e'
const TEXT = '#ededed'
const MUTED = '#9a9a9a'
const ACCENT = '#C47050'

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.emoji}>🛠️</Text>
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.body}>
          This screen hit an unexpected error. Your data is safe — try again, and if it keeps
          happening, restart the app.
        </Text>
        {error?.message ? (
          <View style={styles.detail}>
            <Text style={styles.detailText} numberOfLines={4}>{error.message}</Text>
          </View>
        ) : null}
        <TouchableOpacity style={styles.button} onPress={retry} accessibilityRole="button">
          <Text style={styles.buttonText}>Try again</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: BG },
  content: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 14, maxWidth: 480, alignSelf: 'center', width: '100%' },
  emoji: { fontSize: 40 },
  title: { color: TEXT, fontSize: 22, fontWeight: '900', textAlign: 'center' },
  body: { color: MUTED, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  detail: { backgroundColor: SURFACE, borderWidth: 1, borderColor: BORDER, borderRadius: 12, padding: 12, width: '100%' },
  detailText: { color: MUTED, fontSize: 12, fontFamily: 'monospace' as const },
  button: { marginTop: 8, height: 50, borderRadius: 100, backgroundColor: ACCENT, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40 },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 1 },
})
