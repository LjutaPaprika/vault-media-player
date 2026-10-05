// Book reader settings: global defaults in the drive's config, with an
// optional full override per book (library.db book_settings). A book either
// follows the defaults or has its own complete set; there is no field-by-field
// mixing, so what the settings panel shows is always exactly what applies.

export type ReaderTheme = 'dark' | 'sepia' | 'light' | 'black'
export type ReaderFont = 'serif' | 'sans'
export type ReaderWidth = 'narrow' | 'medium' | 'wide'
export type ReaderMargin = 'small' | 'medium' | 'large'
export type PagesPerView = 'auto' | 'one'

export interface ReaderSettings {
  /** Base text size in CSS px. */
  fontSize: number
  font: ReaderFont
  lineHeight: number
  /** How many characters a line holds, roughly: the page's measure. */
  width: ReaderWidth
  margin: ReaderMargin
  theme: ReaderTheme
  /** Keep the book's own fonts and layout, or set everything in the reader's. */
  publisherStyles: boolean
  pagesPerView: PagesPerView
}

export const DEFAULT_SETTINGS: ReaderSettings = {
  fontSize: 19,
  font: 'serif',
  lineHeight: 1.6,
  width: 'medium',
  margin: 'medium',
  theme: 'dark',
  publisherStyles: true,
  pagesPerView: 'auto',
}

export const FONT_SIZE = { min: 13, max: 34, step: 1 }
export const LINE_HEIGHT = { min: 1.2, max: 2.2, step: 0.1 }

export const FONT_STACKS: Record<ReaderFont, string> = {
  serif: 'Georgia, "Iowan Old Style", "Palatino Linotype", "Book Antiqua", serif',
  sans: '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", Arial, sans-serif',
}

/** Line length in ems: about 60, 70 and 85 characters of a book face. */
export const MEASURE_EM: Record<ReaderWidth, number> = { narrow: 27, medium: 32, wide: 39 }

/** Space around the page block, in CSS px: [horizontal, vertical]. */
export const MARGIN_PX: Record<ReaderMargin, [number, number]> = {
  small: [24, 28], medium: [56, 44], large: [104, 64],
}

/**
 * accent colours the reader's own marks (progress line, bookmark ribbon); on
 * the dark themes it follows the app's accent. link and selection are used
 * inside the book's frame, which cannot see the app's CSS variables.
 */
export interface ThemeColours { bg: string; page: string; fg: string; muted: string; link: string; selection: string; accent: string }

export const THEMES: Record<ReaderTheme, ThemeColours> = {
  dark:  { bg: '#121214', page: '#121214', fg: '#d9d6cf', muted: '#77746e', link: '#c9a86a', selection: 'rgba(201, 168, 106, 0.35)', accent: 'var(--accent)' },
  sepia: { bg: '#efe4cf', page: '#f4ead5', fg: '#4b3a26', muted: '#93806a', link: '#8a5a12', selection: 'rgba(176, 123, 34, 0.3)', accent: '#b07b22' },
  light: { bg: '#f6f6f3', page: '#fbfbf9', fg: '#1d1d1f', muted: '#86868b', link: '#2b5fb4', selection: 'rgba(43, 95, 180, 0.25)', accent: '#2b5fb4' },
  black: { bg: '#000000', page: '#000000', fg: '#c8c6c0', muted: '#5f5d58', link: '#c9a86a', selection: 'rgba(201, 168, 106, 0.35)', accent: 'var(--accent)' },
}

const GLOBAL_KEY = 'bookReader.settings'

function sanitise(raw: unknown): ReaderSettings {
  const s = { ...DEFAULT_SETTINGS, ...(raw && typeof raw === 'object' ? raw : {}) } as ReaderSettings
  const pick = <T extends string>(v: T, allowed: readonly T[], d: T): T => (allowed.includes(v) ? v : d)
  return {
    fontSize: Math.min(FONT_SIZE.max, Math.max(FONT_SIZE.min, Number(s.fontSize) || DEFAULT_SETTINGS.fontSize)),
    font: pick(s.font, ['serif', 'sans'], DEFAULT_SETTINGS.font),
    lineHeight: Math.min(LINE_HEIGHT.max, Math.max(LINE_HEIGHT.min, Number(s.lineHeight) || DEFAULT_SETTINGS.lineHeight)),
    width: pick(s.width, ['narrow', 'medium', 'wide'], DEFAULT_SETTINGS.width),
    margin: pick(s.margin, ['small', 'medium', 'large'], DEFAULT_SETTINGS.margin),
    theme: pick(s.theme, ['dark', 'sepia', 'light', 'black'], DEFAULT_SETTINGS.theme),
    publisherStyles: s.publisherStyles !== false,
    pagesPerView: pick(s.pagesPerView, ['auto', 'one'], DEFAULT_SETTINGS.pagesPerView),
  }
}

function parse(json: string | null): ReaderSettings | null {
  if (!json) return null
  try { return sanitise(JSON.parse(json)) } catch { return null }
}

export interface LoadedSettings {
  global: ReaderSettings
  /** This book's own settings, or null when it follows the global ones. */
  book: ReaderSettings | null
}

export async function loadSettings(filePath: string): Promise<LoadedSettings> {
  const [g, b] = await Promise.all([
    window.api.settings.get(GLOBAL_KEY, ''),
    window.api.books.getSettings(filePath).catch(() => null),
  ])
  return { global: parse(g) ?? DEFAULT_SETTINGS, book: parse(b) }
}

export function saveGlobalSettings(s: ReaderSettings): Promise<void> {
  return window.api.settings.set(GLOBAL_KEY, JSON.stringify(s))
}

export function saveBookSettings(filePath: string, s: ReaderSettings | null): Promise<void> {
  return window.api.books.setSettings(filePath, s ? JSON.stringify(s) : null)
}

// ─── Reading speed ───────────────────────────────────────────────────────────

const WPM_KEY = 'bookReader.wpm'
export const DEFAULT_WPM = 250

export async function loadWpm(): Promise<number> {
  const v = Number(await window.api.settings.get(WPM_KEY, String(DEFAULT_WPM)))
  return v >= 80 && v <= 900 ? v : DEFAULT_WPM
}

export function saveWpm(wpm: number): Promise<void> {
  return window.api.settings.set(WPM_KEY, String(Math.round(wpm)))
}

// ─── First-run help ──────────────────────────────────────────────────────────

const HELP_KEY = 'bookReader.helpSeen'

export async function helpSeen(): Promise<boolean> {
  return (await window.api.settings.get(HELP_KEY, '')) === '1'
}

export function markHelpSeen(): Promise<void> {
  return window.api.settings.set(HELP_KEY, '1')
}
