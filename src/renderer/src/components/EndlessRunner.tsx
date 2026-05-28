import { useEffect, useRef, useState } from 'react'
import styles from './EndlessRunner.module.css'

// Endless Runner — three modes share a scrolling engine.
//   side    — jump over spikes (Space / Up)
//   lane    — switch between 3 lanes (Up / Down)
//   gravity — flip floor/ceiling (Space)

type Mode = 'side' | 'lane' | 'gravity'
type Phase = 'menu' | 'countdown' | 'playing' | 'over'

const W = 720
const H = 360
const PLAYER_X = 140
const GROUND_Y = 300
const CEIL_Y = 60

const V0 = 300             // brisk starting speed
const V_PER_SCORE = 0.7    // px/s gained per score point
const V_MAX = 950          // hard cap

interface Obstacle {
  x: number
  w: number
  h: number
  y: number
  kind: 'spike' | 'block' | 'bird' | 'coin'
  laneIdx?: number
  flipSide?: 'floor' | 'ceil'
  hit?: boolean
}

interface PlayerState {
  x: number; y: number; vy: number
  grounded: boolean
  lane: number; laneTarget: number
  flipped: boolean
}

interface Star { x: number; y: number; speed: number; size: number }

const SIDE_GRAVITY = 2400
const SIDE_JUMP_V = -820
const SIDE_GRAVITY_CUT = 5400   // when releasing jump while ascending — snappier short hops
const LANE_YS = [110, 200, 290]

const SAVE_KEYS: Record<Mode, string> = {
  side: 'runnerHighScore_side',
  lane: 'runnerHighScore_lane',
  gravity: 'runnerHighScore_gravity'
}

const MODE_DESC: Record<Mode, string> = {
  side: 'Jump over spikes — Space or ↑',
  lane: 'Switch between 3 lanes — ↑ / ↓ · collect coins',
  gravity: 'Flip between floor and ceiling — Space or ↑'
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
  const phaseRef = useRef<Phase>('menu')
  const countdownRef = useRef(0)
  const [mode, setMode] = useState<Mode>('side')
  const [phase, setPhase] = useState<Phase>('menu')
  const [countdownUI, setCountdownUI] = useState(3)

  const playerRef = useRef<PlayerState>({
    x: PLAYER_X, y: GROUND_Y, vy: 0, grounded: true,
    lane: 1, laneTarget: 1, flipped: false
  })
  const obstaclesRef = useRef<Obstacle[]>([])
  const popupsRef = useRef<Array<{ x: number; y: number; vy: number; life: number; text: string }>>([])
  const starsRef = useRef<Star[]>(makeStars())
  const distRef = useRef(0)
  const speedRef = useRef(V0)
  const nextSpawnRef = useRef(W + 300)
  const lastFrameRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const inputRef = useRef({ jumpQueued: false, jumpHeld: false, flipQueued: false, laneDelta: 0 })

  const [scoreUI, setScoreUI] = useState(0)
  const [bestUI, setBestUI] = useState<Record<Mode, number>>({ side: 0, lane: 0, gravity: 0 })

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
      if (document.activeElement !== canvasRef.current) return
      const m = modeRef.current
      const p = phaseRef.current
      if (p === 'menu') return
      if (p === 'over') {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); beginCountdown(m) }
        return
      }
      if (p === 'countdown') return
      // p === 'playing'
      if (m === 'side') {
        if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
          e.preventDefault(); e.stopPropagation()
          if (!e.repeat) inputRef.current.jumpQueued = true
          inputRef.current.jumpHeld = true
        }
      } else if (m === 'lane') {
        if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
          e.preventDefault(); e.stopPropagation()
          inputRef.current.laneDelta = -1
        } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
          e.preventDefault(); e.stopPropagation()
          inputRef.current.laneDelta = 1
        }
      } else if (m === 'gravity') {
        if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
          e.preventDefault(); e.stopPropagation()
          inputRef.current.flipQueued = true
        }
      }
    }
    function onKeyUp(e: KeyboardEvent): void {
      if (document.activeElement !== canvasRef.current) return
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.stopPropagation()
        inputRef.current.jumpHeld = false
      }
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('keyup', onKeyUp, true)
    }
  }, [])

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

  function selectMode(m: Mode): void {
    modeRef.current = m
    setMode(m)
    beginCountdown(m)
  }

  function beginCountdown(m: Mode): void {
    obstaclesRef.current = []
    popupsRef.current = []
    distRef.current = 0
    speedRef.current = V0
    nextSpawnRef.current = W + 400    // first obstacle delayed
    inputRef.current = { jumpQueued: false, jumpHeld: false, flipQueued: false, laneDelta: 0 }
    playerRef.current = {
      x: PLAYER_X,
      y: m === 'gravity' ? GROUND_Y : (m === 'lane' ? LANE_YS[1] : GROUND_Y),
      vy: 0,
      grounded: true,
      lane: 1, laneTarget: 1, flipped: false
    }
    setScoreUI(0)
    countdownRef.current = 3
    setCountdownUI(3)
    phaseRef.current = 'countdown'
    setPhase('countdown')
    canvasRef.current?.focus()
  }

  function backToMenu(): void {
    phaseRef.current = 'menu'
    setPhase('menu')
  }

  function step(dt: number): void {
    const ph = phaseRef.current
    if (ph === 'menu' || ph === 'over') return

    if (ph === 'countdown') {
      countdownRef.current -= dt
      const remaining = Math.ceil(countdownRef.current)
      if (remaining !== countdownUI) setCountdownUI(remaining)
      if (countdownRef.current <= 0) {
        phaseRef.current = 'playing'
        setPhase('playing')
      }
      // While counting down, just animate stars (no spawning, no scoring)
      for (const s of starsRef.current) {
        s.x -= s.speed * 30 * dt
        if (s.x < 0) { s.x = W; s.y = Math.random() * H }
      }
      return
    }

    // ph === 'playing'
    const m = modeRef.current
    const p = playerRef.current

    distRef.current += speedRef.current * dt
    const score = Math.floor(distRef.current / 10)
    setScoreUI(score)
    speedRef.current = Math.min(V_MAX, V0 + score * V_PER_SCORE)

    for (const s of starsRef.current) {
      s.x -= s.speed * (speedRef.current / V0) * 60 * dt
      if (s.x < 0) { s.x = W; s.y = Math.random() * H }
    }

    if (m === 'side') {
      if (inputRef.current.jumpQueued && p.grounded) {
        p.vy = SIDE_JUMP_V
        p.grounded = false
      }
      inputRef.current.jumpQueued = false
      const grav = (p.vy < 0 && !inputRef.current.jumpHeld) ? SIDE_GRAVITY_CUT : SIDE_GRAVITY
      p.vy += grav * dt
      p.y += p.vy * dt
      if (p.y >= GROUND_Y) { p.y = GROUND_Y; p.vy = 0; p.grounded = true }
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
      const tgtY = p.flipped ? CEIL_Y : GROUND_Y
      const dy = tgtY - p.y
      const speed = 1400
      const stepLen = speed * dt
      if (Math.abs(dy) <= stepLen) p.y = tgtY
      else p.y += Math.sign(dy) * stepLen
    }

    nextSpawnRef.current -= speedRef.current * dt
    if (nextSpawnRef.current <= W) {
      if (m === 'side') spawnSide(speedRef.current)
      else if (m === 'lane') spawnLane(speedRef.current)
      else spawnGravity(speedRef.current)
    }

    for (const o of obstaclesRef.current) o.x -= speedRef.current * dt
    obstaclesRef.current = obstaclesRef.current.filter(o => o.x + o.w > -20)

    const px = p.x - 14, py = p.y - 14, pw = 28, ph2 = 28
    for (const o of obstaclesRef.current) {
      if (o.hit) continue
      if (px < o.x + o.w && px + pw > o.x && py < o.y + o.h && py + ph2 > o.y) {
        if (o.kind === 'coin') {
          o.hit = true
          distRef.current += 200
          popupsRef.current.push({ x: o.x + o.w / 2, y: o.y, vy: -55, life: 0.9, text: '+20' })
        }
        else { die(); return }
      }
    }

    // Popups (floating score text — scroll with the world)
    for (const pu of popupsRef.current) {
      pu.y += pu.vy * dt
      pu.x -= speedRef.current * dt
      pu.life -= dt
    }
    popupsRef.current = popupsRef.current.filter(pu => pu.life > 0)
  }

  function spawnSide(speed: number): void {
    const r = Math.random()
    const score = Math.floor(distRef.current / 10)
    if (r < 0.40) {
      // Ground spike
      const w = 20 + Math.floor(Math.random() * 14)
      const h = 26
      obstaclesRef.current.push({ x: W + 10, w, h, y: GROUND_Y + 14 - h, kind: 'spike' })
    } else if (r < 0.60) {
      // Ground block (tall — must jump over)
      const w = 36 + Math.floor(Math.random() * 16)
      const h = 30
      obstaclesRef.current.push({ x: W + 10, w, h, y: GROUND_Y + 14 - h, kind: 'block' })
    } else if (r < 0.80) {
      // Mid-air block (must duck / short-jump under or jump over)
      const w = 36 + Math.floor(Math.random() * 14)
      const h = 28
      const midY = GROUND_Y - 50 - Math.floor(Math.random() * 30)
      obstaclesRef.current.push({ x: W + 10, w, h, y: midY, kind: 'block' })
    } else {
      // Combo: ground spike + mid-air block (tight jump window)
      const spikeW = 20 + Math.floor(Math.random() * 10)
      obstaclesRef.current.push({ x: W + 10, w: spikeW, h: 24, y: GROUND_Y + 14 - 24, kind: 'spike' })
      if (score > 40) {
        const blockW = 44 + Math.floor(Math.random() * 14)
        obstaclesRef.current.push({ x: W + 50 + Math.floor(Math.random() * 60), w: blockW, h: 26, y: GROUND_Y - 80, kind: 'block' })
      }
    }
    const minClearGap = speed * (2 * Math.abs(SIDE_JUMP_V) / SIDE_GRAVITY) * 0.7
    const baseGap = Math.max(280, minClearGap + 80)
    nextSpawnRef.current = W + baseGap + Math.random() * 140
  }

  function spawnLane(speed: number): void {
    // Spawn 1 or 2 obstacles, always one lane safe
    const count = Math.random() < 0.35 ? 2 : 1
    const lanes = [0, 1, 2]
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
        // Rectangle obstacle, lane-centered
        obstaclesRef.current.push({ x: W + 10, w: 36, h: 36, y: LANE_YS[lane] - 18, kind: 'block', laneIdx: lane })
      }
    }
    const baseGap = Math.max(360, 240 + speed * 0.5)
    nextSpawnRef.current = W + baseGap + Math.random() * 160
  }

  function spawnGravity(speed: number): void {
    const flipTravel = speed * 0.18
    const score = Math.floor(distRef.current / 10)
    const r = Math.random()
    if (r < 0.50) {
      // Single spike on random side
      const side: 'floor' | 'ceil' = Math.random() < 0.5 ? 'floor' : 'ceil'
      const w = 26 + Math.floor(Math.random() * 16)
      const h = 26
      const y = side === 'floor' ? GROUND_Y + 14 - h : CEIL_Y - 14
      obstaclesRef.current.push({ x: W + 10, w, h, y, kind: 'spike', flipSide: side })
    } else if (r < 0.75 || score < 30) {
      // Two spikes same side — must stay on opposite side
      const side: 'floor' | 'ceil' = Math.random() < 0.5 ? 'floor' : 'ceil'
      const w1 = 26 + Math.floor(Math.random() * 14)
      const w2 = 26 + Math.floor(Math.random() * 14)
      const h = 26
      const y = side === 'floor' ? GROUND_Y + 14 - h : CEIL_Y - 14
      obstaclesRef.current.push({ x: W + 10, w: w1, h, y, kind: 'spike', flipSide: side })
      obstaclesRef.current.push({ x: W + 10 + w1 + 30 + Math.floor(Math.random() * 40), w: w2, h, y, kind: 'spike', flipSide: side })
    } else {
      // Alternating floor/ceil — forces a flip between them
      const h = 26
      const gap = Math.max(60, flipTravel + 20)
      obstaclesRef.current.push({ x: W + 10, w: 30, h, y: GROUND_Y + 14 - h, kind: 'spike', flipSide: 'floor' })
      obstaclesRef.current.push({ x: W + 10 + gap, w: 30, h, y: CEIL_Y - 14, kind: 'spike', flipSide: 'ceil' })
    }
    const baseGap = Math.max(180, flipTravel + 100)
    nextSpawnRef.current = W + baseGap + Math.random() * 80
  }

  function die(): void {
    if (phaseRef.current !== 'playing') return
    const m = modeRef.current
    const score = Math.floor(distRef.current / 10)
    if (score > bestUI[m]) {
      const next = { ...bestUI, [m]: score }
      setBestUI(next)
      window.api.settings.set(SAVE_KEYS[m], String(score)).catch(() => {})
    }
    phaseRef.current = 'over'
    setPhase('over')
  }

  function draw(): void {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    const m = modeRef.current
    const ph = phaseRef.current

    ctx.fillStyle = '#0a0f1e'
    ctx.fillRect(0, 0, W, H)

    for (const s of starsRef.current) {
      ctx.fillStyle = s.size === 1 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.9)'
      ctx.fillRect(s.x, s.y, s.size, s.size)
    }

    if (ph === 'menu') return    // menu overlay handles the rest

    if (m === 'side' || m === 'gravity') {
      ctx.fillStyle = '#1f2937'
      ctx.fillRect(0, GROUND_Y + 14, W, H - (GROUND_Y + 14))
      ctx.strokeStyle = '#f59e0b'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(0, GROUND_Y + 14); ctx.lineTo(W, GROUND_Y + 14); ctx.stroke()
      if (m === 'gravity') {
        ctx.fillStyle = '#1f2937'
        ctx.fillRect(0, 0, W, CEIL_Y - 14)
        ctx.beginPath(); ctx.moveTo(0, CEIL_Y - 14); ctx.lineTo(W, CEIL_Y - 14); ctx.stroke()
      }
    }
    // lane mode: no guide lines — player learns the three lanes from movement

    for (const o of obstaclesRef.current) {
      if (o.hit) continue
      if (o.kind === 'spike') {
        ctx.fillStyle = '#dc2626'
        if (o.flipSide === 'ceil') {
          ctx.beginPath()
          ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + o.w, o.y); ctx.lineTo(o.x + o.w / 2, o.y + o.h)
          ctx.closePath(); ctx.fill()
        } else {
          ctx.beginPath()
          ctx.moveTo(o.x, o.y + o.h); ctx.lineTo(o.x + o.w, o.y + o.h); ctx.lineTo(o.x + o.w / 2, o.y)
          ctx.closePath(); ctx.fill()
        }
      } else if (o.kind === 'block') {
        ctx.fillStyle = '#7f1d1d'
        ctx.fillRect(o.x, o.y, o.w, o.h)
        ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 2
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
        ctx.closePath(); ctx.fill()
      } else if (o.kind === 'coin') {
        ctx.fillStyle = '#fbbf24'
        ctx.beginPath(); ctx.arc(o.x + o.w / 2, o.y + o.h / 2, o.w / 2, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = '#78350f'
        ctx.font = 'bold 12px ui-monospace'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('$', o.x + o.w / 2, o.y + o.h / 2 + 1)
      }
    }

    // Popups
    for (const pu of popupsRef.current) {
      ctx.globalAlpha = Math.min(1, pu.life * 1.4)
      ctx.fillStyle = '#fbbf24'
      ctx.font = 'bold 14px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(pu.text, pu.x, pu.y)
      ctx.globalAlpha = 1
    }

    const p = playerRef.current
    ctx.fillStyle = '#f59e0b'
    if (m === 'gravity' && p.flipped) {
      ctx.beginPath()
      ctx.moveTo(p.x - 14, p.y + 14); ctx.lineTo(p.x + 14, p.y + 14); ctx.lineTo(p.x, p.y - 14)
      ctx.closePath(); ctx.fill()
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
        <span>Mode <strong>{mode}</strong></span>
        {(phase === 'playing' || phase === 'countdown' || phase === 'over') && (
          <button className={styles.resetBtn} onClick={backToMenu}>← Menu</button>
        )}
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
        {phase === 'menu' && 'Pick a mode to begin'}
        {phase === 'countdown' && 'Ready…'}
        {phase === 'playing' && MODE_DESC[mode]}
        {phase === 'over' && 'Press Space or Enter to retry · Menu to switch mode'}
      </div>
      {phase === 'menu' && (
        <div className={styles.overlay}>
          <div className={styles.title}>ENDLESS RUNNER</div>
          <div className={styles.subtitle}>Pick a mode</div>
          <div className={styles.modeRow}>
            {(['side', 'lane', 'gravity'] as const).map(m => (
              <button
                key={m}
                className={styles.upgradeCardLike ?? styles.btn}
                onClick={() => selectMode(m)}
                style={{ width: 180, padding: '14px 12px', background: 'rgba(245,158,11,0.12)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 8, cursor: 'pointer', fontFamily: 'inherit', fontWeight: 800, letterSpacing: '0.06em' }}
              >
                <div style={{ fontSize: 16, marginBottom: 6 }}>{m.toUpperCase()}</div>
                <div style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.6)' }}>{MODE_DESC[m]}</div>
                <div style={{ fontSize: 10, marginTop: 6, color: 'rgba(255,255,255,0.4)' }}>best: {bestUI[m]}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      {phase === 'countdown' && (
        <div className={styles.overlay} style={{ background: 'rgba(0,0,0,0.45)' }}>
          <div style={{ fontSize: 120, fontWeight: 900, color: '#f59e0b', lineHeight: 1 }}>
            {countdownUI > 0 ? countdownUI : 'GO'}
          </div>
        </div>
      )}
      {phase === 'over' && (
        <div className={styles.overlay}>
          <div className={styles.title}>WIPEOUT</div>
          <div className={styles.subtitle}>{scoreUI} points · {mode}</div>
          <button className={styles.btn} onClick={() => beginCountdown(modeRef.current)}>Run Again</button>
          <button className={styles.resetBtn} onClick={backToMenu}>Change Mode</button>
        </div>
      )}
    </div>
  )
}
