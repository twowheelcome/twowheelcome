import { Session } from '@supabase/supabase-js'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { router, useLocalSearchParams } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Image, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView, Platform } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useTheme, useThemeMode, type ThemeColors } from '../lib/ThemeContext'
import { FONT } from '../lib/theme'
import { Wordmark } from '../components/Wordmark'
import { AppWordmark } from '../components/AppHeader'

const ONBOARDING_KEY = '@twowheelcome/onboarding-seen'

function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())
}

// ── First-run onboarding ─────────────────────────────────────────────────────

function Onboarding({ C, onDone }: { C: ThemeColors; onDone: () => void }) {
  const { scheme } = useThemeMode()
  const [step, setStep] = useState(0)
  // Theme-aware glyphs: graphite+terracotta on light, cream+terracotta on dark
  // (orange accent kept in both — same treatment as the logo).
  const dark = scheme === 'dark'
  const slides = [
    {
      image: dark ? require('../../assets/images/bike-cream.png') : require('../../assets/images/bike.png'),
      title: 'Where will your bike sleep tonight?',
      body: "Riders who'll share a safe spot for your bike — and a roof for you.",
    },
    {
      image: dark ? require('../../assets/images/roof-cream.png') : require('../../assets/images/roof.png'),
      title: "Know it's safe before you knock.",
      body: 'Every host shows the parking up front: locked garage, carport, yard, or street.',
    },
    {
      image: dark ? require('../../assets/images/kruh-cream.png') : require('../../assets/images/kruh.png'),
      title: "It's riders looking after riders.",
      body: 'Free to find and host. Just a safe night, passed on by someone who gets it.',
    },
  ]
  const current = slides[step]
  const isLast = step === slides.length - 1

  return (
    <View style={{ flex: 1, backgroundColor: C.bg, paddingHorizontal: 24, paddingTop: 56, paddingBottom: 34 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppWordmark compact />
        <TouchableOpacity onPress={onDone} hitSlop={10}>
          <Text style={{ color: C.textDim, fontSize: 13, fontWeight: '700' }}>Skip</Text>
        </TouchableOpacity>
      </View>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18 }}>
        <View style={{ width: 160, height: 160, alignItems: 'center', justifyContent: 'center' }}>
          <Image source={current.image} style={{ width: 160, height: 160 }} resizeMode="contain" />
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
  const { scheme } = useThemeMode()
  const styles = useMemo(() => makeStyles(C), [C])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [session, setSession] = useState<Session | null>(null)
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null)
  const [authError, setAuthError] = useState('')
  const [authSuccess, setAuthSuccess] = useState('')
  const [canResend, setCanResend] = useState(false)   // show "Resend confirmation email"
  const { signup } = useLocalSearchParams<{ signup?: string }>()
  const [mode, setMode] = useState<'login' | 'register'>(signup ? 'register' : 'login')

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => setSession(session))
    AsyncStorage.getItem(ONBOARDING_KEY).then(value => setOnboardingSeen(value === 'true'))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (session) router.replace('/(tabs)/map')
  }, [session])

  async function handleLogin() {
    setAuthError(''); setAuthSuccess(''); setCanResend(false)
    if (!isValidEmail(email)) { setAuthError('Please enter a valid email address.'); return }
    if (!password) { setAuthError('Please enter your password.'); return }
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) {
      if (error.message) console.warn('login error:', error.message)
      const notConfirmed = /email not confirmed/i.test(error.message)
      if (notConfirmed) setCanResend(true)
      setAuthError(/invalid login credentials/i.test(error.message)
        ? 'Wrong email or password. Please check and try again.'
        : notConfirmed
        ? 'Please confirm your email first — check your inbox for the link.'
        : 'Could not sign in right now. Please try again.')
    }
    setLoading(false)
  }

  async function handleResendConfirmation() {
    setAuthError(''); setAuthSuccess('')
    if (!isValidEmail(email)) { setAuthError('Enter your email above first, then resend.'); return }
    setLoading(true)
    const emailRedirectTo = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim(),
      ...(emailRedirectTo ? { options: { emailRedirectTo } } : {}),
    })
    if (error) {
      if (error.message) console.warn('resend confirmation error:', error.message)
      setAuthError('Could not resend the confirmation email right now. Please try again in a moment.')
    } else {
      setAuthSuccess('Confirmation email sent. Check your inbox (and your spam folder).')
    }
    setLoading(false)
  }

  async function handleRegister() {
    setAuthError(''); setAuthSuccess('')
    if (!fullName.trim()) { setAuthError('Please enter your name.'); return }
    if (!isValidEmail(email)) { setAuthError('Please enter a valid email address.'); return }
    if (password.length < 6) { setAuthError('Password must be at least 6 characters.'); return }
    setLoading(true)
    const name = fullName.trim()
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name } },
    })
    if (error) {
      if (error.message) console.warn('signup error:', error.message)
      setAuthError(/already registered|already exists|already been registered/i.test(error.message)
        ? 'That email already has an account. Try logging in instead.'
        : /password/i.test(error.message)
        ? 'Please choose a stronger password (at least 6 characters).'
        : 'Could not create your account right now. Please try again.')
    } else {
      if (data.user) {
        await supabase.from('profiles').update({ full_name: name }).eq('id', data.user.id)
      }
      setAuthSuccess('Done! Check your email to confirm your account.')
      setCanResend(true)
    }
    setLoading(false)
  }

  async function handleForgotPassword() {
    setAuthError(''); setAuthSuccess('')
    if (!isValidEmail(email)) { setAuthError('Enter a valid email above first, then tap “Forgot your password?”.'); return }
    setLoading(true)
    const redirectTo = Platform.OS === 'web' && typeof window !== 'undefined'
      ? `${window.location.origin}/reset-password`
      : 'twowheelcome://reset-password'
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo })
    if (error) {
      if (error.message) console.warn('reset password error:', error.message)
      setAuthError('Could not send the reset link right now. Please try again in a moment.')
    }
    else setAuthSuccess('If that email is registered, a reset link is on its way. Check your inbox.')
    setLoading(false)
  }

  async function finishOnboarding() {
    await AsyncStorage.setItem(ONBOARDING_KEY, 'true')
    setOnboardingSeen(true)
  }

  if (onboardingSeen === null && !signup) {
    return <View style={styles.container} />
  }

  if (!onboardingSeen && !session && !signup) {
    return <Onboarding C={C} onDone={finishOnboarding} />
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} bounces={false}>

      {/* Logo + tagline */}
      <View style={styles.hero}>
        <Image
          source={scheme === 'dark' ? require('../../assets/images/mark-cream.png') : require('../../assets/images/mark.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <Wordmark size={32} style={{ marginBottom: 8 }} />
        <Text style={styles.tagline}>Safe night for your bike and you.</Text>
        <Text style={styles.taglineSub}>From riders to riders.</Text>
      </View>

      {/* Form */}
      <View style={styles.form}>
        {mode === 'register' && (
          <View style={styles.inputWrap}>
            <Feather name="user" size={16} color={C.textDim} style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Your name"
              placeholderTextColor={C.placeholder}
              value={fullName}
              onChangeText={setFullName}
              autoCapitalize="words"
            />
          </View>
        )}

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
          onPress={() => { setAuthError(''); setAuthSuccess(''); setFullName(''); setMode(mode === 'login' ? 'register' : 'login') }}
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

        {canResend ? (
          <TouchableOpacity style={styles.forgotWrap} onPress={handleResendConfirmation} disabled={loading}>
            <Text style={styles.forgotText}>Didn’t get the email? Resend confirmation</Text>
          </TouchableOpacity>
        ) : null}

        {mode === 'login' && (
          <TouchableOpacity style={styles.forgotWrap} onPress={handleForgotPassword} disabled={loading}>
            <Text style={styles.forgotText}>Forgot your password?</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.forgotWrap} onPress={() => setOnboardingSeen(false)}>
          <Text style={styles.forgotText}>View intro</Text>
        </TouchableOpacity>

        <View style={styles.legalLinks}>
          <TouchableOpacity onPress={() => router.push('/privacy')} hitSlop={8}>
            <Text style={styles.legalLinkText}>Privacy</Text>
          </TouchableOpacity>
          <Text style={styles.legalSeparator}>·</Text>
          <TouchableOpacity onPress={() => router.push('/terms')} hitSlop={8}>
            <Text style={styles.legalLinkText}>Terms</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  )
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container:        { flex: 1, backgroundColor: C.bg },
    contentContainer: { flexGrow: 1, justifyContent: 'center', paddingVertical: 24 },

    hero: {
      alignItems: 'center',
      paddingTop: 0,
      paddingBottom: 20,
      paddingHorizontal: 24,
      backgroundColor: C.bg,
    },
    logo: {
      width: 198,
      height: 188,
      marginBottom: 4,
    },
    tagline: {
      color: C.text, fontSize: 18, fontWeight: '700', textAlign: 'center', lineHeight: 25,
    },
    taglineSub: {
      color: C.textMuted, fontSize: 12, fontFamily: FONT.head, letterSpacing: 1.6, textAlign: 'center', marginTop: 8, textTransform: 'uppercase',
    },

    safetyWrap: {
      paddingHorizontal: 24, paddingBottom: 28, gap: 16,
      maxWidth: 440, width: '100%', alignSelf: 'center',
    },
    pitch: {
      color: C.textMuted, fontSize: 13, lineHeight: 20,
    },

    form: { paddingHorizontal: 24, gap: 10, maxWidth: 440, width: '100%', alignSelf: 'center' },

    inputWrap: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: C.elevated,
      borderRadius: 100, paddingHorizontal: 18, borderWidth: 1, borderColor: C.border, height: 54,
    },
    inputIcon: { marginRight: 10 },
    input:     { flex: 1, color: C.text, fontSize: 16 },

    btnPrimary:     { height: 54, backgroundColor: C.accent, borderRadius: 100, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    btnPrimaryText: { color: C.white, fontSize: 16, fontFamily: FONT.head, letterSpacing: 1, textTransform: 'uppercase' },
    btnOutline:     { height: 54, borderRadius: 100, borderWidth: 1.5, borderColor: C.borderMid, alignItems: 'center', justifyContent: 'center' },
    btnOutlineText: { color: C.text, fontSize: 16, fontFamily: FONT.head, letterSpacing: 1, textTransform: 'uppercase' },

    forgotWrap: { alignItems: 'center', paddingVertical: 4 },
    forgotText: { color: C.textDim, fontSize: 14 },
    legalLinks: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingTop: 6 },
    legalLinkText: { color: C.textDim, fontSize: 13, fontWeight: '700' },
    legalSeparator: { color: C.textFaint, fontSize: 13 },

    msgError:       { backgroundColor: C.errorSoft, borderWidth: 1, borderColor: C.errorBorder, borderRadius: 14, padding: 14 },
    msgErrorText:   { color: C.error, fontSize: 13, lineHeight: 19 },
    msgSuccess:     { backgroundColor: C.successSoft, borderWidth: 1, borderColor: C.successBorder, borderRadius: 14, padding: 14 },
    msgSuccessText: { color: C.success, fontSize: 13, lineHeight: 19 },
  })
}
