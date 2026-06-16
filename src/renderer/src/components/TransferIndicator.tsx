import { useEffect } from 'react'
import { useTransferStore } from '../store/transferStore'
import { useAppStore } from '../store/appStore'
import { useStorageStatsStore } from '../store/storageStatsStore'
import styles from './TransferIndicator.module.css'

function actionVerb(action: 'copy' | 'move' | 'delete' | 'sync' | null, dest: 'vault' | 'cold' | null): string {
  if (action === 'sync')   return 'Syncing new items'
  if (action === 'delete') return 'Deleting'
  if (action === 'copy')   return dest === 'cold' ? 'Copying to cold store' : 'Copying to vault'
  if (action === 'move')   return dest === 'cold' ? 'Moving to cold store'  : 'Moving to vault'
  return 'Transferring'
}

export default function TransferIndicator(): JSX.Element | null {
  const { active, action, destSide, progress, terminalAt, errors, skipped, dismiss } = useTransferStore()
  const setPage = useAppStore((s) => s.setActivePage)
  const refreshStats = useStorageStatsStore((s) => s.refresh)

  // Wire IPC progress events through to the store.
  useEffect(() => {
    const off = window.api.storage.onProgress((p) => {
      useTransferStore.getState().update(p)
    })
    return off
  }, [])

  // After terminal state, auto-dismiss after 6s and refresh drive stats.
  useEffect(() => {
    if (terminalAt === null) return
    refreshStats()
    const t = setTimeout(() => dismiss(), 6000)
    return () => clearTimeout(t)
  }, [terminalAt, refreshStats, dismiss])

  if (!active) return null

  const isTerminal = terminalAt !== null
  const phase = progress?.phase ?? 'starting'
  const hasErrors = errors.length > 0
  const variant = isTerminal ? (hasErrors ? 'error' : 'done') : 'running'

  // Stable text. No file names in the pill.
  let header: string
  if (variant === 'done')  header = `${actionVerb(action, destSide)} — complete`
  else if (variant === 'error') header = `${actionVerb(action, destSide)} — failed`
  else                     header = actionVerb(action, destSide)

  const detail = isTerminal
    ? hasErrors
      ? `${errors.length} item(s) failed${skipped > 0 ? ` · ${skipped} skipped` : ''}`
      : action === 'sync'
        ? (progress?.message ?? 'Done')
        : skipped > 0 ? `${skipped} item(s) skipped` : 'All items processed'
    : progress && progress.itemTotal > 0
      ? `${progress.itemIndex} of ${progress.itemTotal} folders${phase !== 'copying' && phase !== 'starting' ? ` · ${phase}` : ''}`
      : action === 'sync'
        ? (phase === 'starting' ? 'Starting…' : 'In progress…')
        : 'Preparing…'

  return (
    <button
      className={`${styles.pill} ${styles[variant]}`}
      onClick={() => setPage('storage')}
      title="Open Storage page"
    >
      <span className={styles.dotWrap}>
        <span className={styles.dot} />
        {variant === 'running' && <span className={styles.dotPulse} />}
      </span>
      <div className={styles.text}>
        <div className={styles.label}>{header}</div>
        <div className={styles.detail}>{detail}</div>
      </div>
    </button>
  )
}
