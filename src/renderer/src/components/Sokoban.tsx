import { useEffect, useRef, useState } from 'react'
import { SOKOBAN_LEVELS } from './sokobanLevels'
import styles from './Sokoban.module.css'

const SAVE_KEY = 'sokobanProgress'
const CELL = 48

type Tile = 'wall' | 'floor' | 'target' | 'box' | 'boxOnTarget' | 'player' | 'playerOnTarget' | 'outside'

interface Cell { wall: boolean; target: boolean; box: boolean; outside: boolean }
interface State { grid: Cell[][]; px: number; py: number }
interface Progress {
  bestMoves: number[]     // index per level — best moves count, 0 = uncleared
}

const INITIAL_PROGRESS: Progress = {
  bestMoves: Array(SOKOBAN_LEVELS.length).fill(0)
}

function parseLevel(ascii: string): State {
  const rows = ascii.split('\n')
  const cols = Math.max(...rows.map((r) => r.length))
  const grid: Cell[][] = []
  let px = 0, py = 0
  for (let r = 0; r < rows.length; r++) {
    const row: Cell[] = []
    for (let c = 0; c < cols; c++) {
      const ch = rows[r][c] ?? ' '
      const cell: Cell = { wall: false, target: false, box: false, outside: false }
      if (ch === '#') cell.wall = true
      else if (ch === '.') cell.target = true
      else if (ch === '$') cell.box = true
      else if (ch === '*') { cell.box = true; cell.target = true }
      else if (ch === '@') { px = c; py = r }
      else if (ch === '+') { px = c; py = r; cell.target = true }
      row.push(cell)
    }
    grid.push(row)
  }
  // Flood-fill exterior: any non-wall cell reachable from the grid boundary
  // without crossing a wall is "outside the room" — mark it so movement is
  // blocked there and it renders as void.
  const seen = new Set<string>()
  const stack: [number, number][] = []
  const tryPush = (r: number, c: number): void => {
    if (r < 0 || r >= grid.length || c < 0 || c >= cols) return
    if (seen.has(`${r},${c}`)) return
    if (grid[r][c].wall) return
    seen.add(`${r},${c}`)
    stack.push([r, c])
  }
  for (let r = 0; r < grid.length; r++) { tryPush(r, 0); tryPush(r, cols - 1) }
  for (let c = 0; c < cols; c++) { tryPush(0, c); tryPush(grid.length - 1, c) }
  while (stack.length) {
    const [r, c] = stack.pop()!
    grid[r][c].outside = true
    tryPush(r - 1, c); tryPush(r + 1, c); tryPush(r, c - 1); tryPush(r, c + 1)
  }
  return { grid, px, py }
}

function cloneState(s: State): State {
  return {
    grid: s.grid.map((row) => row.map((c) => ({ ...c }))),
    px: s.px,
    py: s.py
  }
}

function tryMove(s: State, dx: number, dy: number): State | null {
  const nx = s.px + dx
  const ny = s.py + dy
  const row = s.grid[ny]
  if (!row) return null
  const target = row[nx]
  if (!target || target.wall || target.outside) return null
  if (target.box) {
    const bx = nx + dx
    const by = ny + dy
    const bcell = s.grid[by]?.[bx]
    if (!bcell || bcell.wall || bcell.outside || bcell.box) return null
    const next = cloneState(s)
    next.grid[ny][nx].box = false
    next.grid[by][bx].box = true
    next.px = nx
    next.py = ny
    return next
  }
  const next = cloneState(s)
  next.px = nx
  next.py = ny
  return next
}

function isSolved(s: State): boolean {
  for (const row of s.grid) {
    for (const cell of row) {
      if (cell.box && !cell.target) return false
      if (cell.target && !cell.box) return false
    }
  }
  return true
}

export default function Sokoban(): JSX.Element {
  const [levelIdx, setLevelIdx] = useState(0)
  const [state, setState] = useState<State>(() => parseLevel(SOKOBAN_LEVELS[0]))
  const [moves, setMoves] = useState(0)
  const [progress, setProgress] = useState<Progress>(INITIAL_PROGRESS)
  const [solved, setSolved] = useState(false)

  const stateRef = useRef<State>(state)
  const movesRef = useRef(0)
  const historyRef = useRef<State[]>([])
  const levelRef = useRef(0)
  const solvedRef = useRef(false)
  const progressRef = useRef<Progress>(INITIAL_PROGRESS)

  useEffect(() => {
    window.api.settings.get(SAVE_KEY, '{}').then((v) => {
      try {
        const data = JSON.parse(v) as Partial<Progress>
        const arr = Array.isArray(data.bestMoves) ? data.bestMoves : []
        const padded = SOKOBAN_LEVELS.map((_, i) => arr[i] ?? 0)
        progressRef.current = { bestMoves: padded }
        setProgress(progressRef.current)
      } catch { /* defaults */ }
    })
  }, [])

  function loadLevel(idx: number): void {
    const fresh = parseLevel(SOKOBAN_LEVELS[idx])
    stateRef.current = fresh
    movesRef.current = 0
    historyRef.current = []
    levelRef.current = idx
    solvedRef.current = false
    setState(fresh)
    setMoves(0)
    setLevelIdx(idx)
    setSolved(false)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const k = e.key
      const captureKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'r', 'R', 'z', 'Z', 'u', 'U']
      if (captureKeys.includes(k)) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
      if (solvedRef.current) return
      let dx = 0, dy = 0
      if (k === 'ArrowUp' || k === 'w' || k === 'W') dy = -1
      else if (k === 'ArrowDown' || k === 's' || k === 'S') dy = 1
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A') dx = -1
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') dx = 1
      else if (k === 'r' || k === 'R') { loadLevel(levelRef.current); return }
      else if (k === 'z' || k === 'Z' || k === 'u' || k === 'U') {
        undo()
        return
      }
      else return

      const next = tryMove(stateRef.current, dx, dy)
      if (!next) return
      historyRef.current.push(stateRef.current)
      stateRef.current = next
      movesRef.current++
      setState(next)
      setMoves(movesRef.current)
      if (isSolved(next)) {
        solvedRef.current = true
        setSolved(true)
        recordWin(movesRef.current)
      }
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [])

  function undo(): void {
    const prev = historyRef.current.pop()
    if (!prev) return
    stateRef.current = prev
    movesRef.current = Math.max(0, movesRef.current - 1)
    setState(prev)
    setMoves(movesRef.current)
  }

  function recordWin(movesUsed: number): void {
    const newBest = [...progressRef.current.bestMoves]
    const prev = newBest[levelRef.current] ?? 0
    if (prev === 0 || movesUsed < prev) {
      newBest[levelRef.current] = movesUsed
    }
    progressRef.current = { bestMoves: newBest }
    setProgress(progressRef.current)
    window.api.settings.set(SAVE_KEY, JSON.stringify(progressRef.current)).catch(() => {})
  }

  function tileAt(r: number, c: number): Tile {
    const cell = state.grid[r][c]
    if (cell.outside) return 'outside'
    if (cell.wall) return 'wall'
    if (state.py === r && state.px === c) return cell.target ? 'playerOnTarget' : 'player'
    if (cell.box) return cell.target ? 'boxOnTarget' : 'box'
    if (cell.target) return 'target'
    return 'floor'
  }

  const rows = state.grid.length
  const cols = state.grid[0]?.length ?? 0
  const bestForLevel = progress.bestMoves[levelIdx]
  const cleared = progress.bestMoves.filter((m) => m > 0).length

  return (
    <div className={styles.body}>
      <div className={styles.hud}>
        <span>Level <strong>{levelIdx + 1}</strong> / {SOKOBAN_LEVELS.length}</span>
        <span>Moves <strong>{moves}</strong></span>
        {bestForLevel > 0 && <span className={styles.best}>best {bestForLevel}</span>}
        <span className={styles.cleared}>{cleared} cleared</span>
      </div>
      <div className={styles.boardWrap}>
        <div className={styles.board} style={{ width: cols * CELL, height: rows * CELL }}>
          {state.grid.map((row, r) =>
            row.map((_, c) => {
              const t = tileAt(r, c)
              return (
                <div
                  key={`${r}-${c}`}
                  className={`${styles.cell} ${styles[t]}`}
                  style={{ left: c * CELL, top: r * CELL, width: CELL, height: CELL }}
                />
              )
            })
          )}
        </div>
        {solved && (
          <div className={styles.overlay}>
            <span className={styles.title}>✨ Solved!</span>
            <span className={styles.score}>{moves} moves{bestForLevel === moves && moves !== 0 ? ' (new best)' : ''}</span>
            <div className={styles.btnRow}>
              {levelIdx + 1 < SOKOBAN_LEVELS.length && (
                <button className={styles.btn} onClick={() => loadLevel(levelIdx + 1)}>
                  Next Level
                </button>
              )}
              <button className={styles.btnSecondary} onClick={() => loadLevel(levelIdx)}>
                Replay
              </button>
            </div>
          </div>
        )}
      </div>
      <div className={styles.controls}>
        <div className={styles.levelRow}>
          <button
            className={styles.smallBtn}
            disabled={levelIdx === 0}
            onClick={() => loadLevel(levelIdx - 1)}
          >
            ‹ Prev
          </button>
          <label className={styles.jumpLabel}>
            Jump to
            <input
              type="number"
              min={1}
              max={SOKOBAN_LEVELS.length}
              value={levelIdx + 1}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10)
                if (!isNaN(n) && n >= 1 && n <= SOKOBAN_LEVELS.length) loadLevel(n - 1)
              }}
              className={styles.jumpInput}
            />
          </label>
          <button
            className={styles.smallBtn}
            disabled={levelIdx === SOKOBAN_LEVELS.length - 1}
            onClick={() => loadLevel(levelIdx + 1)}
          >
            Next ›
          </button>
          <button className={styles.smallBtn} onClick={() => loadLevel(levelIdx)}>Restart (R)</button>
          <button className={styles.smallBtn} onClick={undo} disabled={historyRef.current.length === 0}>Undo (Z)</button>
        </div>
        <span className={styles.hint}>Arrows / WASD to move · Z to undo · R to reset</span>
      </div>
    </div>
  )
}
