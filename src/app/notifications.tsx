import { useCallback, useMemo, useState } from 'react'
import { ActivityIndicator, Platform, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
import { FONT } from '../lib/theme'
import { AppHeader, HeaderBackButton } from '../components/AppHeader'
import { enableWebPush, disableWebPush, isWebPushEnabled, isIos } from '../lib/webPush'

export default function NotificationsScreen() {
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState(true)
  const [push, setPush] = useState(true)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [webPushOn, setWebPushOn] = useState(false)
  const [webBusy, setWebBusy] = useState(false)
  const [webNote, setWebNote] = useState<string | null>(null)

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
      if (Platform.OS === 'web') isWebPushEnabled().then(on => { if (active) setWebPushOn(on) })
      return () => { active = false }
    }, []),
  )

  async function toggleWebPush() {
    if (!userId || webBusy) return
    setWebBusy(true)
    setWebNote(null)
    if (webPushOn) {
      await disableWebPush()
      setWebPushOn(false)
      setWebBusy(false)
      return
    }
    const r = await enableWebPush(userId)
    setWebBusy(false)
    if (r === 'subscribed') { setWebPushOn(true); return }
    setWebNote(
      r === 'needs-install' ? 'On iPhone/iPad: open the Share menu → “Add to Home Screen”, launch the app from there, then enable notifications.'
      : r === 'denied' ? 'Notifications are blocked for this site in your browser settings. Allow them, then try again.'
      : r === 'unsupported' ? 'This browser doesn’t support web notifications.'
      : 'Could not enable notifications. Please try again.',
    )
  }

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

        {Platform.OS === 'web' && !loading ? (
          <View style={styles.section}>
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>Web notifications (this device)</Text>
                <Text style={styles.rowSub}>
                  Alerts on this device even when the tab is closed{isIos() ? ' — add the app to your Home Screen first (iPhone/iPad).' : '.'}
                </Text>
              </View>
              <TouchableOpacity
                style={[styles.webBtn, webPushOn && styles.webBtnOn]}
                onPress={toggleWebPush}
                disabled={webBusy}
                accessibilityRole="button"
              >
                {webBusy
                  ? <ActivityIndicator size="small" color={webPushOn ? C.white : C.accent} />
                  : <Text style={[styles.webBtnText, webPushOn && styles.webBtnTextOn]}>{webPushOn ? 'Enabled ✓' : 'Enable'}</Text>}
              </TouchableOpacity>
            </View>
            {webNote ? <Text style={[styles.rowSub, { paddingHorizontal: 14, paddingBottom: 12 }]}>{webNote}</Text> : null}
          </View>
        ) : null}

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
    kicker: { color: C.accent, fontSize: 11, fontFamily: FONT.head, letterSpacing: 2, textTransform: 'uppercase' },
    title: { color: C.text, fontSize: 30, fontFamily: FONT.headBold, lineHeight: 36 },
    body: { color: C.textMuted, fontSize: 15, lineHeight: 23 },
    section: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 18, padding: 4 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, paddingHorizontal: 14 },
    rowText: { flex: 1, gap: 3 },
    rowTitle: { color: C.text, fontSize: 16, fontWeight: '800' },
    rowSub: { color: C.textMuted, fontSize: 13, lineHeight: 18 },
    divider: { height: 1, backgroundColor: C.border, marginHorizontal: 14 },
    webBtn: { borderWidth: 1, borderColor: C.accent, borderRadius: 100, paddingHorizontal: 16, paddingVertical: 9, minWidth: 92, alignItems: 'center' },
    webBtnOn: { backgroundColor: C.accent },
    webBtnText: { color: C.accent, fontSize: 13, fontWeight: '800' },
    webBtnTextOn: { color: C.white },
    error: { color: C.error, fontSize: 14, lineHeight: 20 },
    note: { color: C.textDim, fontSize: 13, lineHeight: 19, marginTop: 4 },
  })
}
