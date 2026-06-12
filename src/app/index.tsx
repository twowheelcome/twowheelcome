import { Session } from '@supabase/supabase-js'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Feather } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'

export default function AuthScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [session, setSession] = useState<Session | null>(null)
  const [authError, setAuthError] = useState('')
  const [authSuccess, setAuthSuccess] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    supabase.auth.onAuthStateChange((_event, session) => setSession(session))
  }, [])

  useEffect(() => {
    if (session) router.replace('/(tabs)/map')
  }, [session])

  async function handleLogin() {
    setAuthError('')
    setAuthSuccess('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
    setLoading(false)
  }

  async function handleRegister() {
    setAuthError('')
    setAuthSuccess('')
    if (!email.trim()) { setAuthError('Zadej email.'); return }
    if (password.length < 6) { setAuthError('Heslo musí mít aspoň 6 znaků.'); return }
    setLoading(true)
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) setAuthError(error.message)
    else setAuthSuccess('Hotovo! Zkontroluj email a potvrď registraci. 🤘')
    setLoading(false)
  }

  return (
    <View style={styles.container}>
      {/* Forest gradient header */}
      <LinearGradient
        colors={['#1C3020', '#162418', '#100C08']}
        locations={[0, 0.55, 1]}
        style={styles.heroGradient}
      >
        {/* Tree silhouettes using shapes */}
        <View style={styles.treeLine}>
          {[60, 80, 45, 90, 55, 70, 40, 85, 50, 75, 42, 68, 58, 82].map((h, i) => (
            <View key={i} style={[styles.tree, {
              borderBottomWidth: h,
              borderLeftWidth: h * 0.38,
              borderRightWidth: h * 0.38,
              bottom: 0,
              left: `${i * 7.2}%` as any,
            }]} />
          ))}
        </View>
        <View style={styles.mist} />
      </LinearGradient>

      {/* Logo area */}
      <View style={styles.logoWrap}>
        <Text style={styles.logo}>TWOWHEELCOME</Text>
        <View style={styles.tireTrack}>
          {Array.from({ length: 18 }).map((_, i) => (
            <View key={i} style={[styles.trackDash, i % 2 === 0 ? styles.trackDashOdd : styles.trackDashEven]} />
          ))}
        </View>
      </View>

      {/* Form */}
      <View style={styles.form}>
        <View style={styles.inputWrap}>
          <Feather name="user" size={16} color={C.textDim} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={C.placeholder}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
        </View>

        <View style={styles.inputWrap}>
          <Feather name="lock" size={16} color={C.textDim} style={styles.inputIcon} />
          <TextInput
            style={styles.input}
            placeholder="Heslo"
            placeholderTextColor={C.placeholder}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />
        </View>

        <TouchableOpacity
          style={styles.btnPrimary}
          onPress={mode === 'login' ? handleLogin : handleRegister}
          disabled={loading}
        >
          <Text style={styles.btnPrimaryText}>
            {loading ? 'Moment...' : mode === 'login' ? 'Přihlásit se' : 'Registrovat se'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnOutline}
          onPress={() => setMode(mode === 'login' ? 'register' : 'login')}
        >
          <Text style={styles.btnOutlineText}>
            {mode === 'login' ? 'Registrovat se' : 'Přihlásit se'}
          </Text>
        </TouchableOpacity>

        {authError ? (
          <View style={styles.msgError}>
            <Text style={styles.msgErrorText}>⚠️ {authError}</Text>
          </View>
        ) : null}

        {authSuccess ? (
          <View style={styles.msgSuccess}>
            <Text style={styles.msgSuccessText}>{authSuccess}</Text>
          </View>
        ) : null}

        {mode === 'login' && (
          <TouchableOpacity style={styles.forgotWrap}>
            <Text style={styles.forgotText}>Zapomněl(a) jste heslo?</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },
  heroGradient: {
    height: 220,
    overflow: 'hidden',
    position: 'relative',
  },
  treeLine: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '100%',
    flexDirection: 'row',
  },
  tree: {
    position: 'absolute',
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: '#0A180C',
  },
  mist: {
    position: 'absolute',
    bottom: -10,
    left: 0,
    right: 0,
    height: 80,
    backgroundColor: 'rgba(28, 40, 28, 0.6)',
    borderRadius: 0,
  },
  logoWrap: {
    alignItems: 'center',
    paddingTop: 28,
    paddingBottom: 36,
    gap: 10,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  logo: {
    fontSize: 42,
    fontFamily: 'Rye_400Regular',
    color: C.text,
    letterSpacing: 1,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 1, height: 3 },
    textShadowRadius: 6,
  },
  tireTrack: {
    flexDirection: 'row',
    gap: 3,
    alignItems: 'center',
  },
  trackDash: {
    height: 5,
    borderRadius: 2,
  },
  trackDashOdd: {
    width: 14,
    backgroundColor: C.accent,
    opacity: 0.9,
  },
  trackDashEven: {
    width: 6,
    backgroundColor: C.accent,
    opacity: 0.4,
  },
  form: {
    paddingHorizontal: 24,
    gap: 12,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.elevated,
    borderRadius: 100,
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: C.border,
    height: 54,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    color: C.text,
    fontSize: 15,
  },
  btnPrimary: {
    height: 54,
    backgroundColor: C.accent,
    borderRadius: 100,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  btnPrimaryText: {
    color: C.white,
    fontWeight: '700',
    fontSize: 16,
    letterSpacing: 0.3,
  },
  btnOutline: {
    height: 54,
    borderRadius: 100,
    borderWidth: 1.5,
    borderColor: C.borderMid,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnOutlineText: {
    color: C.text,
    fontWeight: '600',
    fontSize: 16,
  },
  forgotWrap: {
    alignItems: 'center',
    paddingVertical: 4,
  },
  forgotText: {
    color: C.textDim,
    fontSize: 14,
  },
  msgError: {
    backgroundColor: C.errorSoft,
    borderWidth: 1,
    borderColor: C.errorBorder,
    borderRadius: 14,
    padding: 14,
  },
  msgErrorText: {
    color: C.error,
    fontSize: 13,
    lineHeight: 19,
  },
  msgSuccess: {
    backgroundColor: C.successSoft,
    borderWidth: 1,
    borderColor: C.successBorder,
    borderRadius: 14,
    padding: 14,
  },
  msgSuccessText: {
    color: C.success,
    fontSize: 13,
    lineHeight: 19,
  },
})
