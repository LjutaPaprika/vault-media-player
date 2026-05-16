import { useEffect, useRef, useState } from 'react'
import styles from './Minesweeper.module.css'

const SAVE_KEY = 'minesweeperBest'
const PRESETS = {
  beginner:     { cols: 9,  rows: 9,  mines: 10, cellPx: 30 },
  intermediate: { cols: 16, rows: 16, mines: 40, cellPx: 26 },
  expert:       { cols: 30, rows: 16, mines: 99, cellPx: 22 }
}

type Difficulty = 'beginner' | 'intermediate' | 'expert'
type Phase = 'playing' | 'won' | 'lost'

const NUM_COLORS: Record<number, string> = {
  1: '#3b82f6', 2: '#22c55e', 3: '#ef4444', 4: '#1d4ed8',
  5: '#7f1d1d', 6: '#06b6d4', 7: '#374151', 8: '#9ca3af'
}

interface Cell {
  mine: boolean
  revealed: boolean
  flagged: boolean
  adjCount: number
}

interface BestTimes {
  beginner?: number
  intermediate?: number
  expert?: number
}

interface MinesweeperProps {
  onNewBest?: (diff: Difficulty, time: number) => void
}

export default function Minesweeper({ onNewBest }: MinesweeperProps): JSX.Element {
  const [difficulty, setDifficulty] = useState<Difficulty>('beginner')
  const [phase, setPhase] = useState<Phase>('playing')
  const [displayTime, setDisplayTime] = useState(0)
  const [displayFlags, setDisplayFlags] = useState(0)
  const [best, setBest] = useState<BestTimes>({})
  const [version, setVersion] = useState(0)

  const gridRef = useRef<Cell[][]>([])
  const phaseRef = useRef<Phase>('playing')
  const startTimeRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const firstClickRef = useRef(true)
  const revealedRef = useRef(0)
  const flagCountRef = useRef(0)

  useEffect(() => {
    window.api.settings.get(SAVE_KEY, '{}').then(v => {
      try { setBest(JSON.parse(v) as BestTimes) } catch { /* use defaults */ }
    })
    initializeGrid('beginner')
    return () => { if (timerRef.current) clearInterval(timerRef.current) }
  }, [])

  function initializeGrid(diff: Difficulty): void {
    const preset = PRESETS[diff]
    gridRef.current = Array.from({ length: preset.rows }, () =>
      Array.from({ length: preset.cols }, () => ({
        mine: false, revealed: false, flagged: false, adjCount: 0
      }))
    )
    firstClickRef.current = true
    revealedRef.current = 0
    flagCountRef.current = 0
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
    setDisplayTime(0)
    setDisplayFlags(0)
    phaseRef.current = 'playing'
    setPhase('playing')
    setVersion(v => v + 1)
  }

  function generateMines(startX: number, startY: number): void {
    const preset = PRESETS[difficulty]
    const grid = gridRef.current
    let placed = 0
    while (placed < preset.mines) {
      const x = Math.floor(Math.random() * preset.cols)
      const y = Math.floor(Math.random() * preset.rows)
      if (!grid[y][x].mine && !(x === startX && y === startY)) {
        grid[y][x].mine = true
        placed++
      }
    }
    for (let y = 0; y < preset.rows; y++) {
      for (let x = 0; x < preset.cols; x++) {
        if (grid[y][x].mine) continue
        let count = 0
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const ny = y + dy, nx = x + dx
            if (ny >= 0 && ny < preset.rows && nx >= 0 && nx < preset.cols && grid[ny][nx].mine) count++
          }
        }
        grid[y][x].adjCount = count
      }
    }
  }

  function floodReveal(startX: number, startY: number): void {
    const preset = PRESETS[difficulty]
    const stack: [number, number][] = [[startX, startY]]
    while (stack.length > 0) {
      const [x, y] = stack.pop()!
      if (x < 0 || x >= preset.cols || y < 0 || y >= preset.rows) continue
      const cell = gridRef.current[y][x]
      if (cell.revealed || cell.flagged || cell.mine) continue
      cell.revealed = true
      revealedRef.current++
      if (cell.adjCount === 0) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue
            stack.push([x + dx, y + dy])
          }
        }
      }
    }
  }

  function revealCell(x: number, y: number): void {
    if (phaseRef.current !== 'playing') return
    const preset = PRESETS[difficulty]
    if (x < 0 || x >= preset.cols || y < 0 || y >= preset.rows) return
    const cell = gridRef.current[y][x]
    if (cell.revealed || cell.flagged) return

    if (firstClickRef.current) {
      generateMines(x, y)
      firstClickRef.current = false
      startTimeRef.current = Date.now()
      timerRef.current = setInterval(() => {
        setDisplayTime(Math.floor((Date.now() - startTimeRef.current) / 1000))
      }, 250)
    }

    if (cell.mine) {
      // Reveal all mines for the loss state
      for (const row of gridRef.current) for (const c of row) if (c.mine) c.revealed = true
      phaseRef.current = 'lost'
      setPhase('lost')
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      setVersion(v => v + 1)
      return
    }

    floodReveal(x, y)

    if (revealedRef.current === preset.cols * preset.rows - preset.mines) {
      phaseRef.current = 'won'
      setPhase('won')
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
      const time = Math.floor((Date.now() - startTimeRef.current) / 1000)
      const oldTime = best[difficulty]
      if (!oldTime || time < oldTime) {
        const newBest = { ...best, [difficulty]: time }
        setBest(newBest)
        window.api.settings.set(SAVE_KEY, JSON.stringify(newBest)).catch(() => {})
        onNewBest?.(difficulty, time)
      }
    }
    setVersion(v => v + 1)
  }

  function toggleFlag(x: number, y: number): void {
    if (phaseRef.current !== 'playing') return
    const preset = PRESETS[difficulty]
    if (x < 0 || x >= preset.cols || y < 0 || y >= preset.rows) return
    const cell = gridRef.current[y][x]
    if (cell.revealed) return
    cell.flagged = !cell.flagged
    flagCountRef.current += cell.flagged ? 1 : -1
    setDisplayFlags(flagCountRef.current)
    setVersion(v => v + 1)
  }

  function onGridClick(e: React.MouseEvent<HTMLDivElement>): void {
    const target = e.target as HTMLElement
    const x = parseInt(target.dataset.x ?? '', 10)
    const y = parseInt(target.dataset.y ?? '', 10)
    if (Number.isNaN(x) || Number.isNaN(y)) return
    revealCell(x, y)
  }

  function onGridContextMenu(e: React.MouseEvent<HTMLDivElement>): void {
    e.preventDefault()
    const target = e.target as HTMLElement
    const x = parseInt(target.dataset.x ?? '', 10)
    const y = parseInt(target.dataset.y ?? '', 10)
    if (Number.isNaN(x) || Number.isNaN(y)) return
    toggleFlag(x, y)
  }

  function changeDifficulty(d: Difficulty): void {
    setDifficulty(d)
    initializeGrid(d)
  }

  const preset = PRESETS[difficulty]
  const flagsRemaining = Math.max(0, preset.mines - displayFlags)
  const bestTime = best[difficulty]

  return (
    <div className={styles.body}>
      <div className={styles.header}>
        <div className={styles.modeSelect}>
          {(['beginner', 'intermediate', 'expert'] as Difficulty[]).map(d => (
            <button
              key={d}
              className={`${styles.modeBtn} ${difficulty === d ? styles.modeBtnActive : ''}`}
              onClick={() => changeDifficulty(d)}
            >
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
        <div className={styles.stats}>
          <span>🚩 {flagsRemaining}</span>
          <span>⏱️ {displayTime}s</span>
        </div>
      </div>
      <div className={styles.bestsRow}>
        {(['beginner', 'intermediate', 'expert'] as Difficulty[]).map(d => (
          <span key={d} className={`${styles.bestPill} ${difficulty === d ? styles.bestPillActive : ''}`}>
            <span className={styles.bestPillLabel}>{d.charAt(0).toUpperCase() + d.slice(1)}</span>
            <span className={styles.bestPillVal}>{best[d] != null ? `${best[d]}s` : '—'}</span>
          </span>
        ))}
      </div>

      <div className={styles.gameArea}>
        <div
          className={styles.grid}
          style={{
            gridTemplateColumns: `repeat(${preset.cols}, ${preset.cellPx}px)`,
            gridAutoRows: `${preset.cellPx}px`
          }}
          onClick={onGridClick}
          onContextMenu={onGridContextMenu}
          data-version={version}
        >
          {gridRef.current.flatMap((row, y) =>
            row.map((cell, x) => {
              const cls = cell.revealed ? styles.cellRevealed : cell.flagged ? styles.cellFlagged : styles.cell
              const content = cell.flagged ? '🚩' : cell.revealed ? (cell.mine ? '💣' : cell.adjCount > 0 ? cell.adjCount : '') : ''
              const color = cell.revealed && !cell.mine && cell.adjCount > 0 ? NUM_COLORS[cell.adjCount] : undefined
              return (
                <div
                  key={`${x},${y}`}
                  className={cls}
                  data-x={x}
                  data-y={y}
                  style={color ? { color } : undefined}
                >
                  {content}
                </div>
              )
            })
          )}
        </div>

        {(phase === 'won' || phase === 'lost') && (
          <div className={styles.overlay}>
            <div className={styles.message}>
              {phase === 'won' ? `✨ You Won! ${displayTime}s` : '💥 Game Over'}
            </div>
            {bestTime && <span className={styles.bestTime}>Best: {bestTime}s</span>}
            <button className={styles.btn} onClick={() => initializeGrid(difficulty)}>Play Again</button>
          </div>
        )}
      </div>
    </div>
  )
}
