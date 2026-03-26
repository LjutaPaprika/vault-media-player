import { useEffect, useState } from 'react'
import { useMusicPlayer } from '../context/MusicPlayerContext'
import styles from './MusicPlayerBar.module.css'

function formatTime(s: number): string {
  if (!isFinite(s) || isNaN(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function MusicPlayerBar(): JSX.Element | null {
  const { queue, currentIndex, albumMeta, playing, currentTime, duration, volume,
          togglePlay, next, prev, seek, setVolume } = useMusicPlayer()
  const [artSrc, setArtSrc] = useState<string | null>(null)

  const track = queue[currentIndex]

  useEffect(() => {
    if (!albumMeta?.artPath) { setArtSrc(null); return }
    window.api.library.readImage(albumMeta.artPath).then(setArtSrc)
  }, [albumMeta?.artPath])

  if (!track) return null

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
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
          <span className={styles.trackArtist}>{albumMeta?.artist}</span>
        </div>
      </div>

      {/* Center — controls + progress */}
      <div className={styles.controls}>
        <div className={styles.buttons}>
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
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 18l8.5-6L6 6v12zm2-8.14 5.47 3.86-5.47 3.86V9.86zM16 6h2v12h-2z"/></svg>
          </button>
        </div>
        <div className={styles.progressRow}>
          <span className={styles.time}>{formatTime(currentTime)}</span>
          <div
            className={styles.progressBar}
            onClick={(e) => {
              const rect = e.currentTarget.getBoundingClientRect()
              seek(((e.clientX - rect.left) / rect.width) * duration)
            }}
          >
            <div className={styles.progressFill} style={{ width: `${progress}%` }}>
              <div className={styles.progressThumb} />
            </div>
          </div>
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
  )
}
