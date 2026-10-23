import { useCallback, useEffect, useRef, useState } from 'react'
import PageShell from '../components/PageShell'
import PosterImage from '../components/PosterImage'
import PosterRow, { type RowCard } from '../components/PosterRow'
import { PlayIcon, PrimaryButton, SecondaryButton } from '../components/PosterModal'
import { useAppStore, type OpenRequest, type Page } from '../store/appStore'
import { formatClock, formatRuntime } from '../utils/duration'
import { episodeCode, parseEpisode } from '../utils/episodes'
import { cleanDisplayTitle } from '../utils/mangaSeries'
import { startPosition, watchedFraction, watchState, type WatchState } from '../utils/resume'
import styles from './HomePage.module.css'

const CATEGORY_LABEL: Record<string, string> = {
  movies: 'Movie', tv: 'TV', anime: 'Anime', manga: 'Manga', comics: 'Comics'
}
const WATCHING = new Set(['movies', 'tv', 'anime'])
const READING = new Set(['manga', 'comics'])

/* ── Turning a Home entry into what to show and what to open ──────────────── */

interface Shown {
  entry: HomeEntry
  /** The entry Continue opens: the next one when the last was finished. */
  target: HomeEntryRef
  state: WatchState
  isNext: boolean
  /** "S01E05 · 12m left", "Next: Ch.215", "41m left". */
  detail: string
  /** Bar to draw: the open entry's position, else the series' share done. */
  fraction: number | null
  /** Button label. */
  action: string
}


function describe(entry: HomeEntry): Shown | null {
  const target = entry.next ?? entry.current
  const isNext = !!entry.next
  const state = watchState(target.progress ?? undefined, 0, entry.category)
  const reading = READING.has(entry.category)
  // Gone through with nothing after it: nothing to continue.
  if (!isNext && state.kind === 'finished') return null
  if (!isNext && state.kind === 'unstarted' && !reading && entry.category !== 'tv' && entry.category !== 'anime') return null
  if (!isNext && reading && state.kind !== 'partial' && entry.doneCount >= entry.entryCount) return null

  const name = reading ? cleanDisplayTitle(target.title)
    : entry.category === 'tv' || entry.category === 'anime' ? episodeCode(parseEpisode(target))
    : null
  let left = ''
  if (state.kind === 'partial') {
    left = reading
      ? `${target.filePath.toLowerCase().endsWith('.epub') ? 'ch.' : 'p.'} ${Math.floor(state.position) + 1}/${state.duration}`
      : `${formatRuntime(state.duration - state.position)} left`
  }
  const detail = isNext
    ? `Next: ${name ?? target.title}`
    : [name, left].filter(Boolean).join(' · ') || (reading ? 'Continue reading' : 'Continue watching')

  const series = entry.entryCount > 1 ? entry.doneCount / entry.entryCount : null
  const fraction = state.kind === 'partial' ? watchedFraction(state) : series
  const action = state.kind === 'partial'
    ? (reading ? 'Continue' : `Resume from ${formatClock(state.position)}`)
    : isNext ? (reading ? 'Read next' : 'Play next') : reading ? 'Read' : 'Play'
  return { entry, target, state, isNext, detail, fraction, action }
}

/** Opens something on another shelf, fading the content out and back in around the jump. */
function useGoTo(): (req: OpenRequest) => void {
  const transition = useAppStore((st) => st.transition)
  const requestOpen = useAppStore((st) => st.requestOpen)
  return useCallback((req: OpenRequest) => transition(() => requestOpen(req)), [transition, requestOpen])
}

/** Plays or opens the entry Continue points at. */
function useOpeners(): { play: (s: Shown) => void; open: (s: Shown) => void } {
  const goTo = useGoTo()
  const open = useCallback((s: Shown): void => {
    const { entry, target, state } = s
    const page = entry.category as Page
    if (READING.has(entry.category)) {
      goTo({ page, series: entry.series, filePath: target.filePath, startAt: startPosition(state) })
    } else if (entry.category === 'movies') {
      goTo({ page, filePath: target.filePath })
    } else {
      goTo({ page, series: entry.series })
    }
  }, [goTo])
  // Films play straight from Home. An episode plays from its series' page,
  // which queues the episodes after it as its own Continue does, and a chapter
  // opens in the reader.
  const play = useCallback((s: Shown): void => {
    if (s.entry.category === 'movies') {
      const start = startPosition(s.state)
      window.api.playback.openVideo(s.target.filePath, s.entry.category, start > 0 ? start : undefined)
    } else if (WATCHING.has(s.entry.category)) {
      goTo({ page: s.entry.category as Page, series: s.entry.series, filePath: s.target.filePath, play: true })
    } else open(s)
  }, [open, goTo])
  return { play, open }
}

function toCard(s: Shown, open: (s: Shown) => void, badge = true): RowCard {
  return {
    key: `${s.entry.category}:${s.entry.series}`,
    posterPath: s.entry.posterPath,
    title: s.entry.series,
    subtitle: s.detail,
    badge: badge ? CATEGORY_LABEL[s.entry.category] : undefined,
    progress: s.fraction,
    onClick: () => open(s)
  }
}

function gameCard(g: HomeGame, goTo: (r: OpenRequest) => void): RowCard {
  return {
    key: g.filePath,
    posterPath: g.posterPath,
    title: g.title,
    subtitle: g.playSeconds >= 60 ? `${formatRuntime(g.playSeconds)} played` : 'Not played yet',
    onClick: () => goTo({ page: 'games', filePath: g.filePath })
  }
}

/* ── The big "pick up where you left off" card ───────────────────────────── */

function HeroCard({ s, play, open, overline }: {
  s: Shown; play: (s: Shown) => void; open: (s: Shown) => void; overline: string
}): JSX.Element {
  const series = s.entry.category !== 'movies'
  return (
    <div className={styles.heroCard}>
      <div className={styles.heroWash}>
        {s.entry.posterPath && <PosterImage filePath={s.entry.posterPath} title="" width={310} />}
      </div>
      <button className={styles.heroPoster} onClick={() => open(s)}>
        {s.entry.posterPath
          ? <PosterImage filePath={s.entry.posterPath} title={s.entry.series} width={520} />
          : <span className={styles.placeholder}>{s.entry.series.charAt(0)}</span>}
      </button>
      <div className={styles.heroBody}>
        <div className={styles.overline}>{overline}</div>
        <div className={styles.heroTitle}>{s.entry.series}</div>
        <div className={styles.heroDetail}>{s.detail}</div>
        {s.fraction != null && (
          <div className={styles.heroBar}><div style={{ width: `${Math.max(2, s.fraction * 100)}%` }} /></div>
        )}
        <div className={styles.heroActions}>
          <PrimaryButton onClick={() => play(s)}><PlayIcon />{s.action}</PrimaryButton>
          {series && (
            <SecondaryButton onClick={() => open(s)}>
              {READING.has(s.entry.category) ? 'Open series' : 'Open show'}
            </SecondaryButton>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Scan, now a small menu in the page header ───────────────────────────── */

function ScanMenu(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [result, setResult] = useState<string | null>(null)

  async function run(force: boolean): Promise<void> {
    setOpen(false)
    setScanning(true)
    setResult(null)
    try {
      const r = force ? await window.api.library.forceScan() : await window.api.library.scan()
      setResult(force ? `Full rescan complete — ${r.count} items indexed.`
        : r.count === 0 ? 'Scan complete — no changes detected.'
        : `Scan complete — ${r.count} new or updated item${r.count === 1 ? '' : 's'} indexed.`)
    } catch {
      setResult('Scan failed. Check your library root path in settings.')
    } finally {
      setScanning(false)
    }
  }

  return (
    <div className={styles.scan}>
      {result && <span className={styles.scanResult}>{result}</span>}
      <button className={styles.scanBtn} onClick={() => setOpen((v) => !v)} disabled={scanning}>
        <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={scanning ? styles.spin : ''}>
          <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" /><path d="M13.5 2.5v3h-3" />
        </svg>
        {scanning ? 'Scanning…' : 'Scan'}
        <span className={styles.caret}>▾</span>
      </button>
      {open && (
        <>
          <div className={styles.scanShield} onClick={() => setOpen(false)} />
          <div className={styles.scanMenu}>
            <button onClick={() => run(false)}>
              <strong>Scan library</strong>
              <span>Fast — only new or changed files</span>
            </button>
            <button onClick={() => run(true)}>
              <strong>Force rescan</strong>
              <span>Rebuild the whole index — if items are missing</span>
            </button>
          </div>
        </>
      )}
    </div>
  )
}

/** How long each in-progress title stays in the hero card. */
const ROTATE_MS = 8000
/** Titles the hero card cycles through. */
const ROTATE_COUNT = 5

/**
 * The hero card, cycling through what's in progress: every eight seconds, or
 * by the dots, and holding still while the pointer is over it.
 */
function HeroCarousel({ items, play, open }: { items: Shown[]; play: (s: Shown) => void; open: (s: Shown) => void }): JSX.Element | null {
  const [i, setI] = useState(0)
  const paused = useRef(false)
  useEffect(() => {
    if (items.length < 2) return
    const id = setInterval(() => { if (!paused.current) setI((n) => (n + 1) % items.length) }, ROTATE_MS)
    return () => clearInterval(id)
  }, [items.length])
  if (items.length === 0) return null
  const s = items[Math.min(i, items.length - 1)]
  return (
    <div className={styles.carousel} onMouseEnter={() => (paused.current = true)} onMouseLeave={() => (paused.current = false)}>
      <HeroCard
        key={`${s.entry.category}:${s.entry.series}`}
        s={s}
        play={play}
        open={open}
        overline={`${s.isNext ? 'Up next' : 'Pick up where you left off'} · ${CATEGORY_LABEL[s.entry.category]}`}
      />
      {items.length > 1 && (
        <div className={styles.dots}>
          {items.map((it, n) => (
            <button
              key={n}
              className={`${styles.dotBtn} ${n === i ? styles.dotOn : ''}`}
              onClick={() => setI(n)}
              aria-label={it.entry.series}
              title={it.entry.series}
            />
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * The last Home data loaded, kept for the next visit. Coming back from a film
 * or a chapter then shows the page straight away instead of "Loading…" while
 * it refreshes.
 */
let lastHome: HomeData | null = null

export default function HomePage(): JSX.Element {
  const [home, setHome] = useState<HomeData | null>(lastHome)
  const goTo = useGoTo()
  const { play, open } = useOpeners()

  useEffect(() => {
    const load = (): void => {
      window.api.library.getHome().then((h) => { lastHome = h; setHome(h) })
    }
    load()
    // Positions change while a video plays in mpv; playtime when a game closes.
    const offProgress = window.api.playback.onProgressChanged(load)
    const offPlaytime = window.api.playback.onPlaytimeUpdate(load)
    return () => { offProgress(); offPlaytime() }
  }, [])

  const shown = (home?.entries ?? []).map(describe).filter((s): s is Shown => s !== null)
  const watching = shown.filter((s) => WATCHING.has(s.entry.category))
  const reading = shown.filter((s) => READING.has(s.entry.category))
  const games = home?.games ?? []

  return (
    <PageShell title="Home" actions={<ScanMenu />}>
      {!home ? (
        <p className={styles.loading}>Loading…</p>
      ) : (
        <div className={styles.stack}>
          <HeroCarousel items={shown.slice(0, ROTATE_COUNT)} play={play} open={open} />
          <PosterRow title="Continue watching" cards={watching.map((s) => toCard(s, open))} />
          <PosterRow title="Continue reading" cards={reading.map((s) => toCard(s, open, false))} />
          <PosterRow title="Recently played" cards={games.map((g) => gameCard(g, goTo))} />
          {shown.length === 0 && games.length === 0 && (
            <p className={styles.loading}>Nothing in progress yet. Start something from the sidebar and it will show up here.</p>
          )}
        </div>
      )}
    </PageShell>
  )
}
