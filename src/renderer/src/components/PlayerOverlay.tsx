import { useEffect, useRef, useState } from 'react'
import { useVideoPlayerStore } from '../store/videoPlayerStore'
import { formatTime } from '../utils/formatTime'
import styles from './PlayerOverlay.module.css'

interface Props {
  title: string
}

export default function PlayerOverlay({ title }: Props): React.JSX.Element {
  const { paused, currentTime, duration, audioTracks, subtitleTracks } = useVideoPlayerStore()
  const close = useVideoPlayerStore((s) => s.close)

  const [visible, setVisible] = useState(true)
  const [volume, setVolume] = useState(100)
  const hideTimer = useRef<ReturnType<typeof setTimeout>>()
  const isDragging = useRef(false)
  const pendingSeek = useRef<number | null>(null)
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  function resetHideTimer(): void {
    setVisible(true)
    clearTimeout(hideTimer.current)
    if (!pausedRef.current) {
      hideTimer.current = setTimeout(() => setVisible(false), 3000)
    }
  }

  useEffect(() => {
    const handler = (): void => resetHideTimer()
    document.addEventListener('mousemove', handler)
    return () => document.removeEventListener('mousemove', handler)
  }, [])

  useEffect(() => {
    if (paused) {
      clearTimeout(hideTimer.current)
      setVisible(true)
    } else {
      resetHideTimer()
    }
    return () => clearTimeout(hideTimer.current)
  }, [paused])

  useEffect(() => {
    document.documentElement.style.cursor = visible ? '' : 'none'
    return () => { document.documentElement.style.cursor = '' }
  }, [visible])

  function handleSeekChange(e: React.ChangeEvent<HTMLInputElement>): void {
    pendingSeek.current = Number(e.target.value)
  }

  function handleSeekCommit(): void {
    isDragging.current = false
    if (pendingSeek.current !== null) {
      window.api.mpv.command(['seek', String(pendingSeek.current), 'absolute']).catch(console.error)
      pendingSeek.current = null
    }
  }

  function handleVolumeChange(e: React.ChangeEvent<HTMLInputElement>): void {
    const v = Number(e.target.value)
    setVolume(v)
    window.api.mpv.command(['set_property', 'volume', v]).catch(console.error)
  }

  function handleSubChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    const val = e.target.value
    window.api.mpv.command(['set_property', 'sid', val === 'no' ? 'no' : Number(val)]).catch(console.error)
  }

  function handleAudioChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    window.api.mpv.command(['set_property', 'aid', Number(e.target.value)]).catch(console.error)
  }

  function togglePause(): void {
    window.api.mpv.command(['cycle', 'pause']).catch(console.error)
  }

  const displayTime = isDragging.current && pendingSeek.current !== null
    ? pendingSeek.current
    : currentTime

  const selectedSub = subtitleTracks.find((t) => t.selected)?.id ?? 'no'
  const selectedAudio = audioTracks.find((t) => t.selected)?.id ?? audioTracks[0]?.id ?? 1

  return (
    <div
      className={`${styles.overlay}${visible ? '' : ` ${styles.hidden}`}`}
    >
      {/* Top bar */}
      <div className={styles.topBar}>
        <button className={styles.backButton} onClick={close}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10.5 3L5.5 8l5 5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back
        </button>
        <span className={styles.titleText}>{title}</span>
      </div>

      {/* Middle: click to play/pause */}
      <div className={styles.middle} onClick={togglePause} />

      {/* Bottom controls */}
      <div className={styles.bottomBar}>
        <div className={styles.seekRow}>
          <button className={styles.playButton} onClick={togglePause} title={paused ? 'Play' : 'Pause'}>
            {paused ? (
              <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor">
                <polygon points="5,3 19,11 5,19"/>
              </svg>
            ) : (
              <svg width="22" height="22" viewBox="0 0 22 22" fill="currentColor">
                <rect x="4" y="3" width="5" height="16" rx="1"/>
                <rect x="13" y="3" width="5" height="16" rx="1"/>
              </svg>
            )}
          </button>

          <input
            type="range"
            className={styles.seekBar}
            min={0}
            max={duration || 1}
            step={0.5}
            value={isDragging.current && pendingSeek.current !== null ? pendingSeek.current : currentTime}
            onChange={handleSeekChange}
            onMouseDown={() => { isDragging.current = true }}
            onMouseUp={handleSeekCommit}
            onTouchEnd={handleSeekCommit}
          />

          <span className={styles.timeDisplay}>
            {formatTime(displayTime)} / {formatTime(duration)}
          </span>
        </div>

        <div className={styles.controlsRow}>
          {/* Volume */}
          <div className={styles.volumeGroup}>
            <button className={styles.iconButton} title="Volume" onClick={() => {
              const muted = volume === 0
              const newVol = muted ? 100 : 0
              setVolume(newVol)
              window.api.mpv.command(['set_property', 'volume', newVol]).catch(console.error)
            }}>
              {volume === 0 ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 5h3l5-3v12l-5-3H2V5z"/>
                  <line x1="11" y1="5" x2="15" y2="11" stroke="currentColor" strokeWidth="1.5"/>
                  <line x1="15" y1="5" x2="11" y2="11" stroke="currentColor" strokeWidth="1.5"/>
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M2 5h3l5-3v12l-5-3H2V5z"/>
                  <path d="M11 4.5a5 5 0 0 1 0 7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                </svg>
              )}
            </button>
            <input
              type="range"
              className={styles.volumeSlider}
              min={0}
              max={100}
              step={1}
              value={volume}
              onChange={handleVolumeChange}
            />
          </div>

          {/* Subtitle selector */}
          {subtitleTracks.length > 0 && (
            <select
              className={styles.trackSelect}
              value={selectedSub}
              onChange={handleSubChange}
              title="Subtitles"
            >
              <option value="no">CC: Off</option>
              {subtitleTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  CC: {t.title ?? t.lang ?? `Track ${t.id}`}
                </option>
              ))}
            </select>
          )}

          {/* Audio track selector */}
          {audioTracks.length > 1 && (
            <select
              className={styles.trackSelect}
              value={selectedAudio}
              onChange={handleAudioChange}
              title="Audio track"
            >
              {audioTracks.map((t) => (
                <option key={t.id} value={t.id}>
                  Audio: {t.title ?? t.lang ?? `Track ${t.id}`}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>
    </div>
  )
}
