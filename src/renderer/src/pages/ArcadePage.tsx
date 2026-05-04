import { useState, useEffect } from 'react'
import { useIdleGameStore, prestigeMultiplier } from '../store/idleGameStore'
import PageShell from '../components/PageShell'
import IdleGame from '../components/IdleGame'
import Snake from '../components/Snake'
import styles from './ArcadePage.module.css'

function fmt(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T'
  if (n >= 1e9)  return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6)  return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3)  return (n / 1e3).toFixed(1) + 'K'
  return Math.floor(n).toString()
}

function fmtRate(n: number): string {
  if (n >= 1e6)  return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3)  return (n / 1e3).toFixed(1) + 'K'
  if (n >= 100)  return Math.floor(n).toString()
  if (n >= 1)    return n.toFixed(1)
  if (n > 0)     return n.toFixed(2)
  return '0'
}

export default function ArcadePage(): JSX.Element {
  const [openCard, setOpenCard] = useState<string | null>(null)
  const [snakeBest, setSnakeBest] = useState(0)

  const { files, prestigeCount, shows, paused, togglePause } = useIdleGameStore()
  const mult = prestigeMultiplier(prestigeCount)
  const passiveRate = shows.reduce((sum, sh) => sum + sh.count * sh.baseRate, 0) * mult

  useEffect(() => {
    window.api.settings.get('snakeHighScore', '0').then(v => {
      setSnakeBest(parseInt(v, 10) || 0)
    })
  }, [])

  function toggleCard(id: string): void {
    setOpenCard(prev => prev === id ? null : id)
  }

  return (
    <PageShell title="Arcade">
      <div className={styles.gameList}>

        {/* ── Vault Clicker ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardGold}`} onClick={() => toggleCard('idle')}>
            <span className={`${styles.cardTitle} ${styles.titleGold}`}>🎮 Vault Clicker</span>
            <span className={styles.cardMeta}>
              {fmt(files)} files
              {paused
                ? <span className={styles.metaPaused}> · paused</span>
                : passiveRate > 0 && <span className={styles.metaRateGold}> · +{fmtRate(passiveRate)}/s</span>
              }
              {prestigeCount > 0 && <span className={styles.metaPrestige}> · ×{mult}</span>}
            </span>
            <button
              className={`${styles.pauseBtn} ${styles.pauseBtnGold}`}
              onClick={e => { e.stopPropagation(); togglePause() }}
              title={paused ? 'Resume' : 'Pause'}
            >
              {paused ? '▶' : '⏸'}
            </button>
            <span className={styles.cardChevron}>{openCard === 'idle' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'idle' && <IdleGame />}
        </div>

        {/* ── Snake ── */}
        <div className={styles.card}>
          <button className={`${styles.cardHeader} ${styles.cardGreen}`} onClick={() => toggleCard('snake')}>
            <span className={`${styles.cardTitle} ${styles.titleGreen}`}>🐍 Snake</span>
            <span className={styles.cardMeta}>
              {snakeBest > 0
                ? <span className={styles.metaRateGreen}>best {snakeBest}</span>
                : 'Arrow keys · WASD'
              }
            </span>
            <span className={styles.cardChevron}>{openCard === 'snake' ? '▲' : '▼'}</span>
          </button>
          {openCard === 'snake' && <Snake onNewBest={n => setSnakeBest(n)} />}
        </div>

        {/* ── Vault Delver (placeholder) ── */}
        <div className={styles.card}>
          <div className={`${styles.cardHeader} ${styles.cardBlue} ${styles.cardHeaderStatic}`}>
            <span className={`${styles.cardTitle} ${styles.titleBlue}`}>⛏️ Vault Delver</span>
            <span className={styles.cardMeta}>Roguelike mining game</span>
            <span className={styles.comingSoon}>Coming Soon</span>
          </div>
        </div>

      </div>
    </PageShell>
  )
}
