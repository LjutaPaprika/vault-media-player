import { useEffect, useRef, useState } from 'react'
import styles from './ImportModal.module.css'

interface DropdownOption { label: string; value: string }

function Dropdown({ options, value, onChange }: {
  options: DropdownOption[]
  value: string
  onChange: (v: string) => void
}): JSX.Element {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  return (
    <div ref={ref} className={styles.dropdown}>
      <button
        type="button"
        className={`${styles.dropdownTrigger} ${open ? styles.dropdownTriggerOpen : ''}`}
        onClick={() => setOpen((o) => !o)}
      >
        <span>{selected?.label ?? ''}</span>
        <svg viewBox="0 0 24 24" fill="currentColor" className={styles.dropdownChevron}><path d="M7 10l5 5 5-5z"/></svg>
      </button>
      {open && (
        <div className={styles.dropdownList}>
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              className={`${styles.dropdownItem} ${o.value === value ? styles.dropdownItemActive : ''}`}
              onClick={() => { onChange(o.value); setOpen(false) }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

interface UrlRow {
  url: string
  title: string
  artist: string
}

interface TrackProgress {
  url: string
  title: string
  status: 'pending' | 'downloading' | 'converting' | 'done' | 'error'
  percent: number
}

type Step = 'setup' | 'downloading' | 'done'
type Mode = 'tracks' | 'playlist'

interface Props {
  onClose: (imported: boolean) => void
}

export default function ImportModal({ onClose }: Props): JSX.Element {
  const [mode, setMode] = useState<Mode>('tracks')
  const [step, setStep] = useState<Step>('setup')
  const [musicDir, setMusicDir] = useState<string>('')
  const [albums, setAlbums] = useState<MusicAlbum[]>([])
  const [selectedAlbumPath, setSelectedAlbumPath] = useState<string>('__new__')
  const [newAlbumName, setNewAlbumName] = useState('')
  const [newAlbumArtist, setNewAlbumArtist] = useState('')
  // Tracks mode
  const [rows, setRows] = useState<UrlRow[]>([{ url: '', title: '', artist: '' }])
  // Playlist mode
  const [playlistUrl, setPlaylistUrl] = useState('')
  // Shared
  const [tracks, setTracks] = useState<TrackProgress[]>([])
  const [error, setError] = useState<string | null>(null)

  const importedRef = useRef(false)

  useEffect(() => {
    window.api.library.getMusicAlbums().then(({ musicDir: dir, albums: a }) => {
      setMusicDir(dir)
      setAlbums(a)
    })
  }, [])

  useEffect(() => {
    if (step !== 'downloading') return
    const unsub = window.api.library.onDownloadProgress((p) => {
      if (mode === 'playlist') {
        // Playlist mode: progress events carry the running item count — grow the list as needed
        setTracks((prev) => {
          const next = [...prev]
          while (next.length <= p.index) next.push({ url: p.url, title: `Track ${next.length + 1}`, status: 'pending', percent: 0 })
          next[p.index] = { ...next[p.index], status: p.status, percent: p.percent }
          return next
        })
      } else {
        setTracks((prev) =>
          prev.map((t, i) =>
            i === p.index ? { ...t, status: p.status, percent: p.percent } : t
          )
        )
      }
    })
    return unsub
  }, [step, mode])

  function addRow(): void {
    setRows((r) => [...r, { url: '', title: '', artist: '' }])
  }

  function removeRow(i: number): void {
    setRows((r) => r.filter((_, idx) => idx !== i))
  }

  function updateRow(i: number, field: keyof UrlRow, value: string): void {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)))
  }

  function resolveAlbumPath(): { albumPath: string; artist?: string } | null {
    if (selectedAlbumPath === '__new__') {
      if (!newAlbumName.trim()) { setError('Enter a name for the new album.'); return null }
      if (!musicDir) { setError('Cannot determine music folder path. Scan your library first.'); return null }
      const base = musicDir.replace(/\\/g, '/').replace(/\/$/, '')
      return { albumPath: `${base}/${newAlbumName.trim()}`, artist: newAlbumArtist.trim() || undefined }
    }
    return { albumPath: selectedAlbumPath }
  }

  async function startTracksImport(): Promise<void> {
    setError(null)
    const validRows = rows.filter((r) => r.url.trim() && r.title.trim()).map((r) => ({
      url: r.url.trim(),
      title: r.title.trim(),
      artist: r.artist.trim() || undefined
    }))
    if (validRows.length === 0) { setError('Add at least one URL and title.'); return }

    const resolved = resolveAlbumPath()
    if (!resolved) return

    setTracks(validRows.map((r) => ({ url: r.url, title: r.title ?? '', status: 'pending', percent: 0 })))
    setStep('downloading')

    try {
      await window.api.library.downloadYouTube({ urls: validRows, ...resolved })
      importedRef.current = true
    } catch (e) {
      setStep('setup')
      setError(e instanceof Error ? e.message : 'Import failed. Please try again.')
      return
    }

    setStep('done')
  }

  async function startPlaylistImport(): Promise<void> {
    setError(null)
    if (!playlistUrl.trim()) { setError('Enter a playlist URL.'); return }

    const resolved = resolveAlbumPath()
    if (!resolved) return

    // Show one placeholder track while we wait for yt-dlp to start reporting
    setTracks([{ url: playlistUrl, title: 'Fetching playlist…', status: 'pending', percent: 0 }])
    setStep('downloading')

    try {
      await window.api.library.downloadYouTubePlaylist({ url: playlistUrl.trim(), ...resolved })
      importedRef.current = true
    } catch (e) {
      setStep('setup')
      setError(e instanceof Error ? e.message : 'Import failed. Please try again.')
      return
    }

    setStep('done')
  }

  // On the done screen, collect rows for failed tracks so the user can retry them
  function retryFailed(): void {
    const failed = tracks.filter((t) => t.status === 'error')
    if (mode === 'tracks') {
      setRows(failed.map((t) => ({ url: t.url, title: t.title, artist: '' })))
    } else {
      // For playlist mode failed = whole thing; just return to setup
    }
    setTracks([])
    setStep('setup')
  }

  function handleClose(): void {
    onClose(importedRef.current)
  }

  const albumOptions = [
    { value: '__new__', label: 'Create new album…' },
    ...albums.map((a) => ({ value: a.path, label: a.name }))
  ]

  const failedCount = tracks.filter((t) => t.status === 'error').length

  return (
    <div className={styles.overlay} onClick={(e) => e.target === e.currentTarget && handleClose()}>
      <div className={styles.modal}>
        <div className={styles.header}>
          <h2 className={styles.title}>Import from YouTube</h2>
          <button className={styles.closeBtn} onClick={handleClose}>✕</button>
        </div>

        {step === 'setup' && (
          <div className={styles.body}>
            {/* Mode toggle */}
            <div className={styles.modeToggle}>
              <button
                className={`${styles.modeBtn} ${mode === 'tracks' ? styles.modeBtnActive : ''}`}
                onClick={() => setMode('tracks')}
              >
                Individual Tracks
              </button>
              <button
                className={`${styles.modeBtn} ${mode === 'playlist' ? styles.modeBtnActive : ''}`}
                onClick={() => setMode('playlist')}
              >
                Playlist URL
              </button>
            </div>

            {/* Album selection */}
            <section className={styles.section}>
              <label className={styles.label}>Album</label>
              <Dropdown value={selectedAlbumPath} onChange={setSelectedAlbumPath} options={albumOptions} />
            </section>

            {selectedAlbumPath === '__new__' && (
              <section className={styles.section}>
                <label className={styles.label}>Album name</label>
                <input
                  className={styles.input}
                  placeholder="e.g. Discovery"
                  value={newAlbumName}
                  onChange={(e) => setNewAlbumName(e.target.value)}
                />
                <label className={styles.label} style={{ marginTop: 8 }}>Artist (optional)</label>
                <input
                  className={styles.input}
                  placeholder="e.g. Daft Punk"
                  value={newAlbumArtist}
                  onChange={(e) => setNewAlbumArtist(e.target.value)}
                />
              </section>
            )}

            {mode === 'tracks' && (
              <section className={styles.section}>
                <label className={styles.label}>Tracks</label>
                <div className={styles.rowList}>
                  {rows.map((row, i) => (
                    <div key={i} className={styles.row}>
                      <input
                        className={styles.input}
                        placeholder="YouTube URL"
                        value={row.url}
                        onChange={(e) => updateRow(i, 'url', e.target.value)}
                      />
                      <input
                        className={`${styles.input} ${styles.titleInput}`}
                        placeholder="Song title"
                        value={row.title}
                        onChange={(e) => updateRow(i, 'title', e.target.value)}
                      />
                      <input
                        className={`${styles.input} ${styles.artistInput}`}
                        placeholder="Artist (optional)"
                        value={row.artist}
                        onChange={(e) => updateRow(i, 'artist', e.target.value)}
                      />
                      {rows.length > 1 && (
                        <button className={styles.removeBtn} onClick={() => removeRow(i)}>✕</button>
                      )}
                    </div>
                  ))}
                </div>
                <button className={styles.addRowBtn} onClick={addRow}>+ Add track</button>
              </section>
            )}

            {mode === 'playlist' && (
              <section className={styles.section}>
                <label className={styles.label}>Playlist URL</label>
                <input
                  className={styles.input}
                  placeholder="https://youtube.com/playlist?list=..."
                  value={playlistUrl}
                  onChange={(e) => setPlaylistUrl(e.target.value)}
                  autoFocus
                />
                <p className={styles.hint}>All tracks in the playlist will be downloaded and numbered automatically.</p>
              </section>
            )}

            {error && <p className={styles.error}>{error}</p>}

            <div className={styles.footer}>
              <button className={styles.cancelBtn} onClick={handleClose}>Cancel</button>
              <button
                className={styles.importBtn}
                onClick={() => void (mode === 'tracks' ? startTracksImport() : startPlaylistImport())}
              >
                Import
              </button>
            </div>
          </div>
        )}

        {step === 'downloading' && (
          <div className={styles.body}>
            <p className={styles.statusMsg}>
              {mode === 'playlist' ? 'Downloading playlist…' : `Downloading ${tracks.length} track${tracks.length !== 1 ? 's' : ''}…`}
            </p>
            <div className={styles.trackList}>
              {tracks.map((t, i) => (
                <div key={i} className={styles.trackItem}>
                  <div className={styles.trackHeader}>
                    <span className={styles.trackTitle}>{t.title}</span>
                    <span className={`${styles.trackStatus} ${styles[t.status]}`}>
                      {t.status === 'pending'     && 'Waiting'}
                      {t.status === 'downloading' && `${Math.round(t.percent)}%`}
                      {t.status === 'converting'  && 'Converting…'}
                      {t.status === 'done'        && 'Done'}
                      {t.status === 'error'       && 'Error'}
                    </span>
                  </div>
                  {(t.status === 'downloading' || t.status === 'converting') && (
                    <div className={styles.progressBar}>
                      <div
                        className={styles.progressFill}
                        style={{ width: t.status === 'converting' ? '100%' : `${t.percent}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 'done' && (
          <div className={styles.body}>
            <p className={styles.statusMsg}>
              {failedCount > 0
                ? `Import complete — ${failedCount} track${failedCount !== 1 ? 's' : ''} failed.`
                : 'Import complete.'}
            </p>
            <div className={styles.trackList}>
              {tracks.map((t, i) => (
                <div key={i} className={styles.trackItem}>
                  <div className={styles.trackHeader}>
                    <span className={styles.trackTitle}>{t.title}</span>
                    <span className={`${styles.trackStatus} ${styles[t.status]}`}>
                      {t.status === 'done' ? '✓ Done' : '✕ Error'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className={styles.footer}>
              {failedCount > 0 && (
                <button className={styles.cancelBtn} onClick={retryFailed}>
                  ↩ Retry failed
                </button>
              )}
              <button className={styles.importBtn} onClick={handleClose}>Close</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
