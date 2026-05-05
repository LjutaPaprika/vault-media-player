import { useEffect, useRef, useState } from 'react'
import styles from './Snake.module.css'

const COLS = 56
const ROWS = 30
const CELL = 20
const W    = COLS * CELL   // 1120
const H    = ROWS * CELL   // 600
const SAVE_KEY = 'snakeHighScore'

const DEFAULT_SETTINGS = {
  bonusPoints: 5,
  bonusGrows: 2,
  maxRocks: 10,
  maxEnemies: 3,
  enemyLength: 5,
  playerSpeedMultiplier: 1,
  enemySpeedMultiplier: 1,
}

const BONUS_POINTS      = 5
const BONUS_LIFETIME_MS = 10_000
const BONUS_FLASH_MS    = 3_000
const BONUS_FIRST_MS    = 15_000
const BONUS_RESPAWN_MS  = 20_000
const MAX_ROCKS         = 10
const ROCK_EVERY        = 4
const BOMB_FIRST_MS     = 35_000
const BOMB_RESPAWN_MS   = 50_000
const BOMB_WARNING_MS   = 3_500
const BOMB_ACTIVE_MS    = 5_000
const ENEMY_TICK_EVERY  = 2       // move enemies every N player ticks
const ENEMY_TURN_CHANCE = 0.07
const ENEMY_SCORES      = [8, 20, 40]  // score thresholds to spawn each enemy
const ENEMY_LENGTH      = 5

type Dir   = 'U' | 'D' | 'L' | 'R'
type Pt    = { x: number; y: number }
type Phase = 'idle' | 'playing' | 'dead'
type Bonus = { x: number; y: number; expiresAt: number }
type Enemy = { body: Pt[]; dir: Dir }
type Bomb  = { cells: Pt[]; lookup: Set<string>; phase: 'warning' | 'active'; phaseEnd: number }
type SnakeSettings = {
  bonusPoints: number
  bonusGrows: number
  maxRocks: number
  maxEnemies: number
  enemyLength: number
  playerSpeedMultiplier: number
  enemySpeedMultiplier: number
}

const OPPOSITE: Record<Dir, Dir> = { U: 'D', D: 'U', L: 'R', R: 'L' }
const DX: Record<Dir, number>    = { R: 1, L: -1, U: 0,  D: 0  }
const DY: Record<Dir, number>    = { R: 0, L:  0, U: -1, D: 1  }
const ALL_DIRS: Dir[]            = ['U', 'D', 'L', 'R']

function rand(n: number): number { return Math.floor(Math.random() * n) }
function shuffle<T>(a: T[]): T[] { return [...a].sort(() => Math.random() - 0.5) }
function tickMs(score: number): number { return Math.max(80, 150 - score * 1.5) }
function perps(dir: Dir): Dir[] { return (dir === 'U' || dir === 'D') ? ['L', 'R'] : ['U', 'D'] }

function pickEmpty(occupied: Set<string>): Pt | null {
  let p: Pt, t = 0
  do { p = { x: rand(COLS), y: rand(ROWS) }; t++ } while (occupied.has(`${p.x},${p.y}`) && t < 400)
  return t < 400 ? p : null
}

interface SnakeProps {
  onNewBest?: (score: number) => void
}

export default function Snake({ onNewBest }: SnakeProps): JSX.Element {
  const [phase, setPhase]         = useState<Phase>('idle')
  const [score, setScore]         = useState(0)
  const [highScore, setHighScore] = useState(0)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings]   = useState<SnakeSettings>(DEFAULT_SETTINGS)

  const canvasRef        = useRef<HTMLCanvasElement>(null)
  const snakeRef         = useRef<Pt[]>([])
  const dirRef           = useRef<Dir>('R')
  const inputQueue       = useRef<Dir[]>([])
  const foodRef          = useRef<Pt>({ x: 0, y: 0 })
  const bonusRef         = useRef<Bonus | null>(null)
  const rocksRef         = useRef<Pt[]>([])
  const enemiesRef       = useRef<Enemy[]>([])
  const bombRef          = useRef<Bomb | null>(null)
  const scoreRef         = useRef(0)
  const hiRef            = useRef(0)
  const tickCountRef     = useRef(0)
  const enemySpawnedRef  = useRef(0)
  const timerRef         = useRef<ReturnType<typeof setInterval> | null>(null)
  const bonusTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null)
  const bombTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastBombCenter   = useRef<Pt | null>(null)
  const rafRef           = useRef<number | null>(null)
  const phaseRef         = useRef<Phase>('idle')
  const settingsRef      = useRef<SnakeSettings>(DEFAULT_SETTINGS)

  useEffect(() => {
    Promise.all([
      window.api.settings.get(SAVE_KEY, '0'),
      window.api.settings.get('snakeSettings', '{}')
    ]).then(([scoreStr, settingsStr]) => {
      const n = parseInt(scoreStr, 10) || 0
      hiRef.current = n
      setHighScore(n)
      try {
        const loaded = JSON.parse(settingsStr) as Partial<SnakeSettings>
        const merged = { ...DEFAULT_SETTINGS, ...loaded }
        settingsRef.current = merged
        setSettings(merged)
      } catch { /* use defaults */ }
    })
    requestAnimationFrame(draw)
    return () => stopAll()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
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
      const q = inputQueue.current
      const last = q.length > 0 ? q[q.length - 1] : dirRef.current
      if (d !== OPPOSITE[last] && d !== last && q.length < 3) q.push(d)
      if (e.key.startsWith('Arrow')) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [])

  // ── Timer / loop helpers ──────────────────────────────────────────────────

  function stopAll(): void {
    stopTimer(); stopRaf()
    if (bonusTimerRef.current) { clearTimeout(bonusTimerRef.current); bonusTimerRef.current = null }
    if (bombTimerRef.current)  { clearTimeout(bombTimerRef.current);  bombTimerRef.current = null  }
  }

  function stopTimer(): void {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  function stopRaf(): void {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null }
  }

  function startRaf(): void {
    stopRaf()
    const loop = (): void => { draw(); rafRef.current = requestAnimationFrame(loop) }
    rafRef.current = requestAnimationFrame(loop)
  }

  // ── Occupied cell set ────────────────────────────────────────────────────

  function occupied(): Set<string> {
    const s = new Set<string>()
    snakeRef.current.forEach(p => s.add(`${p.x},${p.y}`))
    s.add(`${foodRef.current.x},${foodRef.current.y}`)
    rocksRef.current.forEach(r => s.add(`${r.x},${r.y}`))
    if (bonusRef.current) s.add(`${bonusRef.current.x},${bonusRef.current.y}`)
    enemiesRef.current.forEach(e => e.body.forEach(p => s.add(`${p.x},${p.y}`)))
    return s
  }

  // ── Bonus food ────────────────────────────────────────────────────────────

  function scheduleBonus(delayMs: number): void {
    if (bonusTimerRef.current) clearTimeout(bonusTimerRef.current)
    bonusTimerRef.current = setTimeout(() => {
      if (phaseRef.current !== 'playing' || bonusRef.current) return
      const pt = pickEmpty(occupied())
      if (pt) bonusRef.current = { ...pt, expiresAt: Date.now() + BONUS_LIFETIME_MS }
    }, delayMs)
  }

  // ── Rocks ─────────────────────────────────────────────────────────────────

  function trySpawnRock(): void {
    if (rocksRef.current.length >= settingsRef.current.maxRocks) return
    const head = snakeRef.current[0]
    const occ  = occupied()
    let p: Pt, t = 0
    do {
      p = { x: rand(COLS), y: rand(ROWS) }; t++
    } while (t < 300 && (occ.has(`${p.x},${p.y}`) || Math.abs(p.x - head.x) + Math.abs(p.y - head.y) < 5))
    if (t < 300) rocksRef.current = [...rocksRef.current, p]
  }

  // ── Enemies ───────────────────────────────────────────────────────────────

  function spawnEnemy(): void {
    const head = snakeRef.current[0]
    const occ  = occupied()
    let pos: Pt | null = null
    for (let t = 0; t < 400; t++) {
      const p = { x: rand(COLS), y: rand(ROWS) }
      if (!occ.has(`${p.x},${p.y}`) && Math.abs(p.x - head.x) + Math.abs(p.y - head.y) > 12) {
        pos = p; break
      }
    }
    if (!pos) return
    const dir = ALL_DIRS[rand(4)]
    const body: Pt[] = [pos]
    for (let i = 1; i < settingsRef.current.enemyLength; i++) {
      const prev = body[i - 1]
      const nx = prev.x - DX[dir], ny = prev.y - DY[dir]
      if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) break
      body.push({ x: nx, y: ny })
    }
    enemiesRef.current = [...enemiesRef.current, { body, dir }]
  }

  function checkEnemySpawns(): void {
    while (
      enemySpawnedRef.current < ENEMY_SCORES.length &&
      scoreRef.current >= ENEMY_SCORES[enemySpawnedRef.current]
    ) {
      spawnEnemy()
      enemySpawnedRef.current++
    }
  }

  function isEnemyBlocked(x: number, y: number): boolean {
    if (x < 0 || x >= COLS || y < 0 || y >= ROWS) return true
    if (rocksRef.current.some(r => r.x === x && r.y === y)) return true
    if (bombRef.current?.phase === 'active' && bombRef.current.lookup.has(`${x},${y}`)) return true
    return false
  }

  function tickEnemies(): void {
    enemiesRef.current = enemiesRef.current.map(enemy => {
      const head = enemy.body[0]
      let dir    = enemy.dir

      if (Math.random() < ENEMY_TURN_CHANCE) {
        const p = perps(dir); dir = p[rand(2)]
      }

      let nx = head.x + DX[dir], ny = head.y + DY[dir]

      if (isEnemyBlocked(nx, ny)) {
        let moved = false
        for (const d of shuffle([...perps(dir), OPPOSITE[dir]])) {
          const cx = head.x + DX[d], cy = head.y + DY[d]
          if (!isEnemyBlocked(cx, cy)) {
            dir = d; nx = cx; ny = cy; moved = true; break
          }
        }
        if (!moved) return enemy
      }

      return { body: [{ x: nx, y: ny }, ...enemy.body.slice(0, -1)], dir }
    })
  }

  // ── Bomb ──────────────────────────────────────────────────────────────────

  function scheduleBomb(delayMs: number): void {
    if (bombTimerRef.current) clearTimeout(bombTimerRef.current)
    bombTimerRef.current = setTimeout(triggerBomb, delayMs)
  }

  function triggerBomb(): void {
    if (phaseRef.current !== 'playing') return

    let bw = 0, bh = 0, bx = 0, by = 0
    for (let attempt = 0; attempt < 12; attempt++) {
      bw = 6 + rand(7)
      bh = 5 + rand(5)
      bx = 2 + rand(COLS - bw - 4)
      by = 2 + rand(ROWS - bh - 4)
      const cx = bx + bw / 2, cy = by + bh / 2
      const prev = lastBombCenter.current
      if (!prev || Math.abs(cx - prev.x) + Math.abs(cy - prev.y) > 14) break
    }
    lastBombCenter.current = { x: bx + bw / 2, y: by + bh / 2 }

    const ecx = bx + bw / 2, ecy = by + bh / 2
    const rx  = bw / 2,      ry  = bh / 2
    const cells: Pt[] = []
    const lookup = new Set<string>()
    for (let x = bx; x < bx + bw; x++) {
      for (let y = by; y < by + bh; y++) {
        const dx = (x + 0.5 - ecx) / rx
        const dy = (y + 0.5 - ecy) / ry
        if (dx*dx + dy*dy <= 1) { cells.push({ x, y }); lookup.add(`${x},${y}`) }
      }
    }
    bombRef.current = { cells, lookup, phase: 'warning', phaseEnd: Date.now() + BOMB_WARNING_MS }
    bombTimerRef.current = setTimeout(() => {
      if (!bombRef.current || phaseRef.current !== 'playing') return
      bombRef.current = { ...bombRef.current, phase: 'active', phaseEnd: Date.now() + BOMB_ACTIVE_MS }
      bombTimerRef.current = setTimeout(() => {
        bombRef.current = null
        if (phaseRef.current === 'playing') scheduleBomb(BOMB_RESPAWN_MS)
      }, BOMB_ACTIVE_MS)
    }, BOMB_WARNING_MS)
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
    ctx.strokeStyle = 'rgba(255,255,255,0.018)'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x*CELL,0); ctx.lineTo(x*CELL,H); ctx.stroke() }
    for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0,y*CELL); ctx.lineTo(W,y*CELL); ctx.stroke() }

    // Bomb zone
    const bomb = bombRef.current
    if (bomb) {
      if (bomb.phase === 'warning') {
        const pulse = 0.08 + 0.22 * Math.abs(Math.sin(now / 220))
        ctx.fillStyle = `rgba(234,179,8,${pulse})`
        bomb.cells.forEach(c => ctx.fillRect(c.x*CELL, c.y*CELL, CELL, CELL))
        const edgePulse = 0.25 + 0.55 * Math.abs(Math.sin(now / 220))
        ctx.strokeStyle = `rgba(234,179,8,${edgePulse})`
        ctx.lineWidth = 1
        bomb.cells.forEach(c => ctx.strokeRect(c.x*CELL+0.5, c.y*CELL+0.5, CELL-1, CELL-1))
        ctx.fillStyle = `rgba(234,179,8,${edgePulse})`
        ctx.font = `bold ${CELL - 6}px monospace`
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        bomb.cells.forEach(c => {
          ctx.fillText('!', c.x*CELL + CELL/2, c.y*CELL + CELL/2)
        })
      } else {
        ctx.fillStyle = '#1a0505'
        bomb.cells.forEach(c => ctx.fillRect(c.x*CELL, c.y*CELL, CELL, CELL))
        ctx.strokeStyle = 'rgba(185,28,28,0.55)'
        ctx.lineWidth = 1
        bomb.cells.forEach(c => {
          ctx.beginPath()
          ctx.moveTo(c.x*CELL+4, c.y*CELL+4); ctx.lineTo(c.x*CELL+CELL-4, c.y*CELL+CELL-4)
          ctx.moveTo(c.x*CELL+CELL-4, c.y*CELL+4); ctx.lineTo(c.x*CELL+4, c.y*CELL+CELL-4)
          ctx.stroke()
        })
      }
    }

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
    ctx.shadowColor = 'rgba(232,180,75,0.8)'; ctx.shadowBlur = 12
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
        ctx.shadowColor = 'rgba(251,146,60,0.9)'; ctx.shadowBlur = 18
        ctx.fillStyle = '#fb923c'
        ctx.beginPath()
        ctx.arc(bonus.x*CELL + CELL/2, bonus.y*CELL + CELL/2, CELL/2 - 1, 0, Math.PI*2)
        ctx.fill()
        ctx.fillStyle = 'rgba(255,255,255,0.55)'
        ctx.beginPath()
        ctx.arc(bonus.x*CELL + CELL/2 - 3, bonus.y*CELL + CELL/2 - 3, 2.5, 0, Math.PI*2)
        ctx.fill()
        ctx.shadowBlur = 0; ctx.globalAlpha = 1
      }
    }

    // Enemy snakes
    enemiesRef.current.forEach(enemy => {
      const elen = enemy.body.length
      enemy.body.forEach((p, i) => {
        if (i === 0) return
        const alpha = (1 - (i / elen) * 0.65).toFixed(2)
        ctx.fillStyle = `rgba(185,28,28,${alpha})`
        ctx.fillRect(p.x*CELL+1, p.y*CELL+1, CELL-2, CELL-2)
      })
      if (elen > 0) {
        const h = enemy.body[0]
        ctx.shadowColor = 'rgba(239,68,68,0.6)'; ctx.shadowBlur = 8
        ctx.fillStyle = '#ef4444'
        ctx.fillRect(h.x*CELL+1, h.y*CELL+1, CELL-2, CELL-2)
        ctx.shadowBlur = 0
      }
    })

    // Player snake body
    const len = snakeRef.current.length
    snakeRef.current.forEach((p, i) => {
      if (i === 0) return
      const alpha = (1 - (i / len) * 0.65).toFixed(2)
      ctx.fillStyle = `rgba(22,163,74,${alpha})`
      ctx.fillRect(p.x*CELL+1, p.y*CELL+1, CELL-2, CELL-2)
    })

    // Player head
    if (len > 0) {
      const h = snakeRef.current[0]
      ctx.shadowColor = 'rgba(74,222,128,0.55)'; ctx.shadowBlur = 10
      ctx.fillStyle = '#4ade80'
      ctx.fillRect(h.x*CELL+1, h.y*CELL+1, CELL-2, CELL-2)
      ctx.shadowBlur = 0
    }
  }

  // ── Game tick ─────────────────────────────────────────────────────────────

  function tick(): void {
    tickCountRef.current++
    if (tickCountRef.current % ENEMY_TICK_EVERY === 0) tickEnemies()

    if (inputQueue.current.length > 0) dirRef.current = inputQueue.current.shift()!
    const head = snakeRef.current[0]
    const next: Pt = { x: head.x + DX[dirRef.current], y: head.y + DY[dirRef.current] }

    const hitEnemy = enemiesRef.current.some(e => e.body.some(p => p.x === next.x && p.y === next.y))
    const hitBomb  = bombRef.current?.phase === 'active' && bombRef.current.lookup.has(`${next.x},${next.y}`)

    if (
      next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS ||
      snakeRef.current.some(p => p.x === next.x && p.y === next.y) ||
      rocksRef.current.some(r => r.x === next.x && r.y === next.y) ||
      hitEnemy || hitBomb
    ) {
      stopAll()
      phaseRef.current = 'dead'
      setPhase('dead')
      const s = scoreRef.current
      if (s > hiRef.current) {
        hiRef.current = s; setHighScore(s)
        window.api.settings.set(SAVE_KEY, String(s)).catch(() => {})
        onNewBest?.(s)
      }
      requestAnimationFrame(draw)
      return
    }

    if (bonusRef.current && Date.now() >= bonusRef.current.expiresAt) {
      bonusRef.current = null
      scheduleBonus(BONUS_RESPAWN_MS)
    }

    const ateFood  = next.x === foodRef.current.x  && next.y === foodRef.current.y
    const ateBonus = !!bonusRef.current && next.x === bonusRef.current.x && next.y === bonusRef.current.y

    if (ateFood || ateBonus) {
      const growBy = ateBonus ? settingsRef.current.bonusGrows : 1
      snakeRef.current = [next, ...Array(growBy - 1).fill(next), ...snakeRef.current]
      if (ateFood) {
        const pt = pickEmpty(occupied()); if (pt) foodRef.current = pt
      }
      if (ateBonus) {
        bonusRef.current = null; scheduleBonus(BONUS_RESPAWN_MS)
      }
      scoreRef.current += ateBonus ? settingsRef.current.bonusPoints : 1
      setScore(scoreRef.current)
      if (scoreRef.current % ROCK_EVERY === 0) trySpawnRock()
      checkEnemySpawns()
      stopTimer()
      timerRef.current = setInterval(tick, tickMs(scoreRef.current))
    } else {
      snakeRef.current = [next, ...snakeRef.current.slice(0, -1)]
    }
  }

  // ── Game start ────────────────────────────────────────────────────────────

  function startGame(): void {
    const s: Pt[] = [{ x: 27, y: 14 }, { x: 26, y: 14 }, { x: 25, y: 14 }]
    snakeRef.current        = s
    dirRef.current          = 'R'
    inputQueue.current      = []
    rocksRef.current        = []
    enemiesRef.current      = []
    bonusRef.current        = null
    bombRef.current         = null
    scoreRef.current        = 0
    tickCountRef.current    = 0
    enemySpawnedRef.current = 0
    lastBombCenter.current  = null
    foodRef.current = pickEmpty(new Set(s.map(p => `${p.x},${p.y}`))) ?? { x: 35, y: 14 }
    setScore(0)
    phaseRef.current = 'playing'
    setPhase('playing')
    stopAll()
    timerRef.current = setInterval(tick, tickMs(0))
    scheduleBonus(BONUS_FIRST_MS)
    scheduleBomb(BOMB_FIRST_MS)
    startRaf()
  }

  const isNewBest = phase === 'dead' && score > 0 && score >= hiRef.current

  return (
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
                  <span className={styles.legendItem}><span className={styles.dotGold} />food · 1 pt</span>
                  <span className={styles.legendItem}><span className={styles.dotOrange} />bonus · {BONUS_POINTS} pts</span>
                  <span className={styles.legendItem}><span className={styles.dotRock} />rocks</span>
                  <span className={styles.legendItem}><span className={styles.dotEnemy} />enemies</span>
                  <span className={styles.legendItem}><span className={styles.dotBomb} />meteor zone</span>
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
          <button className={styles.settingsBtn} onClick={() => setShowSettings(!showSettings)} title="Settings">⚙️</button>
        </div>
      )}
      {showSettings && (
        <div className={styles.settingsOverlay} onClick={() => setShowSettings(false)}>
          <div className={styles.settingsPanel} onClick={e => e.stopPropagation()}>
            <h3 className={styles.settingsTitle}>Snake Settings</h3>
            <div className={styles.settingsGrid}>
              <label>Bonus Points: <input type="number" min="1" max="50" value={settings.bonusPoints} onChange={e => { const v = parseInt(e.target.value, 10) || 1; setSettings({...settings, bonusPoints: v}); settingsRef.current.bonusPoints = v; window.api.settings.set('snakeSettings', JSON.stringify(settings)).catch(() => {}) }} /></label>
              <label>Bonus Growth: <input type="number" min="1" max="5" value={settings.bonusGrows} onChange={e => { const v = parseInt(e.target.value, 10) || 1; setSettings({...settings, bonusGrows: v}); settingsRef.current.bonusGrows = v; window.api.settings.set('snakeSettings', JSON.stringify(settings)).catch(() => {}) }} /></label>
              <label>Max Rocks: <input type="number" min="5" max="30" value={settings.maxRocks} onChange={e => { const v = parseInt(e.target.value, 10) || 10; setSettings({...settings, maxRocks: v}); settingsRef.current.maxRocks = v; window.api.settings.set('snakeSettings', JSON.stringify(settings)).catch(() => {}) }} /></label>
              <label>Enemy Length: <input type="number" min="3" max="10" value={settings.enemyLength} onChange={e => { const v = parseInt(e.target.value, 10) || 5; setSettings({...settings, enemyLength: v}); settingsRef.current.enemyLength = v; window.api.settings.set('snakeSettings', JSON.stringify(settings)).catch(() => {}) }} /></label>
              <label>Max Enemies: <input type="number" min="1" max="10" value={settings.maxEnemies} onChange={e => { const v = parseInt(e.target.value, 10) || 3; setSettings({...settings, maxEnemies: v}); settingsRef.current.maxEnemies = v; window.api.settings.set('snakeSettings', JSON.stringify(settings)).catch(() => {}) }} /></label>
              <label>Player Speed: <input type="number" min="0.5" max="2" step="0.1" value={settings.playerSpeedMultiplier} onChange={e => { const v = parseFloat(e.target.value) || 1; setSettings({...settings, playerSpeedMultiplier: v}); settingsRef.current.playerSpeedMultiplier = v; window.api.settings.set('snakeSettings', JSON.stringify(settings)).catch(() => {}) }} /></label>
              <label>Enemy Speed: <input type="number" min="0.5" max="2" step="0.1" value={settings.enemySpeedMultiplier} onChange={e => { const v = parseFloat(e.target.value) || 1; setSettings({...settings, enemySpeedMultiplier: v}); settingsRef.current.enemySpeedMultiplier = v; window.api.settings.set('snakeSettings', JSON.stringify(settings)).catch(() => {}) }} /></label>
            </div>
            <button className={styles.closeSettingsBtn} onClick={() => setShowSettings(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  )
}
