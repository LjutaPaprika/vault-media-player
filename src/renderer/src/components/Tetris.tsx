import { useEffect, useRef, useState } from 'react'
import styles from './Tetris.module.css'

// Classic Tetris. Arrow keys to move/rotate, Space to hard-drop, P to pause.

const COLS = 10
const ROWS = 20
const CELL = 26
const W = COLS * CELL
const H = ROWS * CELL

const SAVE_KEY = 'tetrisHighScore'

type Cell = number // 0 empty, 1..7 piece color index

// Piece shapes as 4x4 matrices, rotation states encoded as arrays.
interface Piece {
  shape: number[][]
  color: number
}

const PIECES: Record<string, Piece> = {
  I: { color: 1, shape: [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]] },
  J: { color: 2, shape: [[1,0,0],[1,1,1],[0,0,0]] },
  L: { color: 3, shape: [[0,0,1],[1,1,1],[0,0,0]] },
  O: { color: 4, shape: [[1,1],[1,1]] },
  S: { color: 5, shape: [[0,1,1],[1,1,0],[0,0,0]] },
  T: { color: 6, shape: [[0,1,0],[1,1,1],[0,0,0]] },
  Z: { color: 7, shape: [[1,1,0],[0,1,1],[0,0,0]] },
}
const KEYS = Object.keys(PIECES)

const COLORS = ['#000', '#22d3ee', '#3b82f6', '#f97316', '#facc15', '#22c55e', '#a855f7', '#ef4444']

function rotate(m: number[][]): number[][] {
  const n = m.length
  const r: number[][] = Array.from({ length: n }, () => Array(n).fill(0))
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) r[x][n - 1 - y] = m[y][x]
  return r
}

function clone(m: number[][]): number[][] { return m.map(r => r.slice()) }

interface Active {
  shape: number[][]
  color: number
  x: number
  y: number
}

function randomPiece(): Active {
  const k = KEYS[Math.floor(Math.random() * KEYS.length)]
  const p = PIECES[k]
  return { shape: clone(p.shape), color: p.color, x: Math.floor((COLS - p.shape.length) / 2), y: -1 }
}

function emptyBoard(): Cell[][] {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0))
}

function collides(board: Cell[][], a: Active, dx: number, dy: number, shape?: number[][]): boolean {
  const sh = shape || a.shape
  for (let y = 0; y < sh.length; y++) for (let x = 0; x < sh.length; x++) {
    if (!sh[y][x]) continue
    const nx = a.x + x + dx, ny = a.y + y + dy
    if (nx < 0 || nx >= COLS || ny >= ROWS) return true
    if (ny >= 0 && board[ny][nx]) return true
  }
  return false
}

function merge(board: Cell[][], a: Active): void {
  for (let y = 0; y < a.shape.length; y++) for (let x = 0; x < a.shape.length; x++) {
    if (a.shape[y][x] && a.y + y >= 0) board[a.y + y][a.x + x] = a.color
  }
}

function clearLines(board: Cell[][]): number {
  let n = 0
  for (let y = ROWS - 1; y >= 0; y--) {
    if (board[y].every(c => c)) {
      board.splice(y, 1)
      board.unshift(Array(COLS).fill(0))
      n++
      y++
    }
  }
  return n
}

const LINE_SCORE = [0, 100, 300, 500, 800]

export default function Tetris(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nextCanvasRef = useRef<HTMLCanvasElement>(null)
  const boardRef = useRef<Cell[][]>(emptyBoard())
  const pieceRef = useRef<Active>(randomPiece())
  const nextRef = useRef<Active>(randomPiece())
  const lastDropRef = useRef(performance.now())
  const rafRef = useRef(0)
  const phaseRef = useRef<'idle' | 'playing' | 'paused' | 'gameover'>('idle')

  const [score, setScore] = useState(0)
  const [lines, setLines] = useState(0)
  const [level, setLevel] = useState(0)
  const [phase, setPhase] = useState<'idle' | 'playing' | 'paused' | 'gameover'>('idle')
  const [hi, setHi] = useState(0)

  const scoreRef = useRef(0)
  const linesRef = useRef(0)
  const levelRef = useRef(0)
  const hiRef    = useRef(0)

  useEffect(() => {
    window.api.settings.get(SAVE_KEY, '0').then(v => {
      const n = parseInt(v, 10) || 0
      hiRef.current = n
      setHi(n)
    })
  }, [])

  useEffect(() => {
    function loop(t: number): void {
      const interval = Math.max(80, 800 - levelRef.current * 60)
      if (phaseRef.current === 'playing' && t - lastDropRef.current > interval) {
        step()
        lastDropRef.current = t
      }
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const tetrisKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'p', 'P']
      if (!tetrisKeys.includes(e.key)) return
      if (phaseRef.current === 'idle' || phaseRef.current === 'gameover') return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.key === 'p' || e.key === 'P') {
        if (phaseRef.current === 'playing') { phaseRef.current = 'paused'; setPhase('paused') }
        else if (phaseRef.current === 'paused') { phaseRef.current = 'playing'; setPhase('playing') }
        return
      }
      if (phaseRef.current !== 'playing') return
      const a = pieceRef.current
      const b = boardRef.current
      if (e.key === 'ArrowLeft')  { if (!collides(b, a, -1, 0)) a.x-- }
      else if (e.key === 'ArrowRight') { if (!collides(b, a, 1, 0)) a.x++ }
      else if (e.key === 'ArrowDown')  { if (!collides(b, a, 0, 1)) a.y++ }
      else if (e.key === 'ArrowUp') {
        const r = rotate(a.shape)
        if (!collides(b, a, 0, 0, r)) a.shape = r
        else if (!collides(b, a, -1, 0, r)) { a.x--; a.shape = r }
        else if (!collides(b, a, 1, 0, r)) { a.x++; a.shape = r }
      } else if (e.key === ' ') {
        while (!collides(b, a, 0, 1)) a.y++
        step()
        lastDropRef.current = performance.now()
      }
      draw()
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [])

  function startGame(): void {
    boardRef.current = emptyBoard()
    pieceRef.current = randomPiece()
    nextRef.current = randomPiece()
    scoreRef.current = 0; setScore(0)
    linesRef.current = 0; setLines(0)
    levelRef.current = 0; setLevel(0)
    lastDropRef.current = performance.now()
    phaseRef.current = 'playing'; setPhase('playing')
  }

  function step(): void {
    const a = pieceRef.current
    const b = boardRef.current
    if (!collides(b, a, 0, 1)) {
      a.y++
      return
    }
    // Lock
    if (a.y < 0) {
      phaseRef.current = 'gameover'; setPhase('gameover')
      const finalScore = scoreRef.current
      if (finalScore > hiRef.current) {
        hiRef.current = finalScore
        setHi(finalScore)
        window.api.settings.set(SAVE_KEY, String(finalScore)).catch(() => {})
      }
      return
    }
    merge(b, a)
    const cleared = clearLines(b)
    if (cleared) {
      const ns = scoreRef.current + LINE_SCORE[cleared] * (levelRef.current + 1)
      const nl = linesRef.current + cleared
      const lv = Math.floor(nl / 10)
      scoreRef.current = ns; setScore(ns)
      linesRef.current = nl; setLines(nl)
      if (lv !== levelRef.current) { levelRef.current = lv; setLevel(lv) }
    }
    pieceRef.current = nextRef.current
    nextRef.current = randomPiece()
    if (collides(b, pieceRef.current, 0, 0)) {
      phaseRef.current = 'gameover'; setPhase('gameover')
      if (scoreRef.current > hiRef.current) {
        hiRef.current = scoreRef.current
        setHi(scoreRef.current)
        window.api.settings.set(SAVE_KEY, String(scoreRef.current)).catch(() => {})
      }
    }
  }

  function reset(): void { startGame() }

  function draw(): void {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#0b0f14'
    ctx.fillRect(0, 0, W, H)

    // Grid
    ctx.strokeStyle = 'rgba(255,255,255,0.04)'
    ctx.lineWidth = 1
    for (let x = 0; x <= COLS; x++) {
      ctx.beginPath(); ctx.moveTo(x * CELL, 0); ctx.lineTo(x * CELL, H); ctx.stroke()
    }
    for (let y = 0; y <= ROWS; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * CELL); ctx.lineTo(W, y * CELL); ctx.stroke()
    }

    const b = boardRef.current
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (b[y][x]) drawCell(ctx, x, y, b[y][x])
    }

    // Ghost piece
    const a = pieceRef.current
    let gy = a.y
    while (!collides(b, { ...a, y: gy }, 0, 1)) gy++
    if (gy > a.y) {
      for (let y = 0; y < a.shape.length; y++) for (let x = 0; x < a.shape.length; x++) {
        if (a.shape[y][x] && gy + y >= 0) {
          ctx.fillStyle = 'rgba(255,255,255,0.08)'
          ctx.fillRect((a.x + x) * CELL + 1, (gy + y) * CELL + 1, CELL - 2, CELL - 2)
        }
      }
    }
    // Active piece
    for (let y = 0; y < a.shape.length; y++) for (let x = 0; x < a.shape.length; x++) {
      if (a.shape[y][x] && a.y + y >= 0) drawCell(ctx, a.x + x, a.y + y, a.color)
    }

    drawNext()
  }

  function drawNext(): void {
    const c = nextCanvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#0b0f14'
    ctx.fillRect(0, 0, c.width, c.height)
    const n = nextRef.current
    const NCELL = 20
    // Center the shape's bounding box
    let minX = n.shape.length, minY = n.shape.length, maxX = -1, maxY = -1
    for (let y = 0; y < n.shape.length; y++) for (let x = 0; x < n.shape.length; x++) {
      if (n.shape[y][x]) { if (x < minX) minX = x; if (y < minY) minY = y; if (x > maxX) maxX = x; if (y > maxY) maxY = y }
    }
    const pw = (maxX - minX + 1) * NCELL
    const ph = (maxY - minY + 1) * NCELL
    const ox = (c.width - pw) / 2
    const oy = (c.height - ph) / 2
    for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
      if (!n.shape[y][x]) continue
      const px = ox + (x - minX) * NCELL
      const py = oy + (y - minY) * NCELL
      ctx.fillStyle = COLORS[n.color]
      ctx.fillRect(px + 1, py + 1, NCELL - 2, NCELL - 2)
      ctx.fillStyle = 'rgba(255,255,255,0.18)'
      ctx.fillRect(px + 1, py + 1, NCELL - 2, 2)
      ctx.fillStyle = 'rgba(0,0,0,0.25)'
      ctx.fillRect(px + 1, py + NCELL - 3, NCELL - 2, 2)
    }
  }

  function drawCell(ctx: CanvasRenderingContext2D, x: number, y: number, color: number): void {
    ctx.fillStyle = COLORS[color]
    ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, CELL - 2)
    ctx.fillStyle = 'rgba(255,255,255,0.18)'
    ctx.fillRect(x * CELL + 1, y * CELL + 1, CELL - 2, 3)
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(x * CELL + 1, y * CELL + CELL - 4, CELL - 2, 3)
  }

  return (
    <div className={styles.body}>
      <div className={styles.header}>
        <span>Score <strong>{score}</strong></span>
        <span>Lines <strong>{lines}</strong></span>
        <span>Lv <strong>{level}</strong></span>
        <span>High <strong>{hi}</strong></span>
      </div>
      <div className={styles.stageRow}>
      <div className={styles.stage}>
        <canvas ref={canvasRef} width={W} height={H} className={styles.canvas} />
        {phase === 'idle' && (
          <div className={styles.overlay}>
            <div className={styles.title}>TETRIS</div>
            <div className={styles.subtitle}>← → move · ↑ rotate · ↓ soft · Space hard · P pause</div>
            <button className={styles.btn} onClick={startGame}>Start</button>
          </div>
        )}
        {phase === 'paused' && (
          <div className={styles.overlay}><div className={styles.title}>PAUSED</div></div>
        )}
        {phase === 'gameover' && (
          <div className={styles.overlay}>
            <div className={styles.title}>GAME OVER</div>
            <div className={styles.subtitle}>{score} pts · {lines} lines</div>
            <button className={styles.btn} onClick={reset}>Play Again</button>
          </div>
        )}
      </div>
      <div className={styles.sidePanel}>
        <div className={styles.sideLabel}>NEXT</div>
        <canvas ref={nextCanvasRef} width={100} height={100} className={styles.nextCanvas} />
      </div>
      </div>
      {phase !== 'idle' && (
        <div className={styles.hint}>← → move · ↑ rotate · ↓ soft drop · Space hard drop · P pause</div>
      )}
    </div>
  )
}
