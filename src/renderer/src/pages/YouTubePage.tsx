import { useEffect, useMemo, useRef, useState } from 'react'
import PageShell from '../components/PageShell'
import PosterImage from '../components/PosterImage'
import WatchedBar from '../components/WatchedBar'
import { useLibrary } from '../hooks/useLibrary'
import { useAppStore } from '../store/appStore'
import { formatClock, formatRuntime } from '../utils/duration'
import { buildPlaylists, openedAgo, sortByTitle, startPosition, VIDEO_THUMB_WIDTH, watchedFraction, watchState, type YouTubePlaylist } from '../utils/youtubePlaylists'
import YouTubePlaylistPage from './YouTubePlaylistPage'
import styles from './YouTubePage.module.css'

// ─── Download modal ───────────────────────────────────────────────────────────

interface DownloadModalProps {
  onClose: (downloaded: boolean) => void
}

function DownloadModal({ onClose }: DownloadModalProps): JSX.Element {
  const [playlists, setPlaylists] = useState<string[]>([])
  const [urlInput, setUrlInput] = useState('')
  const [urls, setUrls] = useState<string[]>([])
  const [playlistMode, setPlaylistMode] = useState<'none' | 'existing' | 'new'>('none')
  const [selectedPlaylist, setSelectedPlaylist] = useState('')
  const [newPlaylistName, setNewPlaylistName] = useState('')
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState<{ index: number; total: number; status: string; percent: number } | null>(null)
  const [errors, setErrors] = useState<{ url: string; kind: DownloadProgress['errorKind'] }[]>([])
  const [succeeded, setSucceeded] = useState<number | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    window.api.youtube.getPlaylists().then(setPlaylists)
    return () => { unsubRef.current?.() }
  }, [])

  function addUrl(): void {
    const trimmed = urlInput.trim()
    if (!trimmed) return
    setUrls((prev) => [...prev, trimmed])
    setUrlInput('')
  }

  function removeUrl(i: number): void {
    setUrls((prev) => prev.filter((_, idx) => idx !== i))
  }

  async function download(): Promise<void> {
    const finalUrls = urlInput.trim() ? [...urls, urlInput.trim()] : urls
    if (finalUrls.length === 0) return
    setUrlInput('')
    const playlistName =
      playlistMode === 'existing' ? selectedPlaylist || null
      : playlistMode === 'new'    ? newPlaylistName.trim() || null
      : null

    setDownloading(true)
    setErrors([])
    const newErrors: { url: string; kind: DownloadProgress['errorKind'] }[] = []

    unsubRef.current = window.api.library.onDownloadProgress((p) => {
      setProgress({ index: p.index, total: p.total, status: p.status, percent: p.percent })
      if (p.status === 'error') newErrors.push({ url: p.url, kind: p.errorKind })
    })

    await window.api.youtube.downloadVideo({
      urls: finalUrls.map((url) => ({ url, title: '' })),
      playlistName
    })

    unsubRef.current?.()
    unsubRef.current = null
    setErrors(newErrors)
    setDownloading(false)
    setProgress(null)
    // Auto-close only when every URL succeeded. If anything failed, keep the
    // modal open so the user can read the error explanation and act on it.
    if (newErrors.length === 0) {
      setSucceeded(finalUrls.length)
      // Brief confirmation before auto-close, otherwise fast downloads look
      // like the modal flashed and disappeared.
      window.setTimeout(() => onClose(true), 1500)
    }
  }

  const resolvedPlaylist =
    playlistMode === 'existing' ? selectedPlaylist
    : playlistMode === 'new'    ? newPlaylistName
    : null

  return (
    <div className={styles.modalBackdrop} onClick={() => { if (!downloading) onClose(false) }}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalTitle}>Download YouTube Video</span>
          {!downloading && (
            <button className={styles.modalClose} onClick={() => onClose(false)}>✕</button>
          )}
        </div>

        {succeeded !== null ? (
          <div className={styles.progressArea} style={{ alignItems: 'center', textAlign: 'center', gap: 8 }}>
            <div style={{ fontSize: 48, color: 'var(--accent)' }}>✓</div>
            <p className={styles.progressLabel}>
              Downloaded {succeeded} video{succeeded === 1 ? '' : 's'}
            </p>
          </div>
        ) : !downloading ? (
          <>
            {/* URL input */}
            <div className={styles.field}>
              <label className={styles.label}>Video URLs</label>
              {urls.length > 0 && (
                <ul className={styles.urlList}>
                  {urls.map((u, i) => (
                    <li key={i} className={styles.urlItem}>
                      <span className={styles.urlText}>{u}</span>
                      <button className={styles.removeBtn} onClick={() => removeUrl(i)}>✕</button>
                    </li>
                  ))}
                </ul>
              )}
              <div className={styles.urlRow}>
                <input
                  className={styles.input}
                  placeholder="https://youtube.com/watch?v=..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addUrl() }}
                  autoFocus
                />
                <button className={styles.addBtn} onClick={addUrl}>Add</button>
              </div>
            </div>

            {/* Playlist */}
            <div className={styles.field}>
              <label className={styles.label}>Playlist</label>
              <div className={styles.playlistRow}>
                <button
                  className={`${styles.playlistBtn} ${playlistMode === 'none' ? styles.playlistBtnActive : ''}`}
                  onClick={() => setPlaylistMode('none')}
                >
                  None
                </button>
                {playlists.length > 0 && (
                  <button
                    className={`${styles.playlistBtn} ${playlistMode === 'existing' ? styles.playlistBtnActive : ''}`}
                    onClick={() => { setPlaylistMode('existing'); if (!selectedPlaylist) setSelectedPlaylist(playlists[0]) }}
                  >
                    Existing
                  </button>
                )}
                <button
                  className={`${styles.playlistBtn} ${playlistMode === 'new' ? styles.playlistBtnActive : ''}`}
                  onClick={() => setPlaylistMode('new')}
                >
                  New
                </button>
              </div>
              {playlistMode === 'existing' && (
                <select
                  className={styles.select}
                  value={selectedPlaylist}
                  onChange={(e) => setSelectedPlaylist(e.target.value)}
                >
                  {playlists.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              )}
              {playlistMode === 'new' && (
                <input
                  className={styles.input}
                  placeholder="Playlist name"
                  value={newPlaylistName}
                  onChange={(e) => setNewPlaylistName(e.target.value)}
                />
              )}
            </div>

            {resolvedPlaylist && (
              <p className={styles.destHint}>Saving to: youtube/{resolvedPlaylist}/</p>
            )}

            {errors.length > 0 && (
              <div className={styles.errorMsg}>
                <p style={{ margin: 0, fontWeight: 600 }}>{errors.length} download(s) failed:</p>
                <ul style={{ margin: '6px 0 0', paddingLeft: 18, fontSize: 12, lineHeight: 1.5 }}>
                  {errors.map((e, i) => (
                    <li key={i}>
                      <span style={{ wordBreak: 'break-all' }}>{e.url}</span>
                      {' — '}
                      {e.kind === 'age-restricted'
                        ? <>age-restricted. Refresh YouTube cookies in <strong>Settings → YouTube Cookies</strong>.</>
                       : e.kind === 'bot-check'
                        ? <>YouTube bot check. Refresh YouTube cookies in <strong>Settings → YouTube Cookies</strong>.</>
                       : e.kind === 'unavailable'
                        ? <>video unavailable (private, removed, or region-blocked).</>
                        : <>download failed — see <code>app/logs/yt-dlp.log</code> on the drive.</>}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className={styles.modalFooter}>
              <button className={styles.cancelBtn} onClick={() => onClose(false)}>Cancel</button>
              <button
                className={styles.downloadBtn}
                onClick={() => void download()}
                disabled={urls.length === 0 && !urlInput.trim()}
              >
                {(() => { const n = urls.length + (urlInput.trim() ? 1 : 0); return n > 1 ? `Download ${n} videos` : 'Download video' })()}
              </button>
            </div>
          </>
        ) : (
          <div className={styles.progressArea}>
            {progress && (
              <>
                <p className={styles.progressLabel}>
                  {progress.status === 'converting' ? 'Processing…' : `Downloading ${progress.index + 1} of ${progress.total}…`}
                </p>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${progress.percent}%` }} />
                </div>
                <p className={styles.progressPct}>{Math.round(progress.percent)}%</p>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function YouTubePage(): JSX.Element {
  const { items, loading, error, reload } = useLibrary('youtube')
  const { contentResetKey } = useAppStore()
  const [query, setQuery] = useState('')
  const [showDownload, setShowDownload] = useState(false)
  const [durations, setDurations] = useState<Record<string, number>>({})
  const [covers, setCovers] = useState<Record<string, string | null>>({})
  const [selectedName, setSelectedName] = useState<string | null>(null)
  // Opening a video stamps last_opened_at in the database, but `items` was
  // loaded before that. Holding the new timestamps here keeps the cards and the
  // playlist view current without reloading the whole shelf after every play.
  const [openedAt, setOpenedAt] = useState<Record<string, number>>({})
  const [progress, setProgress] = useState<Record<string, VideoProgress>>({})

  useEffect(() => {
    window.api.library.getDurations('youtube').then(setDurations)
    window.api.youtube.getPlaylistCovers().then(setCovers)
    window.api.youtube.getProgress().then(setProgress)
  }, [items])

  // mpv records the playhead every few seconds and when it closes; the main
  // process watches for those writes, so bars and Continue keep up live.
  useEffect(() => {
    return window.api.youtube.onProgressChanged(() => {
      window.api.youtube.getProgress().then(setProgress)
    })
  }, [])

  useEffect(() => { setQuery(''); setSelectedName(null) }, [contentResetKey])

  const library = useMemo(
    () => items.map((i) => openedAt[i.filePath] !== undefined ? { ...i, lastOpenedAt: openedAt[i.filePath] } : i),
    [items, openedAt]
  )
  const playlists = useMemo(() => buildPlaylists(library, covers, durations), [library, covers, durations])

  /** Opens a video, resuming where it was left off unless told where to start. */
  function playVideo(filePath: string, startAt?: number): void {
    const start = startAt ?? startPosition(watchState(progress[filePath], durations[filePath]))
    window.api.playback.openVideo(filePath, 'youtube', start > 0 ? start : undefined)
    setOpenedAt((prev) => ({ ...prev, [filePath]: Math.floor(Date.now() / 1000) }))
  }

  const selected = selectedName ? playlists.find((p) => p.name === selectedName) : undefined
  if (selected) {
    return (
      <YouTubePlaylistPage
        playlist={selected}
        durations={durations}
        progress={progress}
        onBack={() => setSelectedName(null)}
        onPlay={playVideo}
      />
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
        <button className={styles.actionBtn} onClick={() => setShowDownload(true)}>
          <svg viewBox="0 0 24 24" fill="currentColor" className={styles.btnIcon}>
            <path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/>
          </svg>
          Download Video
        </button>
      </div>

      {loading && <p style={{ color: 'var(--text-muted)', padding: '24px' }}>Loading...</p>}
      {error   && <p style={{ color: 'var(--danger)',     padding: '24px' }}>{error}</p>}
      {noVideos && (
        <p style={{ color: 'var(--text-muted)', padding: '24px' }}>
          No saved videos yet. Use Download Video to save YouTube videos for offline viewing.
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
                watched={watchedFraction(watchState(progress[item.filePath], durations[item.filePath]))}
                onPlay={() => playVideo(item.filePath)}
              />
            ))}
          </div>
        </>
      )}
    </PageShell>

    {showDownload && (
      <DownloadModal onClose={(downloaded) => {
        setShowDownload(false)
        if (downloaded) reload()
      }} />
    )}
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
