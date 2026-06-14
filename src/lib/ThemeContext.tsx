import React, { createContext, useContext } from 'react'
import { useColorScheme } from 'react-native'
import { DARK, LIGHT, type ThemeColors } from './theme'

export type { ThemeColors }

const ThemeContext = createContext<ThemeColors>(DARK)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const scheme = useColorScheme()
  const C = scheme === 'light' ? LIGHT : DARK
  return <ThemeContext.Provider value={C}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeColors {
  return useContext(ThemeContext)
}
