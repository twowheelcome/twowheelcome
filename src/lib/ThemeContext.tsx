import React, { createContext, useContext } from 'react'
import { LIGHT, type ThemeColors } from './theme'

export type { ThemeColors }

const ThemeContext = createContext<ThemeColors>(LIGHT)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <ThemeContext.Provider value={LIGHT}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeColors {
  return useContext(ThemeContext)
}
