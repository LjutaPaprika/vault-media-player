import { useEffect, useRef, useState } from 'react'
import PageShell from '../components/PageShell'
import PosterImage from '../components/PosterImage'
import AlbumDetailPage from './AlbumDetailPage'
import ImportModal from '../components/ImportModal'
import { useLibrary } from '../hooks/useLibrary'
import { useAppStore } from '../store/appStore'
import { useController } from '../hooks/useController'
import { useMusicPlayer, type Track, type AlbumMeta } from '../context/MusicPlayerContext'
import styles from './MusicPage.module.css'

interface SelectedAlbum {
  title: string
  artist: string
  year: number | null
  artPath: string | null
  firstTrackPath: string
}

export default function MusicPage(): JSX.Element {
  const { items, loading, error, reload } = useLibrary('music')
  const { contentResetKey, setFocusZone } = useAppStore()
  const { play } = useMusicPlayer()
  const [query, setQuery] = useState('')
  const [openedAlbum, setOpenedAlbum] = useState<SelectedAlbum | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [shuffleMode, setShuffleMode] = useState(false)
  const [checkedIndices, setCheckedIndices] = useState<Set<number>>(new Set())
  const [focusedIdx, setFocusedIdx] = useState(0)

  const focusedIdxRef = useRef(0)
  const filteredRef = useRef<MediaItem[]>([])
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const playBtnRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => { setOpenedAlbum(null) }, [contentResetKey])

  const filtered = items.filter((i) => i.title.toLowerCase().includes(query.toLowerCase()))
  filteredRef.current = filtered

  // In shuffle mode nav[0] = play button, nav[1..n] = albums.
  // In normal mode  nav[0..n-1] = albums.
  function navTotal(): number { return shuffleMode ? filtered.length + 1 : filtered.length }

  function focusItem(idx: number): void {
    const clamped = Math.max(0, Math.min(navTotal() - 1, idx))
    focusedIdxRef.current = clamped
    setFocusedIdx(clamped)
    if (shuffleMode && clamped === 0) {
      playBtnRef.current?.scrollIntoView({ block: 'nearest' })
    } else {
      const cardIdx = shuffleMode ? clamped - 1 : clamped
      cardRefs.current[cardIdx]?.scrollIntoView({ block: 'nearest' })
    }
  }

  function toggleCheck(albumIdx: number): void {
    setCheckedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(albumIdx)) next.delete(albumIdx)
      else next.add(albumIdx)
      return next
    })
  }

  async function playShuffled(albumIndices: Set<number>): Promise<void> {
    const allTracks: Track[] = []
    const selectedTitles: string[] = []
    for (const i of albumIndices) {
      const item = filteredRef.current[i]
      if (!item?.filePath) continue
      const raw = await window.api.library.getAlbumTracks(item.filePath)
      allTracks.push(...raw)
      selectedTitles.push(item.title)
    }
    if (allTracks.length === 0) return
    const shuffled = [...allTracks].sort(() => Math.random() - 0.5)
    const meta: AlbumMeta = {
      title: selectedTitles.length === 1 ? selectedTitles[0] : 'Shuffled Mix',
      artist: '',
      artPath: null
    }
    play(shuffled, 0, meta)
    setShuffleMode(false)
    setCheckedIndices(new Set())
  }

  function enterShuffleMode(): void {
    setShuffleMode(true)
    setCheckedIndices(new Set())
    const startIdx = filtered.length > 0 ? 1 : 0
    focusedIdxRef.current = startIdx
    setFocusedIdx(startIdx)
  }

  function cancelShuffleMode(): void {
    setShuffleMode(false)
    setCheckedIndices(new Set())
    focusedIdxRef.current = 0
    setFocusedIdx(0)
  }

  const { resetState } = useController({ onButton: (btn) => {
    if (btn === 'back') {
      if (shuffleMode) { cancelShuffleMode(); return }
      setFocusZone('sidebar')
      return
    }
    if (btn === 'up' || btn === 'left')   focusItem(focusedIdxRef.current - 1)
    if (btn === 'down' || btn === 'right') focusItem(focusedIdxRef.current + 1)
    if (btn === 'confirm') {
      const navIdx = focusedIdxRef.current
      if (shuffleMode) {
        if (navIdx === 0) {
          const toPlay = checkedIndices.size > 0
            ? checkedIndices
            : new Set(filteredRef.current.map((_, i) => i))
          void playShuffled(toPlay)
        } else {
          toggleCheck(navIdx - 1)
        }
      } else {
        const item = filteredRef.current[navIdx]
        if (item) setOpenedAlbum({
          title:          item.title,
          artist:         item.genre ?? '',
          year:           item.year ?? null,
          artPath:        item.posterPath ?? null,
          firstTrackPath: item.filePath ?? ''
        })
      }
    }
  } })

  useEffect(() => { resetState() }, [])

  if (openedAlbum) {
    return (
      <AlbumDetailPage
        albumTitle={openedAlbum.title}
        artist={openedAlbum.artist}
        year={openedAlbum.year}
        artPath={openedAlbum.artPath}
        firstTrackPath={openedAlbum.firstTrackPath}
        onBack={() => setOpenedAlbum(null)}
      />
    )
  }

  const allIndices = new Set(filtered.map((_, i) => i))

  return (
    <>
    <PageShell title="Music" searchValue={query} onSearch={setQuery}>
      {/* Shuffle action bar */}
      {!loading && !error && filtered.length > 0 && (
        <div className={styles.actionBar}>
          {shuffleMode ? (
            <>
              <button
                ref={playBtnRef}
                className={`${styles.playShuffledBtn} ${focusedIdx === 0 ? styles.controllerFocus : ''}`}
                onClick={() => void playShuffled(checkedIndices.size > 0 ? checkedIndices : allIndices)}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className={styles.btnIcon}><path d="M8 5v14l11-7z"/></svg>
                {checkedIndices.size > 0 ? `Shuffle ${checkedIndices.size} selected` : 'Shuffle All'}
              </button>
              <button
                className={styles.actionBtn}
                onClick={() =>
                  setCheckedIndices(
                    checkedIndices.size === filtered.length
                      ? new Set()
                      : new Set(filtered.map((_, i) => i))
                  )
                }
              >
                {checkedIndices.size === filtered.length ? 'Deselect All' : 'Select All'}
              </button>
              <button className={styles.actionBtn} onClick={cancelShuffleMode}>
                Cancel
              </button>
            </>
          ) : (
            <>
              <button
                className={styles.actionBtn}
                onClick={() => void playShuffled(allIndices)}
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className={styles.btnIcon}><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
                Shuffle All
              </button>
              <button className={styles.actionBtn} onClick={enterShuffleMode}>
                <svg viewBox="0 0 24 24" fill="currentColor" className={styles.btnIcon}><path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg>
                Shuffle Selected...
              </button>
              <button className={styles.actionBtn} onClick={() => setShowImport(true)}>
                <svg viewBox="0 0 24 24" fill="currentColor" className={styles.btnIcon}><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                Import
              </button>
            </>
          )}
        </div>
      )}

      {loading && <p style={{ color: 'var(--text-muted)', padding: '24px' }}>Loading...</p>}
      {error   && <p style={{ color: 'var(--danger)',     padding: '24px' }}>{error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p style={{ color: 'var(--text-muted)', padding: '24px' }}>
          {items.length === 0
            ? 'No music found. Add folders to media/music/ and scan your library.'
            : 'No results.'}
        </p>
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className={styles.grid}>
          {filtered.map((item, i) => {
            const navIdx = shuffleMode ? i + 1 : i
            const isChecked = shuffleMode && checkedIndices.has(i)
            return (
              <button
                key={item.id}
                ref={(el) => (cardRefs.current[i] = el)}
                className={`${styles.card} ${isChecked ? styles.cardChecked : ''} ${navIdx === focusedIdx ? styles.controllerFocus : ''}`}
                onClick={() => {
                  if (shuffleMode) {
                    toggleCheck(i)
                  } else {
                    setOpenedAlbum({
                      title:          item.title,
                      artist:         item.genre ?? '',
                      year:           item.year ?? null,
                      artPath:        item.posterPath ?? null,
                      firstTrackPath: item.filePath ?? ''
                    })
                  }
                }}
              >
                {shuffleMode && (
                  <div className={`${styles.checkOverlay} ${isChecked ? styles.checkOverlayActive : ''}`}>
                    {isChecked && <span className={styles.checkmark}>✓</span>}
                  </div>
                )}
                <div className={styles.art}>
                  {item.posterPath
                    ? <PosterImage filePath={item.posterPath} title={item.title} />
                    : <div className={styles.artPlaceholder}>{item.title.charAt(0)}</div>
                  }
                  {!shuffleMode && (
                    <div className={styles.playOverlay}>
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                    </div>
                  )}
                </div>
                <div className={styles.info}>
                  <span className={styles.albumTitle}>{item.title}</span>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </PageShell>
    {showImport && (
      <ImportModal
        onClose={(imported) => {
          setShowImport(false)
          if (imported) reload()
        }}
      />
    )}
    </>
  )
}
