import { create } from 'zustand'

export type Page = 'home' | 'movies' | 'tv' | 'anime' | 'music' | 'books' | 'manga' | 'games' | 'stats' | 'settings'

// 'sidebar' = controller/keyboard controls sidebar navigation
// 'content' = controller/keyboard controls the media grid / page content
export type FocusZone = 'sidebar' | 'content'

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
  setActivePage: (page: Page) => void
  setFocusZone: (zone: FocusZone) => void
  setLibrary: (label: string, path: string | null) => void
}

export const useAppStore = create<AppState>((set) => ({
  activePage: 'home',
  focusZone: 'sidebar',
  contentResetKey: 0,
  libraryLabel: null,
  libraryPath: null,
  setActivePage: (page) => set((s) => ({ activePage: page, contentResetKey: s.contentResetKey + 1 })),
  setFocusZone: (zone) => set({ focusZone: zone }),
  setLibrary: (label, path) => set({ libraryLabel: label, libraryPath: path })
}))
