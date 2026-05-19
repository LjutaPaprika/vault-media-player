import { useEffect, useRef, useState } from 'react'
import styles from './Pacman.module.css'

const SAVE_KEY = 'pacmanHighScore'
const CELL = 18
const LIVES_INITIAL = 3
const POWER_DURATION = 420       // frames (~7s @ 60fps)
const PACMAN_SPEED = 0.075       // cells per frame — authentic arcade pace
const GHOST_SPEED = 0.07
const GHOST_FRIGHTENED_SPEED = 0.045
const PELLET_SCORE = 10
const POWER_SCORE = 50
const GHOST_SCORE_BASE = 200      // 200, 400, 800, 1600 for consecutive eats
const COUNTDOWN_FRAMES = 180      // 3 seconds at 60fps

// Authentic Pac-Man maze (28 cols x 31 rows). Adapted from the canonical
// arcade layout. Tunnel wrap is row 14.
//   # wall    . pellet    o power pellet
//   - ghost-house door (ghosts pass, pacman can't from outside)
//   P pacman spawn       G ghost spawn (becomes floor)
//   (space) corridor with no pellet
const MAZE_RAW = [
  '############################',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#o####.#####.##.#####.####o#',
  '#.####.#####.##.#####.####.#',
  '#..........................#',
  '#.####.##.########.##.####.#',
  '#.####.##.########.##.####.#',
  '#......##....##....##......#',
  '######.##### ## #####.######',
  '     #.##### ## #####.#     ',
  '     #.##          ##.#     ',
  '     #.## ###--### ##.#     ',
  '######.## #      # ##.######',
  '      .   #GGGGGG#   .      ',
  '######.## #      # ##.######',
  '     #.## ######## ##.#     ',
  '     #.##          ##.#     ',
  '     #.## ######## ##.#     ',
  '######.## ######## ##.######',
  '#............##............#',
  '#.####.#####.##.#####.####.#',
  '#.####.#####.##.#####.####.#',
  '#o..##.......P .......##..o#',
  '###.##.##.########.##.##.###',
  '###.##.##.########.##.##.###',
  '#......##....##....##......#',
  '#.##########.##.##########.#',
  '#.##########.##.##########.#',
  '#..........................#',
  '############################'
]

const ROWS = MAZE_RAW.length
const COLS = MAZE_RAW[0].length
const W = COLS * CELL
const H = ROWS * CELL

type Dir = 'up' | 'down' | 'left' | 'right' | 'none'
type Phase = 'idle' | 'countdown' | 'playing' | 'won' | 'lost' | 'death'

interface Pacman {
  x: number; y: number             // cell coordinates (float)
  dir: Dir; nextDir: Dir
  mouth: number                    // animation phase
}

interface Ghost {
  x: number; y: number
  dir: Dir
  homeX: number; homeY: number     // scatter target
  spawnX: number; spawnY: number
  color: string
  state: 'normal' | 'frightened' | 'eaten'  // eaten = returning to spawn
  releaseFrame: number             // when to leave the ghost house
}

const DIR_VEC: Record<Dir, [number, number]> = {
  up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0], none: [0, 0]
}

const OPPOSITE: Record<Dir, Dir> = {
  up: 'down', down: 'up', left: 'right', right: 'left', none: 'none'
}

function isWall(grid: string[][], r: number, c: number): boolean {
  if (r < 0 || r >= ROWS || c < 0) {
    return true
  }
  // Horizontal tunnel: leftmost/rightmost open cells wrap
  if (c >= COLS) return true
  return grid[r][c] === '#'
}

function isDoor(grid: string[][], r: number, c: number): boolean {
  return grid[r]?.[c] === '-'
}

function buildInitialGrid(): string[][] {
  return MAZE_RAW.map((row) => row.split(''))
}

function countPellets(grid: string[][]): number {
  let n = 0
  for (const row of grid) for (const ch of row) if (ch === '.' || ch === 'o') n++
  return n
}

function spawnPositions(grid: string[][]): { pacman: { x: number; y: number }; ghosts: { x: number; y: number }[] } {
  let pacman = { x: 9, y: 15 }
  const ghosts: { x: number; y: number }[] = []
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (grid[r][c] === 'P') {
        pacman = { x: c, y: r }
        grid[r][c] = ' '
      } else if (grid[r][c] === 'G') {
        ghosts.push({ x: c, y: r })
        grid[r][c] = ' '
      }
    }
  }
  return { pacman, ghosts }
}

export default function Pacman(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(LIVES_INITIAL)
  const [level, setLevel] = useState(1)
  const [highScore, setHighScore] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phaseRef = useRef<Phase>('idle')
  const gridRef = useRef<string[][]>([])
  const pacmanRef = useRef<Pacman>({ x: 9, y: 15, dir: 'none', nextDir: 'none', mouth: 0 })
  const ghostsRef = useRef<Ghost[]>([])
  const scoreRef = useRef(0)
  const livesRef = useRef(LIVES_INITIAL)
  const levelRef = useRef(1)
  const hiRef = useRef(0)
  const pelletsLeftRef = useRef(0)
  const powerFramesRef = useRef(0)
  const ghostEatStreakRef = useRef(0)
  const frameRef = useRef(0)
  const deathTimerRef = useRef(0)
  const countdownRef = useRef(0)
  const [countdownN, setCountdownN] = useState(3)
  const keysRef = useRef<Set<string>>(new Set())
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    window.api.settings.get(SAVE_KEY, '0').then((v) => {
      hiRef.current = parseInt(v, 10) || 0
      setHighScore(hiRef.current)
    })
    initLevel(true)
    draw()
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const k = e.key
      const capture = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D', ' ', 'Spacebar', 'Enter']
      if (capture.includes(k)) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
      if (k === 'ArrowUp' || k === 'w' || k === 'W') pacmanRef.current.nextDir = 'up'
      if (k === 'ArrowDown' || k === 's' || k === 'S') pacmanRef.current.nextDir = 'down'
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') pacmanRef.current.nextDir = 'left'
      if (k === 'ArrowRight' || k === 'd' || k === 'D') pacmanRef.current.nextDir = 'right'
      if (k === ' ' || k === 'Spacebar' || k === 'Enter') {
        if (phaseRef.current === 'idle' || phaseRef.current === 'won' || phaseRef.current === 'lost') {
          startGame()
        }
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [])

  function initLevel(fullReset: boolean): void {
    gridRef.current = buildInitialGrid()
    const spawns = spawnPositions(gridRef.current)
    pacmanRef.current = { x: spawns.pacman.x, y: spawns.pacman.y, dir: 'none', nextDir: 'none', mouth: 0 }
    const colors = ['#ef4444', '#f97316', '#22d3ee', '#ec4899']
    const homes: [number, number][] = [[1, 1], [COLS - 2, 1], [1, ROWS - 2], [COLS - 2, ROWS - 2]]
    ghostsRef.current = spawns.ghosts.slice(0, 4).map((g, i) => ({
      x: g.x,
      y: g.y,
      dir: 'up',
      homeX: homes[i][0],
      homeY: homes[i][1],
      spawnX: g.x,
      spawnY: g.y,
      color: colors[i % colors.length],
      state: 'normal',
      releaseFrame: 30 + i * 90    // staggered release
    }))
    pelletsLeftRef.current = countPellets(gridRef.current)
    powerFramesRef.current = 0
    ghostEatStreakRef.current = 0
    frameRef.current = 0
    deathTimerRef.current = 0
    if (fullReset) {
      scoreRef.current = 0
      livesRef.current = LIVES_INITIAL
      levelRef.current = 1
      setScore(0)
      setLives(LIVES_INITIAL)
      setLevel(1)
    }
  }

  function startGame(): void {
    initLevel(true)
    countdownRef.current = COUNTDOWN_FRAMES
    setCountdownN(3)
    phaseRef.current = 'countdown'
    setPhase('countdown')
    startLoop()
  }

  function startLoop(): void {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const loop = (): void => {
      step()
      draw()
      if (phaseRef.current === 'playing' || phaseRef.current === 'death' || phaseRef.current === 'countdown') {
        rafRef.current = requestAnimationFrame(loop)
      }
    }
    rafRef.current = requestAnimationFrame(loop)
  }

  function canMove(x: number, y: number, dir: Dir, isGhost: boolean): boolean {
    if (dir === 'none') return false
    const [dx, dy] = DIR_VEC[dir]
    const epsilon = 0.001
    const cx = Math.round(x), cy = Math.round(y)
    const onTile = Math.abs(x - cx) < epsilon && Math.abs(y - cy) < epsilon
    if (!onTile) return false
    let nc = cx + dx
    const nr = cy + dy
    // Tunnel wrap on row 9 only (matches the open corridor at row 9 in maze)
    if (nc < 0) nc = COLS - 1
    if (nc >= COLS) nc = 0
    if (nr < 0 || nr >= ROWS) return false
    const cell = gridRef.current[nr][nc]
    if (cell === '#') return false
    if (cell === '-' && !isGhost) return false
    return true
  }

  function moveEntity(x: number, y: number, dir: Dir, speed: number): { x: number; y: number } {
    const [dx, dy] = DIR_VEC[dir]
    let nx = x + dx * speed
    let ny = y + dy * speed
    // Tunnel wrap
    if (nx < -0.5) nx = COLS - 0.5
    if (nx > COLS - 0.5) nx = -0.5
    return { x: nx, y: ny }
  }

  function ghostNextDir(g: Ghost, pacX: number, pacY: number): Dir {
    const cx = Math.round(g.x), cy = Math.round(g.y)
    const opp = OPPOSITE[g.dir]
    const candidates: Dir[] = (['up', 'down', 'left', 'right'] as Dir[]).filter((d) => {
      if (d === opp) return false
      return canMove(cx, cy, d, true)
    })
    if (candidates.length === 0) {
      // Allow reversal as fallback
      return canMove(cx, cy, opp, true) ? opp : 'none'
    }
    if (candidates.length === 1) return candidates[0]

    // Pick by target. Frightened ghosts pick randomly. Eaten ghosts head home.
    // Normal ghosts head toward Pac-Man with some randomness.
    let target: [number, number]
    if (g.state === 'eaten') {
      target = [g.spawnX, g.spawnY]
    } else if (g.state === 'frightened') {
      return candidates[Math.floor(Math.random() * candidates.length)]
    } else {
      // 75% chase Pac-Man, 25% scatter to corner
      if (Math.random() < 0.75) {
        target = [pacX, pacY]
      } else {
        target = [g.homeX, g.homeY]
      }
    }
    let bestDir = candidates[0]
    let bestDist = Infinity
    for (const d of candidates) {
      const [dx, dy] = DIR_VEC[d]
      const tx = cx + dx, ty = cy + dy
      const dist = (tx - target[0]) ** 2 + (ty - target[1]) ** 2
      if (dist < bestDist) {
        bestDist = dist
        bestDir = d
      }
    }
    return bestDir
  }

  function step(): void {
    if (phaseRef.current === 'countdown') {
      countdownRef.current--
      const n = Math.ceil(countdownRef.current / 60)
      if (n !== countdownN) setCountdownN(n)
      if (countdownRef.current <= 0) {
        phaseRef.current = 'playing'
        setPhase('playing')
      }
      return
    }
    if (phaseRef.current === 'death') {
      deathTimerRef.current--
      if (deathTimerRef.current <= 0) {
        const spawns = spawnPositions(buildInitialGrid())
        pacmanRef.current.x = spawns.pacman.x
        pacmanRef.current.y = spawns.pacman.y
        pacmanRef.current.dir = 'none'
        pacmanRef.current.nextDir = 'none'
        for (const g of ghostsRef.current) {
          g.x = g.spawnX
          g.y = g.spawnY
          g.dir = 'up'
          g.state = 'normal'
        }
        countdownRef.current = COUNTDOWN_FRAMES
        setCountdownN(3)
        phaseRef.current = 'countdown'
        setPhase('countdown')
      }
      return
    }
    if (phaseRef.current !== 'playing') return
    frameRef.current++
    const f = frameRef.current

    if (powerFramesRef.current > 0) {
      powerFramesRef.current--
      if (powerFramesRef.current === 0) {
        ghostEatStreakRef.current = 0
        for (const g of ghostsRef.current) {
          if (g.state === 'frightened') g.state = 'normal'
        }
      }
    }

    // Pac-Man movement
    const p = pacmanRef.current
    const cx = Math.round(p.x), cy = Math.round(p.y)
    const onTile = Math.abs(p.x - cx) < 0.05 && Math.abs(p.y - cy) < 0.05
    if (onTile) {
      p.x = cx
      p.y = cy
      // Try nextDir if requested
      if (p.nextDir !== 'none' && canMove(p.x, p.y, p.nextDir, false)) {
        p.dir = p.nextDir
      } else if (!canMove(p.x, p.y, p.dir, false)) {
        p.dir = 'none'
      }
    }
    if (p.dir !== 'none') {
      const { x, y } = moveEntity(p.x, p.y, p.dir, PACMAN_SPEED)
      p.x = x
      p.y = y
      p.mouth = (p.mouth + 0.18) % (Math.PI * 2)
    }

    // Pellet eating
    const pTileX = Math.round(p.x)
    const pTileY = Math.round(p.y)
    if (Math.abs(p.x - pTileX) < 0.3 && Math.abs(p.y - pTileY) < 0.3) {
      const tile = gridRef.current[pTileY]?.[pTileX]
      if (tile === '.') {
        gridRef.current[pTileY][pTileX] = ' '
        scoreRef.current += PELLET_SCORE
        pelletsLeftRef.current--
      } else if (tile === 'o') {
        gridRef.current[pTileY][pTileX] = ' '
        scoreRef.current += POWER_SCORE
        pelletsLeftRef.current--
        powerFramesRef.current = POWER_DURATION
        ghostEatStreakRef.current = 0
        for (const g of ghostsRef.current) {
          if (g.state === 'normal') {
            g.state = 'frightened'
            g.dir = OPPOSITE[g.dir]   // ghosts reverse on power activation
          }
        }
      }
    }

    if (pelletsLeftRef.current === 0) {
      levelRef.current++
      setLevel(levelRef.current)
      initLevel(false)
      countdownRef.current = COUNTDOWN_FRAMES
      setCountdownN(3)
      phaseRef.current = 'countdown'
      setPhase('countdown')
      return
    }

    // Ghost movement
    for (const g of ghostsRef.current) {
      if (f < g.releaseFrame && g.state === 'normal') continue
      const gcx = Math.round(g.x), gcy = Math.round(g.y)
      const gOnTile = Math.abs(g.x - gcx) < 0.05 && Math.abs(g.y - gcy) < 0.05
      if (gOnTile) {
        g.x = gcx
        g.y = gcy
        // Check if eaten ghost reached spawn — respawn
        if (g.state === 'eaten' && Math.abs(gcx - g.spawnX) < 0.5 && Math.abs(gcy - g.spawnY) < 0.5) {
          g.state = 'normal'
          g.dir = 'up'
        }
        g.dir = ghostNextDir(g, p.x, p.y)
      }
      if (g.dir !== 'none') {
        const speed = g.state === 'frightened' ? GHOST_FRIGHTENED_SPEED
                    : g.state === 'eaten' ? GHOST_SPEED * 2
                    : GHOST_SPEED
        const { x, y } = moveEntity(g.x, g.y, g.dir, speed)
        g.x = x
        g.y = y
      }
    }

    // Pacman vs ghost collisions
    for (const g of ghostsRef.current) {
      if (g.state === 'eaten') continue
      if (Math.hypot(g.x - p.x, g.y - p.y) < 0.7) {
        if (g.state === 'frightened') {
          ghostEatStreakRef.current++
          const bonus = GHOST_SCORE_BASE * Math.pow(2, ghostEatStreakRef.current - 1)
          scoreRef.current += bonus
          g.state = 'eaten'
        } else {
          // Pac-Man dies
          livesRef.current--
          setLives(livesRef.current)
          if (livesRef.current <= 0) {
            endGame()
            return
          }
          phaseRef.current = 'death'
          setPhase('death')
          deathTimerRef.current = 60
          return
        }
      }
    }

    setScore(scoreRef.current)
  }

  function endGame(): void {
    phaseRef.current = 'lost'
    setPhase('lost')
    if (scoreRef.current > hiRef.current) {
      hiRef.current = scoreRef.current
      setHighScore(hiRef.current)
      window.api.settings.set(SAVE_KEY, String(hiRef.current)).catch(() => {})
    }
  }

  function draw(): void {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#04040a'
    ctx.fillRect(0, 0, W, H)

    // Maze
    const grid = gridRef.current
    if (grid.length === 0) return
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const ch = grid[r][c]
        const x = c * CELL, y = r * CELL
        if (ch === '#') {
          ctx.fillStyle = '#1e40af'
          ctx.fillRect(x, y, CELL, CELL)
          ctx.strokeStyle = '#3b82f6'
          ctx.lineWidth = 1
          ctx.strokeRect(x + 0.5, y + 0.5, CELL - 1, CELL - 1)
        } else if (ch === '-') {
          ctx.fillStyle = '#fbbf24'
          ctx.fillRect(x, y + CELL / 2 - 2, CELL, 4)
        } else if (ch === '.') {
          ctx.fillStyle = '#fde68a'
          ctx.beginPath()
          ctx.arc(x + CELL / 2, y + CELL / 2, 2, 0, Math.PI * 2)
          ctx.fill()
        } else if (ch === 'o') {
          ctx.fillStyle = '#fde68a'
          ctx.shadowColor = 'rgba(253, 230, 138, 0.8)'
          ctx.shadowBlur = 8
          ctx.beginPath()
          ctx.arc(x + CELL / 2, y + CELL / 2, 5, 0, Math.PI * 2)
          ctx.fill()
          ctx.shadowBlur = 0
        }
      }
    }

    // Pac-Man
    const p = pacmanRef.current
    const px = p.x * CELL + CELL / 2
    const py = p.y * CELL + CELL / 2
    const mouthOpen = (Math.sin(p.mouth) + 1) / 2 * 0.5
    let angleStart = 0
    if (p.dir === 'right') angleStart = mouthOpen
    else if (p.dir === 'down') angleStart = Math.PI / 2 + mouthOpen
    else if (p.dir === 'left') angleStart = Math.PI + mouthOpen
    else if (p.dir === 'up') angleStart = -Math.PI / 2 + mouthOpen
    ctx.fillStyle = '#fde047'
    ctx.beginPath()
    ctx.moveTo(px, py)
    ctx.arc(px, py, CELL * 0.42, angleStart, angleStart + Math.PI * 2 - mouthOpen * 2)
    ctx.closePath()
    ctx.fill()

    // Ghosts
    const flashing = powerFramesRef.current > 0 && powerFramesRef.current < 90
    for (const g of ghostsRef.current) {
      const gx = g.x * CELL + CELL / 2
      const gy = g.y * CELL + CELL / 2
      const r = CELL * 0.42
      if (g.state === 'eaten') {
        // Eyes only
        ctx.fillStyle = '#fff'
        ctx.beginPath()
        ctx.arc(gx - 4, gy, 3, 0, Math.PI * 2)
        ctx.arc(gx + 4, gy, 3, 0, Math.PI * 2)
        ctx.fill()
        continue
      }
      const isFright = g.state === 'frightened'
      ctx.fillStyle = isFright ? (flashing && Math.floor(frameRef.current / 8) % 2 === 0 ? '#fff' : '#3b82f6') : g.color
      ctx.beginPath()
      ctx.arc(gx, gy, r, Math.PI, 0)
      ctx.lineTo(gx + r, gy + r)
      // Wavy bottom
      const waves = 4
      for (let i = 0; i < waves; i++) {
        const x1 = gx + r - (i * 2 + 1) * r / waves
        const x2 = gx + r - (i * 2 + 2) * r / waves
        ctx.lineTo(x1, gy + r * 0.7)
        ctx.lineTo(x2, gy + r)
      }
      ctx.closePath()
      ctx.fill()
      // Eyes
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.arc(gx - 4, gy - 2, 3, 0, Math.PI * 2)
      ctx.arc(gx + 4, gy - 2, 3, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = isFright ? '#ef4444' : '#1e3a8a'
      ctx.beginPath()
      ctx.arc(gx - 4, gy - 2, 1.5, 0, Math.PI * 2)
      ctx.arc(gx + 4, gy - 2, 1.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  return (
    <div className={styles.body}>
      <div className={styles.hud}>
        <span>Score <strong>{score}</strong></span>
        <span>Lives <strong>{lives}</strong></span>
        <span>Level <strong>{level}</strong></span>
        {highScore > 0 && <span className={styles.best}>Best: {highScore}</span>}
      </div>
      <div className={styles.canvasWrap}>
        <canvas ref={canvasRef} width={W} height={H} className={styles.canvas} />
        {phase === 'countdown' && (
          <div className={styles.countdown}>
            <span key={countdownN} className={styles.countdownNum}>
              {countdownN > 0 ? countdownN : 'GO!'}
            </span>
          </div>
        )}
        {(phase === 'idle' || phase === 'lost') && (
          <div className={styles.overlay}>
            {phase === 'idle' && <span className={styles.title}>👻 Pac-Man</span>}
            {phase === 'lost' && (
              <>
                <span className={styles.title}>💀 Game Over</span>
                <span className={styles.score}>Score: {score} · Level {level}</span>
              </>
            )}
            <button className={styles.btn} onClick={startGame}>
              {phase === 'idle' ? 'Start' : 'Play Again'}
            </button>
            <span className={styles.hint}>Arrows or WASD to turn · eat all pellets</span>
          </div>
        )}
      </div>
    </div>
  )
}
