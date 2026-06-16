import AsyncStorage from '@react-native-async-storage/async-storage'
import { createClient } from '@supabase/supabase-js'
import { Platform } from 'react-native'

const SUPABASE_URL = 'https://igrmxzvnadqckxjachdc.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable__9ut7dzGoOq3ZabRwoDabg_Rznv47CA'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: Platform.OS === 'web' ? undefined : AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: Platform.OS === 'web',
  },
})
