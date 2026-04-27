import { useEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import PosterImage from '../components/PosterImage'
import { useController } from '../hooks/useController'
import { useAppStore } from '../store/appStore'
import styles from './MovieDetailPage.module.css'

interface Props {
  title: string
  year: number | null
  posterPath: string | null
  filePath: string
  description: string | null
  genre: string | null
  onBack: () => void
}

function formatDuration(secs: number): string {
  if (!secs) return ''
  const h = Math.floor(secs / 3600)
  const m = Math.floor((secs % 3600) / 60)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function formatFileSize(bytes: number): string {
  if (!bytes) return ''
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`
  return `${(bytes / 1e6).toFixed(0)} MB`
}

function formatResolution(height: number): string {
  if (height >= 2160) return '4K'
  if (height >= 1080) return '1080p'
  if (height >= 720) return '720p'
  if (height >= 480) return '480p'
  return height ? `${height}p` : ''
}

function formatCodec(codec: string): string {
  const map: Record<string, string> = {
    hevc: 'H.265', h265: 'H.265', h264: 'H.264', avc: 'H.264',
    av1: 'AV1', vp9: 'VP9', mpeg4: 'MPEG-4', mpeg2video: 'MPEG-2'
  }
  return map[codec.toLowerCase()] ?? codec.toUpperCase()
}

function formatChannels(n: number): string {
  if (n === 1) return 'Mono'
  if (n === 2) return 'Stereo'
  if (n === 6) return '5.1'
  if (n === 8) return '7.1'
  return `${n}ch`
}

function formatLang(code: string): string {
  const map: Record<string, string> = {
    eng: 'English', jpn: 'Japanese', fre: 'French', fra: 'French',
    spa: 'Spanish', ger: 'German', deu: 'German', ita: 'Italian',
    por: 'Portuguese', rus: 'Russian', chi: 'Chinese', zho: 'Chinese',
    kor: 'Korean', ara: 'Arabic', hin: 'Hindi', und: 'Unknown'
  }
  return map[code.toLowerCase()] ?? code.toUpperCase()
}

function formatAudioCodec(codec: string): string {
  const map: Record<string, string> = {
    dts: 'DTS', ac3: 'AC3', eac3: 'E-AC3', aac: 'AAC',
    mp3: 'MP3', flac: 'FLAC', truehd: 'TrueHD', opus: 'Opus', vorbis: 'Vorbis'
  }
  return map[codec.toLowerCase()] ?? codec.toUpperCase()
}

export default function MovieDetailPage({ title, year, posterPath, filePath, description, genre, onBack }: Props): JSX.Element {
  const { setFocusZone } = useAppStore()
  const [extras, setExtras] = useState<MediaItem[]>([])
  const [techInfo, setTechInfo] = useState<MediaTechInfo | null>(null)
  const [backdropSrc, setBackdropSrc] = useState<string | null>(null)
  const [focusedIdx, setFocusedIdx] = useState(0)
  const focusedIdxRef = useRef(0)
  const playBtnRef = useRef<HTMLButtonElement | null>(null)
  const extraRefs = useRef<(HTMLButtonElement | null)[]>([])
  const extrasRef = useRef<MediaItem[]>([])

  // Local overrides — updated after a metadata refresh
  const [localYear, setLocalYear] = useState(year)
  const [localDescription, setLocalDescription] = useState(description)
  const [localGenre, setLocalGenre] = useState(genre)
  const [refreshing, setRefreshing] = useState(false)
  const [refreshMsg, setRefreshMsg] = useState<string | null>(null)

  useEffect(() => {
    window.api.library.getExtras(title).then(setExtras)
    window.api.library.getTechInfo(filePath).then(setTechInfo)
    if (posterPath) {
      window.api.library.readImage(posterPath).then(setBackdropSrc)
    }
  }, [title, filePath, posterPath])

  useEffect(() => { extrasRef.current = extras }, [extras])

  async function handleRefreshMetadata(): Promise<void> {
    setRefreshing(true)
    setRefreshMsg(null)
    try {
      const result = await window.api.metadata.fetchOne(filePath, title, localYear)
      if (result) {
        if (result.year !== null) setLocalYear(result.year)
        setLocalDescription(result.description)
        setLocalGenre(result.genre)
        setRefreshMsg('Updated')
      } else {
        setRefreshMsg('No match found')
      }
    } catch (e) {
      setRefreshMsg((e as Error).message)
    } finally {
      setRefreshing(false)
      setTimeout(() => setRefreshMsg(null), 3000)
    }
  }

  const [launching, setLaunching] = useState(false)

  function launchVideo(path: string): void {
    flushSync(() => setLaunching(true))
    setTimeout(() => setLaunching(false), 1500)
    window.api.playback.openVideo(path)
  }

  function playMovie(): void { launchVideo(filePath) }

  function focusRow(idx: number): void {
    const total = 1 + extrasRef.current.length
    const clamped = Math.max(0, Math.min(total - 1, idx))
    focusedIdxRef.current = clamped
    setFocusedIdx(clamped)
    if (clamped === 0) playBtnRef.current?.focus()
    else extraRefs.current[clamped - 1]?.focus()
  }

  const { resetState } = useController({ onButton: (btn) => {
    if (btn === 'back') { setFocusZone('content'); onBack(); return }
    if (btn === 'up')   focusRow(focusedIdxRef.current - 1)
    if (btn === 'down') focusRow(focusedIdxRef.current + 1)
    if (btn === 'confirm') {
      if (focusedIdxRef.current === 0) playMovie()
      else {
        const extra = extrasRef.current[focusedIdxRef.current - 1]
        if (extra?.filePath) launchVideo(extra.filePath as string)
      }
    }
  } })

  useEffect(() => { resetState() }, [])

  const resolution = techInfo ? formatResolution(techInfo.height) : ''
  const codec      = techInfo ? formatCodec(techInfo.videoCodec) : ''
  const duration   = techInfo ? formatDuration(techInfo.duration) : ''
  const fileSize   = techInfo ? formatFileSize(techInfo.fileSize) : ''
  const techChips  = [resolution, codec, fileSize].filter(Boolean)
  const genres     = localGenre ? localGenre.split(',').map((g) => g.trim()).filter(Boolean) : []

  return (
    <div className={styles.page}>
      {/* Hero card with blurred backdrop */}
      <div className={styles.heroCard}>
        {backdropSrc && (
          <div
            className={styles.backdrop}
            style={{ backgroundImage: `url(${backdropSrc})` }}
          />
        )}
        <div className={styles.backdropOverlay} />

        <button className={styles.back} onClick={onBack}>
          <span className={styles.backArrow}>‹</span> Back
        </button>

        <div className={styles.heroInner}>
          <div className={styles.heroPoster}>
            {posterPath
              ? <PosterImage filePath={posterPath} title={title} />
              : <div className={styles.posterPlaceholder}>{title.charAt(0)}</div>
            }
          </div>

          <div className={styles.heroInfo}>
            {genres.length > 0 && (
              <div className={styles.genreRow}>
                {genres.map((g) => <span key={g} className={styles.genreChip}>{g}</span>)}
              </div>
            )}
            <div className={styles.heroTitle}>{title}</div>
            <div className={styles.heroMeta}>
              {localYear && <span>{localYear}</span>}
              {localYear && duration && <span className={styles.metaSep}>·</span>}
              {duration && <span>{duration}</span>}
            </div>
            {techChips.length > 0 && (
              <div className={styles.techChips}>
                {techChips.map((chip, i) => <span key={i} className={styles.chip}>{chip}</span>)}
              </div>
            )}
            <div className={styles.actionRow}>
              <button
                ref={playBtnRef}
                className={`${styles.playButton} ${focusedIdx === 0 ? styles.playButtonFocus : ''}`}
                onClick={playMovie}
                disabled={launching}
                style={launching ? { opacity: 0.5, cursor: 'default' } : undefined}
              >
                {launching ? 'Opening…' : '▶  Play'}
              </button>
              <button
                className={styles.refreshButton}
                onClick={handleRefreshMetadata}
                disabled={refreshing}
                title="Fetch metadata from TMDb"
              >
                {refreshing ? '…' : '↻'}
              </button>
              {refreshMsg && <span className={styles.refreshMsg}>{refreshMsg}</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      {localDescription && (
        <p className={styles.description}>{localDescription}</p>
      )}

      {/* Technical metadata */}
      {techInfo && (
        <div className={styles.metaSection}>
          {techInfo.audioTracks.length > 0 && (
            <div className={styles.metaBlock}>
              <div className={styles.metaLabel}>Audio</div>
              <div className={styles.metaRows}>
                {techInfo.audioTracks.map((t, i) => (
                  <div key={i} className={styles.metaRow}>
                    <span className={styles.metaLang}>{formatLang(t.lang)}</span>
                    <span className={styles.metaDot}>·</span>
                    <span className={styles.metaValue}>{formatAudioCodec(t.codec)} {formatChannels(t.channels)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {techInfo.subtitleTracks.length > 0 && (
            <div className={styles.metaBlock}>
              <div className={styles.metaLabel}>Subtitles</div>
              <div className={styles.metaValue}>
                {[...new Set(techInfo.subtitleTracks.map((s) => formatLang(s.lang)))].join(', ')}
              </div>
            </div>
          )}
          <div className={styles.metaBlock}>
            <div className={styles.metaLabel}>File</div>
            <div className={styles.metaValue}>
              {[techInfo.width && techInfo.height ? `${techInfo.width}×${techInfo.height}` : '', fileSize]
                .filter(Boolean).join('  ·  ')}
            </div>
          </div>
        </div>
      )}

      {/* Extras */}
      {extras.length > 0 && (
        <div className={styles.extrasSection}>
          <div className={styles.extrasHeader}>
            <span className={styles.extrasTitle}>Extras</span>
            <span className={styles.extrasCount}>{extras.length}</span>
          </div>
          <div className={styles.extrasList}>
            {extras.map((item, i) => (
              <button
                key={item.id}
                ref={(el) => (extraRefs.current[i] = el)}
                className={`${styles.extraRow} ${i + 1 === focusedIdx ? styles.controllerFocus : ''}`}
                onClick={() => item.filePath && launchVideo(item.filePath as string)}
              >
                <span className={styles.extraTitle}>{item.title}</span>
                <span className={styles.playIcon}>▶</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
