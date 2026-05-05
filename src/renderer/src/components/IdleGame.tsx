import { useEffect, useRef } from 'react'
import { useIdleGameStore, showCost, prestigeMultiplier, baseClickPower } from '../store/idleGameStore'
import styles from './IdleGame.module.css'

interface VizParticle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  label: string
}

const FILE_PATHS = [
  'index.json', 'meta.db', 'scan.log', 'cache.idx', 'thumb.bin',
  'info.txt', 'hash.map', 'tags.json', 'data.bin', 'state.db'
]

function fmt(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(2) + 'T'
  if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  return Math.floor(n).toString()
}

function fmtRate(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K'
  if (n >= 100) return Math.floor(n).toString()
  if (n >= 1) return n.toFixed(1)
  if (n > 0) return n.toFixed(2)
  return '0'
}

export default function IdleGame(): JSX.Element {
  const { files, lifetimeFiles, prestigeCount, shows, clickUpgrades,
          click, buyShow, buyUpgrade, prestige } = useIdleGameStore()

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<VizParticle[]>([])
  const rafRef = useRef<number | null>(null)
  const spawnAccumRef = useRef(0)

  const mult = prestigeMultiplier(prestigeCount)
  const passiveRate = shows.reduce((sum, sh) => sum + sh.count * sh.baseRate, 0) * mult
  const clickPower = baseClickPower(clickUpgrades) * mult
  const canPrestige = lifetimeFiles >= 1_000_000_000
  const visibleShows = shows.filter((sh) => sh.unlockAt === 0 || lifetimeFiles >= sh.unlockAt * 0.9)
  const purchasedUpgradeCount = clickUpgrades.filter((u) => u.purchased).length

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const draw = (): void => {
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Clear
      ctx.fillStyle = 'rgba(0,0,0,0.1)'
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Spawn new particles
      spawnAccumRef.current += passiveRate / 60
      while (spawnAccumRef.current >= 1 && passiveRate > 0) {
        spawnAccumRef.current -= 1
        const label = FILE_PATHS[Math.floor(Math.random() * FILE_PATHS.length)]
        particlesRef.current.push({
          x: Math.random() * canvas.width,
          y: canvas.height,
          vx: (Math.random() - 0.5) * 20,
          vy: -20 - Math.random() * 40,
          life: 1,
          label
        })
      }

      // Update and draw particles
      particlesRef.current = particlesRef.current.filter(p => {
        p.x += p.vx / 60
        p.y += p.vy / 60
        p.life -= 1 / 120
        return p.life > 0
      })

      for (const p of particlesRef.current) {
        const alpha = Math.min(1, p.life * 2) * (1 - p.life) * 0.6
        ctx.fillStyle = `rgba(74,222,128,${alpha})`
        ctx.font = '10px monospace'
        ctx.textAlign = 'center'
        ctx.fillText(p.label, p.x, p.y)
      }

      rafRef.current = requestAnimationFrame(draw)
    }

    rafRef.current = requestAnimationFrame(draw)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [passiveRate])

  return (
    <div className={styles.body}>
      {/* ── Resource counter ── */}
      <div className={styles.counter}>
        <canvas ref={canvasRef} width={1000} height={60} className={styles.vizCanvas} />
        <div className={styles.counterMain}>
          <span className={styles.counterFiles}>{fmt(files)}</span>
          <span className={styles.counterLabel}>files indexed</span>
        </div>
        <div className={styles.counterStats}>
          {passiveRate > 0 && (
            <span className={styles.statPill}>
              <span className={styles.statPillDot} />
              {fmtRate(passiveRate)}/s passive
            </span>
          )}
          <span className={styles.statPill}>
            +{fmt(clickPower)} / click
            {purchasedUpgradeCount > 0 && <span className={styles.statPillUpgrade}> ×{Math.pow(2, purchasedUpgradeCount)}</span>}
          </span>
          {prestigeCount > 0 && (
            <span className={styles.statPillPrestige}>×{mult} prestige boost</span>
          )}
        </div>
      </div>

      {/* ── Click button ── */}
      <div className={styles.clickArea}>
        <button className={styles.clickBtn} onClick={click}>
          <span className={styles.clickIcon}>📁</span>
          <span className={styles.clickLabel}>Index File</span>
          <span className={styles.clickGain}>+{fmt(clickPower)}</span>
        </button>
        {canPrestige && (
          <button className={styles.prestigeBtn} onClick={prestige}>
            <span className={styles.prestigeIcon}>🌟</span>
            <span className={styles.prestigeLabel}>Prestige!</span>
            <span className={styles.prestigeGain}>reset → ×{mult * 2} boost</span>
          </button>
        )}
      </div>

      {!canPrestige && lifetimeFiles > 10_000_000 && (
        <div className={styles.prestigeBar}>
          <div className={styles.prestigeBarLabel}>
            Prestige at 1B — {fmt(lifetimeFiles)} lifetime / 1B
          </div>
          <div className={styles.prestigeBarTrack}>
            <div
              className={styles.prestigeBarFill}
              style={{ width: `${Math.min(100, (lifetimeFiles / 1e9) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Shop ── */}
      <div className={styles.shop}>
        <div className={styles.shopSection}>
          <div className={styles.shopHeader}>
            <span>📺 Content Shop</span>
            <span className={styles.shopCount}>{visibleShows.length} unlocked</span>
          </div>
          {visibleShows.map((sh) => {
            const cost = showCost(sh)
            const canAfford = files >= cost
            const rate = (sh.baseRate * sh.count * mult)
            return (
              <div key={sh.id} className={`${styles.shopRow} ${!canAfford ? styles.shopRowDim : ''}`}>
                <span className={styles.shopEmoji}>{sh.emoji}</span>
                <div className={styles.shopInfo}>
                  <span className={styles.shopName}>{sh.name}</span>
                  <span className={styles.shopRate}>
                    {sh.count > 0 ? `${fmtRate(rate)}/s total` : `${fmtRate(sh.baseRate * mult)}/s each`}
                  </span>
                </div>
                {sh.count > 0 && (
                  <span className={styles.shopBadge}>×{sh.count}</span>
                )}
                <button
                  className={canAfford ? styles.shopBuyBtn : styles.shopBuyBtnDisabled}
                  onClick={() => buyShow(sh.id)}
                  disabled={!canAfford}
                  title={canAfford ? undefined : `Need ${fmt(cost - Math.floor(files))} more files`}
                >
                  <span className={styles.shopBuyIcon}>📁</span>
                  {fmt(cost)}
                </button>
              </div>
            )
          })}
        </div>

        <div className={styles.shopSection}>
          <div className={styles.shopHeader}>
            <span>⚡ Click Upgrades</span>
            <span className={styles.shopCount}>{purchasedUpgradeCount}/{clickUpgrades.length}</span>
          </div>
          {clickUpgrades.map((u) => {
            const canAfford = !u.purchased && files >= u.cost
            return (
              <div key={u.id} className={u.purchased ? styles.shopRowOwned : `${styles.shopRow} ${!canAfford ? styles.shopRowDim : ''}`}>
                <span className={styles.shopEmoji}>{u.purchased ? '✓' : '🖱️'}</span>
                <div className={styles.shopInfo}>
                  <span className={styles.shopName}>{u.name}</span>
                  <span className={styles.shopRate}>doubles click power</span>
                </div>
                {u.purchased ? (
                  <span className={styles.ownedBadge}>OWNED</span>
                ) : (
                  <button
                    className={canAfford ? styles.shopBuyBtn : styles.shopBuyBtnDisabled}
                    onClick={() => buyUpgrade(u.id)}
                    disabled={!canAfford}
                    title={canAfford ? undefined : `Need ${fmt(u.cost - Math.floor(files))} more files`}
                  >
                    <span className={styles.shopBuyIcon}>📁</span>
                    {fmt(u.cost)}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
