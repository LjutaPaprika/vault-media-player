import { useEffect, useRef, useState } from 'react'
import styles from './Frogger.module.css'

// Frogger — Crossy Road style. Infinite forward scrolling, hop one tile
// at a time. Score = furthest row reached. Camera auto-scrolls slowly to
// keep you honest.

const CELL = 36
const COLS = 13
const VIEW_ROWS = 13
const CANVAS_W = CELL * COLS
const CANVAS_H = CELL * VIEW_ROWS

const SAVE_KEY = 'froggerHighScore'

type RowKind = 'grass' | 'road' | 'river' | 'rail'

interface Entity {
  x: number        // tile coords (fractional)
  w: number        // length in tiles
}

interface Row {
  ty: number
  kind: RowKind
  dir: 1 | -1
  speed: number    // tiles/sec
  entityKind: 'log' | 'turtle' | 'car' | 'truck' | 'train' | null
  entities: Entity[]
  spawnCursor: number   // next x position to spawn at (going in dir)
  gapAhead: number      // remaining gap until next entity
}

interface FrogState {
  tx: number        // tile X (frog snaps to integers when not on a moving entity)
  ty: number        // tile Y (always integer)
  px: number        // pixel X (fractional when riding a log)
  hopping: boolean
  hopFromX: number  // pixel start
  hopFromY: number
  hopToX: number
  hopToY: number
  hopT: number      // 0 → HOP_TIME
  alive: boolean
  ridingRow: number | null     // ty of river row being ridden
  ridingOffset: number | null  // tile offset within the log/turtle (locked at landing)
}

const HOP_TIME = 0.09    // seconds per hop animation
const START_ROWS_BEHIND = 4   // grass rows at the start
const CAMERA_START_DELAY = 5    // seconds before camera starts drifting
const CAMERA_BASE_SPEED = 0.6   // rows/sec minimum drift, ramps with score
const CAMERA_MAX_SPEED = 2.0
const HIT_INSET = 0.28   // fraction of tile to inset for forgiving hitbox

export default function Frogger(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const rowsRef = useRef<Map<number, Row>>(new Map())
  const frogRef = useRef<FrogState>(initialFrog())
  const cameraTyRef = useRef(0)             // lowest visible ty (fractional for smooth scroll)
  const cameraTimerRef = useRef(0)
  const aliveRef = useRef(true)
  const deathTimerRef = useRef(0)
  const phaseRef = useRef<'menu' | 'playing' | 'over'>('menu')
  const lastFrameRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const inputQueueRef = useRef<Array<'up' | 'down' | 'left' | 'right'>>([])

  const [score, setScore] = useState(0)
  const [best, setBest] = useState(0)
  const [phase, setPhase] = useState<'menu' | 'playing' | 'over'>('menu')

  function initialFrog(): FrogState {
    return {
      tx: Math.floor(COLS / 2),
      ty: 0,
      px: Math.floor(COLS / 2) * CELL,
      hopping: false,
      hopFromX: 0, hopFromY: 0, hopToX: 0, hopToY: 0,
      hopT: 0,
      alive: true,
      ridingRow: null,
      ridingOffset: null
    }
  }

  function genRow(ty: number): Row {
    // First START_ROWS_BEHIND rows back from start are grass; then random
    if (ty <= 0 && ty > -START_ROWS_BEHIND) {
      return makeBlankRow(ty, 'grass')
    }
    if (ty === 0) return makeBlankRow(0, 'grass')

    // Guarantee a grass rest row every 3-4 dangerous rows
    let dangerousStreak = 0
    for (let check = ty - 1; check >= ty - 4; check--) {
      const prev = rowsRef.current.get(check)
      if (!prev || prev.kind === 'grass') break
      dangerousStreak++
    }
    if (dangerousStreak >= 3) return makeBlankRow(ty, 'grass')

    // Random row type
    const r = Math.random()
    let kind: RowKind
    if (r < 0.20) kind = 'grass'
    else if (r < 0.55) kind = 'road'
    else if (r < 0.88) kind = 'river'
    else kind = 'rail'

    if (kind === 'grass') return makeBlankRow(ty, 'grass')
    if (kind === 'rail') return makeRailRow(ty)
    if (kind === 'road') return makeRoadRow(ty)
    return makeRiverRow(ty)
  }

  function makeBlankRow(ty: number, kind: RowKind): Row {
    return { ty, kind, dir: 1, speed: 0, entityKind: null, entities: [], spawnCursor: 0, gapAhead: 0 }
  }

  function makeRoadRow(ty: number): Row {
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1
    const isTruck = Math.random() < 0.3
    const difficulty = Math.min(1, Math.abs(ty) / 60)
    const speed = (1.0 + Math.random() * 1.2 + difficulty * 1.2) * (isTruck ? 0.8 : 1.0)
    const row: Row = {
      ty, kind: 'road', dir, speed,
      entityKind: isTruck ? 'truck' : 'car',
      entities: [],
      spawnCursor: dir > 0 ? -2 : COLS + 2,
      gapAhead: 0
    }
    // Pre-populate
    prefillLane(row, isTruck ? 2 : 1)
    return row
  }

  function makeRiverRow(ty: number): Row {
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1
    const isTurtle = Math.random() < 0.4
    const speed = 0.9 + Math.random() * 1.6
    const len = isTurtle ? 2 + Math.floor(Math.random() * 2) : 3 + Math.floor(Math.random() * 3)
    const row: Row = {
      ty, kind: 'river', dir, speed,
      entityKind: isTurtle ? 'turtle' : 'log',
      entities: [],
      spawnCursor: dir > 0 ? -len - 1 : COLS + 1,
      gapAhead: 0
    }
    prefillLane(row, len)
    return row
  }

  function makeRailRow(ty: number): Row {
    const dir: 1 | -1 = Math.random() < 0.5 ? 1 : -1
    return {
      ty, kind: 'rail', dir, speed: 6 + Math.random() * 3,
      entityKind: 'train',
      entities: [],
      spawnCursor: dir > 0 ? -8 : COLS + 8,
      gapAhead: 6 + Math.random() * 6
    }
  }

  function prefillLane(row: Row, len: number): void {
    // Place entities with gaps that guarantee a passable lane (>= 3 tiles).
    // Trucks are bigger and faster — give them more spacing.
    const isTruck = row.entityKind === 'truck'
    const gapMin = isTruck ? 4 : 3
    const gapMax = isTruck ? 7 : 6
    // Random initial offset so adjacent rows are out of phase
    let cursor = -len - Math.floor(Math.random() * 3)
    while (cursor < COLS + len) {
      const gap = gapMin + Math.floor(Math.random() * (gapMax - gapMin + 1))
      row.entities.push({ x: cursor, w: len })
      cursor += len + gap
    }
  }

  function getRow(ty: number): Row {
    let r = rowsRef.current.get(ty)
    if (!r) {
      r = genRow(ty)
      rowsRef.current.set(ty, r)
    }
    return r
  }

  function reset(): void {
    // Return to start menu — game does not auto-begin
    rowsRef.current = new Map()
    frogRef.current = initialFrog()
    cameraTyRef.current = -2
    cameraTimerRef.current = 0
    aliveRef.current = true
    deathTimerRef.current = 0
    phaseRef.current = 'menu'
    inputQueueRef.current = []
    setScore(0)
    setPhase('menu')
    canvasRef.current?.focus()
  }

  function beginRun(): void {
    rowsRef.current = new Map()
    frogRef.current = initialFrog()
    cameraTyRef.current = -2
    cameraTimerRef.current = 0
    aliveRef.current = true
    deathTimerRef.current = 0
    phaseRef.current = 'playing'
    inputQueueRef.current = []
    setScore(0)
    setPhase('playing')
    canvasRef.current?.focus()
  }

  useEffect(() => {
    window.api.settings.get(SAVE_KEY, '0').then(v => setBest(parseInt(v, 10) || 0))
  }, [])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    function onKey(e: KeyboardEvent): void {
      if (document.activeElement !== canvasRef.current) return
      if (phaseRef.current === 'menu') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault(); e.stopPropagation()
          beginRun()
        }
        return
      }
      if (phaseRef.current === 'over') {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault(); e.stopPropagation()
          beginRun()
        }
        return
      }
      let d: 'up' | 'down' | 'left' | 'right' | null = null
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') d = 'up'
      else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') d = 'down'
      else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') d = 'left'
      else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') d = 'right'
      if (d) {
        e.preventDefault(); e.stopPropagation()
        if (inputQueueRef.current.length < 2) inputQueueRef.current.push(d)
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

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

  function tryHop(d: 'up' | 'down' | 'left' | 'right'): void {
    const f = frogRef.current
    let dx = 0, dy = 0
    if (d === 'up') dy = 1
    else if (d === 'down') dy = -1
    else if (d === 'left') dx = -1
    else dx = 1

    const newTx = f.tx + dx
    const newTy = f.ty + dy
    if (newTx < 0 || newTx >= COLS) return
    // Can't hop backwards below camera floor (would be off-screen)
    if (newTy < Math.ceil(cameraTyRef.current)) return

    // Spawn a "row" for the target if needed
    getRow(newTy)

    f.ridingRow = null
    f.ridingOffset = null
    f.hopping = true
    f.hopT = 0
    f.hopFromX = f.px
    f.hopFromY = (f.ty - cameraTyRef.current) * CELL    // (not used; we recompute screen y at draw)
    f.hopToX = newTx * CELL
    f.hopToY = (newTy - cameraTyRef.current) * CELL
    f.tx = newTx
    f.ty = newTy

    if (newTy > f.ty - 1 && newTy > 0 && newTy > score) {
      // score updates after landing — set in step
    }
  }

  function step(dt: number): void {
    if (phaseRef.current !== 'playing') return
    const f = frogRef.current

    // Consume one input per frame if not hopping
    if (!f.hopping && f.alive && inputQueueRef.current.length > 0) {
      const d = inputQueueRef.current.shift()
      if (d) tryHop(d)
    }

    // Update rows: advance entities and spawn new
    for (const row of rowsRef.current.values()) {
      if (row.speed === 0) continue
      for (const e of row.entities) e.x += row.dir * row.speed * dt

      // Cleanup entities that have left the playfield in their travel direction
      row.entities = row.entities.filter(e => {
        if (row.dir > 0) return e.x < COLS + 3            // moving right, remove once past right edge
        return e.x + e.w > -3                              // moving left, remove once past left edge
      })

      if (row.entityKind === 'train') {
        if (row.entities.length === 0) {
          row.gapAhead -= dt
          if (row.gapAhead <= 0) {
            const len = COLS + 4
            row.entities.push({ x: row.dir > 0 ? -len : COLS, w: len })
            row.gapAhead = 5 + Math.random() * 6
          }
        }
      } else {
        // Cars/logs/turtles: spawn from the TRAILING side
        const len = row.entityKind === 'log' ? 4 : row.entityKind === 'turtle' ? 2 : row.entityKind === 'truck' ? 2 : 1
        const isTruck = row.entityKind === 'truck'
        // Guarantee a passable gap of at least 3 tiles, more for trucks
        const gap = (isTruck ? 4 : 3) + Math.floor(Math.random() * 4)
        if (row.dir > 0) {
          const leftmost = row.entities.length === 0
            ? Infinity
            : row.entities.reduce((m, e) => Math.min(m, e.x), Infinity)
          // Spawn a new entity at -len when leftmost entity has moved at least `gap` tiles past -len
          if (leftmost > -len + gap) {
            row.entities.push({ x: -len, w: len })
          }
        } else {
          const rightmost = row.entities.length === 0
            ? -Infinity
            : row.entities.reduce((m, e) => Math.max(m, e.x + e.w), -Infinity)
          // Spawn at COLS when rightmost entity has moved at least `gap` tiles past COLS
          if (rightmost < COLS - gap) {
            row.entities.push({ x: COLS, w: len })
          }
        }
      }
    }

    // If frog is on a river row and not hopping, ride the log it's on
    if (!f.hopping && f.alive) {
      const row = rowsRef.current.get(f.ty)
      if (row && row.kind === 'river') {
        // If we just landed (no ridingOffset yet), find a log we're standing on and lock in
        if (f.ridingOffset === null || f.ridingRow !== f.ty) {
          const frogCenterTile = f.px / CELL + 0.5
          let landedOn: Entity | null = null
          for (const e of row.entities) {
            if (frogCenterTile >= e.x + HIT_INSET && frogCenterTile <= e.x + e.w - HIT_INSET) {
              landedOn = e
              break
            }
          }
          if (landedOn) {
            // Lock the frog to its current offset within the log
            f.ridingRow = f.ty
            f.ridingOffset = frogCenterTile - landedOn.x
          } else {
            die('drown')
          }
        }
        // Ride: position the frog at log.x + offset every frame. Find the log we're locked to.
        if (f.ridingOffset !== null) {
          // The log we're on must still contain our locked offset; otherwise drown
          let myLog: Entity | null = null
          for (const e of row.entities) {
            if (f.ridingOffset >= 0.15 && f.ridingOffset <= e.w - 0.15) {
              // matching log: the one whose x position keeps us under the same anchor
              const center = e.x + f.ridingOffset
              const centerPx = (center - 0.5) * CELL
              if (Math.abs(centerPx - f.px) < CELL * 0.6) {
                myLog = e
                break
              }
            }
          }
          if (!myLog) {
            // fallback: find any log overlapping our current tile center
            const frogCenterTile = f.px / CELL + 0.5
            for (const e of row.entities) {
              if (frogCenterTile >= e.x + HIT_INSET && frogCenterTile <= e.x + e.w - HIT_INSET) {
                myLog = e
                f.ridingOffset = frogCenterTile - e.x
                break
              }
            }
          }
          if (myLog && f.ridingOffset !== null) {
            const center = myLog.x + f.ridingOffset
            f.px = (center - 0.5) * CELL
            f.tx = Math.round(f.px / CELL)
            // off-screen drown
            if (f.px < -CELL * 0.5 || f.px > CANVAS_W - CELL * 0.5) die('drown')
          } else {
            die('drown')
          }
        }
      } else if (row && (row.kind === 'road' || row.kind === 'rail')) {
        f.ridingRow = null
        f.ridingOffset = null
        for (const e of row.entities) {
          if (f.tx + 0.5 > e.x + HIT_INSET && f.tx + 0.5 < e.x + e.w - HIT_INSET) {
            die('squish')
            break
          }
        }
      } else {
        f.ridingRow = null
        f.ridingOffset = null
      }
    }

    // Hop animation
    if (f.hopping) {
      f.hopT += dt
      const t = Math.min(1, f.hopT / HOP_TIME)
      f.px = f.hopFromX + (f.hopToX - f.hopFromX) * t
      if (t >= 1) {
        f.px = f.tx * CELL
        f.hopping = false
        // Landed — update score
        if (f.ty > score) setScore(f.ty)
        // Re-evaluate landing tile
        // (squish / drown checks happen in the non-hopping block on the next tick)
      }
    }

    // Camera follows the player smoothly and drifts upward to pressure idle frogs
    if (f.alive) {
      cameraTimerRef.current += dt
      // Smooth follow: lerp toward keeping the frog ~5 rows from top
      const followTarget = f.ty - (VIEW_ROWS - 5)
      if (followTarget > cameraTyRef.current) {
        const lerpSpeed = 4.0
        cameraTyRef.current += (followTarget - cameraTyRef.current) * Math.min(1, lerpSpeed * dt)
      }
      // After delay, camera drifts upward independently
      if (cameraTimerRef.current > CAMERA_START_DELAY) {
        const accel = Math.min(CAMERA_MAX_SPEED - CAMERA_BASE_SPEED, score * 0.018)
        const driftSpeed = CAMERA_BASE_SPEED + accel
        cameraTyRef.current += driftSpeed * dt
      }
      if (cameraTyRef.current > f.ty + 1) {
        die('caught')
      }
    }

    // Generate rows ahead of frog (preload ~8 rows above)
    const topVisible = Math.floor(cameraTyRef.current) + VIEW_ROWS + 4
    for (let ty = Math.floor(cameraTyRef.current) - 1; ty < topVisible; ty++) {
      getRow(ty)
    }
    // GC rows far below camera
    for (const key of rowsRef.current.keys()) {
      if (key < cameraTyRef.current - 4) rowsRef.current.delete(key)
    }

    // Death animation timer
    if (!f.alive) {
      deathTimerRef.current -= dt
      if (deathTimerRef.current <= 0) {
        // Finalize game over
        const final = score
        if (final > best) {
          setBest(final)
          window.api.settings.set(SAVE_KEY, String(final)).catch(() => {})
        }
        phaseRef.current = 'over'
        setPhase('over')
      }
    }
  }

  function die(_cause: string): void {
    const f = frogRef.current
    if (!f.alive) return
    f.alive = false
    deathTimerRef.current = 0.8
  }

  function draw(): void {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    const camFrac = cameraTyRef.current
    const camFloor = Math.floor(camFrac)
    const offY = (camFrac - camFloor) * CELL    // for smooth scroll

    ctx.fillStyle = '#0a1f10'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    // Draw rows (bottom-up: viewport row 0 = camFloor, viewport row VIEW_ROWS-1 = top)
    for (let vy = 0; vy < VIEW_ROWS + 1; vy++) {
      const ty = camFloor + vy
      const row = rowsRef.current.get(ty)
      if (!row) continue
      const screenY = CANVAS_H - (vy + 1) * CELL + offY
      drawRow(ctx, row, screenY)
    }

    // Frog
    const f = frogRef.current
    const screenY = CANVAS_H - (f.ty - camFloor + 1) * CELL + offY + (f.hopping ? hopArcY(f) : 0)
    if (f.alive) {
      drawFrog(ctx, f.px, screenY)
    } else {
      drawDeath(ctx, f.px, screenY)
    }

    // Top fade (where rows are still rendering above viewport)
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(0, 0, CANVAS_W, 2)
  }

  function hopArcY(f: FrogState): number {
    const t = Math.min(1, f.hopT / HOP_TIME)
    return -Math.sin(t * Math.PI) * 12
  }

  function drawRow(ctx: CanvasRenderingContext2D, row: Row, screenY: number): void {
    if (row.kind === 'grass') {
      ctx.fillStyle = row.ty === 0 ? '#16a34a' : (row.ty % 2 === 0 ? '#15803d' : '#166534')
      ctx.fillRect(0, screenY, CANVAS_W, CELL)
      // Decorations: small flowers
      for (let i = 0; i < COLS; i++) {
        const seed = (row.ty * 31 + i * 7) % 13
        if (seed < 2) {
          ctx.fillStyle = '#fef08a'
          ctx.beginPath()
          ctx.arc(i * CELL + CELL / 2, screenY + CELL / 2, 2, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    } else if (row.kind === 'road') {
      ctx.fillStyle = '#1f1f1f'
      ctx.fillRect(0, screenY, CANVAS_W, CELL)
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.4)'
      ctx.setLineDash([8, 8])
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, screenY + CELL / 2)
      ctx.lineTo(CANVAS_W, screenY + CELL / 2)
      ctx.stroke()
      ctx.setLineDash([])
      for (const e of row.entities) drawCar(ctx, e.x * CELL, screenY, e.w, row.entityKind === 'truck')
    } else if (row.kind === 'river') {
      ctx.fillStyle = '#1e3a8a'
      ctx.fillRect(0, screenY, CANVAS_W, CELL)
      // Wave shimmer
      ctx.fillStyle = 'rgba(96, 165, 250, 0.15)'
      for (let i = 0; i < COLS; i++) {
        const seed = (row.ty * 53 + i * 11) % 7
        if (seed < 2) ctx.fillRect(i * CELL + 4, screenY + CELL / 2 + 2, CELL - 8, 1)
      }
      for (const e of row.entities) {
        if (row.entityKind === 'log') drawLog(ctx, e.x * CELL, screenY, e.w)
        else drawTurtles(ctx, e.x * CELL, screenY, e.w)
      }
    } else if (row.kind === 'rail') {
      ctx.fillStyle = '#44403c'
      ctx.fillRect(0, screenY, CANVAS_W, CELL)
      // tracks
      ctx.strokeStyle = '#a8a29e'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, screenY + CELL / 2 - 4)
      ctx.lineTo(CANVAS_W, screenY + CELL / 2 - 4)
      ctx.moveTo(0, screenY + CELL / 2 + 4)
      ctx.lineTo(CANVAS_W, screenY + CELL / 2 + 4)
      ctx.stroke()
      // ties
      ctx.fillStyle = '#1c1917'
      for (let i = 0; i < COLS * 2; i++) {
        ctx.fillRect(i * (CELL / 2) + 4, screenY + 4, 6, CELL - 8)
      }
      for (const e of row.entities) {
        ctx.fillStyle = '#dc2626'
        ctx.fillRect(e.x * CELL, screenY + 4, e.w * CELL, CELL - 8)
        ctx.fillStyle = '#fbbf24'
        ctx.fillRect(e.x * CELL + 2, screenY + 8, 6, 4)
      }
    }
  }

  function drawCar(ctx: CanvasRenderingContext2D, x: number, y: number, lenTiles: number, isTruck: boolean): void {
    const w = lenTiles * CELL - 4
    const pad = 4
    if (isTruck) {
      ctx.fillStyle = '#dc2626'
      ctx.fillRect(x + 2, y + pad, w, CELL - pad * 2)
      ctx.fillStyle = '#7f1d1d'
      ctx.fillRect(x + 2, y + pad, w * 0.3, CELL - pad * 2)
      ctx.fillStyle = '#fde68a'
      ctx.fillRect(x + 4, y + pad + 4, 5, 4)
    } else {
      ctx.fillStyle = '#f59e0b'
      ctx.fillRect(x + 2, y + pad, w, CELL - pad * 2)
      ctx.fillStyle = '#fef3c7'
      ctx.fillRect(x + 6, y + pad + 4, w - 12, 5)
    }
    ctx.fillStyle = '#0a0a0a'
    ctx.fillRect(x + 4, y + CELL - pad - 2, 4, 2)
    ctx.fillRect(x + w - 4, y + CELL - pad - 2, 4, 2)
  }

  function drawLog(ctx: CanvasRenderingContext2D, x: number, y: number, lenTiles: number): void {
    const w = lenTiles * CELL
    const pad = 5
    ctx.fillStyle = '#7c4a1e'
    ctx.fillRect(x, y + pad, w, CELL - pad * 2)
    ctx.fillStyle = '#4a2c10'
    for (let i = 0; i < lenTiles; i++) {
      ctx.beginPath()
      ctx.arc(x + i * CELL + 4, y + CELL / 2, 3, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.strokeStyle = '#4a2c10'
    ctx.lineWidth = 1
    for (let i = 1; i < lenTiles; i++) {
      ctx.beginPath()
      ctx.moveTo(x + i * CELL, y + pad)
      ctx.lineTo(x + i * CELL, y + CELL - pad)
      ctx.stroke()
    }
  }

  function drawTurtles(ctx: CanvasRenderingContext2D, x: number, y: number, lenTiles: number): void {
    for (let i = 0; i < lenTiles; i++) {
      const cx = x + i * CELL + CELL / 2
      const cy = y + CELL / 2
      ctx.fillStyle = '#16a34a'
      ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.42, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#14532d'
      ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.24, 0, Math.PI * 2); ctx.fill()
      // hexagon pattern
      ctx.strokeStyle = '#052e16'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(cx, cy, CELL * 0.24, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  function drawFrog(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    const cx = px + CELL / 2, cy = py + CELL / 2
    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)'
    ctx.beginPath(); ctx.ellipse(cx, py + CELL - 4, CELL * 0.35, 4, 0, 0, Math.PI * 2); ctx.fill()
    // body
    ctx.fillStyle = '#4ade80'
    ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.34, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#16a34a'
    ctx.beginPath(); ctx.arc(cx, cy + 2, CELL * 0.26, 0, Math.PI * 2); ctx.fill()
    // eyes (top)
    ctx.fillStyle = '#fef3c7'
    ctx.beginPath()
    ctx.arc(cx - 6, cy - 7, 4, 0, Math.PI * 2)
    ctx.arc(cx + 6, cy - 7, 4, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#0a0a0a'
    ctx.beginPath()
    ctx.arc(cx - 6, cy - 7, 2, 0, Math.PI * 2)
    ctx.arc(cx + 6, cy - 7, 2, 0, Math.PI * 2)
    ctx.fill()
    // legs
    ctx.fillStyle = '#15803d'
    ctx.beginPath(); ctx.arc(cx - 11, cy + 6, 4, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(cx + 11, cy + 6, 4, 0, Math.PI * 2); ctx.fill()
  }

  function drawDeath(ctx: CanvasRenderingContext2D, px: number, py: number): void {
    const cx = px + CELL / 2, cy = py + CELL / 2
    ctx.fillStyle = '#dc2626'
    ctx.beginPath(); ctx.arc(cx, cy, CELL * 0.35, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 18px ui-monospace, monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('✕', cx, cy)
  }

  return (
    <div className={styles.body}>
      <div className={styles.header}>
        <span>Score <strong>{score}</strong></span>
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
      <div className={styles.hint}>Arrow keys or WASD to hop · keep moving forward · cars squish · river drowns</div>
      {phase === 'menu' && (
        <div className={styles.overlay}>
          <div className={styles.title}>FROGGER</div>
          <div className={styles.subtitle}>
            Hop forward to set distance records.<br />
            Cars squish · rivers drown · don't fall behind the camera.
          </div>
          <button className={styles.btn} onClick={beginRun}>Start</button>
          {best > 0 && <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>Best: {best}</div>}
        </div>
      )}
      {phase === 'over' && (
        <div className={styles.overlay}>
          <div className={styles.title}>GAME OVER</div>
          <div className={styles.subtitle}>{score} tiles · {best > score ? `best ${best}` : 'new best!'}</div>
          <button className={styles.btn} onClick={reset}>New Game</button>
        </div>
      )}
    </div>
  )
}
