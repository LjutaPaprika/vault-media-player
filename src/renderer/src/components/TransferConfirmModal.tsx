import { useState } from 'react'
import styles from './TransferConfirmModal.module.css'

export interface PendingTransfer {
  action: 'copy' | 'move' | 'delete'
  sourceSide: 'vault' | 'cold'
  destSide: 'vault' | 'cold' | null
  items: { relPath: string; bytes: number }[]
}

interface Props {
  pending: PendingTransfer
  conflicts: { relPath: string; exists: boolean }[]
  onCancel: () => void
  onConfirm: (conflictPolicy: 'skip' | 'replace') => void
}

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`
  if (bytes >= 1e9)  return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6)  return `${(bytes / 1e6).toFixed(0)} MB`
  if (bytes >= 1e3)  return `${(bytes / 1e3).toFixed(0)} KB`
  return `${bytes} B`
}

function actionTitle(action: 'copy' | 'move' | 'delete', destSide: 'vault' | 'cold' | null): string {
  if (action === 'delete') return 'Delete folders?'
  if (action === 'copy')   return destSide === 'cold' ? 'Copy to cold store?' : 'Copy to vault?'
  return destSide === 'cold' ? 'Move to cold store?' : 'Move to vault?'
}

function actionConfirmLabel(action: 'copy' | 'move' | 'delete'): string {
  if (action === 'delete') return 'Delete'
  if (action === 'copy')   return 'Copy'
  return 'Move'
}

export default function TransferConfirmModal({ pending, conflicts, onCancel, onConfirm }: Props): JSX.Element {
  const [conflictPolicy, setConflictPolicy] = useState<'skip' | 'replace'>('skip')

  const total = pending.items.reduce((s, it) => s + it.bytes, 0)
  const conflictedPaths = new Set(conflicts.filter((c) => c.exists).map((c) => c.relPath))
  const hasConflicts = conflictedPaths.size > 0
  const isDestructive = pending.action === 'delete' || pending.action === 'move'

  return (
    <div className={styles.backdrop} onClick={onCancel}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>{actionTitle(pending.action, pending.destSide)}</h2>
        <div className={styles.summary}>
          <div><strong>{pending.items.length}</strong> folder(s) · <strong>{formatBytes(total)}</strong></div>
          {pending.action !== 'delete' && pending.destSide && (
            <div className={styles.summarySub}>
              {pending.action === 'move' ? 'Moving' : 'Copying'} from <strong>{pending.sourceSide}</strong> to <strong>{pending.destSide}</strong>
            </div>
          )}
          {pending.action === 'delete' && (
            <div className={styles.summarySub}>
              Permanently deleting from <strong>{pending.sourceSide}</strong>
            </div>
          )}
        </div>

        <div className={styles.itemList}>
          {pending.items.map((it) => (
            <div key={it.relPath} className={styles.item}>
              <span className={styles.itemPath}>
                {conflictedPaths.has(it.relPath) && <span className={styles.conflictBadge}>!</span>}
                {it.relPath}
              </span>
              <span className={styles.itemSize}>{formatBytes(it.bytes)}</span>
            </div>
          ))}
        </div>

        {hasConflicts && pending.action !== 'delete' && (
          <div className={styles.conflictBlock}>
            <div className={styles.conflictHeader}>
              <strong>{conflictedPaths.size}</strong> folder(s) already exist at the destination
            </div>
            <div className={styles.conflictOptions}>
              <label className={styles.conflictOption}>
                <input
                  type="radio"
                  name="conflict"
                  checked={conflictPolicy === 'skip'}
                  onChange={() => setConflictPolicy('skip')}
                />
                <div>
                  <div className={styles.conflictOptionTitle}>Skip existing</div>
                  <div className={styles.conflictOptionDesc}>Leave the destination copies untouched.</div>
                </div>
              </label>
              <label className={styles.conflictOption}>
                <input
                  type="radio"
                  name="conflict"
                  checked={conflictPolicy === 'replace'}
                  onChange={() => setConflictPolicy('replace')}
                />
                <div>
                  <div className={styles.conflictOptionTitle}>Replace</div>
                  <div className={styles.conflictOptionDesc}>Delete the destination folder, then copy fresh.</div>
                </div>
              </label>
            </div>
          </div>
        )}

        {isDestructive && (
          <div className={styles.warning}>
            {pending.action === 'delete'
              ? 'This permanently removes the files. There is no recycle bin.'
              : 'Source folders are deleted only after the copy is byte-verified.'}
          </div>
        )}

        <div className={styles.buttons}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button
            className={`${styles.confirmBtn} ${isDestructive ? styles.destructive : ''}`}
            onClick={() => onConfirm(conflictPolicy)}
          >
            {actionConfirmLabel(pending.action)}
          </button>
        </div>
      </div>
    </div>
  )
}
