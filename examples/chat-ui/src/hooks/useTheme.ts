import { useState, useEffect } from 'react'
import type { Theme } from '../types'

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('theme') as Theme) || 'system')

  useEffect(() => {
    const root = window.document.documentElement
    root.classList.remove('light', 'dark')

    const effectiveTheme = theme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : theme

    root.classList.add(effectiveTheme)
    if (theme === 'system') {
      localStorage.removeItem('theme')
    } else {
      localStorage.setItem('theme', theme)
    }
  }, [theme])

  return [theme, setTheme] as const
}
