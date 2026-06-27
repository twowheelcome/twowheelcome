import { useEffect, useMemo, useState } from 'react'
import { Image, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { router } from 'expo-router'
import { supabase } from '../lib/supabase'
import { useTheme, useThemeMode, type ThemeColors } from '../lib/ThemeContext'

export default function ResetPasswordScreen() {
  const C = useTheme()
  const { scheme } = useThemeMode()
  const styles = useMemo(() => makeStyles(C), [C])

  const [ready, setReady] = useState(false)
  const [hasSession, setHasSession] = useState(false)
  const [isRecovery, setIsRecovery] = useState(false)   // a genuine PASSWORD_RECOVERY event fired
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    // On web the recovery token in the URL is consumed automatically: a
    // PASSWORD_RECOVERY event fires and a session becomes available. We track the
    // recovery event explicitly (the trustworthy signal); a session is still required
    // for updateUser, which is always scoped to the caller's own account.
    supabase.auth.getSession().then(({ data: { session } }) => {
      setHasSession(!!session)
      setReady(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') setIsRecovery(true)
      setHasSession(!!session)
      setReady(true)
    })
    return () => subscription.unsubscribe()
  }, [])

  async function handleSave() {
    setError('')
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return }
    if (password !== confirm) { setError('The two passwords do not match.'); return }
    setLoading(true)
    const { error: updErr } = await supabase.auth.updateUser({ password })
    if (updErr) {
      console.warn('reset password update error:', updErr.message)
      setError(/expired|invalid|token/i.test(updErr.message)
        ? 'This reset link has expired. Please request a new one.'
        : 'Could not update your password right now. Please try again.')
      setLoading(false)
      return
    }
    setDone(true)
    setLoading(false)
    if (isRecovery) {
      // A reset via the email link shouldn't silently log you into the app — clear the
      // short-lived recovery session and have the user sign in with the new password.
      await supabase.auth.signOut()
      setTimeout(() => router.replace('/'), 1400)
    } else {
      setTimeout(() => router.replace('/(tabs)/map'), 1200)
    }
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} bounces={false}>
      <View style={styles.hero}>
        <Image source={scheme === 'dark' ? require('../../assets/images/mark-cream.png') : require('../../assets/images/mark.png')} style={styles.logo} resizeMode="contain" />
        <Text style={styles.title}>Set a new password</Text>
      </View>

      {!ready ? (
        <Text style={styles.note}>Loading…</Text>
      ) : done ? (
        <View style={styles.msgSuccess}>
          <Text style={styles.msgSuccessText}>
            {isRecovery ? 'Password updated. Please log in with your new password.' : 'Password updated. Taking you to the map…'}
          </Text>
        </View>
      ) : !hasSession ? (
        <View style={styles.form}>
          <Text style={styles.note}>
            This reset link is invalid or has expired. Request a new one from the login screen.
          </Text>
          <TouchableOpacity style={styles.btnPrimary} onPress={() => router.replace('/')}>
            <Text style={styles.btnPrimaryText}>Back to log in</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.form}>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="New password"
              placeholderTextColor={C.placeholder}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>
          <View style={styles.inputWrap}>
            <TextInput
              style={styles.input}
              placeholder="Repeat new password"
              placeholderTextColor={C.placeholder}
              value={confirm}
              onChangeText={setConfirm}
              secureTextEntry
              autoCapitalize="none"
            />
          </View>

          <TouchableOpacity style={styles.btnPrimary} onPress={handleSave} disabled={loading}>
            <Text style={styles.btnPrimaryText}>{loading ? 'Saving…' : 'Save new password'}</Text>
          </TouchableOpacity>

          {error ? (
            <View style={styles.msgError}>
              <Text style={styles.msgErrorText}>⚠️ {error}</Text>
            </View>
          ) : null}
        </View>
      )}
    </ScrollView>
  )
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },
    content: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24, paddingHorizontal: 24, maxWidth: 460, width: '100%', alignSelf: 'center' },
    hero: { alignItems: 'center', marginBottom: 24 },
    logo: { width: 64, height: 64, marginBottom: 12 },
    title: { color: C.text, fontSize: 22, fontWeight: '800' },
    form: { gap: 12 },
    note: { color: C.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: 8 },
    inputWrap: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: C.elevated,
      borderRadius: 100, paddingHorizontal: 18, borderWidth: 1, borderColor: C.border, height: 54,
    },
    input: { flex: 1, color: C.text, fontSize: 16 },
    btnPrimary: { height: 54, backgroundColor: C.accent, borderRadius: 100, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    btnPrimaryText: { color: C.white, fontSize: 16, fontWeight: '700' },
    msgError: { backgroundColor: C.errorSoft, borderColor: C.errorBorder, borderWidth: 1, borderRadius: 14, padding: 12 },
    msgErrorText: { color: C.error, fontSize: 14 },
    msgSuccess: { backgroundColor: C.successSoft, borderColor: C.successBorder, borderWidth: 1, borderRadius: 14, padding: 14 },
    msgSuccessText: { color: C.success, fontSize: 14, textAlign: 'center' },
  })
}
