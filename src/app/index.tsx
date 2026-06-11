import { Session } from '@supabase/supabase-js'
import { router } from 'expo-router'
import { useEffect, useState } from 'react'
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import { supabase } from '../lib/supabase'
import { C } from '../lib/theme'

export default function AuthScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [isLogin, setIsLogin] = useState(true)
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
    })
    supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
    })
  }, [])

  useEffect(() => {
    if (session) {
      router.replace('/(tabs)/map')
    }
  }, [session])

  async function handleAuth() {
    setLoading(true)
    if (isLogin) {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) Alert.alert('Chyba', error.message)
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) Alert.alert('Chyba', error.message)
      else Alert.alert('Hotovo!', 'Zkontroluj email a potvrď registraci. 🤘')
    }
    setLoading(false)
  }

  return (
    <View style={styles.container}>
      <Text style={styles.logo}><Text style={styles.logoAccent}>TWO</Text>WHEEL<Text style={styles.logoAccent}>COME</Text></Text>
      <Text style={styles.sub}>Hospitality for two-wheelers</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor="#666"
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <TextInput
        style={styles.input}
        placeholder="Heslo"
        placeholderTextColor="#666"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />

      <TouchableOpacity style={styles.button} onPress={handleAuth} disabled={loading}>
        <Text style={styles.buttonText}>
          {loading ? 'Moment...' : isLogin ? 'PŘIHLÁSIT SE' : 'REGISTROVAT SE'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={() => setIsLogin(!isLogin)}>
        <Text style={styles.toggle}>
          {isLogin ? 'Nemáš účet? Registruj se' : 'Už máš účet? Přihlaš se'}
        </Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  logo: {
    fontFamily: 'System',
    fontSize: 32,
    fontWeight: '900',
    color: C.text,
    letterSpacing: 2,
    marginBottom: 4,
  },
  logoAccent: {
    color: C.accent,
  },
  sub: {
    color: C.textDim,
    fontSize: 12,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 48,
  },
  input: {
    width: '100%',
    backgroundColor: C.elevated,
    borderRadius: 10,
    padding: 14,
    color: C.text,
    fontSize: 15,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: C.border,
  },
  button: {
    width: '100%',
    backgroundColor: C.accent,
    borderRadius: 10,
    padding: 16,
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
  },
  buttonText: {
    color: C.white,
    fontWeight: '700',
    fontSize: 15,
    letterSpacing: 1,
  },
  toggle: {
    color: C.textDim,
    fontSize: 14,
  },
})