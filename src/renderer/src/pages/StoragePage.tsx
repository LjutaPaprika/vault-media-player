import { useCallback, useEffect, useState } from 'react'
import PageShell from '../components/PageShell'
import styles from './StoragePage.module.css'

interface DriveInfo {
  label: string | null
  path: string
  freeBytes: number
  totalBytes: number
}

interface DrivesResponse {
  vault: DriveInfo | null
  cold:  DriveInfo | null
  coldConfigured: boolean
}

interface FolderListing {
  root: string
  mediaRoot: string
  relPath: string
  folders: { name: string; relPath: string; size: number }[]
}

type Side = 'vault' | 'cold'

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`
  if (bytes >= 1e9)  return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6)  return `${(bytes / 1e6).toFixed(0)} MB`
  if (bytes >= 1e3) return `${(bytes / 1e3).toFixed(0)} KB`
  return `${bytes} B`
}

// ─── Drive capacity card ─────────────────────────────────────────────────────

function DriveCard({ name, drive, missingMessage }: {
  name: string
  drive: DriveInfo | null
  missingMessage: string
}): JSX.Element {
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
  return (
    <div className={styles.driveCard}>
      <div className={styles.driveHeader}>
        <span className={styles.driveName}>{name}</span>
        <span className={styles.driveLabel}>
          {drive.label ?? ''} <span className={styles.drivePath}>{drive.path}</span>
        </span>
      </div>
      <div className={styles.bar}>
        <div className={`${styles.barFill} ${tone}`} style={{ width: `${pct.toFixed(1)}%` }} />
      </div>
      <div className={styles.driveFooter}>
        <span><strong>{formatBytes(used)}</strong> used of {formatBytes(drive.totalBytes)}</span>
        <span className={styles.driveFree}>{formatBytes(drive.freeBytes)} free · {pct.toFixed(1)}%</span>
      </div>
    </div>
  )
}

// ─── Folder browser pane ─────────────────────────────────────────────────────

interface PaneProps {
  side: Side
  driveAvailable: boolean
  missingMessage: string
  selected: Set<string>
  onToggleSelect: (side: Side, relPath: string, mode: 'single' | 'additive') => void
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

  function handleRowClick(e: React.MouseEvent, folderRel: string): void {
    if (e.shiftKey || e.ctrlKey || e.metaKey) {
      onToggleSelect(side, folderRel, 'additive')
    } else {
      // Plain click navigates into the folder
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
              onClick={(e) => handleRowClick(e, f.relPath)}
            >
              <input
                type="checkbox"
                className={styles.folderCheck}
                checked={isSelected}
                onChange={() => onToggleSelect(side, f.relPath, 'single')}
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
          ? <span>{selected.size} selected</span>
          : <span className={styles.paneHint}>Click a folder to open · checkbox or ctrl/shift-click to select</span>
        }
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function StoragePage(): JSX.Element {
  const [drives, setDrives] = useState<DrivesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [vaultSel, setVaultSel] = useState<Set<string>>(new Set())
  const [coldSel,  setColdSel]  = useState<Set<string>>(new Set())

  const refresh = useCallback(async () => {
    setLoading(true)
    const r = await window.api.storage.getDrives()
    setDrives(r)
    setLoading(false)
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const setSel = (side: Side, updater: (prev: Set<string>) => Set<string>): void => {
    if (side === 'vault') setVaultSel(updater)
    else                  setColdSel(updater)
  }

  const handleToggleSelect = useCallback((side: Side, relPath: string, _mode: 'single' | 'additive') => {
    setSel(side, (prev) => {
      const next = new Set(prev)
      if (next.has(relPath)) next.delete(relPath)
      else                   next.add(relPath)
      return next
    })
  }, [])

  const handleClearSelection = useCallback((side: Side) => {
    setSel(side, () => new Set())
  }, [])

  const vaultAvailable = drives?.vault !== null && drives?.vault !== undefined
  const coldAvailable  = drives?.cold  !== null && drives?.cold  !== undefined

  return (
    <PageShell
      title="Storage"
      actions={
        <button className={styles.refreshBtn} onClick={refresh} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      }
    >
      <div className={styles.driveGrid}>
        <DriveCard
          name="Vault"
          drive={drives?.vault ?? null}
          missingMessage="Vault drive not detected — reconnect it and refresh."
        />
        <DriveCard
          name="Cold store"
          drive={drives?.cold ?? null}
          missingMessage={
            drives?.coldConfigured === false
              ? 'Cold store not configured. Set the backup drive label in Settings.'
              : 'Cold store drive not detected — plug it in and refresh.'
          }
        />
      </div>

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
            drives?.coldConfigured === false
              ? 'Configure the cold-store drive label in Settings.'
              : 'Cold-store drive not connected.'
          }
          selected={coldSel}
          onToggleSelect={handleToggleSelect}
          onClearSelection={handleClearSelection}
        />
      </div>

      <div className={styles.phaseNote}>
        Phase 2 of 6 — predicted-state visualizer, Copy/Move/Delete actions, and the additive sync arrive in upcoming phases.
      </div>
    </PageShell>
  )
}
