import { useEffect, useState } from 'react'
import { useMusicPlayer, Track, AlbumMeta } from '../context/MusicPlayerContext'
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
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

export default function AlbumDetailPage({ albumTitle, artist, year, artPath, firstTrackPath, onBack }: Props): JSX.Element {
  const { play, playTrack, togglePlay, playing, currentIndex, albumMeta, queue } = useMusicPlayer()
  const [tracks, setTracks] = useState<Track[]>([])
  const [artSrc, setArtSrc] = useState<string | null>(null)
  const [durations, setDurations] = useState<Record<number, number>>({})

  const isThisAlbum = albumMeta?.title === albumTitle && albumMeta?.artist === artist
  const meta: AlbumMeta = { title: albumTitle, artist, artPath }

  useEffect(() => {
    window.api.library.getAlbumTracks(firstTrackPath).then(setTracks)
  }, [firstTrackPath])

  useEffect(() => {
    if (!artPath) return
    window.api.library.readImage(artPath).then(setArtSrc)
  }, [artPath])

  // Load durations by creating temporary audio elements
  useEffect(() => {
    if (tracks.length === 0) return
    const newDurations: Record<number, number> = {}
    let loaded = 0
    tracks.forEach((track, i) => {
      const audio = new Audio()
      audio.preload = 'metadata'
      audio.onloadedmetadata = () => {
        newDurations[i] = audio.duration
        loaded++
        if (loaded === tracks.length) setDurations({ ...newDurations })
      }
      audio.onerror = () => { loaded++; if (loaded === tracks.length) setDurations({ ...newDurations }) }
      audio.src = 'media:///' + encodeURI(track.path.replace(/\\/g, '/'))
    })
  }, [tracks])

  function handlePlay(index: number): void {
    if (isThisAlbum && queue.length > 0) {
      if (currentIndex === index) { togglePlay(); return }
      playTrack(index)
    } else {
      play(tracks, index, meta)
    }
  }

  function handlePlayAll(): void {
    play(tracks, 0, meta)
  }

  const isTrackPlaying = (i: number): boolean => isThisAlbum && currentIndex === i && playing

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
            <p className={styles.heroSub}>{artist}{year ? ` · ${year}` : ''} · {tracks.length} track{tracks.length !== 1 ? 's' : ''}</p>
            <button className={styles.playAllBtn} onClick={handlePlayAll}>
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              Play
            </button>
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
          const active = isThisAlbum && currentIndex === i
          const thisPlaying = isTrackPlaying(i)
          return (
            <div
              key={track.path}
              className={`${styles.trackRow} ${active ? styles.active : ''}`}
              onClick={() => handlePlay(i)}
            >
              <span className={styles.colNum}>
                {thisPlaying
                  ? <svg viewBox="0 0 24 24" fill="currentColor" className={styles.playingIcon}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  : <span className={styles.trackNum}>{track.trackNumber > 0 ? track.trackNumber : i + 1}</span>
                }
                <svg viewBox="0 0 24 24" fill="currentColor" className={styles.hoverPlay}><path d="M8 5v14l11-7z"/></svg>
              </span>
              <span className={styles.colTitle}>{track.title}</span>
              <span className={styles.colDur}>{formatTime(durations[i] ?? 0)}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
