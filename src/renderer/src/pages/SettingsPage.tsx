import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import PageShell from '../components/PageShell'
import styles from './SettingsPage.module.css'

function DriveField({
  title,
  description,
  initialLabel,
  onSave,
  onDetect
}: {
  title: string
  description: string
  initialLabel: string
  onSave: (label: string) => Promise<void>
  onDetect: (label: string) => Promise<string | null>
}): JSX.Element {
  const [label, setLabel] = useState(initialLabel)
  const [saved, setSaved] = useState(false)
  const [detected, setDetected] = useState<string | null | undefined>(undefined)

  async function handleSave(): Promise<void> {
    const trimmed = label.trim()
    if (!trimmed) return
    await onSave(trimmed)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    const path = await onDetect(trimmed)
    setDetected(path)
  }

  async function handleDetect(): Promise<void> {
    const trimmed = label.trim()
    if (!trimmed) return
    const path = await onDetect(trimmed)
    setDetected(path)
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <p className={styles.sectionDesc}>{description}</p>
      <div className={styles.row}>
        <input
          className={styles.input}
          type="text"
          value={label}
          onChange={(e) => { setLabel(e.target.value); setDetected(undefined); setSaved(false) }}
          placeholder="e.g. VAULT"
          spellCheck={false}
        />
        <button className={styles.btn} onClick={handleSave}>{saved ? 'Saved' : 'Save'}</button>
        <button className={styles.btnSecondary} onClick={handleDetect}>Detect</button>
      </div>
      {detected !== undefined && (
        <p className={detected ? styles.statusOk : styles.statusError}>
          {detected ? `Found at ${detected}` : `Drive not found — is it plugged in?`}
        </p>
      )}
    </section>
  )
}

export default function SettingsPage(): JSX.Element {
  const { libraryLabel, libraryPath, setLibrary } = useAppStore()

  const [backupLabelInit, setBackupLabelInit] = useState('')

  // Sync state
  const [syncing, setSyncing] = useState(false)
  const [syncLines, setSyncLines] = useState<SyncProgress[]>([])
  const logRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    window.api.sync.getBackupLabel().then((label) => {
      if (label) setBackupLabelInit(label)
    })
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [syncLines])

  async function saveLibraryLabel(label: string): Promise<void> {
    await window.api.library.setLabel(label)
    const path = await window.api.library.findDrive(label)
    setLibrary(label, path)
  }

  async function startSync(): Promise<void> {
    setSyncing(true)
    setSyncLines([])

    const cleanup = window.api.sync.onProgress((progress) => {
      setSyncLines((prev) => [...prev, progress])
      if (progress.status === 'done' || progress.status === 'error') {
        setSyncing(false)
        cleanup()
      }
    })

    try {
      await window.api.sync.start()
    } catch (err) {
      setSyncLines([{ status: 'error', message: (err as Error).message }])
      setSyncing(false)
      cleanup()
    }
  }

  const lastLine = syncLines[syncLines.length - 1]

  return (
    <PageShell title="Settings">
      <div className={styles.sections}>

        <DriveField
          title="Media Drive"
          description="The volume label of your main SSD. Set this label on your drive once and the app will find it on any computer."
          initialLabel={libraryLabel ?? ''}
          onSave={saveLibraryLabel}
          onDetect={(label) => window.api.library.findDrive(label)}
        />

        <DriveField
          title="Backup Drive"
          description="The volume label of your backup HDD. Set this label on the HDD once and the app will find it when plugged in."
          initialLabel={backupLabelInit}
          onSave={(label) => window.api.sync.setBackupLabel(label)}
          onDetect={(label) => window.api.sync.findDrive(label)}
        />

        {/* Sync */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Sync to Backup</h2>
          <p className={styles.sectionDesc}>
            Mirrors your media drive to the backup HDD. New and changed files are copied.
            Files you have deleted from the main drive are also removed from the backup.
            Both drives must be plugged in.
          </p>
          {libraryPath && (
            <p className={styles.statusOk}>Main drive: {libraryPath}</p>
          )}
          {!libraryPath && libraryLabel && (
            <p className={styles.statusError}>Main drive "{libraryLabel}" not detected — plug it in first.</p>
          )}
          <button
            className={styles.syncBtn}
            onClick={startSync}
            disabled={syncing || !backupLabelInit.trim()}
          >
            {syncing ? 'Syncing...' : 'Start Sync'}
          </button>
          {!backupLabelInit.trim() && (
            <p className={styles.statusError}>Configure a backup drive label above first.</p>
          )}
          {syncLines.length > 0 && (
            <div className={styles.log} ref={logRef}>
              {syncLines.map((line, i) => (
                <div
                  key={i}
                  className={
                    line.status === 'error' ? styles.logError :
                    line.status === 'done'  ? styles.logDone  :
                    styles.logLine
                  }
                >
                  {line.message}
                </div>
              ))}
            </div>
          )}
          {lastLine?.status === 'done' && (
            <div className={styles.summary}>
              <span>{lastLine.filescopied ?? 0} copied</span>
              <span>{lastLine.filesskipped ?? 0} skipped</span>
              <span>{lastLine.filesdeleted ?? 0} deleted</span>
            </div>
          )}
        </section>

      </div>
    </PageShell>
  )
}
