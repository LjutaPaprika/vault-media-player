import { useEffect, useMemo, useRef, useState } from 'react'
import PlaylistPicker, { type PickerPlaylist } from './PlaylistPicker'
import { ipcMessage } from './VideoDownloadModal'
import { useController } from '../hooks/useController'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { checkPlaylistName, describeDestination, type PlaylistTarget } from '../utils/playlistTarget'
import styles from './DownloadModal.module.css'

interface TrackRow {
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
type Mode = 'tracks' | 'youtube-playlist'

interface Props {
  /** Cover art by playlist folder name, from the Music page's cards. */
  covers: Record<string, string | null>
  /** Opened from inside this playlist: start there, collapsed. */
  initialPlaylist?: string | null
  onClose: (downloaded: boolean) => void
}

const EMPTY_ROW: TrackRow = { url: '', title: '', artist: '' }

/** Download music from YouTube as MP3s into a playlist (media/music/<playlist>). */
export default function MusicDownloadModal({ covers, initialPlaylist = null, onClose }: Props): JSX.Element {
  const [mode, setMode] = useState<Mode>('tracks')
  const [step, setStep] = useState<Step>('setup')
  const [playlists, setPlaylists] = useState<MusicPlaylistInfo[]>([])
  const [target, setTarget] = useState<PlaylistTarget>(
    initialPlaylist ? { kind: 'existing', name: initialPlaylist } : { kind: 'new', name: '' }
  )
  const [artist, setArtist] = useState('')
  const [rows, setRows] = useState<TrackRow[]>([{ ...EMPTY_ROW }])
  const [playlistUrl, setPlaylistUrl] = useState('')
  const [tracks, setTracks] = useState<TrackProgress[]>([])
  const [error, setError] = useState<string | null>(null)
  const downloadedRef = useRef(false)

  useEffect(() => {
    // Opened from the page, nothing is pre-picked among existing playlists:
    // the first one alphabetically is no better a guess than any other, and a
    // wrong guess quietly adds tracks to the wrong playlist. "New playlist"
    // with no name yet keeps Download disabled until a choice is made.
    window.api.library.getMusicPlaylists().then(setPlaylists)
  }, [])

  useEffect(() => {
    if (step !== 'downloading') return
    return window.api.library.onDownloadProgress((p) => {
      if (mode === 'youtube-playlist') {
        // Progress events carry the running item count: grow the list as needed.
        setTracks((prev) => {
          const next = [...prev]
          while (next.length <= p.index) next.push({ url: p.url, title: `Track ${next.length + 1}`, status: 'pending', percent: 0 })
          next[p.index] = { ...next[p.index], status: p.status, percent: p.percent }
          return next
        })
      } else {
        setTracks((prev) => prev.map((t, i) => (i === p.index ? { ...t, status: p.status, percent: p.percent } : t)))
      }
    })
  }, [step, mode])

  const options: PickerPlaylist[] = useMemo(() => playlists.map((p) => ({
    name: p.name,
    cover: covers[p.name] ? { path: covers[p.name]!, width: 720 } : null,
    detail: p.trackCount === 0 ? 'Empty' : `${p.trackCount} track${p.trackCount === 1 ? '' : 's'}`
  })), [playlists, covers])

  const names = playlists.map((p) => p.name)
  const nameCheck = target.kind === 'new' ? checkPlaylistName(target.name, names) : null
  const chosen = target.kind === 'existing' ? playlists.find((p) => p.name === target.name) : undefined
  const validRows = rows.filter((r) => r.url.trim() && r.title.trim())
  const count = mode === 'youtube-playlist' ? null : validRows.length
  const summary = describeDestination({
    target,
    noun: 'track',
    count,
    existingCount: chosen?.trackCount,
    firstNumber: chosen?.nextNumber
  })
  const haveSource = mode === 'youtube-playlist' ? !!playlistUrl.trim() : validRows.length > 0
  const ready = haveSource && target.kind !== 'none' && (nameCheck === null || nameCheck.ok)

  function close(): void {
    if (step !== 'downloading') onClose(downloadedRef.current)
  }
  useEscapeKey(close)
  useController({ onButton: (btn) => { if (btn === 'back') close() } })

  function updateRow(i: number, field: keyof TrackRow, value: string): void {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)))
  }

  /** The playlist to send, or null (with the reason shown) if there is none yet. */
  function resolvedPlaylist(): { playlist: string; artist?: string } | null {
    if (target.kind === 'existing') return { playlist: target.name }
    if (nameCheck?.ok) return { playlist: nameCheck.name, artist: artist.trim() || undefined }
    return null
  }

  async function start(): Promise<void> {
    setError(null)
    if (mode === 'tracks' && rows.some((r) => r.url.trim() && !r.title.trim())) {
      setError('Give every track a title; it becomes the file name.')
      return
    }
    const dest = resolvedPlaylist()
    if (!dest || !haveSource) return

    setTracks(mode === 'tracks'
      ? validRows.map((r) => ({ url: r.url.trim(), title: r.title.trim(), status: 'pending', percent: 0 }))
      : [{ url: playlistUrl.trim(), title: 'Track 1', status: 'pending', percent: 0 }])
    setStep('downloading')

    try {
      if (mode === 'tracks') {
        await window.api.library.downloadYouTube({
          urls: validRows.map((r) => ({ url: r.url.trim(), title: r.title.trim(), artist: r.artist.trim() || undefined })),
          ...dest
        })
      } else {
        await window.api.library.downloadYouTubePlaylist({ url: playlistUrl.trim(), ...dest })
      }
      downloadedRef.current = true
    } catch (e) {
      setStep('setup')
      setError(e instanceof Error ? ipcMessage(e) : 'The download failed. Please try again.')
      return
    }
    // A new playlist exists now: anything retried goes into it.
    if (target.kind === 'new') setTarget({ kind: 'existing', name: dest.playlist })
    window.api.library.getMusicPlaylists().then(setPlaylists)
    setStep('done')
  }

  function retryFailed(): void {
    const failed = tracks.filter((t) => t.status === 'error')
    if (mode === 'tracks') setRows(failed.map((t) => ({ url: t.url, title: t.title, artist: '' })))
    setTracks([])
    setStep('setup')
  }

  const failedCount = tracks.filter((t) => t.status === 'error').length
  const title = initialPlaylist ? `Add tracks to ${initialPlaylist}` : 'Download music from YouTube'

  return (
    <div className={styles.backdrop} onClick={close}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
          {step !== 'downloading' && <button className={styles.close} onClick={close}>✕</button>}
        </div>

        {step === 'setup' && (
          <>
            <div className={styles.body}>
              <div className={styles.field}>
                <div className={styles.modeToggle}>
                  <button className={`${styles.modeBtn} ${mode === 'tracks' ? styles.modeBtnActive : ''}`} onClick={() => setMode('tracks')}>
                    Individual tracks
                  </button>
                  <button className={`${styles.modeBtn} ${mode === 'youtube-playlist' ? styles.modeBtnActive : ''}`} onClick={() => setMode('youtube-playlist')}>
                    A whole YouTube playlist
                  </button>
                </div>
              </div>

              {mode === 'tracks' ? (
                <div className={styles.field}>
                  <label className={styles.label}>Tracks</label>
                  <div className={styles.trackRows}>
                    {rows.map((row, i) => (
                      <div key={i} className={styles.trackRow}>
                        <input className={styles.input} placeholder="YouTube link" value={row.url} onChange={(e) => updateRow(i, 'url', e.target.value)} autoFocus={i === 0} />
                        <input className={styles.input} placeholder="Song title" value={row.title} onChange={(e) => updateRow(i, 'title', e.target.value)} />
                        <input className={styles.input} placeholder="Artist (optional)" value={row.artist} onChange={(e) => updateRow(i, 'artist', e.target.value)} />
                        {rows.length > 1
                          ? <button className={styles.removeBtn} onClick={() => setRows((r) => r.filter((_, idx) => idx !== i))}>✕</button>
                          : <span />}
                      </div>
                    ))}
                  </div>
                  <button className={styles.addRowBtn} onClick={() => setRows((r) => [...r, { ...EMPTY_ROW }])}>+ Add another track</button>
                </div>
              ) : (
                <div className={styles.field}>
                  <label className={styles.label}>YouTube playlist link</label>
                  <input
                    className={styles.input}
                    placeholder="https://youtube.com/playlist?list=..."
                    value={playlistUrl}
                    onChange={(e) => setPlaylistUrl(e.target.value)}
                    autoFocus
                  />
                  <p className={styles.hint}>Every track in it is downloaded, in the YouTube playlist's order.</p>
                </div>
              )}

              <div className={styles.field}>
                <label className={styles.label}>Add to</label>
                <PlaylistPicker
                  playlists={options}
                  value={target}
                  onChange={setTarget}
                  coverShape="square"
                  startCollapsed={!!initialPlaylist}
                />
                {target.kind === 'new' && (
                  <input
                    className={styles.input}
                    placeholder="Artist, if it's all one artist (optional)"
                    value={artist}
                    onChange={(e) => setArtist(e.target.value)}
                  />
                )}
                <p className={styles.summary}>{summary}</p>
              </div>

              {error && <p className={styles.error}>{error}</p>}
            </div>

            <div className={styles.footer}>
              <button className={styles.secondaryBtn} onClick={close}>Cancel</button>
              <button className={styles.primaryBtn} onClick={() => void start()} disabled={!ready}>
                {mode === 'youtube-playlist'
                  ? 'Download playlist'
                  : validRows.length > 1 ? `Download ${validRows.length} tracks` : 'Download track'}
              </button>
            </div>
          </>
        )}

        {step !== 'setup' && (
          <>
            <div className={styles.body}>
              <p className={styles.status}>
                {step === 'downloading'
                  ? (mode === 'youtube-playlist' ? 'Downloading the playlist…' : `Downloading ${tracks.length} track${tracks.length === 1 ? '' : 's'}…`)
                  : failedCount > 0
                    ? `Finished. ${failedCount} track${failedCount === 1 ? '' : 's'} failed.`
                    : `Finished. Saved to ${target.kind === 'none' ? '' : target.name}.`}
              </p>
              <div className={styles.items}>
                {tracks.map((t, i) => (
                  <div key={i} className={styles.item}>
                    <div className={styles.itemHead}>
                      <span className={styles.itemTitle}>{t.title}</span>
                      <span className={`${styles.itemStatus} ${styles[t.status]}`}>
                        {t.status === 'pending'     && 'Waiting'}
                        {t.status === 'downloading' && `${Math.round(t.percent)}%`}
                        {t.status === 'converting'  && 'Converting…'}
                        {t.status === 'done'        && '✓ Done'}
                        {t.status === 'error'       && '✕ Failed'}
                      </span>
                    </div>
                    {step === 'downloading' && (t.status === 'downloading' || t.status === 'converting') && (
                      <div className={styles.progressBar}>
                        <div className={styles.progressFill} style={{ width: t.status === 'converting' ? '100%' : `${t.percent}%` }} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
            {step === 'done' && (
              <div className={styles.footer}>
                {failedCount > 0 && <button className={styles.secondaryBtn} onClick={retryFailed}>↩ Retry failed</button>}
                <button className={styles.primaryBtn} onClick={close}>Close</button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
