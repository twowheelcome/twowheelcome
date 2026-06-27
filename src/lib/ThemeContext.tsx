import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { Appearance } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { LIGHT, DARK, type ThemeColors } from './theme'

export type { ThemeColors }
export type ThemeMode = 'light' | 'dark' | 'system'

const KEY = 'twowheelcome.themeMode'

type Ctx = {
  colors: ThemeColors
  mode: ThemeMode
  scheme: 'light' | 'dark'
  setMode: (m: ThemeMode) => void
}

const ThemeContext = createContext<Ctx>({
  colors: LIGHT,
  mode: 'system',
  scheme: 'light',
  setMode: () => {},
})

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<ThemeMode>('system')
  const [systemScheme, setSystemScheme] = useState<'light' | 'dark'>(
    Appearance.getColorScheme() === 'dark' ? 'dark' : 'light',
  )

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then(v => { if (v === 'light' || v === 'dark' || v === 'system') setModeState(v) })
      .catch(() => {})
    const sub = Appearance.addChangeListener(({ colorScheme }) =>
      setSystemScheme(colorScheme === 'dark' ? 'dark' : 'light'))
    return () => sub.remove()
  }, [])

  const setMode = useCallback((m: ThemeMode) => {
    setModeState(m)
    void AsyncStorage.setItem(KEY, m).catch(() => {})
  }, [])

  const scheme: 'light' | 'dark' = mode === 'system' ? systemScheme : mode
  const colors = scheme === 'dark' ? DARK : LIGHT

  return (
    <ThemeContext.Provider value={{ colors, mode, scheme, setMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

// Existing call sites keep using useTheme() to get the active palette.
export function useTheme(): ThemeColors {
  return useContext(ThemeContext).colors
}

// Light/Dark/System control for the Settings screen.
export function useThemeMode(): { mode: ThemeMode; scheme: 'light' | 'dark'; setMode: (m: ThemeMode) => void } {
  const { mode, scheme, setMode } = useContext(ThemeContext)
  return { mode, scheme, setMode }
}
