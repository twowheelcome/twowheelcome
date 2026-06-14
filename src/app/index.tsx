import { Session } from '@supabase/supabase-js'
import { router } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View, ScrollView } from 'react-native'
import { Feather } from '@expo/vector-icons'
import { supabase } from '../lib/supabase'
import { useTheme, type ThemeColors } from '../lib/ThemeContext'

// ── Hero illustration — mountains + helmet + road ─────────────────────────

function HeroIllustration({ C }: { C: ThemeColors }) {
  const w = 390, h = 300

  // Mountain color layers — derived from theme surface/elevated
  const m1 = C.surface    // far mountains
  const m2 = C.elevated   // mid mountains
  // near mountains: tint slightly beyond elevated
  const isDark = C.bg === '#2F3438'
  const m3 = isDark ? '#232C36' : '#C0B09A'

  // Helmet fill = text color (cream in dark, near-black in light)
  const hFill = C.text
  // Visor cutout = bg
  const vFill = C.bg

  // Road tire track crossbars
  const crossbars = [280, 255, 234, 216, 200, 187].map((y, i) => {
    const spread = 14 + (280 - y) * 0.18
    const cx = 195
    return `<line x1="${(cx - spread).toFixed(0)}" y1="${y}" x2="${(cx + spread).toFixed(0)}" y2="${y}" stroke="${C.accent}" stroke-width="3.5" stroke-linecap="round" opacity="0.75"/>`
  }).join('')

  const svg = `
<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}" style="display:block;max-width:100%">
  <defs>
    <linearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${C.bg}" stop-opacity="0"/>
      <stop offset="100%" stop-color="${C.bg}" stop-opacity="1"/>
    </linearGradient>
  </defs>

  <!-- Sky -->
  <rect width="${w}" height="${h}" fill="${C.bg}"/>

  <!-- Mountains — far -->
  <path d="M-5,${h} L-5,175 L35,125 L75,155 L115,108 L155,138 L200,88 L245,118 L285,82 L330,108 L365,88 L${w+5},105 L${w+5},${h} Z"
        fill="${m1}" opacity="0.55"/>

  <!-- Mountains — mid -->
  <path d="M-5,${h} L-5,205 L28,168 L68,192 L105,160 L145,180 L182,150 L220,172 L258,144 L298,168 L335,148 L370,165 L${w+5},155 L${w+5},${h} Z"
        fill="${m1}" opacity="0.85"/>

  <!-- Mountains — near -->
  <path d="M-5,${h} L-5,238 L22,215 L55,235 L88,208 L122,228 L155,205 L190,222 L225,200 L260,218 L292,198 L325,215 L358,200 L${w+5},212 L${w+5},${h} Z"
        fill="${m2}"/>

  <!-- Road — left track -->
  <path d="M178,${h} Q 181,255 187,222 Q 191,198 193,175"
        fill="none" stroke="${C.accent}" stroke-width="3.5" stroke-linecap="round" opacity="0.7"/>
  <!-- Road — right track -->
  <path d="M212,${h} Q 209,255 203,222 Q 199,198 197,175"
        fill="none" stroke="${C.accent}" stroke-width="3.5" stroke-linecap="round" opacity="0.7"/>
  <!-- Crossbars -->
  ${crossbars}

  <!-- ── Helmet ──────────────────────────────────────────────────────── -->
  <!-- Dome -->
  <path d="M150,168 C150,88 240,88 240,168 L237,182 C237,198 220,210 195,210 C170,210 153,198 153,182 Z"
        fill="${hFill}"/>
  <!-- Chin guard -->
  <path d="M153,175 C153,200 170,214 195,214 C220,214 237,200 237,175 Z"
        fill="${hFill}"/>

  <!-- Goggle strip -->
  <rect x="152" y="135" width="86" height="34" rx="10" fill="${vFill}" opacity="0.25"/>

  <!-- Visor A-frame opening -->
  <path d="M168,155 L195,192 L222,155 Z" fill="${vFill}"/>
  <!-- Stem below A -->
  <rect x="192" y="188" width="6" height="14" rx="2" fill="${vFill}"/>

  <!-- Left goggle -->
  <ellipse cx="176" cy="142" rx="16" ry="11" fill="${vFill}" opacity="0.35"/>
  <!-- Right goggle -->
  <ellipse cx="214" cy="142" rx="16" ry="11" fill="${vFill}" opacity="0.35"/>

  <!-- Tread marks — left side -->
  <rect x="130" y="148" width="17" height="5.5" rx="1.5" fill="${vFill}" opacity="0.45" transform="rotate(-22 138 150)"/>
  <rect x="127" y="162" width="17" height="5.5" rx="1.5" fill="${vFill}" opacity="0.45" transform="rotate(-15 135 164)"/>
  <rect x="126" y="176" width="17" height="5.5" rx="1.5" fill="${vFill}" opacity="0.4"  transform="rotate(-6 134 178)"/>

  <!-- Tread marks — right side -->
  <rect x="243" y="148" width="17" height="5.5" rx="1.5" fill="${vFill}" opacity="0.45" transform="rotate(22 251 150)"/>
  <rect x="246" y="162" width="17" height="5.5" rx="1.5" fill="${vFill}" opacity="0.45" transform="rotate(15 254 164)"/>
  <rect x="247" y="176" width="17" height="5.5" rx="1.5" fill="${vFill}" opacity="0.4"  transform="rotate(6 255 178)"/>

  <!-- Fade to bg at bottom -->
  <rect x="0" y="240" width="${w}" height="60" fill="url(#fade)"/>
</svg>`

  if (Platform.OS === 'web') {
    return (
      <div
        style={{ width: '100%', overflow: 'hidden', flexShrink: 0 } as any}
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    )
  }

  // Native fallback — simple gradient block
  return (
    <View style={{ height: h, backgroundColor: C.surface, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 60 }}>🏔</Text>
    </View>
  )
}

// ── Auth screen ───────────────────────────────────────────────────────────

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

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer} bounces={false}>
      {/* Hero illustration */}
      <HeroIllustration C={C} />

      {/* Wordmark */}
      <View style={styles.wordmarkWrap}>
        <Text style={styles.wordmark}>twowheelcome</Text>
        <Text style={styles.tagline}>THE ADV COMMUNITY HOME</Text>
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
    </ScrollView>
  )
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    container:        { flex: 1, backgroundColor: C.bg },
    contentContainer: { flexGrow: 1 },

    wordmarkWrap: {
      alignItems: 'center', paddingTop: 8, paddingBottom: 24, gap: 4,
      maxWidth: 440, width: '100%', alignSelf: 'center',
    },
    wordmark: {
      fontSize: 30, fontFamily: 'Rye_400Regular', color: C.text, letterSpacing: 0.5,
    },
    tagline: {
      color: C.accent, fontSize: 11, letterSpacing: 3, textTransform: 'uppercase',
      fontFamily: 'Oswald_700Bold',
    },

    form: { paddingHorizontal: 24, gap: 12, maxWidth: 440, width: '100%', alignSelf: 'center', paddingBottom: 40 },

    inputWrap: {
      flexDirection: 'row', alignItems: 'center', backgroundColor: C.elevated,
      borderRadius: 100, paddingHorizontal: 18, borderWidth: 1, borderColor: C.border, height: 54,
    },
    inputIcon: { marginRight: 10 },
    input:     { flex: 1, color: C.text, fontSize: 15 },

    btnPrimary:     { height: 54, backgroundColor: C.accent, borderRadius: 100, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
    btnPrimaryText: { color: C.white, fontFamily: 'Oswald_700Bold', fontSize: 16, letterSpacing: 1.5 },
    btnOutline:     { height: 54, borderRadius: 100, borderWidth: 1.5, borderColor: C.borderMid, alignItems: 'center', justifyContent: 'center' },
    btnOutlineText: { color: C.text, fontFamily: 'Oswald_700Bold', fontSize: 16, letterSpacing: 1.5 },

    forgotWrap: { alignItems: 'center', paddingVertical: 4 },
    forgotText: { color: C.textDim, fontSize: 14 },

    msgError:       { backgroundColor: C.errorSoft, borderWidth: 1, borderColor: C.errorBorder, borderRadius: 14, padding: 14 },
    msgErrorText:   { color: C.error, fontSize: 13, lineHeight: 19 },
    msgSuccess:     { backgroundColor: C.successSoft, borderWidth: 1, borderColor: C.successBorder, borderRadius: 14, padding: 14 },
    msgSuccessText: { color: C.success, fontSize: 13, lineHeight: 19 },
  })
}
