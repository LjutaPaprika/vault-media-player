import { useEffect, useRef, useState } from 'react'
import styles from './Snake.module.css'

const COLS = 28
const ROWS = 20
const CELL = 20
const W = COLS * CELL   // 560
const H = ROWS * CELL   // 400
const SAVE_KEY = 'snakeHighScore'

const BONUS_POINTS       = 5
const BONUS_LIFETIME_MS  = 10_000
const BONUS_FLASH_MS     = 3_000
const BONUS_FIRST_MS     = 15_000
const BONUS_RESPAWN_MS   = 20_000
const MAX_ROCKS          = 8
const ROCK_EVERY         = 4   // spawn a rock every N points

type Dir   = 'U' | 'D' | 'L' | 'R'
type Pt    = { x: number; y: number }
type Phase = 'idle' | 'playing' | 'dead'
type Bonus = { x: number; y: number; expiresAt: number }

const OPPOSITE: Record<Dir, Dir> = { U: 'D', D: 'U', L: 'R', R: 'L' }

function rand(n: number): number { return Math.floor(Math.random() * n) }

function tickMs(score: number): number { return Math.max(65, 150 - score * 3) }

function pickEmpty(occupied: Set<string>): Pt | null {
  let p: Pt, t = 0
  do { p = { x: rand(COLS), y: rand(ROWS) }; t++ } while (occupied.has(`${p.x},${p.y}`) && t < 300)
  return t < 300 ? p : null
}

export default function Snake(): JSX.Element {
  const [open, setOpen]           = useState(false)
  const [phase, setPhase]         = useState<Phase>('idle')
  const [score, setScore]         = useState(0)
  const [highScore, setHighScore] = useState(0)

  const canvasRef      = useRef<HTMLCanvasElement>(null)
  const snakeRef       = useRef<Pt[]>([])
  const dirRef         = useRef<Dir>('R')
  const nextDir        = useRef<Dir>('R')
  const foodRef        = useRef<Pt>({ x: 0, y: 0 })
  const bonusRef       = useRef<Bonus | null>(null)
  const rocksRef       = useRef<Pt[]>([])
  const scoreRef       = useRef(0)
  const hiRef          = useRef(0)
  const timerRef       = useRef<ReturnType<typeof setInterval> | null>(null)
  const bonusTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const rafRef         = useRef<number | null>(null)
  const phaseRef       = useRef<Phase>('idle')
  const openRef        = useRef(false)

  useEffect(() => {
    window.api.settings.get(SAVE_KEY, '0').then(v => {
      const n = parseInt(v, 10) || 0
      hiRef.current = n
      setHighScore(n)
    })
    return () => { stopTimer(); stopRaf(); clearBonusTimer() }
  }, [])

  useEffect(() => {
    openRef.current = open
    if (open) {
      if (phaseRef.current === 'playing') startRaf()
      else requestAnimationFrame(draw)
    } else {
      stopRaf()
    }
  }, [open])

  // Capture phase — intercepts before app navigation handlers
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (!openRef.current) return
      if (phaseRef.current !== 'playing') {
        if (e.key === 'Enter' || e.key === ' ') startGame()
        return
      }
      const map: Record<string, Dir> = {
        ArrowUp: 'U', w: 'U', W: 'U',
        ArrowDown: 'D', s: 'D', S: 'D',
        ArrowLeft: 'L', a: 'L', A: 'L',
        ArrowRight: 'R', d: 'R', D: 'R',
      }
      const d = map[e.key]
      if (!d) return
      if (d !== OPPOSITE[dirRef.current]) nextDir.current = d
      if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [])

  // ── Helpers ───────────────────────────────────────────────────────────────

  function stopTimer(): void {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  function clearBonusTimer(): void {
    if (bonusTimerRef.current) { clearTimeout(bonusTimerRef.current); bonusTimerRef.current = null }
  }

  function stopRaf(): void {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }

  function startRaf(): void {
    stopRaf()
    const loop = (): void => { draw(); rafRef.current = requestAnimationFrame(loop) }
    rafRef.current = requestAnimationFrame(loop)
  }

  function occupied(): Set<string> {
    const s = new Set<string>()
    snakeRef.current.forEach(p => s.add(`${p.x},${p.y}`))
    s.add(`${foodRef.current.x},${foodRef.current.y}`)
    rocksRef.current.forEach(r => s.add(`${r.x},${r.y}`))
    if (bonusRef.current) s.add(`${bonusRef.current.x},${bonusRef.current.y}`)
    return s
  }

  function scheduleBonus(delayMs: number): void {
    clearBonusTimer()
    bonusTimerRef.current = setTimeout(() => {
      if (phaseRef.current !== 'playing' || bonusRef.current) return
      const pt = pickEmpty(occupied())
      if (pt) bonusRef.current = { ...pt, expiresAt: Date.now() + BONUS_LIFETIME_MS }
    }, delayMs)
  }

  function trySpawnRock(): void {
    if (rocksRef.current.length >= MAX_ROCKS) return
    const head = snakeRef.current[0]
    const occ  = occupied()
    let p: Pt, t = 0
    do {
      p = { x: rand(COLS), y: rand(ROWS) }
      t++
    } while (t < 300 && (occ.has(`${p.x},${p.y}`) || Math.abs(p.x - head.x) + Math.abs(p.y - head.y) < 5))
    if (t < 300) rocksRef.current = [...rocksRef.current, p]
  }

  // ── Drawing ───────────────────────────────────────────────────────────────

  function draw(): void {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const now = Date.now()

    ctx.fillStyle = '#08080f'
    ctx.fillRect(0, 0, W, H)

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.02)'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x*CELL,0); ctx.lineTo(x*CELL,H); ctx.stroke() }
    for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0,y*CELL); ctx.lineTo(W,y*CELL); ctx.stroke() }

    // Rocks
    rocksRef.current.forEach(r => {
      ctx.fillStyle = '#1e1e2e'
      ctx.fillRect(r.x*CELL+1, r.y*CELL+1, CELL-2, CELL-2)
      ctx.strokeStyle = 'rgba(255,255,255,0.1)'
      ctx.lineWidth = 1
      ctx.strokeRect(r.x*CELL+1.5, r.y*CELL+1.5, CELL-3, CELL-3)
      ctx.strokeStyle = 'rgba(255,255,255,0.06)'
      ctx.beginPath()
      ctx.moveTo(r.x*CELL+5, r.y*CELL+5); ctx.lineTo(r.x*CELL+CELL-5, r.y*CELL+CELL-5)
      ctx.moveTo(r.x*CELL+CELL-5, r.y*CELL+5); ctx.lineTo(r.x*CELL+5, r.y*CELL+CELL-5)
      ctx.stroke()
    })

    // Regular food
    const f = foodRef.current
    ctx.shadowColor = 'rgba(232,180,75,0.8)'
    ctx.shadowBlur = 12
    ctx.fillStyle = '#e8b44b'
    ctx.beginPath()
    ctx.arc(f.x*CELL + CELL/2, f.y*CELL + CELL/2, CELL/2 - 3, 0, Math.PI*2)
    ctx.fill()
    ctx.shadowBlur = 0

    // Bonus food
    const bonus = bonusRef.current
    if (bonus) {
      const remaining = bonus.expiresAt - now
      const flashing  = remaining < BONUS_FLASH_MS
      if (!flashing || Math.floor(now / 300) % 2 === 0) {
        ctx.globalAlpha = flashing ? 0.5 + 0.5 * Math.abs(Math.sin(now / 180)) : 1
        ctx.shadowColor  = 'rgba(251,146,60,0.9)'
        ctx.shadowBlur   = 18
        ctx.fillStyle    = '#fb923c'
        ctx.beginPath()
        ctx.arc(bonus.x*CELL + CELL/2, bonus.y*CELL + CELL/2, CELL/2 - 1, 0, Math.PI*2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.55)'
        ctx.beginPath()
        ctx.arc(bonus.x*CELL + CELL/2 - 3, bonus.y*CELL + CELL/2 - 3, 2.5, 0, Math.PI*2)
        ctx.fill()
        ctx.shadowBlur  = 0
        ctx.globalAlpha = 1
      }
    }

    // Snake body
    const len = snakeRef.current.length
    snakeRef.current.forEach((p, i) => {
      if (i === 0) return
      const alpha = 1 - (i / len) * 0.65
      ctx.fillStyle = `rgba(22,163,74,${alpha.toFixed(2)})`
      ctx.fillRect(p.x*CELL+1, p.y*CELL+1, CELL-2, CELL-2)
    })

    // Snake head
    if (len > 0) {
      const h = snakeRef.current[0]
      ctx.shadowColor = 'rgba(74,222,128,0.55)'
      ctx.shadowBlur  = 10
      ctx.fillStyle   = '#4ade80'
      ctx.fillRect(h.x*CELL+1, h.y*CELL+1, CELL-2, CELL-2)
      ctx.shadowBlur  = 0
    }
  }

  // ── Game logic ────────────────────────────────────────────────────────────

  function tick(): void {
    dirRef.current = nextDir.current
    const head = snakeRef.current[0]
    const next: Pt = {
      x: head.x + (dirRef.current === 'R' ? 1 : dirRef.current === 'L' ? -1 : 0),
      y: head.y + (dirRef.current === 'D' ? 1 : dirRef.current === 'U' ? -1 : 0),
    }

    if (
      next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS ||
      snakeRef.current.some(p => p.x === next.x && p.y === next.y) ||
      rocksRef.current.some(r => r.x === next.x && r.y === next.y)
    ) {
      stopTimer(); stopRaf(); clearBonusTimer()
      phaseRef.current = 'dead'
      setPhase('dead')
      const s = scoreRef.current
      if (s > hiRef.current) {
        hiRef.current = s
        setHighScore(s)
        window.api.settings.set(SAVE_KEY, String(s)).catch(() => {})
      }
      requestAnimationFrame(draw)
      return
    }

    // Expire bonus
    if (bonusRef.current && Date.now() >= bonusRef.current.expiresAt) {
      bonusRef.current = null
      scheduleBonus(BONUS_RESPAWN_MS)
    }

    const ateFood  = next.x === foodRef.current.x  && next.y === foodRef.current.y
    const ateBonus = !!bonusRef.current && next.x === bonusRef.current.x && next.y === bonusRef.current.y

    if (ateFood || ateBonus) {
      snakeRef.current = [next, ...snakeRef.current]

      if (ateFood) {
        const pt = pickEmpty(occupied())
        if (pt) foodRef.current = pt
      }
      if (ateBonus) {
        bonusRef.current = null
        scheduleBonus(BONUS_RESPAWN_MS)
      }

      scoreRef.current += ateBonus ? BONUS_POINTS : 1
      setScore(scoreRef.current)

      if (scoreRef.current % ROCK_EVERY === 0) trySpawnRock()

      stopTimer()
      timerRef.current = setInterval(tick, tickMs(scoreRef.current))
    } else {
      snakeRef.current = [next, ...snakeRef.current.slice(0, -1)]
    }
  }

  function startGame(): void {
    const s: Pt[] = [{ x: 13, y: 10 }, { x: 12, y: 10 }, { x: 11, y: 10 }]
    snakeRef.current  = s
    dirRef.current    = 'R'
    nextDir.current   = 'R'
    rocksRef.current  = []
    bonusRef.current  = null
    scoreRef.current  = 0
    const occ = new Set(s.map(p => `${p.x},${p.y}`))
    foodRef.current   = pickEmpty(occ) ?? { x: 20, y: 10 }
    setScore(0)
    phaseRef.current  = 'playing'
    setPhase('playing')
    stopTimer()
    clearBonusTimer()
    timerRef.current  = setInterval(tick, tickMs(0))
    scheduleBonus(BONUS_FIRST_MS)
    startRaf()
  }

  const isNewBest = phase === 'dead' && score > 0 && score >= hiRef.current

  return (
    <div className={styles.panel}>
      <button className={styles.toggleBar} onClick={() => setOpen(o => !o)}>
        <span className={styles.toggleTitle}>🐍 Snake</span>
        <span className={styles.toggleMeta}>
          {score > 0 && <span>{score} pts</span>}
          {highScore > 0 && <span className={styles.metaHi}> · best {highScore}</span>}
        </span>
        <span className={styles.toggleChevron}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className={styles.body}>
          <div className={styles.gameWrap}>
            <canvas ref={canvasRef} width={W} height={H} className={styles.canvas} />
            {phase !== 'playing' && (
              <div className={styles.overlay}>
                {phase === 'dead' ? (
                  <>
                    <span className={styles.overlayTitle}>Game Over</span>
                    <span className={styles.overlayScore}>{score} pts</span>
                    {isNewBest && <span className={styles.overlayNew}>✨ New Best!</span>}
                  </>
                ) : (
                  <>
                    <span className={styles.overlayTitle}>🐍 Snake</span>
                    <div className={styles.legend}>
                      <span className={styles.legendItem}><span className={styles.dotGold} /> food · 1 pt</span>
                      <span className={styles.legendItem}><span className={styles.dotOrange} /> bonus · {BONUS_POINTS} pts</span>
                      <span className={styles.legendItem}><span className={styles.dotRock} /> rocks · avoid</span>
                    </div>
                  </>
                )}
                <button className={styles.startBtn} onClick={startGame}>
                  {phase === 'dead' ? 'Play Again' : 'Start'}
                </button>
                <span className={styles.overlayHint}>Arrow keys · WASD</span>
              </div>
            )}
          </div>
          {phase === 'playing' && (
            <div className={styles.hud}>
              <span>Score: <strong>{score}</strong></span>
              {highScore > 0 && <span className={styles.hudBest}>Best: {highScore}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
