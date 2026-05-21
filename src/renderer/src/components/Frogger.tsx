import { useEffect, useRef, useState } from 'react'
import styles from './Frogger.module.css'

// Frogger — hop across a busy road and a treacherous river to fill 5 lily pads.

const CELL = 36
const COLS = 13
const ROWS = 13
const CANVAS_W = CELL * COLS
const CANVAS_H = CELL * ROWS

const ROW_TOP = 0      // hedges + pads
const ROW_RIVER_START = 1
const ROW_RIVER_END = 5
const ROW_MEDIAN = 6
const ROW_ROAD_START = 7
const ROW_ROAD_END = 11
const ROW_START = 12

const PAD_COLS = [0, 3, 6, 9, 12]
const ROUND_TIME = 60
const START_LIVES = 3

const SAVE_KEY = 'froggerHighScore'

type LaneKind = 'log' | 'turtle' | 'car' | 'truck'
interface Lane {
  row: number
  dir: 1 | -1
  speed: number   // tiles/sec
  kind: LaneKind
  length: number  // tiles
  gap: number     // tiles between entities
}

interface Entity {
  x: number       // tile coords (can be negative / > COLS during scroll)
  laneIdx: number
}

interface Frog {
  x: number       // pixel coords
  y: number       // pixel coords
  tx: number      // target tile x (for hop animation)
  ty: number      // target tile y
  hopping: boolean
  alive: boolean
  ridingLane: number | null   // lane index frog is locked to (for logs)
}

const BASE_LANES: Lane[] = [
  { row: 1, dir:  1, speed: 1.6, kind: 'log',    length: 3, gap: 3 },
  { row: 2, dir: -1, speed: 2.4, kind: 'turtle', length: 2, gap: 4 },
  { row: 3, dir:  1, speed: 1.1, kind: 'log',    length: 4, gap: 4 },
  { row: 4, dir: -1, speed: 2.8, kind: 'log',    length: 2, gap: 3 },
  { row: 5, dir:  1, speed: 1.9, kind: 'turtle', length: 3, gap: 4 },
  { row: 7, dir: -1, speed: 2.2, kind: 'car',    length: 1, gap: 3 },
  { row: 8, dir:  1, speed: 1.5, kind: 'car',    length: 1, gap: 4 },
  { row: 9, dir: -1, speed: 3.0, kind: 'truck',  length: 2, gap: 5 },
  { row: 10, dir: 1, speed: 2.4, kind: 'car',    length: 1, gap: 3 },
  { row: 11, dir:-1, speed: 1.3, kind: 'car',    length: 1, gap: 4 }
]

function buildEntities(lanes: Lane[]): Entity[] {
  const out: Entity[] = []
  for (let i = 0; i < lanes.length; i++) {
    const lane = lanes[i]
    const stride = lane.length + lane.gap
    // start with a per-lane phase offset so the world doesn't look gridlocked
    const phase = (i * 1.7) % stride
    for (let x = -stride; x < COLS + stride; x += stride) {
      out.push({ x: x + phase, laneIdx: i })
    }
  }
  return out
}

function rowToY(row: number): number { return row * CELL }

export default function Frogger(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frogRef = useRef<Frog>({ x: 6 * CELL, y: ROW_START * CELL, tx: 6, ty: ROW_START, hopping: false, alive: true, ridingLane: null })
  const lanesRef = useRef<Lane[]>(BASE_LANES.map(l => ({ ...l })))
  const entitiesRef = useRef<Entity[]>(buildEntities(lanesRef.current))
  const padsRef = useRef<boolean[]>([false, false, false, false, false])
  const livesRef = useRef(START_LIVES)
  const scoreRef = useRef(0)
  const levelRef = useRef(1)
  const timeRef = useRef(ROUND_TIME)
  const lastFrameRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)
  const deathTimerRef = useRef(0)

  const [scoreUI, setScoreUI] = useState(0)
  const [livesUI, setLivesUI] = useState(START_LIVES)
  const [levelUI, setLevelUI] = useState(1)
  const [timeUI, setTimeUI] = useState(ROUND_TIME)
  const [padsUI, setPadsUI] = useState<boolean[]>([false, false, false, false, false])
  const [best, setBest] = useState(0)
  const [phase, setPhase] = useState<'playing' | 'over'>('playing')

  useEffect(() => {
    window.api.settings.get(SAVE_KEY, '0').then(v => setBest(parseInt(v, 10) || 0))
  }, [])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    c.focus()
    function onKey(e: KeyboardEvent): void {
      if (phase !== 'playing') return
      const f = frogRef.current
      if (!f.alive || f.hopping) return
      let dx = 0, dy = 0
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') dy = -1
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') dy = 1
      else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') dx = -1
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') dx = 1
      else return
      e.preventDefault()
      const nx = f.tx + dx
      const ny = f.ty + dy
      if (nx < 0 || nx > COLS - 1 || ny < 0 || ny > ROWS - 1) return
      f.tx = nx
      f.ty = ny
      f.hopping = true
      f.ridingLane = null
      if (dy === -1) {
        scoreRef.current += 10
        setScoreUI(scoreRef.current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase])

  useEffect(() => {
    lastFrameRef.current = performance.now()
    const loop = (t: number): void => {
      const dt = Math.min(0.05, (t - lastFrameRef.current) / 1000)
      lastFrameRef.current = t
      step(dt)
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function laneEntitiesAt(row: number, frogTileX: number): { onEntity: boolean; entity: Entity | null; lane: Lane | null } {
    const lanes = lanesRef.current
    const entities = entitiesRef.current
    for (let i = 0; i < entities.length; i++) {
      const e = entities[i]
      const lane = lanes[e.laneIdx]
      if (lane.row !== row) continue
      const left = e.x
      const right = e.x + lane.length
      if (frogTileX + 0.5 >= left && frogTileX + 0.5 <= right) {
        return { onEntity: true, entity: e, lane }
      }
    }
    return { onEntity: false, entity: null, lane: null }
  }

  function step(dt: number): void {
    if (phase !== 'playing') return
    const f = frogRef.current
    const lanes = lanesRef.current
    const entities = entitiesRef.current

    // Tick timer
    if (f.alive) {
      timeRef.current -= dt
      if (timeRef.current <= 0) {
        killFrog('time')
      } else if (Math.floor(timeRef.current) !== Math.floor(timeRef.current + dt)) {
        setTimeUI(Math.max(0, Math.ceil(timeRef.current)))
      }
    } else {
      deathTimerRef.current -= dt
      if (deathTimerRef.current <= 0) {
        respawn()
      }
    }

    // Move entities
    for (const e of entities) {
      const lane = lanes[e.laneIdx]
      e.x += lane.dir * lane.speed * dt
      const stride = lane.length + lane.gap
      // wrap (use modular arithmetic relative to the lane's window)
      if (lane.dir > 0 && e.x > COLS + lane.gap) e.x -= stride * Math.ceil((COLS + 2 * lane.gap) / stride)
      if (lane.dir < 0 && e.x < -lane.length - lane.gap) e.x += stride * Math.ceil((COLS + 2 * lane.gap) / stride)
    }

    if (!f.alive) return

    // Hop animation: snap toward target
    const tgtX = f.tx * CELL
    const tgtY = f.ty * CELL
    if (f.hopping) {
      const speed = CELL * 14   // px/sec
      const dx = tgtX - f.x
      const dy = tgtY - f.y
      const dist = Math.hypot(dx, dy)
      const stepLen = speed * dt
      if (dist <= stepLen) {
        f.x = tgtX
        f.y = tgtY
        f.hopping = false
      } else {
        f.x += (dx / dist) * stepLen
        f.y += (dy / dist) * stepLen
      }
    }

    // Once stationary, evaluate the tile we're on
    if (!f.hopping) {
      const row = f.ty
      if (row >= ROW_RIVER_START && row <= ROW_RIVER_END) {
        // River: must be on a log or turtle
        const info = laneEntitiesAt(row, f.tx)
        if (info.onEntity && info.lane && info.entity) {
          // Ride
          f.ridingLane = info.entity.laneIdx
          f.x += info.lane.dir * info.lane.speed * CELL * dt
          // Update tile-x based on current pixel position (round to nearest for collision math)
          f.tx = Math.round(f.x / CELL)
          // If frog ridden off-screen
          if (f.x < -CELL * 0.5 || f.x > CANVAS_W - CELL * 0.5) {
            killFrog('drown')
          }
        } else {
          killFrog('drown')
        }
      } else if (row >= ROW_ROAD_START && row <= ROW_ROAD_END) {
        // Road: any overlap = death
        const info = laneEntitiesAt(row, f.tx)
        if (info.onEntity) killFrog('squish')
      } else if (row === ROW_TOP) {
        // Goal row: check pad
        if (PAD_COLS.includes(f.tx) && !padsRef.current[PAD_COLS.indexOf(f.tx)]) {
          const padIdx = PAD_COLS.indexOf(f.tx)
          padsRef.current[padIdx] = true
          setPadsUI([...padsRef.current])
          scoreRef.current += 50 + Math.floor(timeRef.current) * 2
          setScoreUI(scoreRef.current)
          if (padsRef.current.every(p => p)) {
            // Level clear
            levelRef.current += 1
            setLevelUI(levelRef.current)
            scoreRef.current += 250
            setScoreUI(scoreRef.current)
            padsRef.current = [false, false, false, false, false]
            setPadsUI([...padsRef.current])
            // Speed up lanes 10% per level
            lanesRef.current = lanesRef.current.map(l => ({ ...l, speed: l.speed * 1.1 }))
          }
          spawnFrogAtStart()
        } else {
          killFrog('hedge')
        }
      }
    }
  }

  function killFrog(_cause: string): void {
    const f = frogRef.current
    if (!f.alive) return
    f.alive = false
    deathTimerRef.current = 0.8
    livesRef.current -= 1
    setLivesUI(livesRef.current)
  }

  function spawnFrogAtStart(): void {
    const f = frogRef.current
    f.tx = 6
    f.ty = ROW_START
    f.x = f.tx * CELL
    f.y = f.ty * CELL
    f.hopping = false
    f.alive = true
    f.ridingLane = null
    timeRef.current = ROUND_TIME
    setTimeUI(ROUND_TIME)
  }

  function respawn(): void {
    if (livesRef.current <= 0) {
      // Game over
      const finalScore = scoreRef.current
      if (finalScore > best) {
        setBest(finalScore)
        window.api.settings.set(SAVE_KEY, String(finalScore)).catch(() => {})
      }
      setPhase('over')
      return
    }
    spawnFrogAtStart()
  }

  function reset(): void {
    frogRef.current = { x: 6 * CELL, y: ROW_START * CELL, tx: 6, ty: ROW_START, hopping: false, alive: true, ridingLane: null }
    lanesRef.current = BASE_LANES.map(l => ({ ...l }))
    entitiesRef.current = buildEntities(lanesRef.current)
    padsRef.current = [false, false, false, false, false]
    livesRef.current = START_LIVES
    scoreRef.current = 0
    levelRef.current = 1
    timeRef.current = ROUND_TIME
    setScoreUI(0)
    setLivesUI(START_LIVES)
    setLevelUI(1)
    setTimeUI(ROUND_TIME)
    setPadsUI([false, false, false, false, false])
    setPhase('playing')
    canvasRef.current?.focus()
  }

  function draw(): void {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    // Background: top hedges, river, median, road, grass
    ctx.fillStyle = '#0a1f10'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    // Top zone with pads
    ctx.fillStyle = '#1a4d2e'
    ctx.fillRect(0, 0, CANVAS_W, CELL)
    for (let i = 0; i < PAD_COLS.length; i++) {
      const px = PAD_COLS[i] * CELL
      ctx.fillStyle = padsRef.current[i] ? '#16a34a' : '#0a3d22'
      ctx.beginPath()
      ctx.arc(px + CELL / 2, CELL / 2, CELL * 0.42, 0, Math.PI * 2)
      ctx.fill()
      if (padsRef.current[i]) {
        // Frog on pad
        drawFrog(ctx, px, 0, true)
      }
    }

    // River
    ctx.fillStyle = '#1e3a8a'
    ctx.fillRect(0, rowToY(ROW_RIVER_START), CANVAS_W, CELL * (ROW_RIVER_END - ROW_RIVER_START + 1))

    // Median
    ctx.fillStyle = '#3b1d6e'
    ctx.fillRect(0, rowToY(ROW_MEDIAN), CANVAS_W, CELL)

    // Road
    ctx.fillStyle = '#1f1f1f'
    ctx.fillRect(0, rowToY(ROW_ROAD_START), CANVAS_W, CELL * (ROW_ROAD_END - ROW_ROAD_START + 1))
    // Lane dashes
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.4)'
    ctx.setLineDash([8, 8])
    ctx.lineWidth = 2
    for (let r = ROW_ROAD_START + 1; r <= ROW_ROAD_END; r++) {
      ctx.beginPath()
      ctx.moveTo(0, rowToY(r))
      ctx.lineTo(CANVAS_W, rowToY(r))
      ctx.stroke()
    }
    ctx.setLineDash([])

    // Start grass
    ctx.fillStyle = '#1a4d2e'
    ctx.fillRect(0, rowToY(ROW_START), CANVAS_W, CELL)

    // Entities
    const lanes = lanesRef.current
    for (const e of entitiesRef.current) {
      const lane = lanes[e.laneIdx]
      const x = e.x * CELL
      const y = rowToY(lane.row)
      drawEntity(ctx, x, y, lane.length, lane.kind, lane.dir)
    }

    // Frog
    const f = frogRef.current
    if (f.alive) {
      drawFrog(ctx, f.x, f.y, false)
    } else {
      // Death splat
      ctx.fillStyle = '#dc2626'
      ctx.beginPath()
      ctx.arc(f.x + CELL / 2, f.y + CELL / 2, CELL * 0.35, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 18px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('✕', f.x + CELL / 2, f.y + CELL / 2)
    }
  }

  function drawEntity(ctx: CanvasRenderingContext2D, x: number, y: number, len: number, kind: LaneKind, _dir: number): void {
    const w = len * CELL
    const pad = 4
    if (kind === 'log') {
      ctx.fillStyle = '#7c4a1e'
      ctx.fillRect(x, y + pad, w, CELL - pad * 2)
      ctx.strokeStyle = '#4a2c10'
      ctx.lineWidth = 1
      for (let i = 1; i < len; i++) {
        ctx.beginPath()
        ctx.moveTo(x + i * CELL, y + pad)
        ctx.lineTo(x + i * CELL, y + CELL - pad)
        ctx.stroke()
      }
    } else if (kind === 'turtle') {
      for (let i = 0; i < len; i++) {
        ctx.fillStyle = '#16a34a'
        ctx.beginPath()
        ctx.arc(x + i * CELL + CELL / 2, y + CELL / 2, CELL * 0.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#14532d'
        ctx.beginPath()
        ctx.arc(x + i * CELL + CELL / 2, y + CELL / 2, CELL * 0.22, 0, Math.PI * 2)
        ctx.fill()
      }
    } else if (kind === 'car') {
      ctx.fillStyle = '#f59e0b'
      ctx.fillRect(x + 2, y + pad, w - 4, CELL - pad * 2)
      ctx.fillStyle = '#fef3c7'
      ctx.fillRect(x + 6, y + pad + 4, w - 12, 6)
    } else if (kind === 'truck') {
      ctx.fillStyle = '#dc2626'
      ctx.fillRect(x + 2, y + pad, w - 4, CELL - pad * 2)
      ctx.fillStyle = '#7f1d1d'
      ctx.fillRect(x + 2, y + pad, w * 0.3, CELL - pad * 2)
    }
  }

  function drawFrog(ctx: CanvasRenderingContext2D, x: number, y: number, dim: boolean): void {
    const cx = x + CELL / 2, cy = y + CELL / 2
    ctx.fillStyle = dim ? '#15803d' : '#4ade80'
    ctx.beginPath()
    ctx.arc(cx, cy, CELL * 0.34, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = dim ? '#052e16' : '#14532d'
    ctx.beginPath()
    ctx.arc(cx - 6, cy - 6, 3, 0, Math.PI * 2)
    ctx.arc(cx + 6, cy - 6, 3, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = dim ? '#0a3d22' : '#16a34a'
    ctx.beginPath()
    ctx.arc(cx - 10, cy + 6, 4, 0, Math.PI * 2)
    ctx.arc(cx + 10, cy + 6, 4, 0, Math.PI * 2)
    ctx.fill()
  }

  return (
    <div className={styles.body}>
      <div className={styles.header}>
        <span>Score <strong>{scoreUI}</strong></span>
        <span>Lives <strong>{livesUI}</strong></span>
        <span>Level <strong>{levelUI}</strong></span>
        <span>Time <strong>{timeUI}</strong></span>
        <span>Pads <strong>{padsUI.filter(Boolean).length}/5</strong></span>
        {best > 0 && <span>Best <strong>{best}</strong></span>}
        <button className={styles.resetBtn} onClick={reset}>↻ New Game</button>
      </div>
      <canvas
        ref={canvasRef}
        width={CANVAS_W}
        height={CANVAS_H}
        className={styles.canvas}
        tabIndex={0}
        onMouseDown={() => canvasRef.current?.focus()}
      />
      <div className={styles.hint}>Arrow keys or WASD to hop · ride logs and turtles · don't get squished</div>
      {phase === 'over' && (
        <div className={styles.overlay}>
          <div className={styles.title}>GAME OVER</div>
          <div className={styles.subtitle}>{scoreUI} points · level {levelUI}</div>
          <button className={styles.btn} onClick={reset}>New Game</button>
        </div>
      )}
    </div>
  )
}
