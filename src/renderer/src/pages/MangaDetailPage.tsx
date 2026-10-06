import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import ContinueButton from '../components/ContinueButton'
import PosterImage from '../components/PosterImage'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useVideoProgress } from '../hooks/useVideoProgress'
import { continueTarget, startPosition, watchState } from '../utils/resume'
import { isExtra, sortKey } from '../utils/readingEntries'
import { isSeriesComplete } from '../utils/seriesComplete'
import styles from './ShowDetailPage.module.css'

interface Props {
  seriesName: string
  volumes: MediaItem[]
  category: 'manga' | 'comics'
  /** Changes when reading positions changed without this page seeing it. */
  progressTick: number
  onBack: () => void
  /** Opens a chapter; `startAt` is where to resume (a page, or for a book a chapter position). */
  onSelect: (item: MediaItem, startAt: number) => void
  /** Marks a chapter read or unread by hand, e.g. one read outside the app. */
  onMarkRead: (item: MediaItem, read: boolean) => void
}

/** EPUB volumes remember a chapter position; everything else a page. */
function unitOf(filePath: string): 'page' | 'chapter' {
  return filePath.toLowerCase().endsWith('.epub') ? 'chapter' : 'page'
}

// Strip Suwayomi scanlation group prefix at display time for entries already in DB with raw titles
function cleanDisplayTitle(raw: string): string {
  // Strip Suwayomi scanlation group prefix: "Group_Vol.1 Ch.1 - Title" → "Vol.1 Ch.1 - Title"
  const m = raw.match(/^.+_(Vol\.[\d.]+.*|Ch\.[\d.]+.*)$/i)
  let title = m ? m[1].trim() : raw
  // Strip leading "Vol.X " when followed by a chapter: "Vol.1 Ch.1 - Title" → "Ch.1 - Title"
  title = title.replace(/^Vol\.[\d.]+\s+(?=Ch\.)/i, '')
  return title
}

// Chapter-list scroll offset per series, kept for the life of the app. Opening
// a chapter replaces this page with the reader, which unmounts the list, so
// without this every return from the reader landed back at the top of the list.
const listScrollBySeries = new Map<string, number>()

export default function MangaDetailPage({ seriesName, volumes, category, progressTick, onBack, onSelect, onMarkRead }: Props): JSX.Element {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; vol: MediaItem } | null>(null)
  useEscapeKey(() => (contextMenu ? setContextMenu(null) : onBack()))
  const listRef = useRef<HTMLDivElement>(null)
  const progress = useVideoProgress(volumes.map((v) => v.filePath), progressTick)
  const open = (vol: MediaItem): void =>
    onSelect(vol, startPosition(watchState(progress[vol.filePath], 0, category)))

  // Restore before paint so the list never flashes at the top first. The rows
  // come from props that are already loaded, so the full scroll height exists
  // on the first render and the saved offset can be applied immediately.
  useLayoutEffect(() => {
    const saved = listScrollBySeries.get(seriesName)
    if (saved && listRef.current) listRef.current.scrollTop = saved
  }, [seriesName])
  const lastReadId = useMemo(() =>
    volumes.reduce<MediaItem | null>(
      (best, vol) => ((vol.lastOpenedAt ?? 0) > (best?.lastOpenedAt ?? 0) ? vol : best),
      null
    )?.id ?? -1
  , [volumes])

  const sortedVolumes = useMemo(() =>
    [...volumes].sort((a, b) => sortKey(a.title) - sortKey(b.title))
  , [volumes])

  const seriesComplete = isSeriesComplete(volumes, { progress, category, isExtra: (v) => isExtra(v.title) })

  // Continue follows the list's own order, so "next" is the row below.
  const next = continueTarget(sortedVolumes, progress, {}, category)

  const { sectionTitle, unitSingular, unitPlural } = useMemo(() => {
    const titles = volumes.map(v => cleanDisplayTitle(v.title).toLowerCase())
    if (titles.some(t => /(?:^|[\s_])ch(apter|\.)/.test(t))) return { sectionTitle: 'Chapters', unitSingular: 'chapter', unitPlural: 'chapters' }
    if (titles.some(t => /(?:^|[\s_])vol(ume|\.)/.test(t))) return { sectionTitle: 'Volumes', unitSingular: 'volume', unitPlural: 'volumes' }
    return { sectionTitle: 'Entries', unitSingular: 'entry', unitPlural: 'entries' }
  }, [volumes])

  return (
    <div className={styles.page}>
      {/* Left panel */}
      <div className={styles.leftPanel}>
        <button className={styles.back} onClick={onBack}>
          <span className={styles.backArrow}>‹</span> Back
        </button>
        <div className={styles.heroPoster}>
          {volumes[0]?.posterPath
            ? <PosterImage filePath={volumes[0].posterPath} title={seriesName} width={640} />
            : <div className={styles.posterPlaceholder}>{seriesName.charAt(0)}</div>
          }
        </div>
        <div className={styles.heroInfo}>
          <div className={styles.heroTitle}>{seriesName}</div>
          <div className={styles.heroMeta}>{volumes.length} {volumes.length !== 1 ? unitPlural : unitSingular}</div>
          {seriesComplete && <span className={styles.seriesCompletePill}>Series Complete</span>}
        </div>
        {next && (
          <ContinueButton
            target={next}
            title={cleanDisplayTitle(next.video.title)}
            readingUnit={unitOf(next.video.filePath)}
            onClick={() => onSelect(next.video, next.startAt)}
          />
        )}
      </div>

      {/* Right panel — volume list */}
      <div
        className={styles.rightPanel}
        ref={listRef}
        onScroll={(e) => listScrollBySeries.set(seriesName, e.currentTarget.scrollTop)}
      >
        <div className={styles.section}>
          <div className={styles.sectionHeaderPlain}>
            <span className={styles.sectionTitle}>{sectionTitle}</span>
            <span className={styles.sectionCount}>{volumes.length}</span>
          </div>
          <div className={styles.episodeList}>
            <div className={styles.episodeListInner}>
              {sortedVolumes.map((vol) => {
                const state = watchState(progress[vol.filePath], 0, category)
                return (
                  <button
                    key={vol.id}
                    className={styles.episodeRow}
                    onClick={() => open(vol)}
                    onContextMenu={(e) => {
                      e.preventDefault()
                      setContextMenu({ x: e.clientX, y: e.clientY, vol })
                    }}
                  >
                    <span className={styles.episodeTitle}>{cleanDisplayTitle(vol.title)}</span>
                    {isExtra(vol.title) && (
                      <span className={styles.extraPill}>Extra</span>
                    )}
                    {!seriesComplete && vol.id === lastReadId && (
                      <span className={styles.lastOpenedPill}>Last Read</span>
                    )}
                    {state.kind === 'partial' && (
                      <span className={styles.readingNote}>
                        {unitOf(vol.filePath) === 'page' ? 'p.' : 'ch.'} {Math.floor(state.position) + 1}/{state.duration}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      {contextMenu && (() => {
        const vol = contextMenu.vol
        const read = vol.lastOpenedAt != null
        const close = (): void => setContextMenu(null)
        return (
          <>
            <div className={styles.contextMenuShield} onClick={close} onContextMenu={(e) => { e.preventDefault(); close() }} />
            <div className={styles.contextMenu} style={{ left: contextMenu.x, top: contextMenu.y }}>
              {watchState(progress[vol.filePath], 0, category).kind === 'partial' && (
                <button type="button" className={styles.contextMenuItem} onClick={() => { close(); onSelect(vol, 0) }}>
                  Read from beginning
                </button>
              )}
              <button type="button" className={styles.contextMenuItem} onClick={() => { close(); onMarkRead(vol, !read) }}>
                {read ? 'Mark as unread' : 'Mark as read'}
              </button>
            </div>
          </>
        )
      })()}
    </div>
  )
}
