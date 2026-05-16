import { useEffect, useRef, useState } from 'react'
import styles from './Game2048.module.css'

const SAVE_KEY = 'game2048Best'
const SIZE = 4
const CELL = 90
const GAP = 12
const BOARD_PX = SIZE * CELL + (SIZE + 1) * GAP

type Phase = 'playing' | 'won' | 'lost'

interface Tile {
  id: number
  value: number
  x: number  // column (0..3)
  y: number  // row (0..3)
  merged?: boolean
  isNew?: boolean
}

const TILE_COLORS: Record<number, { bg: string; text: string }> = {
  2: { bg: '#eee4da', text: '#776e65' },
  4: { bg: '#ede0c8', text: '#776e65' },
  8: { bg: '#f2b179', text: '#f9f6f2' },
  16: { bg: '#f59563', text: '#f9f6f2' },
  32: { bg: '#f67c5f', text: '#f9f6f2' },
  64: { bg: '#f65e3b', text: '#f9f6f2' },
  128: { bg: '#edcf72', text: '#f9f6f2' },
  256: { bg: '#edcc61', text: '#f9f6f2' },
  512: { bg: '#edc850', text: '#f9f6f2' },
  1024: { bg: '#edc53f', text: '#f9f6f2' },
  2048: { bg: '#edc22e', text: '#f9f6f2' }
}

interface Game2048Props {
  onNewBest?: (score: number) => void
}

let nextTileId = 1
function makeTile(value: number, x: number, y: number, isNew = false): Tile {
  return { id: nextTileId++, value, x, y, isNew }
}

export default function Game2048({ onNewBest }: Game2048Props): JSX.Element {
  const [tiles, setTiles] = useState<Tile[]>([])
  const [phase, setPhase] = useState<Phase>('playing')
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(0)

  const tilesRef = useRef<Tile[]>([])
  const phaseRef = useRef<Phase>('playing')
  const scoreRef = useRef(0)
  const hiRef = useRef(0)
  const movingRef = useRef(false)

  useEffect(() => {
    window.api.settings.get(SAVE_KEY, '{}').then(v => {
      try {
        const data = JSON.parse(v) as { score?: number }
        hiRef.current = data.score ?? 0
        setHighScore(hiRef.current)
      } catch { /* defaults */ }
    })
    initializeGame()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const arrowKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']
      if (arrowKeys.includes(e.key)) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
      if (phaseRef.current !== 'playing') {
        if (e.key === 'Enter' || e.key === ' ') initializeGame()
        return
      }
      if (movingRef.current) return
      const dirs: Record<string, [number, number]> = {
        ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1]
      }
      const d = dirs[e.key]
      if (d) move(d[0], d[1])
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [])

  function initializeGame(): void {
    tilesRef.current = []
    scoreRef.current = 0
    setScore(0)
    phaseRef.current = 'playing'
    setPhase('playing')
    movingRef.current = false
    spawnTile()
    spawnTile()
    setTiles([...tilesRef.current])
  }

  function spawnTile(): void {
    const occupied = new Set<string>()
    for (const t of tilesRef.current) occupied.add(`${t.x},${t.y}`)
    const empty: [number, number][] = []
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        if (!occupied.has(`${x},${y}`)) empty.push([x, y])
      }
    }
    if (empty.length === 0) return
    const [x, y] = empty[Math.floor(Math.random() * empty.length)]
    tilesRef.current.push(makeTile(Math.random() < 0.9 ? 2 : 4, x, y, true))
  }

  // Returns a fresh board (4×4 of tile or null) computed from tiles
  function buildBoard(tiles: Tile[]): (Tile | null)[][] {
    const board: (Tile | null)[][] = Array.from({ length: SIZE }, () => Array(SIZE).fill(null))
    for (const t of tiles) {
      if (t.merged) continue
      board[t.y][t.x] = t
    }
    return board
  }

  function move(dx: number, dy: number): void {
    // Clear new/merged flags from previous turn
    tilesRef.current = tilesRef.current.filter(t => !t.merged).map(t => ({ ...t, isNew: false, merged: false }))

    const board = buildBoard(tilesRef.current)
    const merged: Tile[] = []
    let moved = false

    // Determine traversal order: opposite of move direction
    const xs = dx > 0 ? [3, 2, 1, 0] : [0, 1, 2, 3]
    const ys = dy > 0 ? [3, 2, 1, 0] : [0, 1, 2, 3]

    // Track which positions have already absorbed a merge this turn
    const usedMerge = new Set<string>()

    for (const y of ys) {
      for (const x of xs) {
        const tile = board[y][x]
        if (!tile) continue

        let nx = x, ny = y
        // Slide as far as possible
        while (true) {
          const tx = nx + dx, ty = ny + dy
          if (tx < 0 || tx >= SIZE || ty < 0 || ty >= SIZE) break
          if (board[ty][tx] === null) {
            board[ty][tx] = tile
            board[ny][nx] = null
            nx = tx; ny = ty
          } else {
            const target = board[ty][tx]!
            const key = `${tx},${ty}`
            if (target.value === tile.value && !usedMerge.has(key)) {
              // Merge into target: tile slides into target, then target's value doubles
              tile.x = tx; tile.y = ty
              tile.merged = true
              target.value *= 2
              scoreRef.current += target.value
              merged.push(target)
              usedMerge.add(key)
              board[ny][nx] = null
              moved = true
              if (target.value === 2048 && phaseRef.current !== 'won') {
                phaseRef.current = 'won'
              }
              nx = tx; ny = ty
            }
            break
          }
        }

        if (nx !== x || ny !== y) {
          if (!tile.merged) {
            tile.x = nx; tile.y = ny
          }
          moved = true
        }
      }
    }

    if (!moved) return

    movingRef.current = true
    setTiles([...tilesRef.current])
    setScore(scoreRef.current)

    // After slide animation completes: remove merged tiles, spawn new one
    setTimeout(() => {
      tilesRef.current = tilesRef.current.filter(t => !t.merged)
      spawnTile()
      checkGameState()
      setTiles([...tilesRef.current])
      movingRef.current = false

      if (scoreRef.current > hiRef.current) {
        hiRef.current = scoreRef.current
        setHighScore(hiRef.current)
        window.api.settings.set(SAVE_KEY, JSON.stringify({ score: hiRef.current })).catch(() => {})
        onNewBest?.(hiRef.current)
      }
    }, 130)
  }

  function checkGameState(): void {
    if (phaseRef.current === 'won') {
      setPhase('won')
      return
    }
    // Game over: board is full and no merges possible
    if (tilesRef.current.length < SIZE * SIZE) return
    const board = buildBoard(tilesRef.current)
    for (let y = 0; y < SIZE; y++) {
      for (let x = 0; x < SIZE; x++) {
        const v = board[y][x]?.value
        if (!v) return
        if (x < SIZE - 1 && board[y][x + 1]?.value === v) return
        if (y < SIZE - 1 && board[y + 1][x]?.value === v) return
      }
    }
    phaseRef.current = 'lost'
    setPhase('lost')
  }

  function tileTransform(t: Tile): string {
    const px = GAP + t.x * (CELL + GAP)
    const py = GAP + t.y * (CELL + GAP)
    return `translate(${px}px, ${py}px)`
  }

  return (
    <div className={styles.body}>
      <div className={styles.hud}>
        <span>Score: <strong>{score}</strong></span>
        {highScore > 0 && <span>Best: {highScore}</span>}
      </div>
      <div className={styles.boardWrap}>
        <div className={styles.board} style={{ width: BOARD_PX, height: BOARD_PX }}>
          {/* Static cell backgrounds */}
          {Array.from({ length: SIZE * SIZE }).map((_, i) => {
            const x = i % SIZE, y = Math.floor(i / SIZE)
            return (
              <div
                key={i}
                className={styles.cellBg}
                style={{
                  width: CELL, height: CELL,
                  transform: `translate(${GAP + x * (CELL + GAP)}px, ${GAP + y * (CELL + GAP)}px)`
                }}
              />
            )
          })}
          {/* Animated tiles */}
          {tiles.map(t => {
            const colors = TILE_COLORS[t.value] || { bg: '#3c3a32', text: '#f9f6f2' }
            return (
              <div
                key={t.id}
                className={`${styles.tile} ${t.isNew ? styles.tileNew : ''} ${t.merged ? styles.tileMerged : ''}`}
                style={{
                  width: CELL, height: CELL,
                  transform: tileTransform(t),
                  background: colors.bg,
                  color: colors.text,
                  fontSize: t.value >= 1024 ? 26 : t.value >= 100 ? 30 : 36,
                  zIndex: t.merged ? 1 : 2
                }}
              >
                {t.value}
              </div>
            )
          })}
        </div>
        {phase !== 'playing' && (
          <div className={styles.overlay}>
            <span>{phase === 'won' ? '✨ You reached 2048!' : 'Game Over'}</span>
            <button className={styles.btn} onClick={initializeGame}>Play Again</button>
          </div>
        )}
      </div>
    </div>
  )
}
