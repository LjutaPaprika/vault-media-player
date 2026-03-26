import { createContext, useContext, useRef, useState, useCallback, ReactNode } from 'react'

export interface Track {
  path: string
  title: string
  trackNumber: number
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
  play: (tracks: Track[], index: number, meta: AlbumMeta) => void
  playTrack: (index: number) => void
  togglePlay: () => void
  next: () => void
  prev: () => void
  seek: (time: number) => void
  setVolume: (vol: number) => void
}

function toMediaUrl(filePath: string): string {
  return 'media:///' + encodeURI(filePath.replace(/\\/g, '/'))
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

  const loadTrack = useCallback((tracks: Track[], index: number, autoPlay: boolean) => {
    const audio = audioRef.current
    const track = tracks[index]
    if (!audio || !track) return
    audio.src = toMediaUrl(track.path)
    if (autoPlay) audio.play().catch(() => setPlaying(false))
  }, [])

  const play = useCallback((tracks: Track[], index: number, meta: AlbumMeta) => {
    setQueue(tracks)
    setCurrentIndex(index)
    setAlbumMeta(meta)
    setPlaying(true)
    loadTrack(tracks, index, true)
  }, [loadTrack])

  const playTrack = useCallback((index: number) => {
    setCurrentIndex(index)
    setPlaying(true)
    setQueue((q) => { loadTrack(q, index, true); return q })
  }, [loadTrack])

  const togglePlay = useCallback(() => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) { audio.play().catch(() => {}); setPlaying(true) }
    else              { audio.pause();                  setPlaying(false) }
  }, [])

  const next = useCallback(() => {
    setCurrentIndex((i) => {
      setQueue((q) => {
        const n = Math.min(i + 1, q.length - 1)
        if (n !== i) { loadTrack(q, n, true); return q }
        return q
      })
      return Math.min(i + 1, queue.length - 1)
    })
    setPlaying(true)
  }, [queue.length, loadTrack])

  const prev = useCallback(() => {
    const audio = audioRef.current
    if (audio && audio.currentTime > 3) { audio.currentTime = 0; return }
    setCurrentIndex((i) => {
      setQueue((q) => {
        const p = Math.max(i - 1, 0)
        if (p !== i) { loadTrack(q, p, true); return q }
        return q
      })
      return Math.max(i - 1, 0)
    })
    setPlaying(true)
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

  function handleEnded(): void {
    setCurrentIndex((i) => {
      setQueue((q) => {
        if (i < q.length - 1) { loadTrack(q, i + 1, true); return q }
        setPlaying(false)
        return q
      })
      return i < queue.length - 1 ? i + 1 : i
    })
  }

  return (
    <MusicPlayerContext.Provider value={{
      queue, currentIndex, albumMeta, playing, currentTime, duration, volume,
      play, playTrack, togglePlay, next, prev, seek, setVolume
    }}>
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
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
