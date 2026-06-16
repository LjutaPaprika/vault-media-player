import { useEffect, useState } from 'react'
import { useStorageStatsStore } from '../store/storageStatsStore'
import { useTransferStore } from '../store/transferStore'
import { archiveDisplayName } from '../utils/archivePath'
import styles from './LibraryArchiveModal.module.css'

interface Props {
  relPath: string
  onClose: () => void
  onArchived?: () => void
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`
  if (bytes >= 1e9)  return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6)  return `${(bytes / 1e6).toFixed(0)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
}

export default function LibraryArchiveModal({ relPath, onClose, onArchived }: Props): JSX.Element {
  const { cold, coldConfigured, refresh } = useStorageStatsStore()
  const beginTransfer = useTransferStore((s) => s.begin)
  const finishTransfer = useTransferStore((s) => s.finish)
  const [size, setSize] = useState<number | null>(null)
  const [destExists, setDestExists] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [conflictPolicy, setConflictPolicy] = useState<'skip' | 'replace'>('skip')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([
      window.api.storage.getFolderSize('vault', relPath),
      window.api.storage.checkConflicts([{ side: 'vault', relPath }], 'cold')
    ]).then(([sizeRes, conflicts]) => {
      if (cancelled) return
      setSize(sizeRes?.bytes ?? null)
      setDestExists(conflicts[0]?.exists ?? false)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [relPath])

  const coldAvailable = cold !== null
  const willOverflow = coldAvailable && size !== null && (cold!.totalBytes - cold!.freeBytes + size) > cold!.totalBytes

  async function handleArchive(): Promise<void> {
    setSubmitting(true)
    beginTransfer('move', 'cold')
    const result = await window.api.storage.runTransfer({
      action: 'move',
      items: [{ side: 'vault', relPath }],
      destSide: 'cold',
      conflictPolicy
    })
    finishTransfer({ errors: result.errors, skipped: result.skipped })
    await refresh()
    onArchived?.()
    onClose()
  }

  const name = archiveDisplayName(relPath)

  return (
    <div className={styles.backdrop} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>Archive to cold store</h2>
        <div className={styles.target}>
          <div className={styles.targetName}>{name}</div>
          <div className={styles.targetPath}>media/{relPath}</div>
        </div>

        {loading
          ? <div className={styles.row}>Calculating size…</div>
          : (
            <>
              {size !== null && (
                <div className={styles.row}>
                  Size: <strong>{formatBytes(size)}</strong>
                </div>
              )}

              {!coldConfigured && (
                <div className={styles.error}>
                  Cold-store drive is not configured. Set a label in Settings → Cold Store Drive first.
                </div>
              )}
              {coldConfigured && !coldAvailable && (
                <div className={styles.error}>
                  Cold-store drive is not connected. Plug it in and try again.
                </div>
              )}
              {willOverflow && coldAvailable && size !== null && cold && (
                <div className={styles.error}>
                  Cold store has only {formatBytes(cold.freeBytes)} free — this would overflow.
                </div>
              )}
              {destExists && (
                <div className={styles.conflictBlock}>
                  <div className={styles.conflictHeader}>
                    A folder with this path already exists on cold store.
                  </div>
                  <label className={styles.conflictOption}>
                    <input
                      type="radio"
                      name="conflict"
                      checked={conflictPolicy === 'skip'}
                      onChange={() => setConflictPolicy('skip')}
                    />
                    Keep existing — skip this archive
                  </label>
                  <label className={styles.conflictOption}>
                    <input
                      type="radio"
                      name="conflict"
                      checked={conflictPolicy === 'replace'}
                      onChange={() => setConflictPolicy('replace')}
                    />
                    Replace — delete cold copy, then archive fresh
                  </label>
                </div>
              )}

              <div className={styles.warning}>
                The vault copy is removed after the cold copy is byte-verified.
              </div>
            </>
          )
        }

        <div className={styles.buttons}>
          <button className={styles.cancelBtn} onClick={onClose} disabled={submitting}>Cancel</button>
          <button
            className={styles.archiveBtn}
            onClick={handleArchive}
            disabled={loading || !coldAvailable || willOverflow || submitting || (destExists === true && conflictPolicy === 'skip')}
          >
            {submitting ? 'Archiving…' : 'Archive'}
          </button>
        </div>
      </div>
    </div>
  )
}
