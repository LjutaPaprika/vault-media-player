import { useEffect, useMemo, useState } from 'react'
import PageShell from '../components/PageShell'
import PosterImage from '../components/PosterImage'
import VideoDownloadModal from '../components/VideoDownloadModal'
import WatchedBar from '../components/WatchedBar'
import { useLibrary } from '../hooks/useLibrary'
import { useVideoProgress } from '../hooks/useVideoProgress'
import { useAppStore } from '../store/appStore'
import { formatClock, formatRuntime } from '../utils/duration'
import { startPosition, watchedFraction, watchState } from '../utils/resume'
import { upNextAfter } from '../utils/upNext'
import { buildPlaylists, openedAgo, sortByTitle, VIDEO_THUMB_WIDTH, type YouTubePlaylist } from '../utils/youtubePlaylists'
import YouTubePlaylistPage from './YouTubePlaylistPage'
import styles from './YouTubePage.module.css'

// ─── Main page ────────────────────────────────────────────────────────────────

export default function YouTubePage(): JSX.Element {
  const { items, loading, error, reload } = useLibrary('youtube')
  const { contentResetKey } = useAppStore()
  const [query, setQuery] = useState('')
  // The download modal: closed (null), open from the page (''), or open from
  // inside a playlist, named so the modal starts there.
  const [downloadInto, setDownloadInto] = useState<string | null>(null)
  const [durations, setDurations] = useState<Record<string, number>>({})
  const [covers, setCovers] = useState<Record<string, string | null>>({})
  const [selectedName, setSelectedName] = useState<string | null>(null)
  // Opening a video stamps last_opened_at in the database, but `items` was
  // loaded before that. Holding the new timestamps here keeps the cards and the
  // playlist view current without reloading the whole shelf after every play.
  const [openedAt, setOpenedAt] = useState<Record<string, number>>({})
  const progress = useVideoProgress(items.map((i) => i.filePath))

  // Videos autoplay moved on to were opened by mpv, so their position reports
  // are the live sign of it (the database marks them opened at that time).
  // Not a report that a video finished: that is the one being left.
  useEffect(() => {
    setOpenedAt((prev) => {
      let next: Record<string, number> | null = null
      for (const i of items) {
        const p = progress[i.filePath]
        const at = p && !p.finished ? p.savedAt : 0
        if (at > (prev[i.filePath] ?? i.lastOpenedAt ?? 0)) (next ??= { ...prev })[i.filePath] = at
      }
      return next ?? prev
    })
  }, [progress, items])

  useEffect(() => {
    window.api.library.getDurations('youtube').then(setDurations)
    window.api.youtube.getPlaylistCovers().then(setCovers)
  }, [items])

  useEffect(() => { setQuery(''); setSelectedName(null) }, [contentResetKey])

  const library = useMemo(
    () => items.map((i) => openedAt[i.filePath] !== undefined ? { ...i, lastOpenedAt: openedAt[i.filePath] } : i),
    [items, openedAt]
  )
  const playlists = useMemo(() => buildPlaylists(library, covers, durations), [library, covers, durations])

  /** Opens a video, resuming where it was left off unless told where to start. */
  function playVideo(filePath: string, startAt?: number): void {
    const start = startAt ?? startPosition(watchState(progress[filePath], durations[filePath], 'youtube'))
    // A video in a playlist is followed by the rest of that playlist, in the
    // order the playlist page lists it; a loose video plays alone.
    const playlist = playlists.find((p) => p.videos.some((v) => v.filePath === filePath))
    const upNext = playlist ? upNextAfter(playlist.videos, filePath, (v) => v.title, progress, durations, 'youtube') : []
    const title = playlist?.videos.find((v) => v.filePath === filePath)?.title
    window.api.playback.openVideo(filePath, 'youtube', start > 0 ? start : undefined, upNext, title)
    setOpenedAt((prev) => ({ ...prev, [filePath]: Math.floor(Date.now() / 1000) }))
  }

  const downloadModal = downloadInto !== null && (
    <VideoDownloadModal
      playlists={playlists}
      initialPlaylist={downloadInto || null}
      onClose={(downloaded) => {
        setDownloadInto(null)
        if (downloaded) reload()
      }}
    />
  )

  const selected = selectedName ? playlists.find((p) => p.name === selectedName) : undefined
  if (selected) {
    return (
      <>
        <YouTubePlaylistPage
          playlist={selected}
          durations={durations}
          progress={progress}
          onBack={() => setSelectedName(null)}
          onPlay={playVideo}
          onAddVideos={() => setDownloadInto(selected.name)}
          suspended={downloadInto !== null}
        />
        {downloadModal}
      </>
    )
  }

  // With no search, the Videos section holds only the loose videos; every
  // other video is reached through its playlist. A search looks inside the
  // playlists too, listing matching videos alongside the playlists they are in.
  const q = query.trim().toLowerCase()
  const matches = (v: MediaItem): boolean => v.title.toLowerCase().includes(q)
  const shownPlaylists = q
    ? playlists.filter((p) => p.name.toLowerCase().includes(q) || p.videos.some(matches))
    : playlists
  const shownVideos = sortByTitle(q ? library.filter(matches) : library.filter((v) => !v.genre))

  const ready = !loading && !error
  const noVideos = ready && items.length === 0
  const noMatches = ready && items.length > 0 && shownPlaylists.length === 0 && shownVideos.length === 0

  return (
    <>
    <PageShell title="YouTube" searchValue={query} onSearch={setQuery}>
      <div className={styles.actionBar}>
        <button className={styles.actionBtn} onClick={() => setDownloadInto('')}>
          <svg viewBox="0 0 24 24" fill="currentColor" className={styles.btnIcon}>
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
          </svg>
          Download Videos
        </button>
      </div>

      {loading && <p style={{ color: 'var(--text-muted)', padding: '24px' }}>Loading...</p>}
      {error   && <p style={{ color: 'var(--danger)',     padding: '24px' }}>{error}</p>}
      {noVideos && (
        <p style={{ color: 'var(--text-muted)', padding: '24px' }}>
          No saved videos yet. Use Download Videos to save YouTube videos for offline viewing.
        </p>
      )}
      {noMatches && (
        <p style={{ color: 'var(--text-muted)', padding: '24px' }}>
          No videos or playlists match “{query.trim()}”.
        </p>
      )}

      {ready && shownPlaylists.length > 0 && (
        <>
          <p className={styles.sectionLabel}>Playlists</p>
          <div className={styles.playlistGrid}>
            {shownPlaylists.map((p) => (
              <PlaylistCard key={p.name} playlist={p} onOpen={() => setSelectedName(p.name)} />
            ))}
          </div>
        </>
      )}

      {ready && shownVideos.length > 0 && (
        <>
          {shownPlaylists.length > 0 && <p className={styles.sectionLabel}>Videos</p>}
          <div className={styles.grid}>
            {shownVideos.map((item) => (
              <VideoCard
                key={item.id}
                item={item}
                duration={durations[item.filePath]}
                watched={watchedFraction(watchState(progress[item.filePath], durations[item.filePath], 'youtube'))}
                onPlay={() => playVideo(item.filePath)}
              />
            ))}
          </div>
        </>
      )}
    </PageShell>

    {downloadModal}
    </>
  )
}

// ─── Playlist card ────────────────────────────────────────────────────────────

function PlaylistCard({ playlist, onOpen }: { playlist: YouTubePlaylist; onOpen: () => void }): JSX.Element {
  const { name, videos, cover, totalSeconds, lastOpened } = playlist
  const count = `${videos.length} video${videos.length !== 1 ? 's' : ''}`

  return (
    <button className={styles.playlistCard} onClick={onOpen}>
      {/* The two slivers peeking out above the cover mark this as a stack of
          videos rather than a single one. */}
      <div className={styles.stack}>
        <div className={styles.thumb}>
          {cover
            ? <PosterImage filePath={cover.path} title={name} width={cover.width} />
            : <div className={styles.thumbPlaceholder}><PlaylistIcon /></div>
          }
          <div className={styles.playOverlay}>
            <span className={styles.viewPlaylist}><PlaylistIcon /> View playlist</span>
          </div>
          <div className={styles.countBadge}><PlaylistIcon /> {count}</div>
        </div>
      </div>
      <div className={styles.info}>
        <span className={styles.playlistTitle}>{name}</span>
        <span className={styles.meta}>
          {count}{totalSeconds > 0 && ` · ${formatRuntime(totalSeconds)}`}
        </span>
        {lastOpened?.lastOpenedAt && (
          <span className={styles.meta}>
            Watched {openedAgo(lastOpened.lastOpenedAt)} · {lastOpened.title}
          </span>
        )}
      </div>
    </button>
  )
}

function PlaylistIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={styles.playlistIcon}>
      <path d="M3 6h12v2H3zm0 5h12v2H3zm0 5h8v2H3zm14-5v8l6-4z"/>
    </svg>
  )
}

// ─── Video card ───────────────────────────────────────────────────────────────

interface VideoCardProps {
  item: MediaItem
  duration?: number
  /** Share already watched, for the progress bar; null when not started. */
  watched: number | null
  onPlay: () => void
}

function VideoCard({ item, duration, watched, onPlay }: VideoCardProps): JSX.Element {
  return (
    <button className={styles.card} onClick={onPlay}>
      <div className={styles.thumb}>
        {item.posterPath
          ? <PosterImage filePath={item.posterPath} title={item.title} width={VIDEO_THUMB_WIDTH} />
          : (
            <div className={styles.thumbPlaceholder}>
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </div>
          )
        }
        <div className={styles.playOverlay}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </div>
        {duration !== undefined && duration > 0 && (
          <div className={styles.durationOverlay}>{formatClock(duration)}</div>
        )}
        {watched !== null && <WatchedBar fraction={watched} />}
      </div>
      <div className={styles.info}>
        <span className={styles.title}>{item.title}</span>
        {/* Only search results include playlist videos; name the playlist so
            they can be told apart from the loose ones. */}
        {item.genre && <span className={styles.meta}>{item.genre}</span>}
      </div>
    </button>
  )
}
