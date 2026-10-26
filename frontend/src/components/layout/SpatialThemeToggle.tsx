'use client'

import { useEffect } from 'react'

/**
 * Enforces the Classic enterprise light theme permanently.
 * Cleans up any legacy theme tokens from local storage and DOM.
 */
export function ThemeModeSwitch() {
  useEffect(() => {
    try {
      localStorage.removeItem('cloudcost_theme_mode')
      if (typeof document !== 'undefined') {
        document.documentElement.classList.remove('liquid-glass', 'spatial-ui', 'minimal-ui')
      }
    } catch {
      // ignore
    }
  }, [])

  return null
}

export const SpatialThemeToggle = ThemeModeSwitch
export const LiquidGlassToggle = ThemeModeSwitch

export function FloatingSpatialDock() {
  return null
}
