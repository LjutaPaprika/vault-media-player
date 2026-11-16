import { useEffect, useRef, useState } from 'react'
import PageShell from '../components/PageShell'
import MediaGrid from '../components/MediaGrid'
import EpubScrollReader from './EpubScrollReader'
import PDFReaderPage from './PDFReaderPage'
import MangaReaderPage from './MangaReaderPage'
import { MangaSeriesModal } from '../components/MangaSeriesModal'
import PosterRow from '../components/PosterRow'
import { usePosterModal } from '../components/PosterModal'
import { useLibrary } from '../hooks/useLibrary'
import { useVideoProgress } from '../hooks/useVideoProgress'
import { useAppStore, useOpenRequest } from '../store/appStore'
import { startPosition, watchState } from '../utils/resume'
import { isExtra } from '../utils/readingEntries'
import { isSeriesComplete } from '../utils/seriesComplete'
import { cleanDisplayTitle, summarize } from '../utils/mangaSeries'
import { newestNumber, newestOnDrive, orderWatched, releaseStatus, watchNote, type WatchInfo } from '../utils/watchlist'
import { CheckButton } from '../components/WatchControls'
import controls from '../components/WatchControls.module.css'

/** Shelves with fewer series than this skip the Continue row. */
const CONTINUE_MIN_SERIES = 8
/** Most series the Continue row shows. */
const CONTINUE_MAX = 8

// Group key is the parent folder name — always the series name regardless of filename format
function getSeriesName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 2] ?? ''
}

function detectUnit(vols: MediaItem[]): { singular: string; plural: string } {
  const titles = vols.map((v) => v.title.toLowerCase())
  if (titles.some((t) => /(?:^|[\s_])ch(apter|\.)/.test(t))) return { singular: 'chapter', plural: 'chapters' }
  if (titles.some((t) => /(?:^|[\s_])vol(ume|\.)/.test(t))) return { singular: 'volume', plural: 'volumes' }
  if (titles.some((t) => /(?:^|[\s_])issue/.test(t))) return { singular: 'issue', plural: 'issues' }
  return { singular: 'entry', plural: 'entries' }
}

// The folder a series' entries live in: what the watchlist is keyed by.
function seriesFolder(filePath: string): string {
  return filePath.replace(/[\\/][^\\/]+$/, '')
}

function groupBySeries(items: MediaItem[]): Map<string, MediaItem[]> {
  const map = new Map<string, MediaItem[]>()
  for (const item of items) {
    const series = getSeriesName(item.filePath)
    if (!map.has(series)) map.set(series, [])
    map.get(series)!.push(item)
  }
  for (const vols of map.values()) {
    vols.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }))
  }
  return map
}

interface Props {
  category?: 'manga' | 'comics'
  pageTitle?: string
  emptyMessage?: string
}

export default function MangaPage({
  category = 'manga',
  pageTitle = 'Manga',
  emptyMessage = 'No manga found. Add .cbz, .cbr, .epub or .pdf files to media/manga/ and scan your library.'
}: Props = {}): JSX.Element {
  const { items, loading, error } = useLibrary(category)
  const { contentResetKey }       = useAppStore()
  const [query,           setQuery]           = useState('')
  const [selectedSeries,  setSelectedSeries]  = useState<string | null>(null)
  const [selectedBook,    setSelectedBook]     = useState<MediaItem | null>(null)
  const [selectedPdf,     setSelectedPdf]      = useState<MediaItem | null>(null)
  // Opened / marked read (a time) or marked unread (null) since the library loaded.
  const [lastOpenedMap,   setLastOpenedMap]    = useState<Record<string, number | null>>({})
  const [selectedCbz,     setSelectedCbz]      = useState<MediaItem | null>(null)
  // Where to resume the chapter or book being opened (page, or chapter position).
  const [startAt,         setStartAt]          = useState(0)
  // Bumped when reading positions change behind this page's back: a reader
  // closing (they save without telling anyone), or a chapter marked read.
  const [progressTick,    setProgressTick]     = useState(0)
  const progress = useVideoProgress(items.map((i) => i.filePath), progressTick)
  // Series watched for new chapters, by series folder.
  const [watched, setWatched] = useState<Record<string, WatchInfo>>({})
  const [watchTick, setWatchTick] = useState(0)
  useEffect(() => {
    const folders = [...new Set(items.map((i) => seriesFolder(i.filePath)))]
    if (folders.length === 0) return
    let live = true
    window.api.watchlist.get(folders).then((w) => { if (live) setWatched(w) })
    return () => { live = false }
  }, [items, watchTick])
  const setWatching = (folder: string, on: boolean): void => {
    window.api.watchlist.set(folder, on).then(() => setWatchTick((n) => n + 1))
  }
  const markChecked = (folder: string): void => {
    window.api.watchlist.checked(folder).then(() => setWatchTick((n) => n + 1))
  }
  // What the last online check found, by series folder.
  const [releases, setReleases] = useState<Record<string, SeriesReleaseInfo>>({})
  useEffect(() => {
    const folders = [...new Set(items.map((i) => seriesFolder(i.filePath)))]
    if (folders.length === 0) return
    let live = true
    window.api.watchlist.getMeta(folders).then((m) => { if (live) setReleases(m) })
    return () => { live = false }
  }, [items])
  const [checking, setChecking] = useState<{ done: number; total: number } | null>(null)
  const [checkErrors, setCheckErrors] = useState<string[]>([])
  /** Looks each series up online, one after another, showing progress. */
  async function checkOnline(folders: string[]): Promise<void> {
    if (checking || folders.length === 0) return
    const errors: string[] = []
    setChecking({ done: 0, total: folders.length })
    for (let i = 0; i < folders.length; i++) {
      const r = await window.api.watchlist.checkOnline(folders[i])
      if (r.ok) setReleases((prev) => ({ ...prev, [folders[i]]: r.meta }))
      else errors.push(`${folders[i].split(/[\\/]/).pop()}: ${r.error}`)
      setChecking({ done: i + 1, total: folders.length })
      if (i < folders.length - 1) await new Promise((res) => setTimeout(res, 350))
    }
    setChecking(null)
    setCheckErrors(errors)
    setWatchTick((n) => n + 1)
  }
  const closeReader = (): void => {
    const local = (): void => {
      setSelectedCbz(null); setSelectedPdf(null); setSelectedBook(null)
      setProgressTick((n) => n + 1)
    }
    if (openedReader.current) { openedReader.current = false; backOr(local) }
    else local()
  }

  /** Marks a chapter read or unread by hand; either way its saved page no longer applies. */
  function markRead(vol: MediaItem, read: boolean): void {
    window.api.library.setWatched(vol.filePath, read)
    window.api.playback.clearProgress(vol.filePath).then(() => setProgressTick((n) => n + 1))
    setLastOpenedMap((prev) => ({ ...prev, [vol.filePath]: read ? Math.floor(Date.now() / 1000) : null }))
  }

  useEffect(() => { setSelectedSeries(null); setSelectedBook(null); setSelectedPdf(null); setSelectedCbz(null) }, [contentResetKey])

  const { closing, close: closeModal } = usePosterModal(() => setSelectedSeries(null))

  const ext = (path: string): string => path.slice(path.lastIndexOf('.')).toLowerCase()

  /** Opens an entry in the reader its format needs, starting at `at`. */
  function openEntry(vol: MediaItem, at: number): void {
    setStartAt(at)
    window.api.library.markOpened(vol.filePath)
    setLastOpenedMap((prev) => ({ ...prev, [vol.filePath]: Math.floor(Date.now() / 1000) }))
    if (ext(vol.filePath) === '.epub') setSelectedBook(vol)
    else if (ext(vol.filePath) === '.pdf') setSelectedPdf(vol)
    else setSelectedCbz(vol)
  }

  // Home asked for a chapter straight in the reader, or for a series' modal.
  // Whichever it opened, closing it goes back to Home; a chapter opened from
  // that modal still closes back to the modal.
  const openedReader = useRef(false)
  const { backOr } = useOpenRequest(category, !loading, (req) => {
    if (!req.series || !items.some((i) => getSeriesName(i.filePath) === req.series)) return false
    const vol = req.filePath ? items.find((i) => i.filePath === req.filePath) : undefined
    openedReader.current = !!vol
    // The series sits behind the reader only when the series is what was asked for.
    if (vol) openEntry(vol, req.startAt ?? 0)
    else setSelectedSeries(req.series)
    return true
  })

  if (selectedCbz) {
    return (
      <MangaReaderPage
        filePath={selectedCbz.filePath}
        title={selectedCbz.title}
        startPage={startAt}
        onBack={closeReader}
      />
    )
  }

  if (selectedPdf) {
    return (
      <PDFReaderPage
        filePath={selectedPdf.filePath}
        title={selectedPdf.title}
        onBack={closeReader}
      />
    )
  }

  if (selectedBook) {
    return (
      <EpubScrollReader
        filePath={selectedBook.filePath}
        title={selectedBook.title}
        isManga
        startAt={startAt}
        onBack={closeReader}
      />
    )
  }

  const grouped = groupBySeries(items.map((vol) =>
    vol.filePath in lastOpenedMap ? { ...vol, lastOpenedAt: lastOpenedMap[vol.filePath] } : vol
  ))

  // Build series cards for MediaGrid
  const filteredSeries = Array.from(grouped.entries())
    .filter(([name]) => name.toLowerCase().includes(query.toLowerCase()))
    .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))

  const summaries = new Map(filteredSeries.map(([name, vols]) => [name, summarize(vols, progress, category)]))

  const isWatched = (vols: MediaItem[]): boolean => !!watched[seriesFolder(vols[0].filePath)]
  const seriesCards: MediaCard[] = filteredSeries.map(([name, vols]) => {
    const { singular, plural } = detectUnit(vols)
    const sum = summaries.get(name)!
    return {
      id: vols[0].id,
      title: name,
      subtitle: sum.done > 0
        ? `${sum.done} / ${vols.length} ${plural} read`
        : `${vols.length} ${vols.length !== 1 ? plural : singular}`,
      posterPath: vols[0].posterPath,
      complete: isSeriesComplete(vols, { progress, category, isExtra: (v) => isExtra(v.title) }),
      // A finished series has its "complete" dot instead of a full bar.
      progress: sum.complete ? null : sum.done / Math.max(1, vols.length),
      starred: isWatched(vols)
    }
  })

  // Series started and not finished, most recently read first. Only on a
  // shelf big enough for it to save hunting (not three comics), and capped so
  // a lot on the go doesn't turn it into a second shelf.
  const inProgress = !query && grouped.size >= CONTINUE_MIN_SERIES
    ? filteredSeries
        .map(([name, vols]) => ({ name, vols, sum: summaries.get(name)! }))
        .filter(({ sum }) => sum.next && !sum.complete && (sum.done > 0 || sum.entries.some((e) => e.state.kind === 'partial')))
        .sort((a, b) => (b.sum.lastRead?.lastOpenedAt ?? 0) - (a.sum.lastRead?.lastOpenedAt ?? 0))
        .slice(0, CONTINUE_MAX)
    : []

  // The watchlist row: the series you starred (from the series view, or by
  // right-clicking a card). Anything the last online check found new first,
  // then longest since checked. Hidden while searching, like Continue; shown
  // on a shelf of any size.
  const watching = query ? [] : orderWatched(
    Array.from(grouped.entries())
      .map(([name, vols]) => ({ name, vols, folder: seriesFolder(vols[0].filePath), unit: summaries.get(name)?.unit.short ?? 'Ch.' }))
      .filter((s) => watched[s.folder])
      .map((s) => ({ ...s, info: watched[s.folder], rel: releaseStatus(newestNumber(s.vols), releases[s.folder], s.unit) }))
  ).sort((a, b) => b.rel.newCount - a.rel.newCount)

  return (
    <PageShell title={pageTitle} searchValue={query} onSearch={setQuery}>
      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {!loading && !error && inProgress.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <PosterRow
            title="Continue reading"
            cards={inProgress.map(({ name, vols, sum }) => ({
              key: name,
              posterPath: vols[0].posterPath,
              title: name,
              subtitle: `${sum.next!.label === 'Next' ? 'Next: ' : ''}${cleanDisplayTitle(sum.next!.video.title)}`,
              progress: sum.done / Math.max(1, vols.length),
              // Straight into the reader; closing it comes back to the shelf.
              onClick: () => openEntry(sum.next!.video, sum.next!.startAt)
            }))}
          />
        </div>
      )}
      {!loading && !error && watching.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <PosterRow
            title="Watching for new chapters"
            action={
              <CheckButton
                label="Check for new chapters"
                checking={checking}
                onClick={() => checkOnline(watching.map((s) => s.folder))}
              />
            }
            cards={watching.map(({ name, vols, folder, rel, unit }) => {
              const newest = newestOnDrive(vols, unit)
              const meta = releases[folder]
              return {
                key: name,
                posterPath: vols[0].posterPath,
                title: name,
                badge: rel.badge,
                subtitle: newest ? `${newest} on drive` : undefined,
                note: rel.line,
                // What the check matched, so a wrong match is easy to spot, and why "Unknown".
                tooltip: meta
                  ? `${name} \u2014 matched on MangaUpdates: ${meta.muTitle} (${meta.status})${rel.why ? `\n${rel.why}` : ''}`
                  : undefined,
                // Same right-click choices as the grid, so a series can be dropped from the row itself.
                menu: [
                  { label: '\u2605 Stop watching', onClick: () => setWatching(folder, false) },
                  { label: '\u21bb Check online now', onClick: () => checkOnline([folder]) }
                ],
                onClick: () => { if (!closing) setSelectedSeries(name) }
              }
            })}
          />
          {checkErrors.length > 0 && !checking && (
            <p className={controls.hint} title={checkErrors.join('\n')}>
              {checkErrors.length} series could not be matched online (hover for which).
            </p>
          )}
        </div>
      )}
      {!loading && !error && (
        <MediaGrid
          category="manga"
          items={seriesCards}
          onSelect={(card) => {
            // A click landing during the modal's fade-out would be cleared by its timer.
            if (closing) return
            const name = card.title
            const vols = grouped.get(name) ?? []
            if (vols.length === 1) {
              // Single volume — open directly
              const vol = vols[0]
              // No series view in between to have loaded the position, so ask
              // for it before opening.
              window.api.playback.getProgress([vol.filePath]).then((p) => {
                openEntry(vol, startPosition(watchState(p[vol.filePath], 0, category)))
              })
            } else {
              setSelectedSeries(name)
            }
          }}
          emptyMessage={emptyMessage}
          suspended={!!selectedSeries}
          menuFor={(card) => {
            // Star or unstar straight from the shelf, without opening the series.
            const vols = grouped.get(card.title) ?? []
            if (vols.length === 0) return []
            const folder = seriesFolder(vols[0].filePath)
            if (!watched[folder]) return [{ label: '☆ Watch for new chapters', onClick: () => setWatching(folder, true) }]
            return [
              { label: '★ Stop watching', onClick: () => setWatching(folder, false) },
              { label: '↻ Check online now', onClick: () => checkOnline([folder]) }
            ]
          }}
        />
      )}
      {selectedSeries && (
        <MangaSeriesModal
          key={selectedSeries}
          seriesName={selectedSeries}
          volumes={grouped.get(selectedSeries) ?? []}
          category={category}
          progressTick={progressTick}
          closing={closing}
          onClose={() => (openedReader.current ? closeModal() : backOr(closeModal))}
          onMarkRead={markRead}
          onSelect={openEntry}
          watch={(() => {
            const vols = grouped.get(selectedSeries) ?? []
            if (vols.length === 0) return undefined
            const folder = seriesFolder(vols[0].filePath)
            const info = watched[folder]
            return {
              watching: !!info,
              note: info ? watchNote(info) : null,
              onToggle: () => setWatching(folder, !info),
              onChecked: () => markChecked(folder)
            }
          })()}
        />
      )}
    </PageShell>
  )
}
