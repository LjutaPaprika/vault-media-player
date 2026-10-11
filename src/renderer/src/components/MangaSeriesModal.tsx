import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import WatchedBar from './WatchedBar'
import PosterModal, {
  Actions, Chip, Chips, PlayIcon, PrimaryButton, SectionLabel, Spacer, Tile, Tiles, Title
} from './PosterModal'
import { useVideoProgress } from '../hooks/useVideoProgress'
import { startPosition, watchedFraction, type WatchState } from '../utils/resume'
import { isExtra } from '../utils/readingEntries'
import {
  cleanDisplayTitle, continueLabel, readingUnitOf, summarize, timeAgo, type SeriesEntry
} from '../utils/mangaSeries'
import styles from './MangaSeriesModal.module.css'

interface Props {
  seriesName: string
  volumes: MediaItem[]
  category: 'manga' | 'comics'
  /** Changes when reading positions changed without this view seeing it. */
  progressTick: number
  /** Opens an entry; `startAt` is where to resume (a page, or for a book a chapter position). */
  onSelect: (item: MediaItem, startAt: number) => void
  /** Marks an entry read or unread by hand, e.g. one read outside the app. */
  onMarkRead: (item: MediaItem, read: boolean) => void
}

function CheckIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  )
}

/**
 * Scrolls a list so `row` sits mid-way down it. Done by hand rather than with
 * scrollIntoView, which would also scroll the page around the list.
 */
function centerRow(list: HTMLElement | null, row: HTMLElement | null): void {
  if (!list || !row) return
  // The list is position: relative, so offsetTop is measured from its top.
  list.scrollTop = row.offsetTop - list.clientHeight / 2 + row.clientHeight / 2
}

/** "p. 12/19", or "ch. 3/20" for a book. */
function partialNote(item: MediaItem, state: WatchState): string | null {
  if (state.kind !== 'partial') return null
  return `${readingUnitOf(item.filePath) === 'page' ? 'p.' : 'ch.'} ${Math.floor(state.position) + 1}/${state.duration}`
}

/** Positions, the series summary and the right-click menu. */
function useSeries(p: Props) {
  const progress = useVideoProgress(p.volumes.map((v) => v.filePath), p.progressTick)
  const summary = useMemo(() => summarize(p.volumes, progress, p.category), [p.volumes, progress, p.category])
  const [menu, setMenu] = useState<{ x: number; y: number; entry: SeriesEntry } | null>(null)
  const open = (e: SeriesEntry): void => p.onSelect(e.item, startPosition(e.state))
  const openMenu = (ev: React.MouseEvent, entry: SeriesEntry): void => {
    ev.preventDefault()
    setMenu({ x: ev.clientX, y: ev.clientY, entry })
  }
  const menuEl = menu && (() => {
    const { item, state } = menu.entry
    const read = item.lastOpenedAt != null
    const close = (): void => setMenu(null)
    return (
      <>
        <div className={styles.menuShield} onClick={close} onContextMenu={(e) => { e.preventDefault(); close() }} />
        <div className={styles.menu} style={{ left: menu.x, top: menu.y }}>
          {state.kind === 'partial' && (
            <button type="button" className={styles.menuItem} onClick={() => { close(); p.onSelect(item, 0) }}>
              Read from beginning
            </button>
          )}
          <button type="button" className={styles.menuItem} onClick={() => { close(); p.onMarkRead(item, !read) }}>
            {read ? 'Mark as unread' : 'Mark as read'}
          </button>
        </div>
      </>
    )
  })()
  const continueNow = (): void => { if (summary.next) p.onSelect(summary.next.video, summary.next.startAt) }
  return { summary, open, openMenu, menu, setMenu, menuEl, continueNow }
}

/** One entry as a list row: state, title, markers. */
function EntryRow({ entry, isNext, isLastRead, onOpen, onMenu, rowRef }: {
  entry: SeriesEntry; isNext: boolean; isLastRead: boolean
  onOpen: () => void; onMenu: (e: React.MouseEvent) => void; rowRef?: (el: HTMLButtonElement | null) => void
}): JSX.Element {
  const { item, state, done } = entry
  const note = partialNote(item, state)
  return (
    <button
      ref={rowRef}
      className={`${styles.row} ${done ? styles.rowDone : ''} ${isNext ? styles.rowNext : ''}`}
      onClick={onOpen}
      onContextMenu={onMenu}
    >
      <span className={`${styles.rowState} ${done ? styles.stateDone : state.kind === 'partial' ? styles.statePartial : ''}`}>
        {done ? <CheckIcon /> : state.kind === 'partial' ? <PlayIcon /> : null}
      </span>
      <span className={styles.rowTitle}>{cleanDisplayTitle(item.title)}</span>
      {isExtra(item.title) && <span className={styles.pill}>Extra</span>}
      {isLastRead && <span className={`${styles.pill} ${styles.pillAccent}`}>Last read</span>}
      {note && <span className={styles.rowNote}>{note}</span>}
      {state.kind === 'partial' && <WatchedBar fraction={watchedFraction(state) ?? 0} className={styles.rowBar} />}
    </button>
  )
}

export function MangaSeriesModal(p: Props & { closing: boolean; onClose: () => void }): JSX.Element {
  const { summary, open, openMenu, menu, setMenu, menuEl, continueNow } = useSeries(p)
  const nextRef = useRef<HTMLButtonElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)
  // Start the list at the entry Continue would open, not at chapter 1.
  useLayoutEffect(() => centerRow(listRef.current, nextRef.current), [])
  const poster = p.volumes.find((v) => v.posterPath)?.posterPath ?? null
  const pct = summary.total ? Math.round((summary.done / summary.total) * 100) : 0

  return (
    <PosterModal posterPath={poster} frameRatio={0.7} fit="cover" closing={p.closing} onClose={menu ? () => setMenu(null) : p.onClose} closeButton>
      <Title>{p.seriesName}</Title>
      <Chips>
        <Chip accent>{p.category === 'manga' ? 'Manga' : 'Comics'}</Chip>
        <Chip>{summary.total} {summary.total === 1 ? summary.unit.singular : summary.unit.plural}</Chip>
        {summary.complete && <Chip>Series complete</Chip>}
      </Chips>
      <Tiles>
        <Tile value={`${summary.done} / ${summary.total}`} label={`${summary.unit.plural} read · ${pct}%`}>
          <WatchedBar fraction={summary.done / Math.max(1, summary.total)} className={styles.tileBar} />
        </Tile>
        <Tile
          value={summary.lastRead?.lastOpenedAt ? timeAgo(summary.lastRead.lastOpenedAt) : '—'}
          label={summary.lastRead ? `Last read: ${cleanDisplayTitle(summary.lastRead.title)}` : 'Not started yet'}
        />
      </Tiles>
      <SectionLabel>{summary.unit.section} <span className={styles.count}>{summary.total}</span></SectionLabel>
      <div className={styles.modalList} ref={listRef}>
        {summary.entries.map((e) => {
          const isNext = summary.next?.video.id === e.item.id
          return (
            <EntryRow
              key={e.item.id}
              entry={e}
              isNext={isNext}
              isLastRead={!summary.complete && summary.lastRead?.id === e.item.id}
              onOpen={() => open(e)}
              onMenu={(ev) => openMenu(ev, e)}
              rowRef={isNext ? (el) => (nextRef.current = el) : undefined}
            />
          )
        })}
      </div>
      <Spacer />
      {summary.next && (
        <Actions>
          <PrimaryButton onClick={continueNow} autoFocus wide>
            <PlayIcon />
            <span>{continueLabel(summary.next)} · {cleanDisplayTitle(summary.next.video.title)}</span>
          </PrimaryButton>
        </Actions>
      )}
      {menuEl}
    </PosterModal>
  )
}
