import { useState } from 'react'
import PageShell from '../components/PageShell'
import styles from './HomePage.module.css'

export default function HomePage(): JSX.Element {
  const [scanning, setScanning] = useState(false)
  const [scanResult, setScanResult] = useState<string | null>(null)

  async function handleScan(): Promise<void> {
    setScanning(true)
    setScanResult(null)
    try {
      const result = await window.api.library.scan()
      setScanResult(`Scan complete — ${result.count} items indexed.`)
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
            <button className={styles.primaryBtn} onClick={handleScan} disabled={scanning}>
              {scanning ? 'Scanning...' : 'Scan Library'}
            </button>
            <button className={styles.secondaryBtn} onClick={handleForceScan} disabled={scanning}>
              Force Rescan
            </button>
          </div>
          {scanResult && <p className={styles.scanResult}>{scanResult}</p>}
        </div>
        <div className={styles.tips}>
          <h3 className={styles.tipsTitle}>Getting Started</h3>
          <ul className={styles.tipsList}>
            <li>Place your media in the correct folders on your drive (<code>media/movies</code>, <code>games/roms/n64</code>, etc.)</li>
            <li>Click <strong>Scan Library</strong> to index everything</li>
            <li>Use a controller or keyboard to navigate — arrow keys move between items, Enter selects</li>
            <li>Add <code>movie.json</code> / <code>game.json</code> sidecar files for richer metadata</li>
          </ul>
        </div>
      </div>
    </PageShell>
  )
}
