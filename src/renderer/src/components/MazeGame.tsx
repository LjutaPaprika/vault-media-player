import { useEffect, useRef, useState } from 'react'
import styles from './MazeGame.module.css'

const SAVE_KEY = 'mazeBest'
// Cell pixel size chosen so medium fits ~540 px; all sizes use this so the
// player block stays the same size visually across difficulties. The canvas
// scales with dim — large/huge mazes render larger overall.
const CELL_PX = 16

type Size = 'small' | 'medium' | 'large' | 'huge'
type Phase = 'playing' | 'won'

const SIZES: Record<Size, number> = { small: 21, medium: 35, large: 51, huge: 71 }

interface BestTimes {
  small?: number
  medium?: number
  large?: number
  huge?: number
}

interface MazeProps {
  onNewBest?: (size: Size, time: number) => void
}

type WallSet = Set<string>

// Recursive backtracker (DFS) — produces long winding corridors with fewer
// redundant walls than randomized Prim's. Light braiding adds occasional loops.
function generateMaze(size: number): WallSet {
  const walls: WallSet = new Set()
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      walls.add(`${x},${y}:N`)
      walls.add(`${x},${y}:E`)
      walls.add(`${x},${y}:S`)
      walls.add(`${x},${y}:W`)
    }
  }

  const visited = new Set<string>()
  type Dir = { dx: number; dy: number; out: 'N' | 'S' | 'E' | 'W'; back: 'N' | 'S' | 'E' | 'W' }
  const DIRS: Dir[] = [
    { dx: 0, dy: -1, out: 'N', back: 'S' },
    { dx: 1, dy: 0,  out: 'E', back: 'W' },
    { dx: 0, dy: 1,  out: 'S', back: 'N' },
    { dx: -1, dy: 0, out: 'W', back: 'E' }
  ]

  // Iterative DFS using an explicit stack
  const stack: { x: number; y: number }[] = [{ x: 0, y: 0 }]
  visited.add('0,0')
  while (stack.length > 0) {
    const cur = stack[stack.length - 1]
    const choices = DIRS.filter(d => {
      const nx = cur.x + d.dx, ny = cur.y + d.dy
      return nx >= 0 && nx < size && ny >= 0 && ny < size && !visited.has(`${nx},${ny}`)
    })
    if (choices.length === 0) { stack.pop(); continue }
    const d = choices[Math.floor(Math.random() * choices.length)]
    const nx = cur.x + d.dx, ny = cur.y + d.dy
    walls.delete(`${cur.x},${cur.y}:${d.out}`)
    walls.delete(`${nx},${ny}:${d.back}`)
    visited.add(`${nx},${ny}`)
    stack.push({ x: nx, y: ny })
  }

  // Light braiding — break ~4% of dead-end walls to add a few loops
  const braidChance = 0.04
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (Math.random() > braidChance) continue
      const candidates: Dir[] = DIRS.filter(d => {
        const nx = x + d.dx, ny = y + d.dy
        return nx >= 0 && nx < size && ny >= 0 && ny < size && walls.has(`${x},${y}:${d.out}`)
      })
      if (candidates.length === 0) continue
      const d = candidates[Math.floor(Math.random() * candidates.length)]
      walls.delete(`${x},${y}:${d.out}`)
      walls.delete(`${x + d.dx},${y + d.dy}:${d.back}`)
    }
  }

  return walls
}

export default function MazeGame({ onNewBest }: MazeProps): JSX.Element {
  const [size, setSize] = useState<Size>('small')
  const [phase, setPhase] = useState<Phase>('playing')
  const [displayTime, setDisplayTime] = useState(0)
  const [best, setBest] = useState<BestTimes>({})

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wallsRef = useRef<WallSet>(new Set())
  const visitedRef = useRef<Set<string>>(new Set())
  const playerRef = useRef({ x: 0, y: 0 })
  const phaseRef = useRef<Phase>('playing')
  const sizeRef = useRef(SIZES.small)
  const startTimeRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startedRef = useRef(false)

  useEffect(() => {
    window.api.settings.get(SAVE_KEY, '{}').then(v => {
      try { setBest(JSON.parse(v) as BestTimes) } catch { /* defaults */ }
    })
    initializeMaze('small')
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'W', 'a', 'A', 's', 'S', 'd', 'D'].includes(e.key)) return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (phaseRef.current !== 'playing') return
      const dirMap: Record<string, { dx: number; dy: number; wall: string }> = {
        ArrowUp:    { dx: 0, dy: -1, wall: 'N' },
        ArrowDown:  { dx: 0, dy: 1,  wall: 'S' },
        ArrowLeft:  { dx: -1, dy: 0, wall: 'W' },
        ArrowRight: { dx: 1, dy: 0,  wall: 'E' },
        w: { dx: 0, dy: -1, wall: 'N' }, W: { dx: 0, dy: -1, wall: 'N' },
        s: { dx: 0, dy: 1,  wall: 'S' }, S: { dx: 0, dy: 1,  wall: 'S' },
        a: { dx: -1, dy: 0, wall: 'W' }, A: { dx: -1, dy: 0, wall: 'W' },
        d: { dx: 1, dy: 0,  wall: 'E' }, D: { dx: 1, dy: 0,  wall: 'E' }
      }
      const m = dirMap[e.key]
      if (!m) return
      const p = playerRef.current
      if (wallsRef.current.has(`${p.x},${p.y}:${m.wall}`)) return
      const nx = p.x + m.dx, ny = p.y + m.dy
      if (nx < 0 || nx >= sizeRef.current || ny < 0 || ny >= sizeRef.current) return

      if (!startedRef.current) {
        startedRef.current = true
        startTimeRef.current = Date.now()
        timerRef.current = setInterval(() => {
          setDisplayTime(Math.floor((Date.now() - startTimeRef.current) / 1000))
        }, 250)
      }

      p.x = nx; p.y = ny
      visitedRef.current.add(`${nx},${ny}`)
      draw()

      if (p.x === sizeRef.current - 1 && p.y === sizeRef.current - 1) {
        const time = Math.floor((Date.now() - startTimeRef.current) / 1000)
        phaseRef.current = 'won'
        setPhase('won')
        if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
        const oldTime = best[size]
        if (!oldTime || time < oldTime) {
          const newBest = { ...best, [size]: time }
          setBest(newBest)
          window.api.settings.set(SAVE_KEY, JSON.stringify(newBest)).catch(() => {})
          onNewBest?.(size, time)
        }
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [size, best])

  function initializeMaze(s: Size): void {
    const dim = SIZES[s]
    sizeRef.current = dim
    wallsRef.current = generateMaze(dim)
    visitedRef.current = new Set(['0,0'])
    playerRef.current = { x: 0, y: 0 }
    startedRef.current = false
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setDisplayTime(0)
    phaseRef.current = 'playing'
    setPhase('playing')
    draw()
  }

  function draw(): void {
    const canvas = canvasRef.current
    if (!canvas) return
    const dim = sizeRef.current
    const cell = CELL_PX
    const W = dim * cell
    // Resize canvas to fit the whole maze
    if (canvas.width !== W) canvas.width = W
    if (canvas.height !== W) canvas.height = W

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#08080f'
    ctx.fillRect(0, 0, W, W)

    // Visited path subtle glow
    ctx.fillStyle = 'rgba(74, 222, 128, 0.05)'
    visitedRef.current.forEach(k => {
      const [x, y] = k.split(',').map(Number)
      ctx.fillRect(x * cell, y * cell, cell, cell)
    })

    // Goal
    const goalX = dim - 1, goalY = dim - 1
    ctx.fillStyle = 'rgba(232, 180, 75, 0.35)'
    ctx.fillRect(goalX * cell + 1, goalY * cell + 1, cell - 2, cell - 2)
    ctx.fillStyle = '#e8b44b'
    const goalPad = Math.max(2, Math.floor(cell / 4))
    ctx.fillRect(goalX * cell + goalPad, goalY * cell + goalPad, cell - goalPad * 2, cell - goalPad * 2)

    // Walls
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)'
    ctx.lineWidth = Math.max(1, Math.floor(cell / 14))
    ctx.lineCap = 'square'
    const walls = wallsRef.current
    for (let y = 0; y < dim; y++) {
      for (let x = 0; x < dim; x++) {
        const px = x * cell, py = y * cell
        if (walls.has(`${x},${y}:N`)) {
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + cell, py); ctx.stroke()
        }
        if (walls.has(`${x},${y}:W`)) {
          ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px, py + cell); ctx.stroke()
        }
        if (y === dim - 1 && walls.has(`${x},${y}:S`)) {
          ctx.beginPath(); ctx.moveTo(px, py + cell); ctx.lineTo(px + cell, py + cell); ctx.stroke()
        }
        if (x === dim - 1 && walls.has(`${x},${y}:E`)) {
          ctx.beginPath(); ctx.moveTo(px + cell, py); ctx.lineTo(px + cell, py + cell); ctx.stroke()
        }
      }
    }

    // Player
    const p = playerRef.current
    ctx.fillStyle = '#4ade80'
    ctx.shadowColor = 'rgba(74, 222, 128, 0.6)'
    ctx.shadowBlur = 8
    const pad = Math.max(2, Math.floor(cell / 5))
    ctx.fillRect(p.x * cell + pad, p.y * cell + pad, cell - pad * 2, cell - pad * 2)
    ctx.shadowBlur = 0
  }

  function changeSize(s: Size): void {
    setSize(s)
    initializeMaze(s)
  }

  const bestTime = best[size]

  return (
    <div className={styles.body}>
      <div className={styles.header}>
        <div className={styles.modeSelect}>
          {(['small', 'medium', 'large', 'huge'] as Size[]).map(s => (
            <button
              key={s}
              className={`${styles.modeBtn} ${size === s ? styles.modeBtnActive : ''}`}
              onClick={() => changeSize(s)}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)} ({SIZES[s]}²)
            </button>
          ))}
        </div>
        <div className={styles.stats}>
          <span>⏱️ {displayTime}s</span>
          {bestTime && <span>Best: {bestTime}s</span>}
          <button className={styles.regenBtn} onClick={() => initializeMaze(size)}>↻ New</button>
        </div>
      </div>

      <div className={styles.canvasWrap}>
        <canvas ref={canvasRef} className={styles.canvas} />
        {phase === 'won' && (
          <div className={styles.overlay}>
            <span className={styles.title}>✨ Solved!</span>
            <span className={styles.time}>{displayTime}s</span>
            {bestTime === displayTime && bestTime !== undefined && <span className={styles.newBest}>🏆 New best!</span>}
            <button className={styles.btn} onClick={() => initializeMaze(size)}>New Maze</button>
          </div>
        )}
      </div>
      <span className={styles.hint}>Arrow keys / WASD to navigate · Reach the gold square · Each maze is uniquely generated</span>
    </div>
  )
}
