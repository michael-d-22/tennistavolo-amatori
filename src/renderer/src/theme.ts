import { useSyncExternalStore } from 'react'

// Preferenza del tema di questo PC: non fa parte dei dati della stagione, quindi sta in localStorage.

export type ThemePref = 'dark' | 'light' | 'system'

const KEY = 'amatori-theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set<() => void>()

function read(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    if (v === 'dark' || v === 'light' || v === 'system') return v
  } catch {
    // localStorage non disponibile: si usa il predefinito
  }
  return 'dark'
}

let pref = read()

function resolved(p: ThemePref): 'dark' | 'light' {
  return p === 'system' ? (media.matches ? 'dark' : 'light') : p
}

function apply() {
  document.documentElement.dataset.theme = resolved(pref)
  // Anche la barra del titolo di Windows segue il tema.
  window.api?.setNativeTheme(pref)
}

export function initTheme() {
  apply()
  media.addEventListener('change', () => {
    if (pref === 'system') {
      apply()
      listeners.forEach((l) => l())
    }
  })
}

export function setTheme(p: ThemePref) {
  pref = p
  try {
    localStorage.setItem(KEY, p)
  } catch {
    // ignora: il tema vale comunque per questa sessione
  }
  apply()
  listeners.forEach((l) => l())
}

export function useTheme(): { pref: ThemePref; resolved: 'dark' | 'light' } {
  const p = useSyncExternalStore(
    (cb) => {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
    () => pref
  )
  return { pref: p, resolved: resolved(p) }
}

// Dimensione dell'interfaccia (moltiplica lo zoom automatico deciso in base alla finestra).

export type UiSize = 'small' | 'normal' | 'large'
export const UI_SIZES: Record<UiSize, number> = { small: 0.88, normal: 1, large: 1.15 }
const SIZE_KEY = 'amatori-ui-size'
const sizeListeners = new Set<() => void>()

function readSize(): UiSize {
  try {
    const v = localStorage.getItem(SIZE_KEY)
    if (v === 'small' || v === 'normal' || v === 'large') return v
  } catch {
    // predefinito
  }
  return 'normal'
}

let size = readSize()

export function initUiSize() {
  window.api?.setUiScale(UI_SIZES[size])
}

export function setUiSize(s: UiSize) {
  size = s
  try {
    localStorage.setItem(SIZE_KEY, s)
  } catch {
    // vale comunque per questa sessione
  }
  window.api?.setUiScale(UI_SIZES[s])
  sizeListeners.forEach((l) => l())
}

export function useUiSize(): UiSize {
  return useSyncExternalStore(
    (cb) => {
      sizeListeners.add(cb)
      return () => sizeListeners.delete(cb)
    },
    () => size
  )
}
