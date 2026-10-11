import { useEffect, useRef } from 'react'
import { create } from 'zustand'

export type Page = 'home' | 'movies' | 'tv' | 'anime' | 'youtube' | 'music' | 'books' | 'manga' | 'comics' | 'games' | 'arcade' | 'stats' | 'storage' | 'settings'

// 'sidebar' = controller/keyboard controls sidebar navigation
// 'content' = controller/keyboard controls the media grid / page content
export type FocusZone = 'sidebar' | 'content'

/**
 * Something another page (Home) asked a shelf to open once it shows: a film's
 * modal, a series' page, or a chapter straight in the reader.
 */
export interface OpenRequest {
  page: Page
  /** Film file, or the chapter to open in the reader. */
  filePath?: string
  /** Series title (TV, anime) or folder name (manga, comics). */
  series?: string
  /** Where to resume a chapter: a page, or a chapter position for a book. */
  startAt?: number
  /** The page that asked; filled in by requestOpen. */
  from?: Page
}

/** Fade-out before a cross-page jump, and the fade back in after it (CSS too). */
export const VEIL_MS = 140
/** Longest the veil waits for a shelf to open what it was asked for. */
const VEIL_GIVE_UP_MS = 2500

interface AppState {
  activePage: Page
  focusZone: FocusZone
  // Incremented on every setActivePage call (even to the same page), so pages
  // can useEffect on it to reset their local selection state.
  contentResetKey: number
  // Label stored on disk (e.g. "VAULT") — null means not configured yet
  libraryLabel: string | null
  // Path resolved at runtime (e.g. "E:\") — null means drive not currently connected
  libraryPath: string | null
  navHistory: Page[]
  openRequest: OpenRequest | null
  /** The content area is faded out for a cross-page jump. */
  veil: boolean
  setActivePage: (page: Page) => void
  /**
   * Fades the content out, runs `go`, and fades it back in once the page
   * shows what it was asked to open, so the shelf in between never flashes.
   */
  transition: (go: () => void) => void
  /** Back from something another page opened: to that page, with the fade. */
  returnFromOpen: () => void
  /** Go to a shelf and open something on it. */
  requestOpen: (req: OpenRequest) => void
  /** The shelf takes the request, so it opens only once. */
  takeOpenRequest: (page: Page) => OpenRequest | null
  popNav: () => void
  setFocusZone: (zone: FocusZone) => void
  setLibrary: (label: string, path: string | null) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  activePage: 'home',
  focusZone: 'sidebar',
  contentResetKey: 0,
  libraryLabel: null,
  libraryPath: null,
  navHistory: [],
  openRequest: null,
  veil: false,
  transition: (go) => {
    if (get().veil) return
    set({ veil: true })
    setTimeout(() => {
      go()
      const started = Date.now()
      const reveal = (): void => {
        // Wait for the destination to take its request: a shelf takes it once
        // its list has loaded, which is when it can open the item.
        if (get().openRequest) {
          if (Date.now() - started < VEIL_GIVE_UP_MS) { setTimeout(reveal, 30); return }
          set({ openRequest: null })
        }
        // Two frames, so what it opened has painted before it's uncovered.
        requestAnimationFrame(() => requestAnimationFrame(() => set({ veil: false })))
      }
      reveal()
    }, VEIL_MS)
  },
  returnFromOpen: () => get().transition(() => get().popNav()),
  requestOpen: (req) => set((s) => ({
    openRequest: { ...req, from: s.activePage },
    activePage: req.page,
    contentResetKey: s.contentResetKey + 1,
    navHistory: s.activePage !== req.page ? [...s.navHistory.slice(-9), s.activePage] : s.navHistory
  })),
  takeOpenRequest: (page) => {
    const req = get().openRequest
    if (!req || req.page !== page) return null
    set({ openRequest: null })
    return req
  },
  setActivePage: (page) => set((s) => ({
    activePage: page,
    contentResetKey: s.contentResetKey + 1,
    navHistory: s.activePage !== page
      ? [...s.navHistory.slice(-9), s.activePage]
      : s.navHistory
  })),
  popNav: () => set((s) => {
    if (s.navHistory.length === 0) return {}
    const prev = s.navHistory[s.navHistory.length - 1]
    return { activePage: prev, contentResetKey: s.contentResetKey + 1, navHistory: s.navHistory.slice(0, -1) }
  }),
  setFocusZone: (zone) => set({ focusZone: zone }),
  setLibrary: (label, path) => set({ libraryLabel: label, libraryPath: path })
}))

/**
 * A shelf's side of an open request: takes it once the shelf is `ready`, and
 * remembers which page asked. `backOr` then closes the view that was opened by
 * going back to that page, rather than uncovering the shelf it sits on, and
 * otherwise runs the shelf's own close.
 *
 * Only the view the request opened goes back. Anything opened from inside it
 * closes as usual, back to that view, and closing that view goes back.
 */
export function useOpenRequest(page: Page, ready: boolean, open: (req: OpenRequest) => boolean): {
  backOr: (local: () => void) => void
} {
  const from = useRef<Page | null>(null)
  const resetKey = useAppStore((s) => s.contentResetKey)
  useEffect(() => {
    if (!ready) return
    const req = useAppStore.getState().takeOpenRequest(page)
    if (!req) return
    // Nothing to open (renamed since, say): nothing to go back from either.
    from.current = open(req) ? req.from ?? null : null
  }, [ready, resetKey])
  return {
    backOr: (local) => {
      if (from.current) {
        from.current = null
        useAppStore.getState().returnFromOpen()
      } else local()
    }
  }
}
