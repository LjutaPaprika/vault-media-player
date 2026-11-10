import { useEffect, useRef, useState } from 'react'
import {
  DndContext, PointerSensor, closestCenter, useSensor, useSensors,
  type DragEndEvent, type Modifier
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { useMusicPlayer, Track, AlbumMeta } from '../context/MusicPlayerContext'
import { useController } from '../hooks/useController'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useAppStore } from '../store/appStore'
import { applyTrackOrder, moveItem, trackFileName } from '../utils/trackOrder'
import styles from './AlbumDetailPage.module.css'

interface Props {
  albumTitle: string
  artist: string
  year: number | null
  artPath: string | null
  firstTrackPath: string
  onBack: () => void
  /** Opens the download modal set to this playlist. */
  onAddTracks: () => void
  /** A modal is open over the page: leave Escape and the controller to it. */
  suspended?: boolean
}

function formatTime(s: number): string {
  if (!isFinite(s) || isNaN(s) || s <= 0) return ''
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = Math.floor(s % 60)
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`
  return `${m}:${sec.toString().padStart(2, '0')}`
}

/** How long the "Moved · Undo" note stays up. */
const TOAST_MS = 6000

/** Rows only ever move up and down. */
const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 })

/** A step that can be undone: the order before it, and whether that was a saved (custom) one. */
interface UndoEntry { tracks: Track[]; custom: boolean }

interface Toast { text: string; canUndo: boolean; error?: boolean }

interface RowProps {
  track: Track
  index: number
  active: boolean
  playing: boolean
  focused: boolean
  lifted: boolean
  onPlay: () => void
}

function TrackRow({ track, index, active, playing, focused, lifted, onPlay }: RowProps): JSX.Element {
  // Rows aren't made keyboard-focusable (no `attributes`): reordering is by
  // mouse or controller, and Space/Escape already mean play/pause and back.
  const { setNodeRef, listeners, transform, transition, isDragging } = useSortable({ id: track.path })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...listeners}
      className={[
        styles.trackRow,
        active ? styles.active : '',
        focused ? styles.controllerFocus : '',
        isDragging || lifted ? styles.dragging : ''
      ].join(' ')}
      // dnd-kit swallows the click that ends a drag, so this only fires for a real click.
      onClick={onPlay}
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className={styles.grip} aria-hidden>
        <circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/>
        <circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/>
        <circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/>
      </svg>
      <span className={styles.colNum}>
        {playing
          ? <svg viewBox="0 0 24 24" fill="currentColor" className={styles.playingIcon}><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
          : <span className={styles.trackNum}>{index + 1}</span>
        }
        <svg viewBox="0 0 24 24" fill="currentColor" className={styles.hoverPlay}><path d="M8 5v14l11-7z"/></svg>
      </span>
      <span className={styles.colTitle}>
        {track.title}
        {track.artist && <span className={styles.colArtist}>{track.artist}</span>}
      </span>
      <span className={styles.colDur}>{formatTime(track.duration ?? 0)}</span>
    </div>
  )
}

export default function AlbumDetailPage({ albumTitle, artist, year, artPath, firstTrackPath, onBack, onAddTracks, suspended = false }: Props): JSX.Element {
  const { setFocusZone } = useAppStore()
  const [dragActive, setDragActive] = useState(false)
  useEscapeKey(onBack, !suspended && !dragActive)
  const { play, playTrack, togglePlay, playing, currentIndex, albumMeta, queue, seek, currentTime, shuffleEnabled, setShuffle, toggleShuffle, reorderPlaylist } = useMusicPlayer()
  const currentTimeRef = useRef(0)
  useEffect(() => { currentTimeRef.current = currentTime }, [currentTime])
  const [tracks, setTracksState] = useState<Track[]>([])
  const [artSrc, setArtSrc] = useState<string | null>(null)
  const [focusedIdx, setFocusedIdx] = useState(-1)
  const focusedIdxRef = useRef(0)
  const tracksRef = useRef<Track[]>([])
  // Whether the playlist has a saved order of its own (shows "Reset order").
  const [custom, setCustomState] = useState(false)
  const customRef = useRef(false)
  const undoStack = useRef<UndoEntry[]>([])
  // Saves run one after another, so the last drag is the one that sticks.
  const saveChain = useRef<Promise<unknown>>(Promise.resolve())
  const [toast, setToast] = useState<Toast | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout>>()
  // Controller: the index of the track picked up with Y, and the order before it was.
  const [lifted, setLifted] = useState<number | null>(null)
  const liftedRef = useRef<number | null>(null)
  const liftSnapshot = useRef<Track[] | null>(null)

  const isThisAlbum = albumMeta?.title === albumTitle && albumMeta?.artist === artist
  const meta: AlbumMeta = { title: albumTitle, artist, artPath }

  function setTracks(next: Track[]): void { tracksRef.current = next; setTracksState(next) }
  function setCustom(next: boolean): void { customRef.current = next; setCustomState(next) }
  function setLift(idx: number | null): void { liftedRef.current = idx; setLifted(idx) }

  useEffect(() => {
    let cancelled = false
    window.api.library.getAlbumTracks(firstTrackPath).then((t) => { if (!cancelled) setTracks(t) })
    window.api.library.hasCustomTrackOrder(firstTrackPath).then((c) => { if (!cancelled) setCustom(c) }).catch(() => {})
    undoStack.current = []
    return () => { cancelled = true }
  }, [firstTrackPath])

  useEffect(() => {
    if (!artPath) return
    window.api.library.readImage(artPath).then(setArtSrc)
  }, [artPath])

  useEffect(() => () => clearTimeout(toastTimer.current), [])

  function showToast(t: Toast): void {
    clearTimeout(toastTimer.current)
    setToast(t)
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS)
  }

  /** Re-reads the playlist from the drive: after a failed save, or when a track was added meanwhile. */
  async function reload(): Promise<void> {
    const [fresh, isCustom] = await Promise.all([
      window.api.library.getAlbumTracks(firstTrackPath),
      window.api.library.hasCustomTrackOrder(firstTrackPath)
    ])
    const before = tracksRef.current
    setTracks(fresh)
    setCustom(isCustom)
    reorderPlaylist(before, fresh)
  }

  /**
   * Shows `next` at once, moves the playing queue along with it, then saves.
   * `names` null clears the saved order (back to file-name order).
   */
  function applyOrder(next: Track[], names: string[] | null, toastText: string, opts: { before?: Track[]; undoable: boolean }): void {
    const before = opts.before ?? tracksRef.current
    if (opts.undoable) undoStack.current.push({ tracks: before, custom: customRef.current })
    setTracks(next)
    reorderPlaylist(before, next)
    showToast({ text: toastText, canUndo: undoStack.current.length > 0 })
    saveChain.current = saveChain.current
      .then(() => window.api.library.setTrackOrder(firstTrackPath, names))
      .then((res) => {
        setCustom(res.custom)
        // The drive's order can differ from the one shown only if a track was
        // added (or removed) since the page loaded: show the drive's.
        const shown = tracksRef.current.map((t) => trackFileName(t.path))
        if (res.order.length !== shown.length || res.order.some((n, i) => n !== shown[i])) return reload()
      })
      .catch((err: unknown) => {
        console.error('[playlist order] save failed:', err)
        undoStack.current = []
        showToast({ text: 'Couldn’t save the new order. Showing the order on the drive.', canUndo: false, error: true })
        return reload().catch(() => {})
      })
  }

  function moveTrack(from: number, to: number, before?: Track[]): void {
    const list = before ?? tracksRef.current
    const next = moveItem(list, from, to)
    if (next.every((t, i) => t === list[i])) return
    applyOrder(next, next.map((t) => trackFileName(t.path)), `Moved “${list[from].title}”`, { before: list, undoable: true })
  }

  function resetOrder(): void {
    const byName = new Map(tracksRef.current.map((t) => [trackFileName(t.path), t]))
    const next = applyTrackOrder([...byName.keys()], null).map((n) => byName.get(n)!)
    applyOrder(next, null, 'Back to the original order', { undoable: true })
  }

  function undo(): void {
    const entry = undoStack.current.pop()
    if (!entry) return
    applyOrder(entry.tracks, entry.custom ? entry.tracks.map((t) => trackFileName(t.path)) : null, 'Undone', { undoable: false })
  }

  // Ctrl+Z steps back through this visit's moves.
  useEffect(() => {
    if (suspended) return
    function onKey(e: KeyboardEvent): void {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== 'z') return
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (undoStack.current.length === 0 || liftedRef.current !== null) return
      e.preventDefault()
      undo()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [suspended, firstTrackPath])

  // ─── Mouse dragging ─────────────────────────────────────────────────────────
  // A press only becomes a drag after 5 px of movement, so a click still plays.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  // Escape cancels a drag (dnd-kit listens on the document), but the app's
  // "go back" handler on the window would then also leave the page. This
  // listener is added after dnd-kit's, so it runs after the cancel and stops
  // the key there. It is removed a tick after the drag ends: removed during
  // the cancel itself, it would be skipped for that very key press.
  const escGuard = useRef((e: KeyboardEvent): void => { if (e.key === 'Escape') e.stopPropagation() })
  function endDrag(): void {
    setDragActive(false)
    setTimeout(() => document.removeEventListener('keydown', escGuard.current), 0)
  }
  useEffect(() => () => document.removeEventListener('keydown', escGuard.current), [])

  function handleDragEnd({ active, over }: DragEndEvent): void {
    endDrag()
    if (!over || active.id === over.id) return
    const list = tracksRef.current
    const from = list.findIndex((t) => t.path === active.id)
    const to = list.findIndex((t) => t.path === over.id)
    if (from >= 0 && to >= 0) moveTrack(from, to, list)
  }

  // ─── Playback ───────────────────────────────────────────────────────────────
  function handlePlay(index: number): void {
    const clickedPath  = tracks[index]?.path
    const playingPath  = isThisAlbum ? queue[currentIndex]?.path : null
    const isCurrentTrack = clickedPath === playingPath

    if (isThisAlbum && queue.length > 0) {
      if (isCurrentTrack) { togglePlay(); return }
      // The queue was built when the album was last played, which may predate
      // a track added or renamed since. Find the clicked track in it by path:
      // an index from this list would point past the queue's end (nothing
      // plays) or at whatever track now sits there. Not in the queue at all,
      // or shuffle on (clicking restarts shuffle from that track): rebuild.
      const queueIndex = queue.findIndex((t) => t.path === clickedPath)
      if (shuffleEnabled || queueIndex === -1 || queue.length !== tracks.length) {
        play(tracks, index, meta)
      } else {
        playTrack(queueIndex)
      }
    } else {
      play(tracks, index, meta)
    }
  }

  function handlePlayAll(): void {
    play(tracks, 0, meta)
  }

  function handleShuffle(): void {
    if (isThisAlbum && queue.length > 0) {
      // Album already playing — toggle shuffle without restarting, same as the player bar button
      toggleShuffle()
    } else {
      // Different album or nothing playing — start this album in shuffle mode
      setShuffle(true)
      play(tracks, Math.floor(Math.random() * tracks.length), meta)
    }
  }

  // ─── Controller ─────────────────────────────────────────────────────────────
  // Y picks up the highlighted track; up/down carry it; A or Y puts it down
  // (and saves); B puts it back where it was.
  function focus(idx: number): void {
    focusedIdxRef.current = idx
    setFocusedIdx(idx)
  }

  function dropLifted(): void {
    const snapshot = liftSnapshot.current
    const from = snapshot?.findIndex((t) => t.path === tracksRef.current[liftedRef.current ?? -1]?.path) ?? -1
    const to = liftedRef.current
    setLift(null)
    liftSnapshot.current = null
    if (!snapshot || from < 0 || to === null || from === to) {
      if (snapshot) setTracks(snapshot)
      return
    }
    moveTrack(from, to, snapshot)
  }

  function cancelLift(): void {
    const snapshot = liftSnapshot.current
    const original = snapshot?.findIndex((t) => t.path === tracksRef.current[liftedRef.current ?? -1]?.path) ?? -1
    if (snapshot) setTracks(snapshot)
    if (original >= 0) focus(original)
    setLift(null)
    liftSnapshot.current = null
  }

  // `extended` so Y (pick up / put down) is reported at all.
  const { resetState } = useController({ enabled: !suspended, extended: true, onButton: (btn) => {
    const held = liftedRef.current
    if (held !== null) {
      if (btn === 'up' || btn === 'down') {
        const to = btn === 'up' ? Math.max(0, held - 1) : Math.min(tracksRef.current.length - 1, held + 1)
        if (to !== held) {
          setTracks(moveItem(tracksRef.current, held, to))
          setLift(to)
          focus(to)
        }
      }
      if (btn === 'confirm' || btn === 'y') dropLifted()
      if (btn === 'back') cancelLift()
      return
    }
    if (btn === 'back') { setFocusZone('content'); onBack(); return }
    if (btn === 'up') focus(Math.max(0, focusedIdxRef.current - 1))
    if (btn === 'down') focus(Math.min(tracksRef.current.length - 1, focusedIdxRef.current + 1))
    if (btn === 'left')  seek(Math.max(0, currentTimeRef.current - 10))
    if (btn === 'right') seek(currentTimeRef.current + 10)
    if (btn === 'confirm') handlePlay(focusedIdxRef.current)
    if (btn === 'y' && focusedIdxRef.current >= 0 && focusedIdxRef.current < tracksRef.current.length) {
      liftSnapshot.current = tracksRef.current
      setLift(focusedIdxRef.current)
      focus(focusedIdxRef.current)
    }
  } })

  // Absorb any held buttons when detail page mounts (e.g. A held from card selection)
  useEffect(() => { resetState() }, [])

  // Compare by path rather than index so shuffled queues highlight correctly
  const currentPath = isThisAlbum ? (queue[currentIndex]?.path ?? null) : null
  const isTrackPlaying = (i: number): boolean => isThisAlbum && tracks[i]?.path === currentPath && playing

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
            <p className={styles.heroType}>Playlist</p>
            <h1 className={styles.heroTitle}>{albumTitle}</h1>
            <p className={styles.heroSub}>
              {[artist, year ? String(year) : null].filter(Boolean).join(' · ')}
              {(artist || year) ? ' · ' : ''}
              {tracks.length} track{tracks.length !== 1 ? 's' : ''}
            </p>
            <div className={styles.btnRow}>
              <button className={styles.playAllBtn} onClick={handlePlayAll}>
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                Play
              </button>
              <button className={`${styles.shuffleBtn} ${isThisAlbum && shuffleEnabled ? styles.shuffleBtnActive : ''}`} onClick={handleShuffle}>
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
                Shuffle
              </button>
              <button className={styles.addBtn} onClick={onAddTracks}>
                <svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
                Add tracks
              </button>
              {custom && (
                <button className={styles.addBtn} onClick={resetOrder} title="Clear your custom order and go back to file-name order">
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V2L7 6l5 4V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>
                  Reset order
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Track list */}
      <div className={`${styles.trackList} ${dragActive ? styles.listDragging : ''}`}>
        <div className={styles.trackListHeader}>
          <span className={styles.colNum}>#</span>
          <span className={styles.colTitle}>Title</span>
          <span className={styles.colDur}>Duration</span>
        </div>
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[verticalOnly]}
          onDragStart={() => { setDragActive(true); document.addEventListener('keydown', escGuard.current) }}
          onDragEnd={handleDragEnd}
          onDragCancel={endDrag}
        >
          <SortableContext items={tracks.map((t) => t.path)} strategy={verticalListSortingStrategy}>
            {tracks.map((track, i) => (
              <TrackRow
                key={track.path}
                track={track}
                index={i}
                active={isThisAlbum && track.path === currentPath}
                playing={isTrackPlaying(i)}
                focused={focusedIdx >= 0 && i === focusedIdx}
                lifted={lifted === i}
                onPlay={() => { if (liftedRef.current === null) handlePlay(i) }}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      {toast && (
        <div className={`${styles.toast} ${toast.error ? styles.toastError : ''}`} role="status">
          <span>{toast.text}</span>
          {toast.canUndo && !toast.error && (
            <button className={styles.toastUndo} onClick={() => { undo() }}>Undo</button>
          )}
        </div>
      )}
    </div>
  )
}
