import { userKey } from '@/lib/userKey'

export type ThemeMode = 'light' | 'dark'

const THEME_KEY = 'SYCORE_THEME'

export function readStoredTheme(): ThemeMode {
  const stored = localStorage.getItem(userKey(THEME_KEY))
  if (stored === 'light' || stored === 'dark') return stored
  return 'dark'
}

export function storeTheme(mode: ThemeMode): void {
  localStorage.setItem(userKey(THEME_KEY), mode)
}

export function applyTheme(mode: ThemeMode): void {
  document.documentElement.classList.toggle('dark', mode === 'dark')
}
