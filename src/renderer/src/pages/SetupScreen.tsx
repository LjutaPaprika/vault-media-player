import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import styles from './SetupScreen.module.css'

export default function SetupScreen(): JSX.Element {
  const { setLibrary } = useAppStore()
  const [label, setLabel] = useState('')
  const [detected, setDetected] = useState<string | null | undefined>(undefined)
  const [error, setError] = useState('')

  async function handleDetect(): Promise<void> {
    const trimmed = label.trim()
    if (!trimmed) { setError('Enter a label first.'); return }
    setError('')
    const path = await window.api.library.findDrive(trimmed)
    setDetected(path)
  }

  async function handleConfirm(): Promise<void> {
    const trimmed = label.trim()
    if (!trimmed) { setError('Please enter a volume label.'); return }
    await window.api.library.setLabel(trimmed)
    const path = await window.api.library.findDrive(trimmed)
    setLibrary(trimmed, path)
  }

  return (
    <div className={styles.screen}>
      <div className={styles.card}>
        <h1 className={styles.title}>Welcome to Vault</h1>
        <p className={styles.subtitle}>
          Give your media drive a volume label, then enter it here. The app uses the label
          to find your drive on any computer — no matter what letter it's assigned.
        </p>

        <div className={styles.howTo}>
          <p className={styles.howToTitle}>How to label your drive</p>
          <ul className={styles.howToList}>
            <li><strong>Windows:</strong> Open File Explorer → right-click the drive → Properties → rename at the top</li>
            <li><strong>Mac:</strong> Open Disk Utility → select the drive → click the name to rename it</li>
            <li><strong>Linux:</strong> <code>sudo e2label /dev/sdX VAULT</code></li>
          </ul>
          <p className={styles.suggestion}>Suggested label: <code>VAULT</code></p>
        </div>

        <div className={styles.field}>
          <label className={styles.label} htmlFor="drive-label">Drive Volume Label</label>
          <div className={styles.inputRow}>
            <input
              id="drive-label"
              className={styles.input}
              type="text"
              value={label}
              onChange={(e) => { setLabel(e.target.value); setDetected(undefined); setError('') }}
              placeholder="e.g. VAULT"
              spellCheck={false}
            />
            <button className={styles.detectBtn} onClick={handleDetect}>Detect</button>
          </div>
          {error && <span className={styles.error}>{error}</span>}
          {detected !== undefined && (
            <span className={detected ? styles.found : styles.notFound}>
              {detected ? `Found at ${detected}` : 'Drive not found — is it plugged in?'}
            </span>
          )}
        </div>

        <button className={styles.btn} onClick={handleConfirm}>
          Open Library
        </button>
        <p className={styles.hint}>
          If the drive isn't connected right now, you can still save the label and it will
          be found automatically next time you plug it in.
        </p>
      </div>
    </div>
  )
}
