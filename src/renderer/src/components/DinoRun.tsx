import { useEffect, useRef, useState } from 'react'
import styles from './DinoRun.module.css'

// Phase 2: physics + chunked heightmap terrain + jump + death pits.

const W = 720
const H = 360
const GROUND_Y = 300            // baseline ground Y on screen
const PIT_Y = 10000             // sentinel groundY for death pits
const PLAYER_SCREEN_X = 180     // dino's fixed screen X

const SCROLL_SPEED = 260        // px/s world scroll
const RUN_FRAME_HZ = 12

const SCALE = 2
const DINO_W = 20
const DINO_H = 14
const DINO_PX_W = DINO_W * SCALE
const DINO_PX_H = DINO_H * SCALE

// Physics
const GRAVITY = 1800            // px/s²
const JUMP_VY = -620            // px/s
const JUMP_CUT_VY = -240        // when releasing jump while ascending, clamp vy here
const COYOTE_MS = 100
const BUFFER_MS = 130

// Terrain chunks
const COL_W = 8                 // px per heightmap column
const CHUNK_COLS = 32
const CHUNK_WIDTH = COL_W * CHUNK_COLS    // 256 px

type Phase = 'title' | 'playing' | 'dead'

interface Star { x: number; y: number; r: number }
interface Mountain { x: number; w: number; h: number; shade: number }
interface Tree { x: number; h: number; kind: 0 | 1 }

interface Player {
  y: number          // top-left y of sprite
  vy: number
  grounded: boolean
  coyote: number     // ms remaining
  buffer: number     // ms remaining
}

export default function DinoRun(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number | null>(null)
  const lastFrameRef = useRef(0)

  const phaseRef = useRef<Phase>('title')
  const [phaseUI, setPhaseUI] = useState<Phase>('title')

  const cameraXRef = useRef(0)
  const runPhaseRef = useRef(0)
  const starsRef = useRef<Star[]>(makeStars())
  const farMountainsRef = useRef<Mountain[]>(makeMountains(0))
  const nearMountainsRef = useRef<Mountain[]>(makeMountains(1))
  const treesRef = useRef<Tree[]>(makeTrees())

  const chunksRef = useRef<Map<number, number[]>>(new Map())
  const playerRef = useRef<Player>({
    y: GROUND_Y - DINO_PX_H, vy: 0, grounded: true, coyote: 0, buffer: 0
  })
  const distanceRef = useRef(0)
  const [distanceUI, setDistanceUI] = useState(0)

  const [bestUI, setBestUI] = useState<{ distance: number; eggs: number }>({ distance: 0, eggs: 0 })
  const bestRef = useRef(bestUI)
  useEffect(() => { bestRef.current = bestUI }, [bestUI])

  useEffect(() => {
    void window.api.settings.get('dinoRunBest', '{}').then(v => {
      try {
        const d = JSON.parse(v) as { distance?: number; eggs?: number }
        const next = { distance: d.distance ?? 0, eggs: d.eggs ?? 0 }
        setBestUI(next)
        bestRef.current = next
      } catch { /* ignore */ }
    })
    canvasRef.current?.focus()
  }, [])

  function resetRun(): void {
    chunksRef.current = new Map()
    // Seed first few chunks as flat so the player has a soft start.
    for (let i = 0; i < 3; i++) chunksRef.current.set(i, flatChunk())
    cameraXRef.current = 0
    distanceRef.current = 0
    setDistanceUI(0)
    runPhaseRef.current = 0
    playerRef.current = {
      y: GROUND_Y - DINO_PX_H, vy: 0, grounded: true, coyote: 0, buffer: 0
    }
    phaseRef.current = 'playing'
    setPhaseUI('playing')
    canvasRef.current?.focus()
  }

  function dieRun(): void {
    phaseRef.current = 'dead'
    setPhaseUI('dead')
    const distance = distanceRef.current
    if (distance > bestRef.current.distance) {
      const next = { distance, eggs: bestRef.current.eggs }
      bestRef.current = next
      setBestUI(next)
      void window.api.settings.set('dinoRunBest', JSON.stringify(next))
    }
  }

  useEffect(() => {
    // No focus filter — when this component is mounted the user has the card open.
    function onKey(e: KeyboardEvent): void {
      const p = phaseRef.current
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.preventDefault(); e.stopPropagation()
        if (p === 'title' || p === 'dead') {
          if (!e.repeat) resetRun()
        } else {
          if (!e.repeat) playerRef.current.buffer = BUFFER_MS
        }
      }
    }
    function onKeyUp(e: KeyboardEvent): void {
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        e.stopPropagation()
        const pl = playerRef.current
        if (pl.vy < JUMP_CUT_VY) pl.vy = JUMP_CUT_VY
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

  function ensureChunks(): void {
    const cam = cameraXRef.current
    const aheadEnd = Math.floor((cam + W * 2) / CHUNK_WIDTH) + 1
    let lastIdx = -1
    for (const k of chunksRef.current.keys()) if (k > lastIdx) lastIdx = k
    for (let i = lastIdx + 1; i <= aheadEnd; i++) {
      chunksRef.current.set(i, makeChunk(i))
    }
    // Drop chunks well behind camera.
    const behind = Math.floor((cam - CHUNK_WIDTH * 2) / CHUNK_WIDTH)
    for (const k of [...chunksRef.current.keys()]) {
      if (k < behind) chunksRef.current.delete(k)
    }
  }

  function groundAt(worldX: number): number {
    const ci = Math.floor(worldX / CHUNK_WIDTH)
    const local = Math.floor((worldX - ci * CHUNK_WIDTH) / COL_W)
    const chunk = chunksRef.current.get(ci)
    if (!chunk) return GROUND_Y
    const idx = Math.max(0, Math.min(CHUNK_COLS - 1, local))
    return chunk[idx]
  }

  // Ground Y directly under the player's center — what they're standing on.
  function centerGround(): number {
    const cam = cameraXRef.current
    return groundAt(cam + PLAYER_SCREEN_X + DINO_PX_W / 2)
  }

  // Ground Y at the player's front (leading) edge — used for wall detection.
  function frontGround(): number {
    const cam = cameraXRef.current
    return groundAt(cam + PLAYER_SCREEN_X + DINO_PX_W - 4)
  }

  function step(dt: number): void {
    if (phaseRef.current !== 'playing') {
      // Scenery still scrolls on title for life — but freeze on death.
      if (phaseRef.current === 'title') idleScenery(dt)
      return
    }

    cameraXRef.current += SCROLL_SPEED * dt
    distanceRef.current = Math.floor(cameraXRef.current / 10)
    if (distanceRef.current !== distanceUI) setDistanceUI(distanceRef.current)

    ensureChunks()

    const pl = playerRef.current

    // Decay timers.
    pl.buffer = Math.max(0, pl.buffer - dt * 1000)
    pl.coyote = Math.max(0, pl.coyote - dt * 1000)

    // Jump trigger.
    if (pl.buffer > 0 && (pl.grounded || pl.coyote > 0)) {
      pl.vy = JUMP_VY
      pl.grounded = false
      pl.coyote = 0
      pl.buffer = 0
    }

    // Vertical integration.
    pl.vy += GRAVITY * dt
    pl.y += pl.vy * dt

    // Wall collision — if grounded and the FRONT of the player meets ground
    // significantly above the current feet, you've smashed into a wall.
    if (pl.grounded) {
      const fg = frontGround()
      const feetY = pl.y + DINO_PX_H
      if (fg < PIT_Y - 1 && feetY - fg > 10) {
        dieRun(); return
      }
    }

    // Ground / pit at player's center.
    const ground = centerGround()
    if (ground >= PIT_Y - 1) {
      // Over a pit. Jumping over is fine — only kill if the dino's feet have
      // dropped to the pit lip or below (i.e. couldn't clear it).
      pl.grounded = false
      if (pl.y + DINO_PX_H > GROUND_Y - 2) { dieRun(); return }
    } else {
      const feetTarget = ground - DINO_PX_H
      if (pl.vy >= 0 && pl.y >= feetTarget) {
        // Walking-into-a-wall case is caught by the front check above; here
        // we only see legitimate landings (from a jump) or no-op snapping.
        pl.y = feetTarget
        pl.vy = 0
        if (!pl.grounded) {
          pl.grounded = true
          pl.coyote = COYOTE_MS
        }
      } else if (pl.grounded && pl.y < feetTarget - 1) {
        // Walked off a ledge — start coyote grace.
        pl.grounded = false
        pl.coyote = COYOTE_MS
      }
    }

    // Run-cycle animation only when grounded.
    if (pl.grounded) {
      runPhaseRef.current = (runPhaseRef.current + dt * RUN_FRAME_HZ) % 4
    } else {
      runPhaseRef.current = 0   // freeze on contact pose while airborne
    }

    idleScenery(dt)
  }

  function idleScenery(dt: number): void {
    const camX = cameraXRef.current
    for (const m of farMountainsRef.current) {
      const screenX = m.x - camX * 0.15
      if (screenX + m.w < -20) m.x += W * 1.6
    }
    for (const m of nearMountainsRef.current) {
      const screenX = m.x - camX * 0.35
      if (screenX + m.w < -20) m.x += W * 1.4
    }
    for (const t of treesRef.current) {
      const screenX = t.x - camX
      if (screenX < -40) t.x += W + 40 + Math.random() * 120
    }
    // Slow drift on title screen so it isn't dead-still.
    if (phaseRef.current === 'title') cameraXRef.current += 40 * dt
  }

  function draw(): void {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')
    if (!ctx) return
    ctx.imageSmoothingEnabled = false

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, GROUND_Y)
    sky.addColorStop(0, '#1a2942')
    sky.addColorStop(0.6, '#4a5b7a')
    sky.addColorStop(1, '#c8966a')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, W, GROUND_Y)

    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    for (const s of starsRef.current) {
      if (s.y < GROUND_Y - 120) ctx.fillRect(Math.floor(s.x), Math.floor(s.y), s.r, s.r)
    }

    const camX = cameraXRef.current

    for (const m of farMountainsRef.current) {
      const sx = Math.floor(m.x - camX * 0.15)
      drawMountain(ctx, sx, GROUND_Y - m.h, m.w, m.h, `rgb(${30 + m.shade}, ${40 + m.shade}, ${60 + m.shade})`)
    }
    for (const m of nearMountainsRef.current) {
      const sx = Math.floor(m.x - camX * 0.35)
      drawMountain(ctx, sx, GROUND_Y - m.h, m.w, m.h, `rgb(${22 + m.shade}, ${50 + m.shade}, ${36 + m.shade})`)
    }

    // Abyss — dark fill below ground line so pits appear as visible voids
    // instead of stale-frame artifacts.
    ctx.fillStyle = '#06060e'
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y)

    // Heightmap-based ground (per-column dirt + grass strip).
    const startWorld = camX
    const startCol = Math.floor(startWorld / COL_W)
    const endCol = Math.ceil((startWorld + W) / COL_W)
    for (let c = startCol; c <= endCol; c++) {
      const worldX = c * COL_W
      const g = groundAt(worldX)
      if (g >= PIT_Y - 1) continue   // pit — abyss shows
      const screenX = Math.floor(worldX - camX)
      ctx.fillStyle = '#2d3d1f'
      ctx.fillRect(screenX, g, COL_W, H - g)
      ctx.fillStyle = '#3b5a2a'
      ctx.fillRect(screenX, g, COL_W, 3)
    }

    // Subtle scroll stripes
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)'
    const stripe = 40
    const off = -(camX % stripe)
    for (let x = off; x < W; x += stripe) {
      ctx.fillRect(Math.floor(x), GROUND_Y + 18, 20, 2)
    }

    for (const t of treesRef.current) {
      const sx = Math.floor(t.x - camX)
      if (sx > -40 && sx < W + 20) drawTree(ctx, sx, GROUND_Y, t.h, t.kind)
    }

    // Dino
    const pl = playerRef.current
    const frame = Math.floor(runPhaseRef.current)
    drawDino(ctx, PLAYER_SCREEN_X, Math.floor(pl.y), frame)

    // HUD
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
    ctx.font = 'bold 14px monospace'
    ctx.textAlign = 'right'
    ctx.fillText(`${distanceRef.current}`, W - 12, 22)
    ctx.textAlign = 'left'
    ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
    ctx.font = 'bold 10px monospace'
    ctx.fillText('DISTANCE', W - 100, 22)

    // Overlays — read from refs to avoid stale closures inside the RAF loop.
    const ph = phaseRef.current
    if (ph === 'title') drawTitleOverlay(ctx, bestRef.current.distance)
    if (ph === 'dead') drawDeathOverlay(ctx, distanceRef.current, bestRef.current.distance)
  }

  return (
    <div className={styles.body}>
      <div className={styles.header}>
        <span>distance <strong>{distanceUI}</strong></span>
        {bestUI.distance > 0 && <span>best <strong>{bestUI.distance}</strong></span>}
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className={styles.canvas}
        tabIndex={0}
        onClick={() => canvasRef.current?.focus()}
      />
      <div className={styles.hint}>Space / ↑ to jump · click the canvas to focus</div>
    </div>
  )
}

// ── Sprite & scenery drawing ────────────────────────────────────────────

// Pixeljam-style dino: simple flat-color silhouette, bipedal, white eye dot.
// Palette keys: '.' transparent  'D' body  'E' eye white  'P' pupil
const DINO_PALETTE: Record<string, string> = {
  D: '#2a6e8a',  // single body color (teal-blue)
  E: '#ffffff',
  P: '#0a0a14'
}

// Sleek dino silhouette: small head, thin S-curve neck, slim body, long tail.
// 4 full sprites — head/body identical, legs vary per frame.
// Body row 9 narrowed to a hip so legs visibly hang below.
// 4-frame run cycle: contact-right → pass → contact-left → pass.
// Passing frames bob body DOWN 1 px (head/body shifted down 1 row) — the
// "up-and-down" rhythm that makes a run read as a run instead of a slide.
// Legs are tapered (2 px hip → 1 px toe), bird-style for the raptor silhouette.
const DINO_FRAMES: string[][] = [
  [ // 0 — CONTACT: front leg planted forward, back leg lifted+bent up
    '...............DDDD.',
    '..............DDDDDD',
    '..............DDEPDD',
    '..............DDDDD.',
    '.............DDDD...',
    '...........DDDDD....',
    '........DDDDDDD.....',
    '...DDDDDDDDDDDD.....',
    'DDDDDDDDDDDDDD......',
    '.DDDDDDDDDDD........',
    '......DD...DD.......', // back upper + front upper
    '......D....DD.......', // back lifting + front
    '............D.......', // front tapers, leaning forward
    '............D.......'  // front toe at ground (col 12)
  ],
  [ // 1 — PASS: body bobbed down 1 px, both legs vertical under hip
    '....................',
    '...............DDDD.',
    '..............DDDDDD',
    '..............DDEPDD',
    '..............DDDDD.',
    '.............DDDD...',
    '...........DDDDD....',
    '........DDDDDDD.....',
    '...DDDDDDDDDDDD.....',
    'DDDDDDDDDDDDDD......',
    '.DDDDDDDDDDD........', // hip at row 10
    '......DD..DD........', // both thighs
    '.......D...D........', // tapering
    '.......D...D........'  // toes (cols 7, 11)
  ],
  [ // 2 — CONTACT mirror: back leg planted, front leg lifted+bent
    '...............DDDD.',
    '..............DDDDDD',
    '..............DDEPDD',
    '..............DDDDD.',
    '.............DDDD...',
    '...........DDDDD....',
    '........DDDDDDD.....',
    '...DDDDDDDDDDDD.....',
    'DDDDDDDDDDDDDD......',
    '.DDDDDDDDDDD........',
    '......DD...DD.......', // back upper + front upper
    '......DD...D........', // back + front lifting
    '.....D..............', // back tapers, leaning back
    '.....D..............'  // back toe at ground (col 5)
  ],
  [ // 3 — PASS: same as frame 1
    '....................',
    '...............DDDD.',
    '..............DDDDDD',
    '..............DDEPDD',
    '..............DDDDD.',
    '.............DDDD...',
    '...........DDDDD....',
    '........DDDDDDD.....',
    '...DDDDDDDDDDDD.....',
    'DDDDDDDDDDDDDD......',
    '.DDDDDDDDDDD........',
    '......DD..DD........',
    '.......D...D........',
    '.......D...D........'
  ]
]

function drawDino(ctx: CanvasRenderingContext2D, x: number, y: number, frame: number): void {
  renderSprite(ctx, DINO_FRAMES[frame % DINO_FRAMES.length], x, y, 0)
}

function renderSprite(
  ctx: CanvasRenderingContext2D, rows: string[], x: number, y: number, rowOffset: number
): void {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r]
    for (let c = 0; c < row.length; c++) {
      const ch = row[c]
      const color = DINO_PALETTE[ch]
      if (!color) continue
      ctx.fillStyle = color
      ctx.fillRect(x + c * SCALE, y + (r + rowOffset) * SCALE, SCALE, SCALE)
    }
  }
}

function drawMountain(
  ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string
): void {
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x, y + h)
  ctx.lineTo(x + w * 0.4, y)
  ctx.lineTo(x + w * 0.55, y + h * 0.2)
  ctx.lineTo(x + w * 0.75, y + h * 0.05)
  ctx.lineTo(x + w, y + h)
  ctx.closePath()
  ctx.fill()
}

function drawTree(
  ctx: CanvasRenderingContext2D, x: number, groundY: number, h: number, kind: 0 | 1
): void {
  // Simple pine: dark trunk + layered triangle
  const trunkW = 4
  ctx.fillStyle = '#2a1e10'
  ctx.fillRect(x - trunkW / 2, groundY - 6, trunkW, 6)
  const leafColor = kind === 0 ? '#1f4a2a' : '#266234'
  ctx.fillStyle = leafColor
  ctx.beginPath()
  ctx.moveTo(x, groundY - h)
  ctx.lineTo(x - h * 0.5, groundY - 4)
  ctx.lineTo(x + h * 0.5, groundY - 4)
  ctx.closePath()
  ctx.fill()
  // Highlight stripe
  ctx.fillStyle = kind === 0 ? '#2c6638' : '#358243'
  ctx.beginPath()
  ctx.moveTo(x, groundY - h + 4)
  ctx.lineTo(x - h * 0.3, groundY - 6)
  ctx.lineTo(x + h * 0.3, groundY - 6)
  ctx.closePath()
  ctx.fill()
}

// ── Scenery generators ──────────────────────────────────────────────────

function makeStars(): Star[] {
  const out: Star[] = []
  for (let i = 0; i < 60; i++) {
    out.push({
      x: Math.random() * W,
      y: Math.random() * (GROUND_Y - 40),
      r: Math.random() < 0.7 ? 1 : 2
    })
  }
  return out
}

function makeMountains(layer: 0 | 1): Mountain[] {
  const out: Mountain[] = []
  const baseH = layer === 0 ? 120 : 90
  const baseW = layer === 0 ? 260 : 200
  for (let i = 0; i < 4; i++) {
    out.push({
      x: i * (W / 2),
      w: baseW + Math.random() * 60,
      h: baseH + Math.random() * 40,
      shade: Math.floor(Math.random() * 20)
    })
  }
  return out
}

function makeTrees(): Tree[] {
  const out: Tree[] = []
  let x = 80
  while (x < W + 200) {
    out.push({
      x,
      h: 36 + Math.random() * 28,
      kind: Math.random() < 0.5 ? 0 : 1
    })
    x += 80 + Math.random() * 110
  }
  return out
}

// ── Terrain chunks ──────────────────────────────────────────────────────

// All chunks open and close at GROUND_Y so they chain together seamlessly.
// "Rolling" base = gentle sine, slope < 10 px/col so it's all walkable.
// "Rock" = narrow sharp obstacle (must jump). "Pit" = death gap.

function rollingBase(seed: number): number[] {
  const arr = new Array<number>(CHUNK_COLS)
  const amp = 6 + (seed % 7)           // 6-12 px amplitude
  const freq = 0.35 + ((seed * 13) % 25) / 100
  const phase = ((seed * 7) % 100) / 100 * Math.PI * 2
  for (let i = 0; i < CHUNK_COLS; i++) {
    // Taper amplitude at edges so chunk starts/ends near GROUND_Y.
    const edgeFade = Math.min(1, Math.min(i, CHUNK_COLS - 1 - i) / 4)
    const lift = Math.sin(i * freq + phase) * amp * edgeFade
    arr[i] = Math.round(GROUND_Y - lift)
  }
  arr[0] = GROUND_Y
  arr[CHUNK_COLS - 1] = GROUND_Y
  return arr
}

function flatChunk(): number[] {
  return new Array(CHUNK_COLS).fill(GROUND_Y)
}

function rollingChunk(seed: number): number[] {
  return rollingBase(seed)
}

function rockChunk(seed: number): number[] {
  // Narrow obstacle (2-3 cols, sharp sides) on a rolling base. Must be jumped.
  const arr = rollingBase(seed)
  const center = 11 + (seed % 10)
  const halfW = 1 + (seed % 2)         // 2-3 cols total
  const height = 24 + (seed % 14)      // 24-37 px
  for (let i = center - halfW; i <= center + halfW; i++) {
    if (i >= 0 && i < CHUNK_COLS) arr[i] = Math.min(arr[i], GROUND_Y - height)
  }
  return arr
}

function twinRocksChunk(seed: number): number[] {
  const arr = rollingBase(seed)
  const c1 = 7 + (seed % 4)
  const c2 = c1 + 9 + ((seed >> 3) % 5)
  const h1 = 22 + (seed % 10)
  const h2 = 22 + ((seed >> 2) % 12)
  for (const [c, h] of [[c1, h1], [c2, h2]] as const) {
    for (let i = c - 1; i <= c + 1; i++) {
      if (i >= 0 && i < CHUNK_COLS) arr[i] = Math.min(arr[i], GROUND_Y - h)
    }
  }
  return arr
}

function pitSmallChunk(seed: number): number[] {
  const arr = rollingBase(seed)
  const start = 12 + (seed % 6)
  const width = 5 + (seed % 3)
  // Flatten ramps on either side so the pit edges are crisp.
  for (let i = start - 2; i < start + width + 2 && i < CHUNK_COLS; i++) {
    if (i >= 0) arr[i] = GROUND_Y
  }
  for (let i = start; i < start + width && i < CHUNK_COLS; i++) arr[i] = PIT_Y
  return arr
}

function pitWideChunk(seed: number): number[] {
  const arr = flatChunk()
  const start = 10 + (seed % 4)
  const width = 9 + (seed % 3)
  for (let i = start; i < start + width && i < CHUNK_COLS; i++) arr[i] = PIT_Y
  return arr
}

function rampPlateauChunk(seed: number): number[] {
  // Walkable ramp up to plateau, sharp drop on the far side back to baseline.
  const arr = flatChunk()
  const rampStart = 3 + (seed % 3)
  const rampCols = 5
  const plateauH = 28 + (seed % 12)
  // Ramp: ~5-8 px/col rise — walkable (under the 10-px wall threshold).
  for (let i = 0; i < rampCols; i++) {
    const t = (i + 1) / rampCols
    arr[rampStart + i] = Math.round(GROUND_Y - t * plateauH)
  }
  const plateauStart = rampStart + rampCols
  const plateauEnd = plateauStart + 8 + (seed % 4)
  for (let i = plateauStart; i < plateauEnd && i < CHUNK_COLS; i++) {
    arr[i] = GROUND_Y - plateauH
  }
  // After the plateau: instant drop to baseline (the dino falls off).
  return arr
}

function pitWithLedgeChunk(seed: number): number[] {
  // Pit followed by a raised landing ledge — must jump high AND far.
  const arr = flatChunk()
  const pitStart = 8 + (seed % 3)
  const pitWidth = 6 + (seed % 2)
  for (let i = pitStart; i < pitStart + pitWidth; i++) arr[i] = PIT_Y
  const ledgeStart = pitStart + pitWidth
  const ledgeEnd = ledgeStart + 8
  const lift = 22 + (seed % 14)
  for (let i = ledgeStart; i < ledgeEnd && i < CHUNK_COLS; i++) {
    arr[i] = GROUND_Y - lift
  }
  return arr
}

function valleyChunk(seed: number): number[] {
  // A dip below baseline — purely cosmetic challenge, still walkable.
  const arr = flatChunk()
  const depth = 12 + (seed % 8)
  const center = CHUNK_COLS / 2
  for (let i = 0; i < CHUNK_COLS; i++) {
    const d = Math.abs(i - center) / center
    const dip = Math.max(0, Math.cos(d * Math.PI / 2)) * depth
    arr[i] = Math.round(GROUND_Y + dip)
  }
  arr[0] = GROUND_Y
  arr[CHUNK_COLS - 1] = GROUND_Y
  return arr
}

function makeChunk(idx: number): number[] {
  if (idx < 3) return flatChunk()    // soft start
  const seed = idx * 2654435761 >>> 0 // cheap hash
  const roll = Math.random()
  if (roll < 0.20) return rollingChunk(seed)
  if (roll < 0.38) return rockChunk(seed)
  if (roll < 0.53) return pitSmallChunk(seed)
  if (roll < 0.66) return twinRocksChunk(seed)
  if (roll < 0.77) return rampPlateauChunk(seed)
  if (roll < 0.86) return valleyChunk(seed)
  if (roll < 0.94) return pitWideChunk(seed)
  return pitWithLedgeChunk(seed)
}

// ── Overlays ────────────────────────────────────────────────────────────

function drawTitleOverlay(ctx: CanvasRenderingContext2D, bestDistance: number): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)'
  ctx.fillRect(0, 0, W, H)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#4ade80'
  ctx.font = 'bold 44px monospace'
  ctx.fillText('DINO RUN', W / 2, 130)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.7)'
  ctx.font = 'bold 14px monospace'
  ctx.fillText('escape extinction', W / 2, 160)
  ctx.fillStyle = '#e8b44b'
  ctx.font = 'bold 16px monospace'
  ctx.fillText('press SPACE to start', W / 2, 220)
  if (bestDistance > 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.font = 'bold 12px monospace'
    ctx.fillText(`best distance — ${bestDistance}`, W / 2, 250)
  }
  ctx.fillStyle = 'rgba(255, 255, 255, 0.4)'
  ctx.font = '11px monospace'
  ctx.fillText('Space / ↑ jump · hold for higher jump', W / 2, 295)
  ctx.textAlign = 'left'
}

function drawDeathOverlay(ctx: CanvasRenderingContext2D, distance: number, best: number): void {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'
  ctx.fillRect(0, 0, W, H)
  ctx.textAlign = 'center'
  ctx.fillStyle = '#ef4444'
  ctx.font = 'bold 32px monospace'
  ctx.fillText('EXTINCT', W / 2, 130)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)'
  ctx.font = 'bold 14px monospace'
  ctx.fillText(`distance — ${distance}`, W / 2, 170)
  if (best > 0) {
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)'
    ctx.font = '12px monospace'
    ctx.fillText(`best — ${best}`, W / 2, 192)
  }
  ctx.fillStyle = '#e8b44b'
  ctx.font = 'bold 16px monospace'
  ctx.fillText('press SPACE to run again', W / 2, 240)
  ctx.textAlign = 'left'
}
