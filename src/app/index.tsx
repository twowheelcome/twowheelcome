import { Session } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'
import { SAFETY } from '../lib/theme'

const ONBOARDING_KEY = '@twowheelcome/onboarding-seen'

// ── Safety preview — shows the 4 bike parking levels ─────────────────────────

function SafetyPreview({ C }: { C: ThemeColors }) {
  const levels = [
    { key: 'locked_garage' as const, icon: '🔒', label: 'Locked garage' },
    { key: 'carport'       as const, icon: '🏠', label: 'Covered parking' },
    { key: 'fenced_yard'   as const, icon: '🚧', label: 'Fenced yard' },
    { key: 'street'        as const, icon: '🛣️', label: 'Street parking' },
  ]
  return (
    <View style={{ gap: 8 }}>
      <Text style={{ color: C.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 2 }}>
        Bike safety options
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {levels.map(l => {
          const s = SAFETY[l.key]
          return (
            <View key={l.key} style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: s.color + '14', borderRadius: 100,
              borderWidth: 1, borderColor: s.color + '55',
              paddingHorizontal: 12, paddingVertical: 6,
            }}>
              <Text style={{ fontSize: 14 }}>{l.icon}</Text>
              <Text style={{ color: s.color, fontSize: 12, fontWeight: '600' }}>{l.label}</Text>
            </View>
          )
        })}
      </View>
    </View>
  )
}

// ── First-run onboarding ─────────────────────────────────────────────────────

function Onboarding({ C, onDone }: { C: ThemeColors; onDone: () => void }) {
  const [step, setStep] = useState(0)
  const slides = [
    {
      icon: 'home' as const,
      title: 'Hotels solve where you sleep.',
      body: 'Twowheelcome helps you find where your bike can sleep safely too.',
    },
    {
      icon: 'lock' as const,
      title: 'Bike safety comes first.',
      body: 'Every host shows the parking situation before anything else: locked garage, covered parking, fenced yard, or street.',
    },
    {
      icon: 'users' as const,
      title: 'From riders to riders.',
      body: 'A place to rest, a safe spot for the bike, and someone who understands why both matter.',
    },
  ]
  const current = slides[step]
  const isLast = step === slides.length - 1

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingHorizontal: 24, paddingTop: 56, paddingBottom: 34 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Image source={require('../../assets/images/icon.png')} style={{ width: 32, height: 32, borderRadius: 8 }} />
          <Text style={{ color: C.text, fontSize: 15, fontWeight: '800' }}>twowheelcome</Text>
        </View>
        <TouchableOpacity onPress={onDone} hitSlop={10}>
          <Text style={{ color: C.textDim, fontSize: 13, fontWeight: '700' }}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <View style={{ width: 132, height: 132, borderRadius: 66, backgroundColor: C.accentSoft, borderWidth: 1.5, borderColor: C.accentBorder, alignItems: 'center', justifyContent: 'center' }}>
          <Feather name={current.icon} size={48} color={C.accent} />
        </View>
        <Text style={{ color: C.text, fontSize: 28, lineHeight: 34, fontWeight: '800', textAlign: 'center', maxWidth: 330 }}>
          {current.title}
        </Text>
        <Text style={{ color: C.textMuted, fontSize: 15, lineHeight: 23, textAlign: 'center', maxWidth: 330 }}>
          {current.body}
        </Text>
      </View>

      <View style={{ gap: 22 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 7 }}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={{
                width: i === step ? 26 : 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: i === step ? C.accent : C.border,
              }}
            />
          ))}
        </View>
        <TouchableOpacity
          style={{ height: 54, borderRadius: 100, backgroundColor: C.accent, alignItems: 'center', justifyContent: 'center' }}
          onPress={isLast ? onDone : () => setStep(step + 1)}
        >
          <Text style={{ color: C.white, fontSize: 16, fontWeight: '800' }}>
            {isLast ? 'Find a safe night' : 'Next'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ── Auth screen ───────────────────────────────────────────────────────────────

export default function AuthScreen() {
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [session, setSession] = useState<Session | null>(null)
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null)
  const [authError, setAuthError] = useState('')
  const [authSuccess, setAuthSuccess] = useState('')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    AsyncStorage.getItem(ONBOARDING_KEY).then(value => setOnboardingSeen(value === 'true'))
  }, [])

  useEffect(() => {
    if (session) router.replace('/(tabs)/map')
  }, [session])

  async function handleLogin() {
    setAuthError(''); setAuthSuccess(''); setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setAuthError(error.message)
    setLoading(false)
  }

  async function handleRegister() {
    setAuthError(''); setAuthSuccess('')
    if (!email.trim()) { setAuthError('Please enter your email.'); return }
    if (password.length < 6) { setAuthError('Password must be at least 6 characters.'); return }
    setLoading(true)
    const { error } = await supabase.auth.signUp({ email, password })
    if (error) setAuthError(error.message)
    else setAuthSuccess('Done! Check your email to confirm your account.')
    setLoading(false)
  }

  async function finishOnboarding() {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true')
    setOnboardingSeen(true)
  }

  if (onboardingSeen === null) {
    return <View style={styles.container} />
  }

  if (!onboardingSeen && !session) {
    return <Onboarding C={C} onDone={finishOnboarding} />
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} bounces={false}>

      {/* Logo + tagline */}
      <View style={styles.hero}>
        <Image
          source={require('../../assets/images/logo.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Text style={styles.tagline}>Safe night for your bike and you.</Text>
        <Text style={styles.taglineSub}>From riders to riders.</Text>
      </View>

      {/* Safety preview */}
      <View style={styles.safetyWrap}>
        <SafetyPreview C={C} />
        <Text style={styles.pitch}>
          Find a rider-host with safe parking, a place to sleep, and someone who gets it.
        </Text>
      </View>

      {/* Form */}
      <View style={styles.form}>
        <View style={styles.inputWrap}>
          <Feather name="mail" size={16} color={C.textDim} style={styles.inputIcon} />
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
            placeholder="Password"
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
            {loading ? 'Loading...' : mode === 'login' ? 'Log in' : 'Create account'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnOutline}
          onPress={() => { setAuthError(''); setAuthSuccess(''); setMode(mode === 'login' ? 'register' : 'login') }}
        >
          <Text style={styles.btnOutlineText}>
            {mode === 'login' ? 'Create account' : 'Back to log in'}
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
            <Text style={styles.forgotText}>Forgot your password?</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.forgotWrap} onPress={() => setOnboardingSeen(false)}>
          <Text style={styles.forgotText}>View intro</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  )
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container:        { flex: 1, backgroundColor: C.bg },
    contentContainer: { flexGrow: 1 },

    hero: {
      alignItems: 'center',
      paddingTop: 52,
      paddingBottom: 28,
      paddingHorizontal: 24,
      backgroundColor: '#F2EBDD',
    },
    logo: {
      width: 228,
      height: 188,
      marginBottom: 10,
    },
    tagline: {
      color: C.accent, fontSize: 17, fontWeight: '600', textAlign: 'center', lineHeight: 24,
    },
    taglineSub: {
      color: C.textMuted, fontSize: 14, textAlign: 'center', marginTop: 4,
    },

    safetyWrap: {
      paddingHorizontal: 24, paddingBottom: 28, gap: 16,
      maxWidth: 440, width: '100%', alignSelf: 'center',
    },
    pitch: {
      color: C.textMuted, fontSize: 13, lineHeight: 20,
    },

    form: { paddingHorizontal: 24, gap: 12, maxWidth: 440, width: '100%', alignSelf: 'center', paddingBottom: 40 },

    inputWrap: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: C.elevated,
      borderRadius: 100, paddingHorizontal: 18, borderWidth: 1, borderColor: C.border, height: 54,
    },
    inputIcon: { marginRight: 10 },
    input:     { flex: 1, color: C.text, fontSize: 15 },

    btnPrimary:     { height: 54, backgroundColor: C.accent, borderRadius: 100, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    btnPrimaryText: { color: C.white, fontSize: 16, fontWeight: '700' },
    btnOutline:     { height: 54, borderRadius: 100, borderWidth: 1.5, borderColor: C.borderMid, alignItems: 'center', justifyContent: 'center' },
    btnOutlineText: { color: C.text, fontSize: 16 },

    forgotWrap: { alignItems: 'center', paddingVertical: 4 },
    forgotText: { color: C.textDim, fontSize: 14 },

    msgError:       { backgroundColor: C.errorSoft, borderWidth: 1, borderColor: C.errorBorder, borderRadius: 14, padding: 14 },
    msgErrorText:   { color: C.error, fontSize: 13, lineHeight: 19 },
    msgSuccess:     { backgroundColor: C.successSoft, borderWidth: 1, borderColor: C.successBorder, borderRadius: 14, padding: 14 },
    msgSuccessText: { color: C.success, fontSize: 13, lineHeight: 19 },
  })
}
