import { create } from 'zustand'

interface SyncState {
  syncing: boolean
  lines: SyncProgress[]
  start: () => Promise<void>
  reset: () => void
}

export const useSyncStore = create<SyncState>((set, get) => ({
  syncing: false,
  lines: [],
  async start() {
    if (get().syncing) return
    set({ syncing: true, lines: [] })
    try {
      await window.api.sync.start()
    } catch (err) {
      set((s) => ({
        syncing: false,
        lines: [...s.lines, { status: 'error', message: (err as Error).message }]
      }))
    }
  },
  reset() {
    set({ lines: [] })
  }
}))

// Subscribe to main-process progress events once for the lifetime of the renderer.
// Progress lines accumulate in the store regardless of which page is mounted,
// so navigating away from Settings during a sync no longer drops the log.
window.api.sync.onProgress((progress) => {
  useSyncStore.setState((s) => ({
    lines: [...s.lines, progress],
    syncing: progress.status === 'running'
  }))
})
