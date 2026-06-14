import { Session } from '@supabase/supabase-js'
import { router } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Feather } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'

function TireTrack({ C }: { C: ThemeColors }) {
  if (Platform.OS === 'web') {
    const width = 224
    const h = Math.round(width * 0.17)
    const n = 17
    const blocks = Array.from({ length: n }, (_, i) => {
      const t = i / (n - 1)
      const x = 6 + t * (width - 12)
      const arc = Math.sin(t * Math.PI)
      const y = h - 5 - arc * (h - 12)
      const rot = (t - 0.5) * 26
      return `<rect x="${(x - 3.4).toFixed(1)}" y="${(y - 5).toFixed(1)}" width="6.8" height="11" rx="1.6" transform="rotate(${rot.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)})" fill="${C.accent}" opacity="0.92"/>`
    }).join('')
    const svg = `<svg viewBox="0 0 ${width} ${h}" width="${width}" height="${h}" style="display:block"><path d="M6 ${h - 4} Q ${width / 2} 2 ${width - 6} ${h - 4}" fill="none" stroke="${C.accent}" stroke-width="2.2" stroke-linecap="round" opacity="0.5"/><path d="M6 ${h - 1} Q ${width / 2} ${h - 6} ${width - 6} ${h - 1}" fill="none" stroke="${C.accent}" stroke-width="2.2" stroke-linecap="round" opacity="0.28"/>${blocks}</svg>`
    return <div dangerouslySetInnerHTML={{ __html: svg }} style={{ display: 'flex' } as any} />
  }
  return (
    <View style={{ flexDirection: 'row', gap: 3, alignItems: 'center' }}>
      {Array.from({ length: 18 }).map((_, i) => (
        <View key={i} style={[
          { height: 5, borderRadius: 2 },
          i % 2 === 0 ? { width: 14, backgroundColor: C.accent, opacity: 0.9 } : { width: 6, backgroundColor: C.accent, opacity: 0.4 },
        ]} />
      ))}
    </View>
  )
}

export default function AuthScreen() {
  const C = useTheme()
  const styles = useMemo(() => makeStyles(C), [C])
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
    else setAuthSuccess('Done! Check your email to confirm your account. 🤘')
    setLoading(false)
  }

  const ridgeSvg = `
    <svg viewBox="0 0 390 200" preserveAspectRatio="none" style="position:absolute;inset:0;width:100%;height:100%">
      <path d="M0,120 C70,96 130,128 200,108 S330,120 390,100 L390,200 L0,200 Z" fill="#244A2C" opacity="0.9"/>
      <path d="M0,148 C80,128 140,154 205,136 S330,148 390,130 L390,200 L0,200 Z" fill="#172E1C" opacity="0.95"/>
      ${[40, 70, 300, 330, 355].map(x => `<path d="M${x} 162 l5 13 l-10 0 Z M${x} 152 l4 10 l-8 0 Z" fill="${C.bg}" opacity="0.85"/>`).join('')}
    </svg>
    <div style="position:absolute;bottom:0;left:0;right:0;height:80px;background:linear-gradient(180deg,transparent,${C.bg})"></div>
  `

  return (
    <View style={styles.container}>
      {/* Ridge hero */}
      <LinearGradient
        colors={['#2A5234', '#1B331F', C.bg]}
        locations={[0, 0.52, 1]}
        style={styles.heroGradient}
      >
        {Platform.OS === 'web' ? (
          <div
            style={{ position: 'absolute', inset: 0 } as any}
            dangerouslySetInnerHTML={{ __html: ridgeSvg }}
          />
        ) : (
          <>
            <View style={styles.treeLine}>
              {[60, 80, 45, 90, 55, 70, 40, 85, 50, 75, 42, 68, 58, 82].map((h, i) => (
                <View key={i} style={[styles.tree, {
                  borderBottomWidth: h, borderLeftWidth: h * 0.38, borderRightWidth: h * 0.38,
                  bottom: 0, left: `${i * 7.2}%` as any,
                }]} />
              ))}
            </View>
            <View style={styles.mist} />
          </>
        )}
      </LinearGradient>

      {/* Wordmark + TireTrack + tagline */}
      <View style={styles.wordmarkWrap}>
        <Text style={styles.wordmark}>
          TWOWHEEL<Text style={{ color: C.accent }}>COME</Text>
        </Text>
        <TireTrack C={C} />
        <Text style={styles.tagline}>Riders host riders</Text>
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
            {loading ? 'LOADING...' : mode === 'login' ? 'LOG IN' : 'SIGN UP'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.btnOutline}
          onPress={() => { setAuthError(''); setAuthSuccess(''); setMode(mode === 'login' ? 'register' : 'login') }}
        >
          <Text style={styles.btnOutlineText}>
            {mode === 'login' ? 'SIGN UP' : 'BACK TO LOG IN'}
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
      </View>
    </View>
  )
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg },

    heroGradient: { height: 200, overflow: 'hidden' },
    treeLine: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '100%', flexDirection: 'row' },
    tree: {
      position: 'absolute', width: 0, height: 0, backgroundColor: 'transparent',
      borderStyle: 'solid', borderLeftColor: 'transparent', borderRightColor: 'transparent', borderBottomColor: '#0A180C',
    },
    mist: {
      position: 'absolute', bottom: -10, left: 0, right: 0, height: 80,
      backgroundColor: 'rgba(28, 40, 28, 0.6)',
    },

    wordmarkWrap: {
      alignItems: 'center', paddingTop: 20, paddingBottom: 28, gap: 6,
      maxWidth: 440, width: '100%', alignSelf: 'center',
    },
    wordmark: {
      fontSize: 34, fontFamily: 'Rye_400Regular', color: C.text,
      letterSpacing: 1,
      textShadowColor: 'rgba(0,0,0,0.9)', textShadowOffset: { width: 1, height: 3 }, textShadowRadius: 6,
    },
    tagline: {
      color: C.textDim, fontSize: 10.5, letterSpacing: 3, textTransform: 'uppercase',
      fontFamily: 'Oswald_700Bold', marginTop: 2,
    },

    form: { paddingHorizontal: 24, gap: 12, maxWidth: 440, width: '100%', alignSelf: 'center' },

    inputWrap: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: C.elevated,
      borderRadius: 100, paddingHorizontal: 18, borderWidth: 1, borderColor: C.border, height: 54,
    },
    inputIcon: { marginRight: 10 },
    input: { flex: 1, color: C.text, fontSize: 15 },

    btnPrimary: {
      height: 54, backgroundColor: C.accent, borderRadius: 100,
      alignItems: 'center', justifyContent: 'center', marginTop: 4,
    },
    btnPrimaryText: {
      color: C.white, fontFamily: 'Oswald_700Bold', fontSize: 16, letterSpacing: 1.5,
    },
    btnOutline: {
      height: 54, borderRadius: 100, borderWidth: 1.5, borderColor: C.borderMid,
      alignItems: 'center', justifyContent: 'center',
    },
    btnOutlineText: { color: C.text, fontFamily: 'Oswald_700Bold', fontSize: 16, letterSpacing: 1.5 },

    forgotWrap: { alignItems: 'center', paddingVertical: 4 },
    forgotText: { color: C.textDim, fontSize: 14 },

    msgError: { backgroundColor: C.errorSoft, borderWidth: 1, borderColor: C.errorBorder, borderRadius: 14, padding: 14 },
    msgErrorText: { color: C.error, fontSize: 13, lineHeight: 19 },
    msgSuccess: { backgroundColor: C.successSoft, borderWidth: 1, borderColor: C.successBorder, borderRadius: 14, padding: 14 },
    msgSuccessText: { color: C.success, fontSize: 13, lineHeight: 19 },
  })
}
