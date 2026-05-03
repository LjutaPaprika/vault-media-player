import { useEffect, useRef, useState } from 'react'
import PageShell from '../components/PageShell'
import PosterImage from '../components/PosterImage'
import { useLibrary } from '../hooks/useLibrary'
import { useAppStore } from '../store/appStore'
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
  const [errors, setErrors] = useState<string[]>([])
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
    const newErrors: string[] = []

    unsubRef.current = window.api.library.onDownloadProgress((p) => {
      setProgress({ index: p.index, total: p.total, status: p.status, percent: p.percent })
      if (p.status === 'error') newErrors.push(p.url)
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
    onClose(true)
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

        {!downloading ? (
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
              <p className={styles.errorMsg}>{errors.length} download(s) failed.</p>
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

  useEffect(() => { setQuery('') }, [contentResetKey])

  const filtered = items.filter((i) => i.title.toLowerCase().includes(query.toLowerCase()))
  const ungrouped = filtered.filter((i) => !i.genre)

  const playlistMap = new Map<string, MediaItem[]>()
  for (const item of filtered) {
    if (item.genre) {
      if (!playlistMap.has(item.genre)) playlistMap.set(item.genre, [])
      playlistMap.get(item.genre)!.push(item)
    }
  }

  const isEmpty = !loading && !error && filtered.length === 0

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
      {isEmpty && (
        <p style={{ color: 'var(--text-muted)', padding: '24px' }}>
          No saved videos yet. Use Download Video to save YouTube videos for offline viewing.
        </p>
      )}

      {/* Ungrouped videos */}
      {!loading && !error && ungrouped.length > 0 && (
        <>
          {playlistMap.size > 0 && <p className={styles.sectionLabel}>Saved Videos</p>}
          <div className={styles.grid}>
            {ungrouped.map((item) => (
              <VideoCard key={item.id} item={item} />
            ))}
          </div>
        </>
      )}

      {/* Playlists */}
      {!loading && !error && [...playlistMap.entries()].map(([playlist, videos]) => (
        <div key={playlist}>
          <p className={styles.sectionLabel}>{playlist}</p>
          <div className={styles.grid}>
            {videos.map((item) => (
              <VideoCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      ))}
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

// ─── Video card ───────────────────────────────────────────────────────────────

function VideoCard({ item }: { item: MediaItem }): JSX.Element {
  function play(): void {
    if (!item.filePath) return
    window.api.playback.openVideo(item.filePath, 'youtube')
  }

  return (
    <button className={styles.card} onClick={play}>
      <div className={styles.thumb}>
        {item.posterPath
          ? <PosterImage filePath={item.posterPath} title={item.title} />
          : (
            <div className={styles.thumbPlaceholder}>
              <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
            </div>
          )
        }
        <div className={styles.playOverlay}>
          <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
        </div>
      </div>
      <div className={styles.info}>
        <span className={styles.title}>{item.title}</span>
      </div>
    </button>
  )
}
