import { useEffect, useRef, useState } from 'react'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import styles from './MusicPlayerBar.module.css'

function formatTime(s: number): string {
  if (!isFinite(s) || isNaN(s)) return '0:00'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function MusicPlayerBar(): JSX.Element | null {
  const { queue, currentIndex, albumMeta, playing, currentTime, duration, volume, shuffleEnabled, loopEnabled,
          togglePlay, next, prev, seek, setVolume, toggleShuffle, toggleLoop } = useMusicPlayer()
  const [artSrc, setArtSrc] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState(false)
  const hadTrack = useRef(false)
  const currentTimeRef = useRef(0)
  const sliderRef = useRef<HTMLInputElement>(null)
  const isDraggingRef = useRef(false)
  const musicKeysRef = useRef({ playPause: ' ', seekFwd: 'ArrowRight', seekBwd: 'ArrowLeft' })
  useEffect(() => { currentTimeRef.current = currentTime }, [currentTime])

  useEffect(() => {
    window.api.keyboard.getBindings().then((bindings) => {
      musicKeysRef.current = {
        playPause: bindings.find((b) => b.action === 'music-play-pause')?.key ?? ' ',
        seekFwd:   bindings.find((b) => b.action === 'music-seek-fwd')?.key  ?? 'ArrowRight',
        seekBwd:   bindings.find((b) => b.action === 'music-seek-bwd')?.key  ?? 'ArrowLeft',
      }
    })
  }, [])

  // Push audio position → slider imperatively (skipped while user is dragging)
  useEffect(() => {
    const el = sliderRef.current
    if (!el || isDraggingRef.current) return
    el.value = String(currentTime)
    const pct = duration > 0 ? (currentTime / duration) * 100 : 0
    el.style.background = `linear-gradient(to right, var(--music-progress) ${pct}%, var(--bg-hover) ${pct}%)`
  }, [currentTime, duration])

  // Keep max in sync when the track's duration loads
  useEffect(() => {
    if (sliderRef.current) sliderRef.current.max = String(duration || 1)
  }, [duration])

  const track = queue[currentIndex]

  // Reset collapsed when music starts after being stopped
  useEffect(() => {
    const has = !!track
    if (!hadTrack.current && has) setCollapsed(false)
    hadTrack.current = has
  }, [!!track])

  // Global keyboard shortcuts — only active when a track is loaded
  useEffect(() => {
    if (!track) return
    function onKey(e: KeyboardEvent): void {
      // Arrow keys always control seek — preventDefault stops the volume slider from also moving
      if (e.key === musicKeysRef.current.seekBwd) {
        e.preventDefault()
        seek(Math.max(0, currentTimeRef.current - 10))
        return
      }
      if (e.key === musicKeysRef.current.seekFwd) {
        e.preventDefault()
        seek(currentTimeRef.current + 10)
        return
      }
      if (e.key === musicKeysRef.current.playPause) {
        const tag = (e.target as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return
        e.preventDefault()
        togglePlay()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [track, togglePlay, seek])

  useEffect(() => {
    const artPath = albumMeta?.artPath ?? track?.artPath ?? null
    if (!artPath) { setArtSrc(null); return }
    window.api.library.readImage(artPath).then(setArtSrc)
  }, [albumMeta?.artPath, track?.artPath])


  if (!track) return null

  return (
    <div className={styles.outerWrapper}>
      <div className={styles.collapseBtnRow}>
        <button
          className={`${styles.collapseBtn} ${collapsed ? styles.collapseBtnRotated : ''}`}
          onClick={() => setCollapsed((c) => !c)}
        >
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/>
          </svg>
        </button>
      </div>
      <div className={`${styles.collapseAnim} ${collapsed ? styles.collapseAnimClosed : ''}`}>
      <div className={styles.bar}>
      {/* Left — track info */}
      <div className={styles.trackInfo}>
        <div className={styles.artThumb}>
          {artSrc
            ? <img src={artSrc} alt={albumMeta?.title} />
            : <div className={styles.artPlaceholder}>{albumMeta?.title.charAt(0) ?? '♪'}</div>
          }
        </div>
        <div className={styles.trackMeta}>
          <span className={styles.trackTitle}>{track.title}</span>
          <span className={styles.trackArtist}>{track.artist ?? albumMeta?.artist}</span>
        </div>
      </div>

      {/* Center — controls + progress */}
      <div className={styles.controls}>
        <div className={styles.buttons}>
          <button className={`${styles.btn} ${shuffleEnabled ? styles.btnActive : ''}`} onClick={toggleShuffle} title="Shuffle">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
          </button>
          <button className={styles.btn} onClick={prev} title="Previous">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 6h2v12H6zm3.5 6 8.5 6V6z"/></svg>
          </button>
          <button className={`${styles.btn} ${styles.playBtn}`} onClick={togglePlay} title={playing ? 'Pause' : 'Play'}>
            {playing
              ? <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
              : <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            }
          </button>
          <button className={styles.btn} onClick={next} title="Next">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg>
          </button>
          <button className={`${styles.btn} ${loopEnabled ? styles.btnActive : ''}`} onClick={toggleLoop} title="Loop">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg>
          </button>
        </div>
        <div className={styles.progressRow}>
          <span className={styles.time}>{formatTime(currentTime)}</span>
          <input
            ref={sliderRef}
            type="range"
            min={0}
            max={duration || 1}
            step={1}
            defaultValue={0}
            className={styles.progressSlider}
            onMouseDown={() => { isDraggingRef.current = true }}
            onMouseUp={() => { isDraggingRef.current = false }}
            onInput={(e) => {
              const el = e.currentTarget
              const val = parseFloat(el.value)
              seek(val)
              const pct = duration > 0 ? (val / duration) * 100 : 0
              el.style.background = `linear-gradient(to right, var(--music-progress) ${pct}%, var(--bg-hover) ${pct}%)`
            }}
          />
          <span className={styles.time}>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Right — volume */}
      <div className={styles.volumeArea}>
        <svg className={styles.volumeIcon} viewBox="0 0 24 24" fill="currentColor">
          {volume === 0
            ? <path d="M16.5 12A4.5 4.5 0 0 0 14 7.97v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51A8.8 8.8 0 0 0 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06A8.99 8.99 0 0 0 17.73 19L19 20.27 20.27 19 5.27 4 4.27 3zM12 4 9.91 6.09 12 8.18V4z"/>
            : volume < 0.5
            ? <path d="M18.5 12A4.5 4.5 0 0 0 16 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z"/>
            : <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
          }
        </svg>
        <input
          type="range" min={0} max={1} step={0.02}
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          className={styles.volumeSlider}
        />
      </div>
    </div>
      </div>
    </div>
  )
}
