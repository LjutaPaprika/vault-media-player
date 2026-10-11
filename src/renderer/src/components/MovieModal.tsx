import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import WatchedBar from './WatchedBar'
import PosterModal, {
  Actions, Chip, Chips, PlayIcon, PrimaryButton, RestartIcon, SecondaryButton,
  Spacer, Tile, Tiles, Title
} from './PosterModal'
import { useController } from '../hooks/useController'
import { useVideoProgress } from '../hooks/useVideoProgress'
import { formatClock, formatRuntime } from '../utils/duration'
import { startPosition, watchedFraction, watchState } from '../utils/resume'
import styles from './MovieModal.module.css'

interface Props {
  title: string
  year: number | null
  posterPath: string | null
  filePath: string
  genre: string | null
  onGenreChange: (genre: string | null) => void
  closing: boolean
  onClose: () => void
}

const PRESET_GENRES = [
  'Action', 'Adventure', 'Animation', 'Comedy', 'Crime', 'Documentary',
  'Drama', 'Fantasy', 'Horror', 'Mystery', 'Romance', 'Sci-Fi',
  'Thriller', 'War', 'Western', 'Musical', 'Historical', 'Noir'
]

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

function CheckIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  )
}

/** A movie's own modal: play or resume it, its extras, genres and file details. */
export default function MovieModal(p: Props): JSX.Element {
  const [extras, setExtras] = useState<MediaItem[]>([])
  const [techInfo, setTechInfo] = useState<MediaTechInfo | null>(null)
  const [editingGenre, setEditingGenre] = useState(false)
  const [tab, setTab] = useState<'extras' | 'details'>('extras')
  const [launching, setLaunching] = useState(false)

  useEffect(() => {
    // Scoped to 'movies' so a same-titled series doesn't pull in its extras.
    window.api.library.getExtras(p.title, 'movies').then(setExtras)
    window.api.library.getTechInfo(p.filePath).then(setTechInfo)
  }, [p.title, p.filePath])

  const currentGenres = useMemo(() =>
    new Set((p.genre ?? '').split(',').map((g) => g.trim()).filter(Boolean)),
  [p.genre])

  function toggleGenre(g: string): void {
    const next = new Set(currentGenres)
    next.has(g) ? next.delete(g) : next.add(g)
    const joined = [...next].join(', ') || null
    p.onGenreChange(joined)
    window.api.library.setGenre(p.filePath, joined)
  }

  const progress = useVideoProgress([p.filePath, ...extras.map((e) => e.filePath)])
  const movieState = watchState(progress[p.filePath], techInfo?.duration ?? 0, 'movies')
  const partial = movieState.kind === 'partial'

  /** Opens a video, resuming where it was left off unless told where to start. */
  function launchVideo(path: string, startAt?: number): void {
    flushSync(() => setLaunching(true))
    setTimeout(() => setLaunching(false), 1500)
    const known = path === p.filePath ? techInfo?.duration ?? 0 : 0
    const start = startAt ?? startPosition(watchState(progress[path], known, 'movies'))
    window.api.playback.openVideo(path, 'movies', start > 0 ? start : undefined)
  }
  const playMovie    = (): void => launchVideo(p.filePath)
  const restartMovie = (): void => launchVideo(p.filePath, 0)

  // ── Controller / keyboard rows: Play, Start over (while partway), extras ──
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const playRef = useRef<HTMLButtonElement | null>(null)
  const restartRef = useRef<HTMLButtonElement | null>(null)
  const extraRefs = useRef<(HTMLButtonElement | null)[]>([])
  const state = useRef({ focusedIdx, extras, partial })
  state.current = { focusedIdx, extras, partial }
  const offset = partial ? 2 : 1

  function focusRow(idx: number): void {
    const s = state.current
    const off = s.partial ? 2 : 1
    const clamped = Math.max(0, Math.min(off + s.extras.length - 1, idx))
    setFocusedIdx(clamped)
    if (clamped === 0) playRef.current?.focus()
    else if (clamped < off) restartRef.current?.focus()
    else {
      setTab('extras')
      // Let the tab switch render before focusing into it.
      requestAnimationFrame(() => extraRefs.current[clamped - off]?.focus())
    }
  }

  const { resetState } = useController({ onButton: (btn) => {
    const s = state.current
    const off = s.partial ? 2 : 1
    const at = Math.max(0, s.focusedIdx)
    if (btn === 'back') { p.onClose(); return }
    if (btn === 'down') focusRow(at + 1)
    if (btn === 'up') focusRow(at - 1)
    if (btn === 'left' && s.partial && at === 0) focusRow(1)
    if (btn === 'right' && s.partial && at === 1) focusRow(0)
    if (btn === 'confirm') {
      if (at === 0) playMovie()
      else if (at < off) restartMovie()
      else {
        const extra = s.extras[at - off]
        if (extra?.filePath) launchVideo(extra.filePath)
      }
    }
  } })
  // Swallow the press that opened the modal, then start on Play.
  useEffect(() => { resetState(); setFocusedIdx(0) }, [])

  // ── Pieces ──
  const resolution = techInfo ? formatResolution(techInfo.height) : ''
  const codec      = techInfo ? formatCodec(techInfo.videoCodec) : ''
  const runtime    = techInfo?.duration ? formatRuntime(techInfo.duration) : ''
  const fileSize   = techInfo ? formatFileSize(techInfo.fileSize) : ''
  const firstAudio = techInfo?.audioTracks[0]

  const header = (
    <>
      <Title>{p.title}</Title>
      <Chips>
        {p.year && <Chip accent>{p.year}</Chip>}
        {runtime && <Chip>{runtime}</Chip>}
        {resolution && <Chip>{resolution}</Chip>}
        {codec && <Chip>{codec}</Chip>}
      </Chips>
      <div className={styles.genreRow}>
        {[...currentGenres].map((g) => <span key={g} className={styles.genreChip}>{g}</span>)}
        <button className={styles.genreEdit} onClick={() => setEditingGenre((v) => !v)}>
          {editingGenre ? 'Done' : currentGenres.size === 0 ? '+ Add genres' : 'Edit'}
        </button>
        {editingGenre && (
          <div className={styles.genrePicker}>
            {PRESET_GENRES.map((g) => (
              <button
                key={g}
                className={`${styles.pickerChip} ${currentGenres.has(g) ? styles.pickerChipOn : ''}`}
                onClick={() => toggleGenre(g)}
              >
                {g}
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )

  const fraction = watchedFraction(movieState)
  const tiles = (
    <Tiles>
      {movieState.kind === 'partial' ? (
        <Tile value={`${formatRuntime(movieState.duration - movieState.position)} left`} label={`Stopped at ${formatClock(movieState.position)}`}>
          <WatchedBar fraction={fraction ?? 0} className={styles.tileBar} />
        </Tile>
      ) : movieState.kind === 'finished' ? (
        <Tile value="Watched" label="Seen to the end">
          <WatchedBar fraction={1} className={styles.tileBar} />
        </Tile>
      ) : (
        <Tile value={runtime || '—'} label="Not watched yet" />
      )}
      <Tile
        value={resolution || '—'}
        label={[codec, firstAudio && `${formatAudioCodec(firstAudio.codec)} ${formatChannels(firstAudio.channels)}`].filter(Boolean).join(' · ') || 'Video'}
      />
    </Tiles>
  )

  const details = techInfo && (
    <dl className={styles.details}>
      {techInfo.audioTracks.length > 0 && (
        <>
          <dt>Audio</dt>
          <dd>
            {techInfo.audioTracks.map((t, i) => (
              <span key={i} className={styles.detailLine}>
                {formatLang(t.lang)} <span className={styles.dim}>· {formatAudioCodec(t.codec)} {formatChannels(t.channels)}</span>
              </span>
            ))}
          </dd>
        </>
      )}
      {techInfo.subtitleTracks.length > 0 && (
        <>
          <dt>Subtitles</dt>
          <dd>{[...new Set(techInfo.subtitleTracks.map((s) => formatLang(s.lang)))].join(', ')}</dd>
        </>
      )}
      <dt>File</dt>
      <dd>{[techInfo.width && techInfo.height ? `${techInfo.width}×${techInfo.height}` : '', fileSize].filter(Boolean).join('  ·  ')}</dd>
    </dl>
  )

  const extrasList = (
    <div className={styles.extrasList}>
      {extras.map((item, i) => {
        const w = watchState(progress[item.filePath], 0, 'movies')
        return (
          <button
            key={item.id}
            ref={(el) => (extraRefs.current[i] = el)}
            className={`${styles.extraRow} ${i + offset === focusedIdx ? styles.extraFocus : ''}`}
            onClick={() => item.filePath && launchVideo(item.filePath)}
            title={item.title}
          >
            <span className={styles.extraPlay}><PlayIcon /></span>
            <span className={styles.extraTitle}>{item.title}</span>
            {w.kind === 'finished' && <span className={styles.extraDone}><CheckIcon /></span>}
            {w.kind === 'partial' && <WatchedBar fraction={watchedFraction(w) ?? 0} className={styles.extraBar} />}
          </button>
        )
      })}
    </div>
  )

  const actions = (
    <Actions>
      {partial && (
        <SecondaryButton onClick={restartMovie} disabled={launching} focused={focusedIdx === 1} buttonRef={(el) => (restartRef.current = el)}>
          <RestartIcon />Start over
        </SecondaryButton>
      )}
      <PrimaryButton onClick={playMovie} disabled={launching} focused={focusedIdx === 0} buttonRef={(el) => (playRef.current = el)} autoFocus>
        <PlayIcon />
        {launching ? 'Opening…' : movieState.kind === 'partial' ? `Resume from ${formatClock(movieState.position)}` : 'Play'}
      </PrimaryButton>
    </Actions>
  )

  const hasExtras = extras.length > 0

  // Extras and details share one fixed-height panel, so the modal is the same
  // size whether a film has no extras or dozens.
  const showing = hasExtras ? tab : 'details'
  return (
    <PosterModal posterPath={p.posterPath} frameRatio={0.675} closing={p.closing} onClose={p.onClose} closeButton>
      {header}
      {tiles}
      <div className={styles.tabs} role="tablist">
        {hasExtras && (
          <button role="tab" className={`${styles.tab} ${showing === 'extras' ? styles.tabOn : ''}`} onClick={() => setTab('extras')}>
            Extras <span className={styles.count}>{extras.length}</span>
          </button>
        )}
        <button role="tab" className={`${styles.tab} ${showing === 'details' ? styles.tabOn : ''}`} onClick={() => setTab('details')}>
          Details
        </button>
      </div>
      <div className={styles.tabPanel}>
        {showing === 'extras' ? extrasList : details}
      </div>
      <Spacer />
      {actions}
    </PosterModal>
  )
}
