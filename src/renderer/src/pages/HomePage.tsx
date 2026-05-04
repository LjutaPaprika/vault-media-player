import { useState } from 'react'
import PageShell from '../components/PageShell'
import IdleGame from '../components/IdleGame'
import styles from './HomePage.module.css'

export default function HomePage(): JSX.Element {
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<string | null>(null)

  async function handleScan(): Promise<void> {
    setScanning(true)
    setScanResult(null)
    try {
      const result = await window.api.library.scan()
      setScanResult(result.count === 0 ? 'Scan complete — no changes detected.' : `Scan complete — ${result.count} new or updated item${result.count === 1 ? '' : 's'} indexed.`)
    } catch (e) {
      setScanResult('Scan failed. Check your library root path in settings.')
    } finally {
      setScanning(false)
    }
  }

  async function handleForceScan(): Promise<void> {
    setScanning(true)
    setScanResult(null)
    try {
      const result = await window.api.library.forceScan()
      setScanResult(`Full rescan complete — ${result.count} items indexed.`)
    } catch (e) {
      setScanResult('Scan failed. Check your library root path in settings.')
    } finally {
      setScanning(false)
    }
  }

  return (
    <PageShell title="Home">
      <div className={styles.welcome}>
        <div className={styles.hero}>
          <h2 className={styles.heroTitle}>Your Personal Vault</h2>
          <p className={styles.heroSub}>
            All your media and games in one place. Use the sidebar to browse your library.
          </p>
          <div className={styles.actions}>
            <button className={styles.primaryBtn} onClick={handleScan} disabled={scanning}
              title="Fast — only re-indexes files that are new or have changed">
              {scanning ? 'Scanning...' : 'Scan Library'}
            </button>
            <button className={styles.secondaryBtn} onClick={handleForceScan} disabled={scanning}
              title="Rebuilds the full index from scratch — use if items are missing or metadata looks wrong">
              Force Rescan
            </button>
          </div>
          {scanResult && <p className={styles.scanResult}>{scanResult}</p>}
        </div>
        <IdleGame />
        <div className={styles.tips}>
          <h3 className={styles.tipsTitle}>Getting Started</h3>
          <ul className={styles.tipsList}>
            <li>Place your media in the correct folders on your drive (<code>media/movies</code>, <code>games/roms/n64</code>, etc.)</li>
            <li><strong>Scan Library</strong> is fast and incremental — it only processes files that are new or have changed since the last scan. Use it whenever you add new content.</li>
            <li><strong>Force Rescan</strong> rebuilds the entire index from scratch. Only needed if items are missing or metadata looks wrong.</li>
            <li>Use a controller or keyboard to navigate — arrow keys move between items, Enter selects</li>
            <li>Add <code>movie.json</code> / <code>game.json</code> sidecar files for richer metadata</li>
          </ul>
        </div>
      </div>
    </PageShell>
  )
}
