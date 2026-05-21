import { useEffect, useRef, useState } from 'react'
import styles from './EndlessRunner.module.css'

// Endless Runner — three modes share a scrolling engine.
//   side    — jump over spikes (Space / Up)
//   lane    — switch between 3 lanes (Up / Down)
//   gravity — flip floor/ceiling (Space)

type Mode = 'side' | 'lane' | 'gravity'

const W = 720
const H = 360
const PLAYER_X = 140
const GROUND_Y = 300
const CEIL_Y = 60

const V0 = 260            // initial scroll speed px/sec
const V_RAMP = 6          // px/sec gained per 100 score units (i.e. 1000 distance)
const V_MAX = 720

interface Obstacle {
  x: number
  w: number
  h: number
  y: number          // top
  kind: 'spike' | 'block' | 'bird' | 'coin'
  laneIdx?: number   // for lane mode
  flipSide?: 'floor' | 'ceil'  // for gravity mode
  hit?: boolean
}

interface PlayerState {
  x: number
  y: number
  vy: number
  grounded: boolean
  lane: number          // for lane mode: 0=top, 1=mid, 2=bot
  laneTarget: number
  flipped: boolean      // for gravity mode: false=floor, true=ceiling
}

interface Star { x: number; y: number; speed: number; size: number }

const SIDE_GRAVITY = 2200
const SIDE_JUMP_V = -780
const LANE_YS = [110, 200, 290]

const SAVE_KEYS: Record<Mode, string> = {
  side: 'runnerHighScore_side',
  lane: 'runnerHighScore_lane',
  gravity: 'runnerHighScore_gravity'
}

function makeStars(): Star[] {
  const out: Star[] = []
  for (let i = 0; i < 70; i++) {
    out.push({
      x: Math.random() * W,
      y: Math.random() * H,
      speed: 0.2 + Math.random() * 0.6,
      size: Math.random() < 0.7 ? 1 : 2
    })
  }
  return out
}

export default function EndlessRunner(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const modeRef = useRef<Mode>('side')
  const [mode, setMode] = useState<Mode>('side')

  const playerRef = useRef<PlayerState>({
    x: PLAYER_X, y: GROUND_Y, vy: 0, grounded: true,
    lane: 1, laneTarget: 1, flipped: false
  })
  const obstaclesRef = useRef<Obstacle[]>([])
  const starsRef = useRef<Star[]>(makeStars())
  const distRef = useRef(0)
  const speedRef = useRef(V0)
  const nextSpawnRef = useRef(W + 200)
  const aliveRef = useRef(true)
  const lastFrameRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const inputRef = useRef({ jumpQueued: false, flipQueued: false, laneDelta: 0 })

  const [scoreUI, setScoreUI] = useState(0)
  const [bestUI, setBestUI] = useState<Record<Mode, number>>({ side: 0, lane: 0, gravity: 0 })
  const [phase, setPhase] = useState<'playing' | 'over'>('playing')

  useEffect(() => {
    void (async () => {
      const [s, l, g] = await Promise.all([
        window.api.settings.get(SAVE_KEYS.side, '0'),
        window.api.settings.get(SAVE_KEYS.lane, '0'),
        window.api.settings.get(SAVE_KEYS.gravity, '0')
      ])
      setBestUI({
        side: parseInt(s, 10) || 0,
        lane: parseInt(l, 10) || 0,
        gravity: parseInt(g, 10) || 0
      })
    })()
  }, [])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    c.focus()
    function onKey(e: KeyboardEvent): void {
      const m = modeRef.current
      if (phase !== 'playing') {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reset() }
        return
      }
      if (m === 'side') {
        if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
          e.preventDefault()
          inputRef.current.jumpQueued = true
        }
      } else if (m === 'lane') {
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
          e.preventDefault()
          inputRef.current.laneDelta = -1
        } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
          e.preventDefault()
          inputRef.current.laneDelta = 1
        }
      } else if (m === 'gravity') {
        if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
          e.preventDefault()
          inputRef.current.flipQueued = true
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  useEffect(() => {
    lastFrameRef.current = performance.now()
    const loop = (t: number): void => {
      const dt = Math.min(0.04, (t - lastFrameRef.current) / 1000)
      lastFrameRef.current = t
      step(dt)
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function changeMode(m: Mode): void {
    modeRef.current = m
    setMode(m)
    reset()
  }

  function reset(): void {
    const m = modeRef.current
    obstaclesRef.current = []
    distRef.current = 0
    speedRef.current = V0
    nextSpawnRef.current = W + 100
    aliveRef.current = true
    inputRef.current = { jumpQueued: false, flipQueued: false, laneDelta: 0 }
    playerRef.current = {
      x: PLAYER_X,
      y: m === 'gravity' ? GROUND_Y : (m === 'lane' ? LANE_YS[1] : GROUND_Y),
      vy: 0,
      grounded: true,
      lane: 1, laneTarget: 1, flipped: false
    }
    setScoreUI(0)
    setPhase('playing')
    canvasRef.current?.focus()
  }

  function spawnSide(speed: number): void {
    // Random spike or stacked spikes (block) of varying width
    const r = Math.random()
    if (r < 0.7) {
      const w = 20 + Math.floor(Math.random() * 16)
      const h = 30
      obstaclesRef.current.push({ x: W + 10, w, h, y: GROUND_Y - h, kind: 'spike' })
    } else {
      // double spike (block)
      const w = 40 + Math.floor(Math.random() * 24)
      const h = 30
      obstaclesRef.current.push({ x: W + 10, w, h, y: GROUND_Y - h, kind: 'block' })
    }
    const baseGap = 280
    const compress = Math.min(120, (speed - V0) * 0.6)
    nextSpawnRef.current = W + baseGap - compress + Math.random() * 160
  }

  function spawnLane(speed: number): void {
    // Spawn 1 or 2 obstacles, never all 3 lanes blocked
    const count = Math.random() < 0.45 ? 2 : 1
    const lanes = [0, 1, 2]
    // shuffle
    for (let i = lanes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[lanes[i], lanes[j]] = [lanes[j], lanes[i]]
    }
    for (let i = 0; i < count; i++) {
      const lane = lanes[i]
      const isCoin = Math.random() < 0.18
      if (isCoin) {
        obstaclesRef.current.push({ x: W + 10, w: 18, h: 18, y: LANE_YS[lane] - 9, kind: 'coin', laneIdx: lane })
      } else {
        obstaclesRef.current.push({ x: W + 10, w: 34, h: 50, y: LANE_YS[lane] - 25, kind: 'bird', laneIdx: lane })
      }
    }
    const baseGap = 320
    const compress = Math.min(140, (speed - V0) * 0.5)
    nextSpawnRef.current = W + baseGap - compress + Math.random() * 140
  }

  function spawnGravity(speed: number): void {
    // Spikes on floor or ceiling alternating; sometimes both with a gap
    const side: 'floor' | 'ceil' = Math.random() < 0.5 ? 'floor' : 'ceil'
    const w = 28 + Math.floor(Math.random() * 18)
    const h = 30
    const y = side === 'floor' ? GROUND_Y - h : CEIL_Y
    obstaclesRef.current.push({ x: W + 10, w, h, y, kind: 'spike', flipSide: side })
    if (Math.random() < 0.18) {
      // chase spike on the other side, slightly offset
      const other: 'floor' | 'ceil' = side === 'floor' ? 'ceil' : 'floor'
      const oy = other === 'floor' ? GROUND_Y - h : CEIL_Y
      obstaclesRef.current.push({ x: W + 10 + 70, w, h, y: oy, kind: 'spike', flipSide: other })
    }
    const baseGap = 260
    const compress = Math.min(130, (speed - V0) * 0.55)
    nextSpawnRef.current = W + baseGap - compress + Math.random() * 160
  }

  function step(dt: number): void {
    if (phase !== 'playing') return
    const m = modeRef.current
    const p = playerRef.current

    // Speed ramp
    distRef.current += speedRef.current * dt
    const score = Math.floor(distRef.current / 10)
    setScoreUI(score)
    speedRef.current = Math.min(V_MAX, V0 + (score / 100) * V_RAMP * 100)

    // Stars parallax
    for (const s of starsRef.current) {
      s.x -= s.speed * (speedRef.current / V0) * 60 * dt
      if (s.x < 0) { s.x = W; s.y = Math.random() * H }
    }

    // Mode-specific player physics
    if (m === 'side') {
      if (inputRef.current.jumpQueued && p.grounded) {
        p.vy = SIDE_JUMP_V
        p.grounded = false
      }
      inputRef.current.jumpQueued = false
      p.vy += SIDE_GRAVITY * dt
      p.y += p.vy * dt
      if (p.y >= GROUND_Y) {
        p.y = GROUND_Y
        p.vy = 0
        p.grounded = true
      }
    } else if (m === 'lane') {
      if (inputRef.current.laneDelta !== 0) {
        p.laneTarget = Math.max(0, Math.min(2, p.lane + inputRef.current.laneDelta))
        inputRef.current.laneDelta = 0
      }
      const tgtY = LANE_YS[p.laneTarget]
      const dy = tgtY - p.y
      const speed = 900
      const stepLen = speed * dt
      if (Math.abs(dy) <= stepLen) { p.y = tgtY; p.lane = p.laneTarget }
      else p.y += Math.sign(dy) * stepLen
    } else if (m === 'gravity') {
      if (inputRef.current.flipQueued) {
        p.flipped = !p.flipped
        inputRef.current.flipQueued = false
      }
      // Snap toward target surface
      const tgtY = p.flipped ? CEIL_Y : GROUND_Y
      const dy = tgtY - p.y
      const speed = 1400
      const stepLen = speed * dt
      if (Math.abs(dy) <= stepLen) p.y = tgtY
      else p.y += Math.sign(dy) * stepLen
    }

    // Spawn obstacles
    nextSpawnRef.current -= speedRef.current * dt
    if (nextSpawnRef.current <= W) {
      if (m === 'side') spawnSide(speedRef.current)
      else if (m === 'lane') spawnLane(speedRef.current)
      else spawnGravity(speedRef.current)
    }

    // Move obstacles
    for (const o of obstaclesRef.current) {
      o.x -= speedRef.current * dt
    }
    obstaclesRef.current = obstaclesRef.current.filter(o => o.x + o.w > -20)

    // Collisions
    const px = p.x - 14, py = p.y - 14, pw = 28, ph = 28
    for (const o of obstaclesRef.current) {
      if (o.hit) continue
      if (px < o.x + o.w && px + pw > o.x && py < o.y + o.h && py + ph > o.y) {
        if (o.kind === 'coin') {
          o.hit = true
          distRef.current += 200    // 20 score bonus
        } else {
          die()
          return
        }
      }
    }
  }

  function die(): void {
    if (!aliveRef.current) return
    aliveRef.current = false
    const m = modeRef.current
    const score = Math.floor(distRef.current / 10)
    if (score > bestUI[m]) {
      const next = { ...bestUI, [m]: score }
      setBestUI(next)
      window.api.settings.set(SAVE_KEYS[m], String(score)).catch(() => {})
    }
    setPhase('over')
  }

  function draw(): void {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    const m = modeRef.current

    // sky
    ctx.fillStyle = '#0a0f1e'
    ctx.fillRect(0, 0, W, H)

    // stars
    for (const s of starsRef.current) {
      ctx.fillStyle = s.size === 1 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.9)'
      ctx.fillRect(s.x, s.y, s.size, s.size)
    }

    // surfaces
    if (m === 'side' || m === 'gravity') {
      ctx.fillStyle = '#1f2937'
      ctx.fillRect(0, GROUND_Y + 14, W, H - (GROUND_Y + 14))
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, GROUND_Y + 14)
      ctx.lineTo(W, GROUND_Y + 14)
      ctx.stroke()
      if (m === 'gravity') {
        ctx.fillStyle = '#1f2937'
        ctx.fillRect(0, 0, W, CEIL_Y - 14)
        ctx.beginPath()
        ctx.moveTo(0, CEIL_Y - 14)
        ctx.lineTo(W, CEIL_Y - 14)
        ctx.stroke()
      }
    } else if (m === 'lane') {
      // Lane guides
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.18)'
      ctx.setLineDash([10, 14])
      ctx.lineWidth = 1
      for (const y of LANE_YS) {
        ctx.beginPath()
        ctx.moveTo(0, y + 26)
        ctx.lineTo(W, y + 26)
        ctx.stroke()
      }
      ctx.setLineDash([])
    }

    // Obstacles
    for (const o of obstaclesRef.current) {
      if (o.hit) continue
      if (o.kind === 'spike') {
        ctx.fillStyle = '#dc2626'
        if (o.flipSide === 'ceil') {
          // point down
          ctx.beginPath()
          ctx.moveTo(o.x, o.y)
          ctx.lineTo(o.x + o.w, o.y)
          ctx.lineTo(o.x + o.w / 2, o.y + o.h)
          ctx.closePath()
          ctx.fill()
        } else {
          // point up
          ctx.beginPath()
          ctx.moveTo(o.x, o.y + o.h)
          ctx.lineTo(o.x + o.w, o.y + o.h)
          ctx.lineTo(o.x + o.w / 2, o.y)
          ctx.closePath()
          ctx.fill()
        }
      } else if (o.kind === 'block') {
        ctx.fillStyle = '#7f1d1d'
        ctx.fillRect(o.x, o.y, o.w, o.h)
        ctx.strokeStyle = '#dc2626'
        ctx.lineWidth = 2
        ctx.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2)
      } else if (o.kind === 'bird') {
        ctx.fillStyle = '#a855f7'
        ctx.beginPath()
        ctx.ellipse(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, o.h / 2, 0, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#581c87'
        ctx.beginPath()
        ctx.moveTo(o.x + o.w / 2, o.y + 4)
        ctx.lineTo(o.x + o.w / 2 - 8, o.y + 14)
        ctx.lineTo(o.x + o.w / 2 + 8, o.y + 14)
        ctx.closePath()
        ctx.fill()
      } else if (o.kind === 'coin') {
        ctx.fillStyle = '#fbbf24'
        ctx.beginPath()
        ctx.arc(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#78350f'
        ctx.font = 'bold 12px ui-monospace'
        ctx.textAlign = 'center'
        ctx.textBaseline = 'middle'
        ctx.fillText('$', o.x + o.w / 2, o.y + o.h / 2 + 1)
      }
    }

    // Player
    const p = playerRef.current
    ctx.fillStyle = '#f59e0b'
    if (m === 'gravity' && p.flipped) {
      // draw inverted-ish (just flip a triangle visually)
      ctx.beginPath()
      ctx.moveTo(p.x - 14, p.y + 14)
      ctx.lineTo(p.x + 14, p.y + 14)
      ctx.lineTo(p.x, p.y - 14)
      ctx.closePath()
      ctx.fill()
    } else {
      ctx.fillRect(p.x - 14, p.y - 14, 28, 28)
    }
    ctx.fillStyle = '#fde68a'
    ctx.fillRect(p.x - 6, p.y - 6, 12, 12)
  }

  return (
    <div className={styles.body}>
      <div className={styles.header}>
        <span>Score <strong>{scoreUI}</strong></span>
        <span>Best <strong>{bestUI[mode]}</strong></span>
        <div className={styles.modeRow}>
          {(['side', 'lane', 'gravity'] as const).map(m => (
            <button
              key={m}
              className={`${styles.modeBtn} ${mode === m ? styles.modeBtnActive : ''}`}
              onClick={() => changeMode(m)}
              title={m === 'side' ? 'Side scroll — jump over spikes'
                : m === 'lane' ? 'Lane switch — dodge across 3 lanes'
                : 'Gravity flip — flip between floor and ceiling'}
            >
              {m}
            </button>
          ))}
        </div>
        <button className={styles.resetBtn} onClick={reset}>↻ New Run</button>
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className={styles.canvas}
        tabIndex={0}
        onMouseDown={() => canvasRef.current?.focus()}
      />
      <div className={styles.hint}>
        {mode === 'side' && 'Space / ↑ to jump'}
        {mode === 'lane' && '↑ / ↓ to change lane · collect coins'}
        {mode === 'gravity' && 'Space / ↑ to flip gravity'}
      </div>
      {phase === 'over' && (
        <div className={styles.overlay}>
          <div className={styles.title}>WIPEOUT</div>
          <div className={styles.subtitle}>{scoreUI} points · {mode}</div>
          <button className={styles.btn} onClick={reset}>Run Again</button>
        </div>
      )}
    </div>
  )
}
