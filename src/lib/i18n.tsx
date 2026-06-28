import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'

// Lightweight i18n scaffold. English is the source of truth and the default; the
// other languages are listed and selectable but intentionally left empty for now —
// `t()` falls back to English until real translations land in a later step.
export const LANGUAGES = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'fr', label: 'Français' },
  { code: 'cs', label: 'Čeština' },
  { code: 'pl', label: 'Polski' },
] as const

export type LangCode = (typeof LANGUAGES)[number]['code']

const KEY = 'twowheelcome.lang'

// Only English is filled in for now. New keys go here; translations come later.
const EN: Record<string, string> = {
  'settings.title': 'Settings',
  'settings.preferences': 'Preferences',
  'settings.language': 'Language',
  'settings.languageHint': 'Choose your language. English is ready — more translations are on the way.',
  'settings.account': 'Account',
  'settings.email': 'Email',
  'settings.notifications': 'Notifications',
  'settings.notificationsSub': 'Email and push alerts',
  'settings.feedback': 'Send feedback',
  'settings.feedbackSub': 'Tell the makers what to fix or build',
  'settings.blocked': 'Blocked users',
  'settings.blockedSub': 'Manage or unblock',
  'settings.privacy': 'Privacy',
  'settings.privacySub': 'Data, exact location and account deletion',
  'settings.terms': 'Terms',
  'settings.termsSub': 'Community rules and stay requests',
  'settings.deleteAccount': 'Delete account',
}

const STRINGS: Record<LangCode, Record<string, string>> = {
  en: EN, es: {}, fr: {}, cs: {}, pl: {},
}

type Ctx = {
  lang: LangCode
  setLang: (l: LangCode) => void
  t: (key: string, fallback?: string) => string
}

const LanguageContext = createContext<Ctx>({
  lang: 'en',
  setLang: () => {},
  t: (key, fallback) => EN[key] ?? fallback ?? key,
})

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<LangCode>('en')

  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then(v => { if (v && LANGUAGES.some(l => l.code === v)) setLangState(v as LangCode) })
      .catch(() => {})
  }, [])

  const setLang = useCallback((l: LangCode) => {
    setLangState(l)
    void AsyncStorage.setItem(KEY, l).catch(() => {})
  }, [])

  const t = useCallback(
    (key: string, fallback?: string) => STRINGS[lang]?.[key] ?? EN[key] ?? fallback ?? key,
    [lang],
  )

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage(): Ctx {
  return useContext(LanguageContext)
}

export function useT(): Ctx['t'] {
  return useContext(LanguageContext).t
}
