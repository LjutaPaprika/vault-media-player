import { useEffect, useRef, useState } from 'react'
import { useMusicPlayer, Track, AlbumMeta } from '../context/MusicPlayerContext'
import { useController } from '../hooks/useController'
import { useAppStore } from '../store/appStore'
import styles from './AlbumDetailPage.module.css'

interface Props {
  albumTitle: string
  artist: string
  year: number | null
  artPath: string | null
  firstTrackPath: string
  onBack: () => void
}

function formatTime(s: number): string {
  if (!isFinite(s) || isNaN(s) || s <= 0) return ''
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function AlbumDetailPage({ albumTitle, artist, year, artPath, firstTrackPath, onBack }: Props): JSX.Element {
  const { setFocusZone } = useAppStore()
  const { play, playTrack, togglePlay, playing, currentIndex, albumMeta, queue, seek, currentTime, shuffleEnabled, setShuffle, toggleShuffle } = useMusicPlayer()
  const currentTimeRef = useRef(0)
  useEffect(() => { currentTimeRef.current = currentTime }, [currentTime])
  const [tracks, setTracks] = useState<Track[]>([])
  const [artSrc, setArtSrc] = useState<string | null>(null)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const focusedIdxRef = useRef(0)
  const tracksRef = useRef<Track[]>([])

  const isThisAlbum = albumMeta?.title === albumTitle && albumMeta?.artist === artist
  const meta: AlbumMeta = { title: albumTitle, artist, artPath }

  useEffect(() => {
    window.api.library.getAlbumTracks(firstTrackPath).then(setTracks)
  }, [firstTrackPath])

  useEffect(() => {
    if (!artPath) return
    window.api.library.readImage(artPath).then(setArtSrc)
  }, [artPath])

  function handlePlay(index: number): void {
    const clickedPath  = tracks[index]?.path
    const playingPath  = isThisAlbum ? queue[currentIndex]?.path : null
    const isCurrentTrack = clickedPath === playingPath

    if (isThisAlbum && queue.length > 0) {
      if (isCurrentTrack) { togglePlay(); return }
      // When shuffle is on, clicking a track restarts shuffle from that track
      if (shuffleEnabled) {
        play(tracks, index, meta)
      } else {
        playTrack(index)
      }
    } else {
      play(tracks, index, meta)
    }
  }

  function handlePlayAll(): void {
    play(tracks, 0, meta)
  }

  function handleShuffle(): void {
    if (isThisAlbum && queue.length > 0) {
      // Album already playing — toggle shuffle without restarting, same as the player bar button
      toggleShuffle()
    } else {
      // Different album or nothing playing — start this album in shuffle mode
      setShuffle(true)
      play(tracks, Math.floor(Math.random() * tracks.length), meta)
    }
  }

  useEffect(() => { tracksRef.current = tracks }, [tracks])

  const { resetState } = useController({ onButton: (btn) => {
    if (btn === 'back') { setFocusZone('content'); onBack(); return }
    if (btn === 'up') {
      const next = Math.max(0, focusedIdxRef.current - 1)
      focusedIdxRef.current = next
      setFocusedIdx(next)
    }
    if (btn === 'down') {
      const next = Math.min(tracksRef.current.length - 1, focusedIdxRef.current + 1)
      focusedIdxRef.current = next
      setFocusedIdx(next)
    }
    if (btn === 'left')  seek(Math.max(0, currentTimeRef.current - 10))
    if (btn === 'right') seek(currentTimeRef.current + 10)
    if (btn === 'confirm') handlePlay(focusedIdxRef.current)
  } })

  // Absorb any held buttons when detail page mounts (e.g. A held from card selection)
  useEffect(() => { resetState() }, [])

  // Compare by path rather than index so shuffled queues highlight correctly
  const currentPath = isThisAlbum ? (queue[currentIndex]?.path ?? null) : null
  const isTrackPlaying = (i: number): boolean => isThisAlbum && tracks[i]?.path === currentPath && playing

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={onBack}>
        <span className={styles.backArrow}>‹</span> Back
      </button>

      {/* Hero */}
      <div className={styles.hero}>
        {artSrc && <div className={styles.heroBg} style={{ backgroundImage: `url(${artSrc})` }} />}
        <div className={styles.heroContent}>
          <div className={styles.artWrap}>
            {artSrc
              ? <img src={artSrc} alt={albumTitle} className={styles.art} />
              : <div className={styles.artPlaceholder}>{albumTitle.charAt(0)}</div>
            }
          </div>
          <div className={styles.heroMeta}>
            <p className={styles.heroType}>Album</p>
            <h1 className={styles.heroTitle}>{albumTitle}</h1>
            <p className={styles.heroSub}>
              {[artist, year ? String(year) : null].filter(Boolean).join(' · ')}
              {(artist || year) ? ' · ' : ''}
              {tracks.length} track{tracks.length !== 1 ? 's' : ''}
            </p>
            <div className={styles.btnRow}>
              <button className={styles.playAllBtn} onClick={handlePlayAll}>
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                Play
              </button>
              <button className={`${styles.shuffleBtn} ${isThisAlbum && shuffleEnabled ? styles.shuffleBtnActive : ''}`} onClick={handleShuffle}>
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
                Shuffle
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Track list */}
      <div className={styles.trackList}>
        <div className={styles.trackListHeader}>
          <span className={styles.colNum}>#</span>
          <span className={styles.colTitle}>Title</span>
          <span className={styles.colDur}>Duration</span>
        </div>
        {tracks.map((track, i) => {
          const active = isThisAlbum && tracks[i]?.path === currentPath
          const thisPlaying = isTrackPlaying(i)
          return (
            <div
              key={track.path}
              className={`${styles.trackRow} ${active ? styles.active : ''} ${focusedIdx >= 0 && i === focusedIdx ? styles.controllerFocus : ''}`}
              onClick={() => handlePlay(i)}
            >
              <span className={styles.colNum}>
                {thisPlaying
                  ? <svg viewBox="0 0 24 24" fill="currentColor" className={styles.playingIcon}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  : <span className={styles.trackNum}>{track.trackNumber > 0 ? track.trackNumber : i + 1}</span>
                }
                <svg viewBox="0 0 24 24" fill="currentColor" className={styles.hoverPlay}><path d="M8 5v14l11-7z"/></svg>
              </span>
              <span className={styles.colTitle}>
                {track.title}
                {track.artist && <span className={styles.colArtist}>{track.artist}</span>}
              </span>
              <span className={styles.colDur}>{formatTime(track.duration ?? 0)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
