export const DEFAULT_ACCENT            = '#e8b44b'
export const DEFAULT_PILL_LAST_WATCHED = '#e8b44b'
export const DEFAULT_PILL_EXTRA        = '#4ecdc4'
export const DEFAULT_SIDEBAR_ACTIVE    = '#e8b44b'
export const DEFAULT_EPISODE_BADGE     = '#e8b44b'
export const DEFAULT_MUSIC_PROGRESS    = '#e8b44b'

export const ACCENT_PRESETS = [
  '#e8b44b', // Amber (default)
  '#4a9eff', // Blue
  '#a78bfa', // Purple
  '#5abf6a', // Green
  '#4ecdc4', // Teal
  '#f97316', // Orange
  '#f472b6', // Pink
  '#c8c8d0', // Silver
]

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.match(/^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i)
  if (!m) return null
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)]
}

export function applyColor(cssVar: string, hex: string): void {
  if (!hexToRgb(hex)) return
  document.documentElement.style.setProperty(cssVar, hex)
}

export function applyAccentColor(hex: string): void {
  const rgb = hexToRgb(hex)
  if (!rgb) return
  const [r, g, b] = rgb
  const root = document.documentElement
  root.style.setProperty('--accent', hex)
  root.style.setProperty('--accent-dim', `rgba(${r}, ${g}, ${b}, 0.4)`)
  root.style.setProperty('--accent-glow', `rgba(${r}, ${g}, ${b}, 0.15)`)
}
