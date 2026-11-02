import { useEffect, useMemo, useRef, useState } from 'react'
import PlaylistPicker, { type PickerPlaylist } from './PlaylistPicker'
import { useController } from '../hooks/useController'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { formatRuntime } from '../utils/duration'
import { checkPlaylistName, describeDestination, type PlaylistTarget } from '../utils/playlistTarget'
import type { YouTubePlaylist } from '../utils/youtubePlaylists'
import styles from './DownloadModal.module.css'

interface Props {
  /** The YouTube page's playlists, for covers and sizes in the picker. */
  playlists: YouTubePlaylist[]
  /** Opened from inside this playlist: start there, collapsed. */
  initialPlaylist?: string | null
  onClose: (downloaded: boolean) => void
}

/** Download YouTube videos, loose or into a playlist (media/youtube/<playlist>). */
export default function VideoDownloadModal({ playlists, initialPlaylist = null, onClose }: Props): JSX.Element {
  const [folders, setFolders] = useState<string[] | null>(null)
  const [urlInput, setUrlInput] = useState('')
  const [urls, setUrls] = useState<string[]>([])
  const [target, setTarget] = useState<PlaylistTarget>(
    initialPlaylist ? { kind: 'existing', name: initialPlaylist } : { kind: 'none' }
  )
  const [downloading, setDownloading] = useState(false)
  const [progress, setProgress] = useState<{ index: number; total: number; status: string; percent: number } | null>(null)
  const [errors, setErrors] = useState<{ url: string; kind: DownloadProgress['errorKind'] }[]>([])
  const [failure, setFailure] = useState<string | null>(null)
  const [succeeded, setSucceeded] = useState<number | null>(null)
  const unsubRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    // Folders, not just the playlists the library has scanned: an empty or
    // not-yet-scanned playlist folder is still somewhere to download to.
    window.api.youtube.getPlaylists().then(setFolders)
    return () => { unsubRef.current?.() }
  }, [])

  const options: PickerPlaylist[] = useMemo(() => {
    const byName = new Map(playlists.map((p) => [p.name, p]))
    const names = new Set([...(folders ?? []), ...playlists.map((p) => p.name)])
    return [...names].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })).map((name) => {
      const p = byName.get(name)
      const n = p?.videos.length ?? 0
      return {
        name,
        cover: p?.cover ?? null,
        detail: n === 0 ? 'Empty' : `${n} video${n === 1 ? '' : 's'}${p && p.totalSeconds > 0 ? ` · ${formatRuntime(p.totalSeconds)}` : ''}`
      }
    })
  }, [folders, playlists])

  const queued = urls.length + (urlInput.trim() ? 1 : 0)
  const names = options.map((o) => o.name)
  const nameCheck = target.kind === 'new' ? checkPlaylistName(target.name, names) : null
  const ready = queued > 0 && (nameCheck === null || nameCheck.ok)

  const existingCount = target.kind === 'existing' ? playlists.find((p) => p.name === target.name)?.videos.length ?? 0 : undefined
  const summary = describeDestination({ target, noun: 'video', count: queued, existingCount })

  function close(): void {
    if (!downloading) onClose(succeeded !== null)
  }
  useEscapeKey(close)
  useController({ onButton: (btn) => { if (btn === 'back') close() } })

  function addUrl(): void {
    const trimmed = urlInput.trim()
    if (!trimmed) return
    setUrls((prev) => [...prev, trimmed])
    setUrlInput('')
  }

  async function download(): Promise<void> {
    if (!ready) return
    const finalUrls = urlInput.trim() ? [...urls, urlInput.trim()] : urls
    setUrlInput('')
    const playlistName =
      target.kind === 'existing' ? target.name
      : target.kind === 'new' && nameCheck?.ok ? nameCheck.name
      : null

    setDownloading(true)
    setErrors([])
    setFailure(null)
    const newErrors: { url: string; kind: DownloadProgress['errorKind'] }[] = []

    unsubRef.current = window.api.library.onDownloadProgress((p) => {
      setProgress({ index: p.index, total: p.total, status: p.status, percent: p.percent })
      if (p.status === 'error') newErrors.push({ url: p.url, kind: p.errorKind })
    })

    let refused: string | null = null
    try {
      await window.api.youtube.downloadVideo({ urls: finalUrls.map((url) => ({ url, title: '' })), playlistName })
    } catch (e) {
      // The main process refuses a playlist name it cannot make a folder of.
      refused = e instanceof Error ? ipcMessage(e) : 'Download failed.'
    }

    unsubRef.current?.()
    unsubRef.current = null
    setErrors(newErrors)
    setFailure(refused)
    setDownloading(false)
    setProgress(null)
    // A new playlist exists now: a retry adds to it rather than tripping
    // over its own name.
    if (!refused && playlistName && target.kind === 'new') {
      setTarget({ kind: 'existing', name: playlistName })
      window.api.youtube.getPlaylists().then(setFolders)
    }
    // Auto-close only when every URL succeeded. If anything failed, keep the
    // modal open so the user can read the error explanation and act on it,
    // with the links that did not download back in the list to try again.
    if (refused) {
      setUrls(finalUrls)
    } else if (newErrors.length === 0) {
      setSucceeded(finalUrls.length)
      window.setTimeout(() => onClose(true), 1500)
    } else {
      setUrls(newErrors.map((e) => e.url))
    }
  }

  const title = initialPlaylist ? `Add videos to ${initialPlaylist}` : 'Download YouTube videos'

  return (
    <div className={styles.backdrop} onClick={close}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
          {!downloading && <button className={styles.close} onClick={close}>✕</button>}
        </div>

        {succeeded !== null ? (
          <div className={styles.body}>
            <div className={styles.doneMark}>✓</div>
            <p className={`${styles.status} ${styles.centered}`}>
              Downloaded {succeeded} video{succeeded === 1 ? '' : 's'}
              {playlistNameOf(target) ? ` to ${playlistNameOf(target)}` : ''}
            </p>
          </div>
        ) : downloading ? (
          <div className={styles.body}>
            {progress && (
              <>
                <p className={styles.status}>
                  {progress.status === 'converting' ? 'Processing…' : `Downloading ${progress.index + 1} of ${progress.total}…`}
                </p>
                <div className={styles.progressBar}>
                  <div className={styles.progressFill} style={{ width: `${progress.percent}%` }} />
                </div>
                <p className={styles.hint}>{Math.round(progress.percent)}%</p>
              </>
            )}
          </div>
        ) : (
          <>
            <div className={styles.body}>
              <div className={styles.field}>
                <label className={styles.label}>Video links</label>
                {urls.length > 0 && (
                  <ul className={styles.urlList}>
                    {urls.map((u, i) => (
                      <li key={i} className={styles.urlItem}>
                        <span className={styles.urlText}>{u}</span>
                        <button className={styles.removeBtn} onClick={() => setUrls((prev) => prev.filter((_, idx) => idx !== i))}>✕</button>
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

              <div className={styles.field}>
                <label className={styles.label}>Add to</label>
                <PlaylistPicker
                  playlists={options}
                  value={target}
                  onChange={setTarget}
                  allowNone
                  coverShape="wide"
                  startCollapsed={!!initialPlaylist}
                />
                <p className={styles.summary}>{summary}</p>
              </div>

              {failure && <p className={styles.error}>{failure}</p>}

              {errors.length > 0 && (
                <div className={styles.error}>
                  <p style={{ fontWeight: 600 }}>{errors.length} download{errors.length === 1 ? '' : 's'} failed. They are back in the list above to try again.</p>
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
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
            </div>

            <div className={styles.footer}>
              <button className={styles.secondaryBtn} onClick={close}>Cancel</button>
              <button className={styles.primaryBtn} onClick={() => void download()} disabled={!ready}>
                {queued > 1 ? `Download ${queued} videos` : 'Download video'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/** An error thrown in the main process, without Electron's IPC wrapping. */
export function ipcMessage(e: Error): string {
  return e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
}

function playlistNameOf(target: PlaylistTarget): string | null {
  return target.kind === 'none' ? null : target.name.replace(/\s+/g, ' ').trim() || null
}
