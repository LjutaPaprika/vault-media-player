import { useEffect, useState } from 'react'
import { useSyncStore } from '../store/syncStore'
import { useAppStore } from '../store/appStore'
import styles from './SyncIndicator.module.css'

// Robocopy progress lines look like:
//   *EXTRA File   55.4 m F:\...
//   New File       1.2 g E:\...
//   100%
//   Files :    12345    100    50    0    ...
// Pull out a short, useful summary for the pill body.
function summarize(message: string): string {
  const m = message.trim()
  const file = m.match(/^(?:\*EXTRA File|New File|Newer|Older|same)\s+[\d.]+\s*[kmg]?\s+(.+)$/i)
  if (file) {
    const path = file[1]
    const name = path.split(/[\\/]/).pop() ?? path
    return name.length > 40 ? name.slice(0, 37) + '…' : name
  }
  if (/^\d+(\.\d+)?\s*%/.test(m)) return m
  if (/^Files\s*:/.test(m)) return 'Tallying…'
  if (/^Total/i.test(m)) return 'Finalising…'
  return m.length > 40 ? m.slice(0, 37) + '…' : m
}

export default function SyncIndicator(): JSX.Element | null {
  const syncing  = useSyncStore((s) => s.syncing)
  const lines    = useSyncStore((s) => s.lines)
  const setPage  = useAppStore((s) => s.setActivePage)
  const [recentlyDone, setRecentlyDone] = useState(false)

  // Hold the indicator visible for a few seconds after a sync completes so the
  // user sees the terminal state instead of it vanishing the moment robocopy exits.
  useEffect(() => {
    if (!syncing && lines.length > 0) {
      setRecentlyDone(true)
      const t = setTimeout(() => setRecentlyDone(false), 6000)
      return () => clearTimeout(t)
    }
  }, [syncing, lines.length])

  if (!syncing && !recentlyDone) return null

  const last = lines[lines.length - 1]
  const terminal = last && (last.status === 'done' || last.status === 'error')
  const variant = terminal ? last.status : 'running'
  const copied  = last?.filescopied ?? 0
  const skipped = last?.filesskipped ?? 0
  const deleted = last?.filesdeleted ?? 0

  let primary: string
  if (variant === 'done') {
    primary = 'Backup synced'
  } else if (variant === 'error') {
    primary = 'Sync failed'
  } else {
    primary = last ? summarize(last.message) : 'Starting…'
  }

  return (
    <button
      className={`${styles.pill} ${styles[variant]}`}
      onClick={() => setPage('settings')}
      title="Open Settings to see the full sync log"
    >
      <span className={styles.dotWrap}>
        <span className={styles.dot} />
        {variant === 'running' && <span className={styles.dotPulse} />}
      </span>
      <div className={styles.text}>
        <div className={styles.label}>
          {variant === 'running' ? 'Syncing backup' : variant === 'done' ? 'Sync complete' : 'Sync error'}
        </div>
        <div className={styles.detail}>{primary}</div>
      </div>
      {(copied > 0 || skipped > 0 || deleted > 0) && (
        <div className={styles.stats}>
          <span className={styles.stat} title="Copied">
            <span className={styles.statGlyph}>↑</span>{copied.toLocaleString()}
          </span>
          {skipped > 0 && (
            <span className={styles.stat} title="Skipped">
              <span className={styles.statGlyph}>≡</span>{skipped.toLocaleString()}
            </span>
          )}
          {deleted > 0 && (
            <span className={styles.stat} title="Deleted">
              <span className={styles.statGlyph}>−</span>{deleted.toLocaleString()}
            </span>
          )}
        </div>
      )}
    </button>
  )
}
