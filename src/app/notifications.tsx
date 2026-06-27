import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
import { AppHeader, HeaderBackButton } from '../components/AppHeader'

export default function NotificationsScreen() {
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState(true)
  const [push, setPush] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useFocusEffect(
    useCallback(() => {
      let active = true
      void (async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!active) return
        if (!user) { setLoading(false); return }
        setUserId(user.id)
        const { data } = await supabase
          .from('profiles')
          .select('notify_email, notify_push')
          .eq('id', user.id)
          .single()
        if (!active) return
        if (data) {
          setEmail(data.notify_email ?? true)
          setPush(data.notify_push ?? true)
        }
        setLoading(false)
      })()
      return () => { active = false }
    }, []),
  )

  async function update(field: 'notify_email' | 'notify_push', value: boolean) {
    if (!userId) return
    setError(null)
    // Optimistic — flip immediately, roll back if the write fails.
    const setter = field === 'notify_email' ? setEmail : setPush
    setter(value)
    const { error: err } = await supabase.from('profiles').update({ [field]: value }).eq('id', userId)
    if (err) {
      setter(!value)
      setError("Couldn't save your preference. Check your connection and try again.")
    }
  }

  return (
    <View style={styles.container}>
      <AppHeader left={<HeaderBackButton />} />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.kicker}>TWOWHEELCOME</Text>
        <Text style={styles.title}>Notifications</Text>
        <Text style={styles.body}>
          Choose how we let you know about knocks, replies and review reminders.
        </Text>

        {loading ? (
          <ActivityIndicator color={C.accent} style={{ marginTop: 24 }} />
        ) : (
          <View style={styles.section}>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Email notifications</Text>
                <Text style={styles.rowSub}>New knocks, accept/decline and review reminders.</Text>
              </View>
              <Switch
                value={email}
                onValueChange={v => update('notify_email', v)}
                trackColor={{ false: C.border, true: C.accent }}
                thumbColor={C.white}
              />
            </View>

            <View style={styles.divider} />

            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Push notifications</Text>
                <Text style={styles.rowSub}>Instant alerts on your phone (needs the mobile app).</Text>
              </View>
              <Switch
                value={push}
                onValueChange={v => update('notify_push', v)}
                trackColor={{ false: C.border, true: C.accent }}
                thumbColor={C.white}
              />
            </View>
          </View>
        )}

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.note}>
          Account emails — confirming your email, resetting your password and email changes —
          are always sent for your account security and are not affected by these switches.
        </Text>
      </ScrollView>
    </View>
  )
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    content: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 24, paddingBottom: 60, gap: 16 },
    kicker: { color: C.accent, fontSize: 11, fontWeight: '900', letterSpacing: 2 },
    title: { color: C.text, fontSize: 30, fontWeight: '900', lineHeight: 36 },
    body: { color: C.textMuted, fontSize: 15, lineHeight: 23 },
    section: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
    rowText: { flex: 1, gap: 3 },
    rowTitle: { color: C.text, fontSize: 16, fontWeight: '800' },
    rowSub: { color: C.textMuted, fontSize: 13, lineHeight: 18 },
    divider: { height: 1, backgroundColor: C.border, marginHorizontal: 14 },
    error: { color: C.error, fontSize: 14, lineHeight: 20 },
    note: { color: C.textDim, fontSize: 13, lineHeight: 19, marginTop: 4 },
  })
}
