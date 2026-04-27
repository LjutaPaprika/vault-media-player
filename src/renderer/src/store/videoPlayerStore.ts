import { create } from 'zustand'

interface VideoPlayerState {
  active: boolean
  filePath: string | null
  category: string | undefined
  paused: boolean
  currentTime: number
  duration: number
  audioTracks: MpvTrack[]
  subtitleTracks: MpvTrack[]
}

interface VideoPlayerActions {
  open: (filePath: string, category?: string) => void
  close: () => void
  setPaused: (p: boolean) => void
  setCurrentTime: (t: number) => void
  setDuration: (d: number) => void
  setTracks: (tracks: MpvTrack[]) => void
}

const INITIAL: VideoPlayerState = {
  active: false,
  filePath: null,
  category: undefined,
  paused: false,
  currentTime: 0,
  duration: 0,
  audioTracks: [],
  subtitleTracks: []
}

export const useVideoPlayerStore = create<VideoPlayerState & VideoPlayerActions>((set) => ({
  ...INITIAL,

  open(filePath, category) {
    // macOS: fall back to existing detached window — don't set active:true
    if (window.api.platform === 'darwin') {
      window.api.mpv.launch(filePath, category).catch(console.error)
      return
    }
    set({ ...INITIAL, active: true, filePath, category })
    window.api.mpv.launch(filePath, category).catch(console.error)
  },

  close() {
    window.api.mpv.quit().catch(console.error)
    set(INITIAL)
  },

  setPaused: (paused) => set({ paused }),
  setCurrentTime: (currentTime) => set({ currentTime }),
  setDuration: (duration) => set({ duration }),
  setTracks: (tracks) => set({
    audioTracks: tracks.filter((t) => t.type === 'audio'),
    subtitleTracks: tracks.filter((t) => t.type === 'sub')
  })
}))

/** Call once on app startup to wire push events from the main process into the store. */
export function initVideoPlayerListeners(): void {
  window.api.mpv.onTimePos((t) => useVideoPlayerStore.getState().setCurrentTime(t))
  window.api.mpv.onPause((p) => useVideoPlayerStore.getState().setPaused(p))
  window.api.mpv.onDuration((d) => useVideoPlayerStore.getState().setDuration(d))
  window.api.mpv.onTrackList((tracks) => useVideoPlayerStore.getState().setTracks(tracks))
  window.api.mpv.onEnded(() => useVideoPlayerStore.getState().close())
}
