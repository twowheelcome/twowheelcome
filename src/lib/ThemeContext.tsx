import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { useColorScheme } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { DARK, LIGHT, type ThemeColors } from './theme'

export type { ThemeColors }
export type ThemePreference = 'system' | 'dark' | 'light'

const STORAGE_KEY = '@twowheelcome/theme'

interface ThemeContextValue {
  C: ThemeColors
  preference: ThemePreference
  setPreference: (p: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue>({
  C: DARK,
  preference: 'system',
  setPreference: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const system = useColorScheme()
  const [preference, setPreferenceState] = useState<ThemePreference>('system')

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(v => {
      if (v === 'dark' || v === 'light' || v === 'system') setPreferenceState(v)
    })
  }, [])

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p)
    AsyncStorage.setItem(STORAGE_KEY, p)
  }, [])

  const resolved = preference === 'system' ? (system ?? 'dark') : preference
  const C = resolved === 'light' ? LIGHT : DARK

  return (
    <ThemeContext.Provider value={{ C, preference, setPreference }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeColors {
  return useContext(ThemeContext).C
}

export function useThemePreference() {
  const { preference, setPreference } = useContext(ThemeContext)
  return { preference, setPreference }
}
