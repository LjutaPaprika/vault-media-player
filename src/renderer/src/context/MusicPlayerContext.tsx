import { createContext, useContext, useRef, useState, useCallback, useEffect, ReactNode } from 'react'

export interface Track {
  path: string
  title: string
  artist?: string
  trackNumber: number
  duration: number
  artPath?: string | null
}

export interface AlbumMeta {
  title: string
  artist: string
  artPath: string | null
}

interface PlayerContextValue {
  queue: Track[]
  currentIndex: number
  albumMeta: AlbumMeta | null
  playing: boolean
  currentTime: number
  duration: number
  volume: number
  shuffleEnabled: boolean
  loopEnabled: boolean
  play: (tracks: Track[], index: number, meta: AlbumMeta) => void
  playTrack: (index: number) => void
  togglePlay: () => void
  next: () => void
  prev: () => void
  seek: (time: number) => void
  setVolume: (vol: number) => void
  toggleShuffle: () => void
  setShuffle: (enabled: boolean) => void
  toggleLoop: () => void
}

function toMediaUrl(filePath: string): string {
  return 'media:///' + encodeURI(filePath.replace(/\\/g, '/'))
}

function shuffleRest(tracks: Track[], firstIndex: number): Track[] {
  const first = tracks[firstIndex]
  const rest  = tracks.filter((_, i) => i !== firstIndex).sort(() => Math.random() - 0.5)
  return [first, ...rest]
}

const MusicPlayerContext = createContext<PlayerContextValue | null>(null)

export function MusicPlayerProvider({ children }: { children: ReactNode }): JSX.Element {
  const audioRef = useRef<HTMLAudioElement>(null)

  const [queue, setQueue]               = useState<Track[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [albumMeta, setAlbumMeta]       = useState<AlbumMeta | null>(null)
  const [playing, setPlaying]           = useState(false)
  const [currentTime, setCurrentTime]   = useState(0)
  const [duration, setDuration]         = useState(0)
  const [volume, setVolumeState]        = useState(1)
  const [shuffleEnabled, setShuffleEnabled] = useState(false)
  const [loopEnabled,    setLoopEnabled]    = useState(false)

  // Refs so callbacks always read the latest values without stale closures
  const queueRef          = useRef<Track[]>([])
  const currentIndexRef   = useRef(0)
  const shuffleRef        = useRef(false)
  const loopRef           = useRef(false)
  const originalQueueRef  = useRef<Track[]>([])  // unshuffled source of truth
  const ffprobeDurationRef = useRef(0)           // ffprobe-reported duration for the current track

  function commitQueue(q: Track[], idx: number): void {
    queueRef.current        = q
    currentIndexRef.current = idx
    setQueue(q)
    setCurrentIndex(idx)
  }

  const loadTrack = useCallback((tracks: Track[], index: number, autoPlay: boolean) => {
    const audio = audioRef.current
    const track = tracks[index]
    if (!audio || !track) return
    // Seed duration immediately from ffprobe so VBR re-estimation doesn't inflate it
    ffprobeDurationRef.current = track.duration || 0
    if (track.duration) setDuration(track.duration)
    audio.src = toMediaUrl(track.path)
    if (autoPlay) audio.play().catch(() => setPlaying(false))
  }, [])

  // Start playing a set of tracks. If shuffle is on, the chosen track plays first
  // and the remainder are randomised; originalQueue always stores the straight order.
  const play = useCallback((tracks: Track[], index: number, meta: AlbumMeta) => {
    originalQueueRef.current = tracks
    setAlbumMeta(meta)
    setPlaying(true)

    if (shuffleRef.current) {
      const shuffled = shuffleRest(tracks, index)
      commitQueue(shuffled, 0)
      loadTrack(shuffled, 0, true)
    } else {
      commitQueue(tracks, index)
      loadTrack(tracks, index, true)
    }
  }, [loadTrack])

  // Jump to a specific index within the current queue (used from track list)
  const playTrack = useCallback((index: number) => {
    currentIndexRef.current = index
    setCurrentIndex(index)
    setPlaying(true)
    loadTrack(queueRef.current, index, true)
  }, [loadTrack])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) { audio.play().catch(() => {}); setPlaying(true) }
    else              { audio.pause();                  setPlaying(false) }
  }, [])

  const next = useCallback(() => {
    const q = queueRef.current
    const i = currentIndexRef.current
    const n = i + 1 < q.length ? i + 1 : (loopRef.current ? 0 : -1)
    if (n === -1) return
    currentIndexRef.current = n
    setCurrentIndex(n)
    loadTrack(q, n, true)
    setPlaying(true)
  }, [loadTrack])

  const prev = useCallback(() => {
    const audio = audioRef.current
    if (audio && audio.currentTime > 3) { audio.currentTime = 0; return }
    const q = queueRef.current
    const i = currentIndexRef.current
    const p = Math.max(i - 1, 0)
    if (p !== i) {
      currentIndexRef.current = p
      setCurrentIndex(p)
      loadTrack(q, p, true)
      setPlaying(true)
    }
  }, [loadTrack])

  const seek = useCallback((time: number) => {
    const audio = audioRef.current
    if (audio) audio.currentTime = time
  }, [])

  const setVolume = useCallback((vol: number) => {
    const audio = audioRef.current
    if (audio) audio.volume = vol
    setVolumeState(vol)
  }, [])

  // Toggle shuffle on/off while music is already playing.
  // On:  save original order, reshuffle remaining tracks (current track stays put at index 0).
  // Off: restore original order, current track keeps playing from its correct chronological position.
  const toggleShuffle = useCallback(() => {
    const enabling = !shuffleRef.current
    shuffleRef.current = enabling
    setShuffleEnabled(enabling)

    const q   = queueRef.current
    const ci  = currentIndexRef.current

    if (enabling) {
      originalQueueRef.current = q
      const shuffled = shuffleRest(q, ci)
      commitQueue(shuffled, 0)
      // Audio keeps playing — no loadTrack call needed
    } else {
      const original    = originalQueueRef.current
      const currentPath = q[ci]?.path
      const restored    = original.length > 0 ? original : q
      const newIdx      = restored.findIndex(t => t.path === currentPath)
      commitQueue(restored, newIdx >= 0 ? newIdx : 0)
    }
  }, [])

  // Set shuffle state directly (used by the album-page Shuffle button to
  // ensure shuffle is on before calling play(), without reshuffling the live queue)
  const setShuffle = useCallback((enabled: boolean) => {
    shuffleRef.current = enabled
    setShuffleEnabled(enabled)
  }, [])

  const toggleLoop = useCallback(() => {
    loopRef.current = !loopRef.current
    setLoopEnabled(loopRef.current)
  }, [])

  // Pause music whenever MPV opens a video/audio file
  useEffect(() => {
    return window.api.playback.onMusicPause(() => {
      const audio = audioRef.current
      if (audio && !audio.paused) {
        audio.pause()
        setPlaying(false)
      }
    })
  }, [])

  function handleEnded(): void {
    const q = queueRef.current
    const i = currentIndexRef.current
    if (i < q.length - 1) {
      const n = i + 1
      currentIndexRef.current = n
      setCurrentIndex(n)
      loadTrack(q, n, true)
    } else if (loopRef.current) {
      // Loop: restart from first track
      currentIndexRef.current = 0
      setCurrentIndex(0)
      loadTrack(q, 0, true)
    } else {
      setPlaying(false)
    }
  }

  return (
    <MusicPlayerContext.Provider value={{
      queue, currentIndex, albumMeta, playing, currentTime, duration, volume, shuffleEnabled, loopEnabled,
      play, playTrack, togglePlay, next, prev, seek, setVolume, toggleShuffle, setShuffle, toggleLoop
    }}>
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => {
          // Only trust the browser's duration if ffprobe didn't give us one
          if (!ffprobeDurationRef.current) setDuration(e.currentTarget.duration || 0)
        }}
        onEnded={handleEnded}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        style={{ display: 'none' }}
      />
      {children}
    </MusicPlayerContext.Provider>
  )
}

export function useMusicPlayer(): PlayerContextValue {
  const ctx = useContext(MusicPlayerContext)
  if (!ctx) throw new Error('useMusicPlayer must be used inside MusicPlayerProvider')
  return ctx
}
