import { useEffect, useRef, useState } from 'react'
import styles from './Reversi.module.css'

const SAVE_KEY = 'reversiRecord'
const SIZE = 8
const EMPTY = 0, BLACK = 1, WHITE = 2
const AI_DEPTH = 4

type Cell = 0 | 1 | 2
type Player = 1 | 2
type Board = Cell[][]
type Phase = 'idle' | 'playerTurn' | 'aiTurn' | 'gameOver'

// All 8 directions for flank checks
const DIRS: [number, number][] = [
  [-1, -1], [-1, 0], [-1, 1],
  [ 0, -1],          [ 0, 1],
  [ 1, -1], [ 1, 0], [ 1, 1]
]

// Positional weights for AI evaluation: corners are gold, X-squares (diagonals
// to corners) are poison, edges are good, interior is neutral.
const WEIGHTS: number[][] = [
  [120, -20,  20,   5,   5,  20, -20, 120],
  [-20, -40,  -5,  -5,  -5,  -5, -40, -20],
  [ 20,  -5,  15,   3,   3,  15,  -5,  20],
  [  5,  -5,   3,   3,   3,   3,  -5,   5],
  [  5,  -5,   3,   3,   3,   3,  -5,   5],
  [ 20,  -5,  15,   3,   3,  15,  -5,  20],
  [-20, -40,  -5,  -5,  -5,  -5, -40, -20],
  [120, -20,  20,   5,   5,  20, -20, 120]
]

function emptyBoard(): Board {
  return Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(EMPTY))
}

function startingBoard(): Board {
  const b = emptyBoard()
  const m = SIZE / 2
  b[m - 1][m - 1] = WHITE
  b[m - 1][m]     = BLACK
  b[m][m - 1]     = BLACK
  b[m][m]         = WHITE
  return b
}

function opponent(p: Player): Player {
  return p === BLACK ? WHITE : BLACK
}

// Returns list of cells flipped if `player` plays at (r, c) on `board`, or
// empty array if not a legal move.
function flipsFor(board: Board, r: number, c: number, player: Player): [number, number][] {
  if (board[r][c] !== EMPTY) return []
  const opp = opponent(player)
  const flips: [number, number][] = []
  for (const [dr, dc] of DIRS) {
    const line: [number, number][] = []
    let nr = r + dr, nc = c + dc
    while (nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr][nc] === opp) {
      line.push([nr, nc])
      nr += dr; nc += dc
    }
    if (line.length > 0 && nr >= 0 && nr < SIZE && nc >= 0 && nc < SIZE && board[nr][nc] === player) {
      flips.push(...line)
    }
  }
  return flips
}

function legalMoves(board: Board, player: Player): Map<string, [number, number][]> {
  const moves = new Map<string, [number, number][]>()
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const flips = flipsFor(board, r, c, player)
      if (flips.length > 0) moves.set(`${r},${c}`, flips)
    }
  }
  return moves
}

function applyMove(board: Board, r: number, c: number, player: Player, flips: [number, number][]): Board {
  const next = board.map((row) => [...row])
  next[r][c] = player
  for (const [fr, fc] of flips) next[fr][fc] = player
  return next
}

function countPieces(board: Board): { black: number; white: number } {
  let black = 0, white = 0
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === BLACK) black++
      else if (board[r][c] === WHITE) white++
    }
  }
  return { black, white }
}

// Evaluation function from WHITE (AI)'s perspective: positive = good for AI.
// Combines positional weights with mobility (legal-move count differential).
function evaluate(board: Board): number {
  let score = 0
  let blackMobility = 0, whiteMobility = 0
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] === WHITE) score += WEIGHTS[r][c]
      else if (board[r][c] === BLACK) score -= WEIGHTS[r][c]
    }
  }
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (board[r][c] !== EMPTY) continue
      if (flipsFor(board, r, c, BLACK).length > 0) blackMobility++
      if (flipsFor(board, r, c, WHITE).length > 0) whiteMobility++
    }
  }
  score += (whiteMobility - blackMobility) * 2
  return score
}

// Minimax with alpha-beta pruning. AI is WHITE (maximizing).
function minimax(board: Board, depth: number, player: Player, alpha: number, beta: number): number {
  if (depth === 0) return evaluate(board)
  const moves = legalMoves(board, player)
  if (moves.size === 0) {
    const oppMoves = legalMoves(board, opponent(player))
    if (oppMoves.size === 0) {
      // Game over — return raw piece differential, scaled to dominate eval
      const { black, white } = countPieces(board)
      return (white - black) * 1000
    }
    // Pass turn
    return minimax(board, depth - 1, opponent(player), alpha, beta)
  }
  const maximizing = player === WHITE
  let best = maximizing ? -Infinity : Infinity
  for (const [key, flips] of moves) {
    const [r, c] = key.split(',').map(Number)
    const next = applyMove(board, r, c, player, flips)
    const score = minimax(next, depth - 1, opponent(player), alpha, beta)
    if (maximizing) {
      if (score > best) best = score
      if (best > alpha) alpha = best
    } else {
      if (score < best) best = score
      if (best < beta) beta = best
    }
    if (beta <= alpha) break
  }
  return best
}

function pickAIMove(board: Board): [number, number] | null {
  const moves = legalMoves(board, WHITE)
  if (moves.size === 0) return null
  let best: [number, number] | null = null
  let bestScore = -Infinity
  let alpha = -Infinity
  const beta = Infinity
  for (const [key, flips] of moves) {
    const [r, c] = key.split(',').map(Number)
    const next = applyMove(board, r, c, WHITE, flips)
    const score = minimax(next, AI_DEPTH - 1, BLACK, alpha, beta)
    if (score > bestScore) {
      bestScore = score
      best = [r, c]
    }
    if (score > alpha) alpha = score
  }
  return best
}

export default function Reversi(): JSX.Element {
  const [board, setBoard] = useState<Board>(startingBoard)
  const [phase, setPhase] = useState<Phase>('idle')
  const [counts, setCounts] = useState({ black: 2, white: 2 })
  const [legal, setLegal] = useState<Map<string, [number, number][]>>(new Map())
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [draws, setDraws] = useState(0)
  const [lastMove, setLastMove] = useState<[number, number] | null>(null)

  const boardRef = useRef<Board>(board)
  const phaseRef = useRef<Phase>('idle')
  const winsRef = useRef(0)
  const lossesRef = useRef(0)
  const drawsRef = useRef(0)
  const aiThinkingRef = useRef(false)

  useEffect(() => {
    window.api.settings.get(SAVE_KEY, '{}').then((v) => {
      try {
        const data = JSON.parse(v) as { wins?: number; losses?: number; draws?: number }
        winsRef.current = data.wins ?? 0
        lossesRef.current = data.losses ?? 0
        drawsRef.current = data.draws ?? 0
        setWins(winsRef.current)
        setLosses(lossesRef.current)
        setDraws(drawsRef.current)
      } catch { /* defaults */ }
    })
  }, [])

  function startGame(): void {
    const b = startingBoard()
    boardRef.current = b
    setBoard(b)
    setCounts(countPieces(b))
    setLegal(legalMoves(b, BLACK))
    setLastMove(null)
    phaseRef.current = 'playerTurn'
    setPhase('playerTurn')
  }

  function endGame(): void {
    phaseRef.current = 'gameOver'
    setPhase('gameOver')
    const { black, white } = countPieces(boardRef.current)
    if (black > white) winsRef.current++
    else if (white > black) lossesRef.current++
    else drawsRef.current++
    setWins(winsRef.current)
    setLosses(lossesRef.current)
    setDraws(drawsRef.current)
    window.api.settings.set(SAVE_KEY, JSON.stringify({
      wins: winsRef.current, losses: lossesRef.current, draws: drawsRef.current
    })).catch(() => {})
  }

  function advanceTo(player: Player, b: Board): void {
    const moves = legalMoves(b, player)
    if (moves.size === 0) {
      const oppMoves = legalMoves(b, opponent(player))
      if (oppMoves.size === 0) {
        endGame()
        return
      }
      // Pass — opponent plays again
      if (player === BLACK) {
        // Player must pass; AI takes turn
        scheduleAIMove(b)
      } else {
        // AI must pass; player takes turn
        setLegal(oppMoves)
        phaseRef.current = 'playerTurn'
        setPhase('playerTurn')
      }
      return
    }
    if (player === BLACK) {
      setLegal(moves)
      phaseRef.current = 'playerTurn'
      setPhase('playerTurn')
    } else {
      scheduleAIMove(b)
    }
  }

  function scheduleAIMove(b: Board): void {
    setLegal(new Map())
    phaseRef.current = 'aiTurn'
    setPhase('aiTurn')
    aiThinkingRef.current = true
    // setTimeout lets the "AI thinking" indicator render before the heavy compute
    setTimeout(() => {
      const move = pickAIMove(b)
      aiThinkingRef.current = false
      if (!move) {
        advanceTo(BLACK, b)
        return
      }
      const [r, c] = move
      const flips = flipsFor(b, r, c, WHITE)
      const next = applyMove(b, r, c, WHITE, flips)
      boardRef.current = next
      setBoard(next)
      setCounts(countPieces(next))
      setLastMove([r, c])
      advanceTo(BLACK, next)
    }, 320)
  }

  function onCellClick(r: number, c: number): void {
    if (phaseRef.current !== 'playerTurn') return
    const flips = legal.get(`${r},${c}`)
    if (!flips) return
    const next = applyMove(board, r, c, BLACK, flips)
    boardRef.current = next
    setBoard(next)
    setCounts(countPieces(next))
    setLastMove([r, c])
    advanceTo(WHITE, next)
  }

  const { black, white } = counts
  const totalGames = wins + losses + draws
  const gameOverResult = phase === 'gameOver'
    ? (black > white ? 'You Win!' : white > black ? 'CPU Wins' : 'Draw')
    : null

  return (
    <div className={styles.body}>
      <div className={styles.hud}>
        <span className={styles.youScore}>
          <span className={styles.discMini} /> You <strong>{black}</strong>
        </span>
        <span className={styles.cpuScore}>
          <span className={`${styles.discMini} ${styles.discMiniWhite}`} /> CPU <strong>{white}</strong>
        </span>
        <span className={styles.best}>
          {totalGames > 0 ? `${wins}W · ${losses}L · ${draws}D` : 'Flank to flip'}
        </span>
      </div>
      <div className={styles.board}>
        {board.map((row, r) =>
          row.map((cell, c) => {
            const isLegal = phase === 'playerTurn' && legal.has(`${r},${c}`)
            const isLast = lastMove && lastMove[0] === r && lastMove[1] === c
            return (
              <button
                key={`${r}-${c}`}
                className={`${styles.cell} ${isLegal ? styles.legal : ''} ${isLast ? styles.lastMove : ''}`}
                onClick={() => onCellClick(r, c)}
                disabled={phase !== 'playerTurn'}
              >
                {cell !== EMPTY && (
                  <span className={`${styles.disc} ${cell === BLACK ? styles.discBlack : styles.discWhite}`} />
                )}
              </button>
            )
          })
        )}
      </div>
      {phase === 'idle' || phase === 'gameOver' ? (
        <div className={styles.endBanner}>
          {gameOverResult && (
            <span className={styles.endTitle}>
              {gameOverResult === 'You Win!' && '🏆 '}
              {gameOverResult === 'CPU Wins' && '💀 '}
              {gameOverResult === 'Draw' && '🤝 '}
              {gameOverResult}
              <span className={styles.endScore}> {black} — {white}</span>
            </span>
          )}
          <button className={styles.btn} onClick={startGame}>
            {phase === 'idle' ? 'Start' : 'Play Again'}
          </button>
        </div>
      ) : (
        <div className={styles.turnIndicator}>
          {phase === 'aiTurn' ? (
            <span className={styles.thinking}>CPU thinking…</span>
          ) : legal.size === 0 ? (
            <span className={styles.passNote}>No legal moves — pass</span>
          ) : (
            <span className={styles.yourTurn}>Your turn · {legal.size} legal moves</span>
          )}
        </div>
      )}
    </div>
  )
}
