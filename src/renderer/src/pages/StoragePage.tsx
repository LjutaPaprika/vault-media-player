import { useCallback, useEffect, useState } from 'react'
import PageShell from '../components/PageShell'
import { useStorageStatsStore } from '../store/storageStatsStore'
import styles from './StoragePage.module.css'

interface DriveInfo {
  label: string | null
  path: string
  freeBytes: number
  totalBytes: number
}

interface FolderListing {
  root: string
  mediaRoot: string
  relPath: string
  folders: { name: string; relPath: string; size: number }[]
}

type Side = 'vault' | 'cold'

// Selection per side: relPath -> total bytes of that folder
type Selection = Map<string, number>

function formatBytes(bytes: number): string {
  const abs = Math.abs(bytes)
  if (abs >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`
  if (abs >= 1e9)  return `${(bytes / 1e9).toFixed(1)} GB`
  if (abs >= 1e6)  return `${(bytes / 1e6).toFixed(0)} MB`
  if (abs >= 1e3)  return `${(bytes / 1e3).toFixed(0)} KB`
  return `${bytes} B`
}

function sumSelection(sel: Selection): number {
  let total = 0
  for (const size of sel.values()) total += size
  return total
}

// ─── Drive capacity card with predicted second bar ───────────────────────────

interface DriveCardProps {
  name: string
  drive: DriveInfo | null
  missingMessage: string
  predictedUsed?: number   // bytes after the pending operation
}

function DriveCard({ name, drive, missingMessage, predictedUsed }: DriveCardProps): JSX.Element {
  if (!drive) {
    return (
      <div className={`${styles.driveCard} ${styles.driveCardMissing}`}>
        <div className={styles.driveHeader}>
          <span className={styles.driveName}>{name}</span>
          <span className={styles.driveStatus}>not detected</span>
        </div>
        <div className={styles.driveMissingMsg}>{missingMessage}</div>
      </div>
    )
  }

  const used = drive.totalBytes - drive.freeBytes
  const pct  = drive.totalBytes > 0 ? (used / drive.totalBytes) * 100 : 0
  const tone = pct >= 90 ? styles.barCritical : pct >= 75 ? styles.barWarn : ''

  const showPredicted = predictedUsed !== undefined && Math.abs(predictedUsed - used) > 0
  const predPct = showPredicted && drive.totalBytes > 0
    ? Math.max(0, Math.min(100, (predictedUsed! / drive.totalBytes) * 100))
    : 0
  const predOverflow = showPredicted && predictedUsed! > drive.totalBytes
  const predTone = predOverflow ? styles.barCritical : predPct >= 75 ? styles.barWarn : styles.barPredicted
  const delta = showPredicted ? predictedUsed! - used : 0
  const deltaSign = delta > 0 ? '+' : ''

  return (
    <div className={styles.driveCard}>
      <div className={styles.driveHeader}>
        <span className={styles.driveName}>{name}</span>
        <span className={styles.driveLabel}>
          {drive.label ?? ''} <span className={styles.drivePath}>{drive.path}</span>
        </span>
      </div>
      <div className={styles.barBlock}>
        <div className={styles.barLabel}>Now</div>
        <div className={styles.bar}>
          <div className={`${styles.barFill} ${tone}`} style={{ width: `${pct.toFixed(1)}%` }} />
        </div>
      </div>
      {showPredicted && (
        <div className={styles.barBlock}>
          <div className={styles.barLabel}>After</div>
          <div className={styles.bar}>
            <div
              className={`${styles.barFill} ${predTone}`}
              style={{ width: `${predPct.toFixed(1)}%` }}
            />
          </div>
        </div>
      )}
      <div className={styles.driveFooter}>
        <span><strong>{formatBytes(used)}</strong> used of {formatBytes(drive.totalBytes)}</span>
        <span className={styles.driveFree}>{formatBytes(drive.freeBytes)} free · {pct.toFixed(1)}%</span>
      </div>
      {showPredicted && (
        <div className={`${styles.predictedFooter} ${predOverflow ? styles.predictedOverflow : ''}`}>
          {predOverflow
            ? <>Would overflow by <strong>{formatBytes(predictedUsed! - drive.totalBytes)}</strong> — deselect to fit.</>
            : <>Δ <strong>{deltaSign}{formatBytes(delta)}</strong> → {formatBytes(predictedUsed!)} used / {formatBytes(drive.totalBytes - predictedUsed!)} free</>
          }
        </div>
      )}
    </div>
  )
}

// ─── Folder browser pane ─────────────────────────────────────────────────────

interface PaneProps {
  side: Side
  driveAvailable: boolean
  missingMessage: string
  selected: Selection
  onToggleSelect: (side: Side, relPath: string, size: number) => void
  onClearSelection: (side: Side) => void
}

function FolderPane({ side, driveAvailable, missingMessage, selected, onToggleSelect, onClearSelection }: PaneProps): JSX.Element {
  const [relPath, setRelPath] = useState('')
  const [listing, setListing] = useState<FolderListing | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!driveAvailable) { setListing(null); return }
    let cancelled = false
    setLoading(true)
    window.api.storage.listFolder(side, relPath).then((r) => {
      if (cancelled) return
      setListing(r)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [side, relPath, driveAvailable])

  const breadcrumbs: { label: string; relPath: string }[] = [
    { label: 'media', relPath: '' },
    ...relPath.split('/').filter(Boolean).map((segment, i, all) => ({
      label: segment,
      relPath: all.slice(0, i + 1).join('/')
    }))
  ]

  function handleRowClick(e: React.MouseEvent, folderRel: string, size: number): void {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      onToggleSelect(side, folderRel, size)
    } else {
      setRelPath(folderRel)
      onClearSelection(side)
    }
  }

  if (!driveAvailable) {
    return (
      <div className={`${styles.pane} ${styles.paneMissing}`}>
        <div className={styles.paneTitle}>{side === 'vault' ? 'Vault' : 'Cold store'}</div>
        <div className={styles.paneMissingMsg}>{missingMessage}</div>
      </div>
    )
  }

  const selectedBytes = sumSelection(selected)

  return (
    <div className={styles.pane}>
      <div className={styles.paneHeader}>
        <div className={styles.paneTitle}>{side === 'vault' ? 'Vault' : 'Cold store'}</div>
        <div className={styles.breadcrumbs}>
          {breadcrumbs.map((bc, i) => (
            <span key={bc.relPath}>
              {i > 0 && <span className={styles.crumbSep}>/</span>}
              <button
                className={styles.crumb}
                onClick={() => { setRelPath(bc.relPath); onClearSelection(side) }}
              >{bc.label}</button>
            </span>
          ))}
        </div>
      </div>
      <div className={styles.folderList}>
        {loading && <div className={styles.folderEmpty}>Loading…</div>}
        {!loading && listing && listing.folders.length === 0 && (
          <div className={styles.folderEmpty}>No folders here.</div>
        )}
        {!loading && listing?.folders.map((f) => {
          const isSelected = selected.has(f.relPath)
          return (
            <div
              key={f.relPath}
              className={`${styles.folderRow} ${isSelected ? styles.folderRowSelected : ''}`}
              onClick={(e) => handleRowClick(e, f.relPath, f.size)}
            >
              <input
                type="checkbox"
                className={styles.folderCheck}
                checked={isSelected}
                onChange={() => onToggleSelect(side, f.relPath, f.size)}
                onClick={(e) => e.stopPropagation()}
              />
              <span className={styles.folderIcon}>📁</span>
              <span className={styles.folderName}>{f.name}</span>
              <span className={styles.folderSize}>{formatBytes(f.size)}</span>
            </div>
          )
        })}
      </div>
      <div className={styles.paneFooter}>
        {selected.size > 0
          ? <span><strong>{selected.size}</strong> selected · {formatBytes(selectedBytes)}</span>
          : <span className={styles.paneHint}>Click a folder to open · checkbox or ctrl/shift-click to select</span>
        }
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function StoragePage(): JSX.Element {
  const { vault, cold, coldConfigured, refresh } = useStorageStatsStore()
  const [loading, setLoading] = useState(true)
  const [vaultSel, setVaultSel] = useState<Selection>(new Map())
  const [coldSel,  setColdSel]  = useState<Selection>(new Map())

  const doRefresh = useCallback(async () => {
    setLoading(true)
    await refresh()
    setLoading(false)
  }, [refresh])

  useEffect(() => { doRefresh() }, [doRefresh])

  const setSel = (side: Side, updater: (prev: Selection) => Selection): void => {
    if (side === 'vault') setVaultSel(updater)
    else                  setColdSel(updater)
  }

  const handleToggleSelect = useCallback((side: Side, relPath: string, size: number) => {
    setSel(side, (prev) => {
      const next = new Map(prev)
      if (next.has(relPath)) next.delete(relPath)
      else                   next.set(relPath, size)
      return next
    })
  }, [])

  const handleClearSelection = useCallback((side: Side) => {
    setSel(side, () => new Map())
  }, [])

  const vaultAvailable = vault !== null
  const coldAvailable  = cold !== null

  // Predicted state assumes "Move selection to the other side" — the
  // most space-impactful intent and the natural reading of the selection.
  // Phase 4's action buttons will refine this per chosen op (Copy/Delete).
  const vaultSelectedBytes = sumSelection(vaultSel)
  const coldSelectedBytes  = sumSelection(coldSel)
  const hasAnySelection = vaultSelectedBytes + coldSelectedBytes > 0

  const vaultUsed = vault ? vault.totalBytes - vault.freeBytes : 0
  const coldUsed  = cold  ? cold.totalBytes  - cold.freeBytes  : 0

  const vaultPredicted = hasAnySelection && vault
    ? vaultUsed - vaultSelectedBytes + coldSelectedBytes
    : undefined
  const coldPredicted = hasAnySelection && cold
    ? coldUsed - coldSelectedBytes + vaultSelectedBytes
    : undefined

  return (
    <PageShell
      title="Storage"
      actions={
        <button className={styles.refreshBtn} onClick={doRefresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      }
    >
      <div className={styles.driveGrid}>
        <DriveCard
          name="Vault"
          drive={vault}
          missingMessage="Vault drive not detected — reconnect it and refresh."
          predictedUsed={vaultPredicted}
        />
        <DriveCard
          name="Cold store"
          drive={cold}
          missingMessage={
            coldConfigured === false
              ? 'Cold store not configured. Set the backup drive label in Settings.'
              : 'Cold store drive not detected — plug it in and refresh.'
          }
          predictedUsed={coldPredicted}
        />
      </div>

      {hasAnySelection && (
        <div className={styles.previewNote}>
          Preview shows the effect of moving the selection to the other drive.
          Copy and Delete actions arrive in Phase 4.
        </div>
      )}

      <div className={styles.paneGrid}>
        <FolderPane
          side="vault"
          driveAvailable={vaultAvailable}
          missingMessage="Vault drive not connected."
          selected={vaultSel}
          onToggleSelect={handleToggleSelect}
          onClearSelection={handleClearSelection}
        />
        <FolderPane
          side="cold"
          driveAvailable={coldAvailable}
          missingMessage={
            coldConfigured === false
              ? 'Configure the cold-store drive label in Settings.'
              : 'Cold-store drive not connected.'
          }
          selected={coldSel}
          onToggleSelect={handleToggleSelect}
          onClearSelection={handleClearSelection}
        />
      </div>

      <div className={styles.phaseNote}>
        Phase 3 of 6 — Copy/Move/Delete actions and the additive sync arrive in upcoming phases.
      </div>
    </PageShell>
  )
}
