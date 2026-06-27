import { useMemo, useState } from 'react'
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
import { FONT } from '../lib/theme'
import { AppHeader, HeaderBackButton } from '../components/AppHeader'

const CATEGORIES = [
  { value: 'bug', icon: '🐞', label: 'Bug' },
  { value: 'idea', icon: '💡', label: 'Idea' },
  { value: 'other', icon: '💬', label: 'Other' },
] as const

export default function FeedbackScreen() {
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])
  const [category, setCategory] = useState<'bug' | 'idea' | 'other'>('other')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    if (busy || !message.trim()) return
    setBusy(true)
    setError(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { setError('Please log in to send feedback.'); setBusy(false); return }
      const res = await supabase.functions.invoke('feedback', { body: { category, message: message.trim() } })
      if (res.error) throw res.error
      setDone(true)
    } catch (e: unknown) {
      console.warn('feedback error:', e instanceof Error ? e.message : e)
      setError("Couldn't send your feedback. Please try again.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <View style={styles.container}>
      <AppHeader left={<HeaderBackButton />}>
        <Text style={styles.headerTitle}>Send feedback</Text>
      </AppHeader>
      <ScrollView contentContainerStyle={styles.content}>
        {done ? (
          <View style={styles.doneCard}>
            <Text style={styles.doneEmoji}>🙌</Text>
            <Text style={styles.doneTitle}>Thanks — your feedback is on its way.</Text>
            <Text style={styles.doneText}>It goes straight to the people building twowheelcome. We read everything.</Text>
            <TouchableOpacity style={styles.primary} onPress={() => router.back()}>
              <Text style={styles.primaryText}>Done</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <Text style={styles.lead}>Help shape twowheelcome — tell us what works, what&apos;s broken, or what you&apos;d love to see.</Text>

            <Text style={styles.section}>What is it?</Text>
            <View style={styles.catRow}>
              {CATEGORIES.map(c => {
                const on = category === c.value
                return (
                  <TouchableOpacity key={c.value} style={[styles.cat, on && styles.catOn]} onPress={() => setCategory(c.value)}>
                    <Text style={styles.catIcon}>{c.icon}</Text>
                    <Text style={[styles.catLabel, on && styles.catLabelOn]}>{c.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <Text style={styles.section}>Your message</Text>
            <TextInput
              style={styles.input}
              placeholder="Tell us what works, what's broken, or what you'd love to see…"
              placeholderTextColor={C.placeholder}
              value={message}
              onChangeText={setMessage}
              multiline
              maxLength={4000}
              autoFocus
            />

            {error ? <Text style={styles.error}>{error}</Text> : null}

            <TouchableOpacity style={[styles.primary, (!message.trim() || busy) && styles.primaryDisabled]} onPress={submit} disabled={!message.trim() || busy}>
              <Text style={styles.primaryText}>{busy ? 'Sending…' : 'Send feedback'}</Text>
            </TouchableOpacity>
            <Text style={styles.note}>Sent with your account email so we can follow up if needed.</Text>
          </>
        )}
      </ScrollView>
    </View>
  )
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    headerTitle: { color: C.text, fontSize: 20, fontFamily: FONT.headBold, textAlign: 'center' },
    content: { padding: 20, gap: 14, maxWidth: 640, width: '100%', alignSelf: 'center' },
    lead: { color: C.textMuted, fontSize: 15, lineHeight: 22, fontFamily: FONT.body },
    section: { color: C.textMuted, fontSize: 11, fontFamily: FONT.head, letterSpacing: 1.2, textTransform: 'uppercase', marginTop: 4 },
    catRow: { flexDirection: 'row', gap: 8 },
    cat: { flex: 1, alignItems: 'center', gap: 4, paddingVertical: 12, borderRadius: 16, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
    catOn: { borderColor: C.accent, backgroundColor: C.accentSoft },
    catIcon: { fontSize: 20 },
    catLabel: { color: C.textMuted, fontSize: 13, fontWeight: '700' },
    catLabelOn: { color: C.accent },
    input: { backgroundColor: C.elevated, borderRadius: 14, padding: 14, color: C.text, fontSize: 16, lineHeight: 22, minHeight: 130, borderWidth: 1, borderColor: C.border, textAlignVertical: 'top', fontFamily: FONT.body },
    error: { color: C.error, fontSize: 13, fontFamily: FONT.body },
    primary: { height: 52, borderRadius: 100, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    primaryDisabled: { backgroundColor: C.elevated },
    primaryText: { color: C.white, fontSize: 15, fontFamily: FONT.head, letterSpacing: 0.5, textTransform: 'uppercase' },
    note: { color: C.textDim, fontSize: 12, lineHeight: 17, fontFamily: FONT.body, textAlign: 'center' },
    doneCard: { alignItems: 'center', gap: 10, paddingVertical: 40 },
    doneEmoji: { fontSize: 44 },
    doneTitle: { color: C.text, fontSize: 18, fontFamily: FONT.headBold, textAlign: 'center' },
    doneText: { color: C.textMuted, fontSize: 14, lineHeight: 21, fontFamily: FONT.body, textAlign: 'center' },
  })
}
