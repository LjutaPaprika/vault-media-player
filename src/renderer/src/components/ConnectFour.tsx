import { useEffect, useRef, useState } from 'react'
import styles from './ConnectFour.module.css'

const COLS = 7, ROWS = 6, CELL = 60
const CANVAS_W = COLS * CELL, CANVAS_H = ROWS * CELL
const SAVE_KEY = 'connectFourWins'

const AI_DEPTH = 6
const DROP_PX_PER_S = 1700        // drop speed: 1700 px/s — feels weighty but snappy

type Player = 0 | 1 | 2
type Phase = 'idle' | 'playing' | 'won' | 'draw'

interface DropAnim {
  col: number
  targetRow: number
  player: Player
  y: number              // current top-of-disc canvas y
  done: boolean
}

export default function ConnectFour(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle')
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)
  const [draws, setDraws] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phaseRef = useRef<Phase>('idle')
  const boardRef = useRef<Player[][]>(Array.from({ length: ROWS }, () => Array(COLS).fill(0)))
  const currentPlayerRef = useRef<Player>(1)
  const winsRef = useRef(0)
  const lossesRef = useRef(0)
  const drawsRef = useRef(0)
  const hoverColRef = useRef(-1)
  const rafRef = useRef<number | null>(null)
  const dropRef = useRef<DropAnim | null>(null)
  const lastFrameRef = useRef(0)

  useEffect(() => {
    window.api.settings.get(SAVE_KEY, '{}').then(v => {
      try {
        const data = JSON.parse(v) as { wins?: number; losses?: number; draws?: number }
        winsRef.current = data.wins ?? 0
        lossesRef.current = data.losses ?? 0
        drawsRef.current = data.draws ?? 0
        setWins(winsRef.current)
        setLosses(lossesRef.current)
        setDraws(drawsRef.current)
      } catch { /* use defaults */ }
    })
  }, [])

  useEffect(() => { draw() }, [phase])

  useEffect(() => {
    function onMouseMove(e: MouseEvent): void {
      if (!canvasRef.current) return
      const rect = canvasRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      hoverColRef.current = Math.floor(x / CELL)
    }
    function onClick(e: MouseEvent): void {
      if (phaseRef.current !== 'playing' || !canvasRef.current) return
      if (currentPlayerRef.current !== 1) return
      if (dropRef.current) return                       // input locked during animation
      const rect = canvasRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const col = Math.floor(x / CELL)
      startDrop(col)
    }
    const c = canvasRef.current
    c?.addEventListener('mousemove', onMouseMove)
    c?.addEventListener('click', onClick)
    return () => {
      c?.removeEventListener('mousemove', onMouseMove)
      c?.removeEventListener('click', onClick)
    }
  }, [phase])

  function persistRecord(): void {
    window.api.settings.set(SAVE_KEY, JSON.stringify({
      wins: winsRef.current, losses: lossesRef.current, draws: drawsRef.current
    })).catch(() => {})
  }

  // Start a disc-drop animation in the given column for the current player.
  function startDrop(col: number): void {
    if (col < 0 || col >= COLS) return
    const targetRow = findLandingRow(boardRef.current, col)
    if (targetRow === -1) return
    dropRef.current = {
      col,
      targetRow,
      player: currentPlayerRef.current,
      y: -CELL,                                          // start just above the board
      done: false
    }
  }

  // Called when a drop animation finishes — commits the piece and advances turn.
  function commitDrop(anim: DropAnim): void {
    const board = boardRef.current
    board[anim.targetRow][anim.col] = anim.player
    if (checkWin(board, anim.col, anim.targetRow)) {
      phaseRef.current = 'won'
      setPhase('won')
      if (anim.player === 1) { winsRef.current++; setWins(winsRef.current) }
      else                   { lossesRef.current++; setLosses(lossesRef.current) }
      persistRecord()
      return
    }
    if (board.every(r => r.every(c => c !== 0))) {
      phaseRef.current = 'draw'
      setPhase('draw')
      drawsRef.current++
      setDraws(drawsRef.current)
      persistRecord()
      return
    }
    currentPlayerRef.current = (3 - anim.player) as Player
    if (currentPlayerRef.current === 2) {
      // Defer AI think so the player's disc renders settled before AI's drop starts
      setTimeout(aiTurn, 300)
    }
  }

  function aiTurn(): void {
    if (phaseRef.current !== 'playing') return
    if (dropRef.current) return
    const col = chooseColMinimax(boardRef.current, 2)
    startDrop(col)
  }

  function findLandingRow(board: Player[][], col: number): number {
    for (let row = ROWS - 1; row >= 0; row--) if (board[row][col] === 0) return row
    return -1
  }

  // ── AI: alpha-beta minimax + threat-based evaluation ────────────────────────

  // Static board score from `aiPlayer`'s perspective. Positive = good for aiPlayer.
  function evaluate(board: Player[][], aiPlayer: Player): number {
    const opp: Player = (3 - aiPlayer) as Player
    let score = 0
    // Center column control
    for (let r = 0; r < ROWS; r++) {
      if (board[r][3] === aiPlayer) score += 6
      else if (board[r][3] === opp) score -= 6
    }
    // All 4-in-a-row windows
    const windows: [number, number][][] = []
    // Horizontal
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c <= COLS - 4; c++)
        windows.push([[r, c], [r, c + 1], [r, c + 2], [r, c + 3]])
    // Vertical
    for (let r = 0; r <= ROWS - 4; r++)
      for (let c = 0; c < COLS; c++)
        windows.push([[r, c], [r + 1, c], [r + 2, c], [r + 3, c]])
    // Diagonal \
    for (let r = 0; r <= ROWS - 4; r++)
      for (let c = 0; c <= COLS - 4; c++)
        windows.push([[r, c], [r + 1, c + 1], [r + 2, c + 2], [r + 3, c + 3]])
    // Diagonal /
    for (let r = 3; r < ROWS; r++)
      for (let c = 0; c <= COLS - 4; c++)
        windows.push([[r, c], [r - 1, c + 1], [r - 2, c + 2], [r - 3, c + 3]])

    for (const w of windows) {
      let a = 0, o = 0
      for (const [r, c] of w) {
        const v = board[r][c]
        if (v === aiPlayer) a++
        else if (v === opp) o++
      }
      if (a > 0 && o > 0) continue                     // mixed window — no value
      if (a === 4) score += 1000
      else if (a === 3) score += 50
      else if (a === 2) score += 5
      if (o === 4) score -= 1100                       // weigh opponent threats slightly higher
      else if (o === 3) score -= 60
      else if (o === 2) score -= 5
    }
    return score
  }

  function isTerminal(board: Player[][]): boolean {
    // Check any winning 4 anywhere; also full board
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (board[r][c] !== 0 && checkWin(board, c, r)) return true
      }
    }
    return board[0].every(c => c !== 0)
  }

  function getValidCols(board: Player[][]): number[] {
    // Center-out order improves alpha-beta pruning
    const order = [3, 2, 4, 1, 5, 0, 6]
    return order.filter(c => board[0][c] === 0)
  }

  function minimax(
    board: Player[][], depth: number, alpha: number, beta: number,
    maxPlayer: boolean, aiPlayer: Player
  ): { score: number; col: number } {
    const valid = getValidCols(board)
    const terminal = isTerminal(board)
    if (depth === 0 || terminal || valid.length === 0) {
      return { score: terminal && !valid.length ? 0 : evaluate(board, aiPlayer), col: -1 }
    }

    let bestCol = valid[0]
    if (maxPlayer) {
      let best = -Infinity
      for (const c of valid) {
        const row = findLandingRow(board, c)
        if (row === -1) continue
        board[row][c] = aiPlayer
        const winNow = checkWin(board, c, row)
        let s: number
        if (winNow) s = 100000 + depth                   // prefer fast wins
        else s = minimax(board, depth - 1, alpha, beta, false, aiPlayer).score
        board[row][c] = 0
        if (s > best) { best = s; bestCol = c }
        alpha = Math.max(alpha, best)
        if (alpha >= beta) break
      }
      return { score: best, col: bestCol }
    } else {
      const opp: Player = (3 - aiPlayer) as Player
      let best = Infinity
      for (const c of valid) {
        const row = findLandingRow(board, c)
        if (row === -1) continue
        board[row][c] = opp
        const winNow = checkWin(board, c, row)
        let s: number
        if (winNow) s = -100000 - depth                  // opponent winning here is awful
        else s = minimax(board, depth - 1, alpha, beta, true, aiPlayer).score
        board[row][c] = 0
        if (s < best) { best = s; bestCol = c }
        beta = Math.min(beta, best)
        if (alpha >= beta) break
      }
      return { score: best, col: bestCol }
    }
  }

  function chooseColMinimax(board: Player[][], aiPlayer: Player): number {
    const { col } = minimax(board, AI_DEPTH, -Infinity, Infinity, true, aiPlayer)
    if (col === -1) {
      const valid = getValidCols(board)
      return valid[0] ?? 3
    }
    return col
  }

  function checkWin(board: Player[][], col: number, row: number): boolean {
    const player = board[row][col]
    if (!player) return false
    const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]]
    for (const [dx, dy] of dirs) {
      let count = 1
      for (let i = 1; i < 4; i++) {
        const nc = col + dx * i, nr = row + dy * i
        if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS && board[nr][nc] === player) count++
        else break
      }
      for (let i = 1; i < 4; i++) {
        const nc = col - dx * i, nr = row - dy * i
        if (nc >= 0 && nc < COLS && nr >= 0 && nr < ROWS && board[nr][nc] === player) count++
        else break
      }
      if (count >= 4) return true
    }
    return false
  }

  function startGame(): void {
    boardRef.current = Array.from({ length: ROWS }, () => Array(COLS).fill(0))
    currentPlayerRef.current = 1
    dropRef.current = null
    phaseRef.current = 'playing'
    setPhase('playing')
    lastFrameRef.current = performance.now()
    startRaf()
  }

  function backToMenu(): void {
    phaseRef.current = 'idle'
    setPhase('idle')
    dropRef.current = null
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }

  function startRaf(): void {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const loop = (t: number): void => {
      const dt = Math.min(0.05, (t - lastFrameRef.current) / 1000)
      lastFrameRef.current = t
      // Advance any active drop animation
      const anim = dropRef.current
      if (anim && !anim.done) {
        const targetY = anim.targetRow * CELL
        anim.y += DROP_PX_PER_S * dt
        if (anim.y >= targetY) {
          anim.y = targetY
          anim.done = true
        }
      }
      draw()
      // Commit after a one-frame display of the settled disc
      if (anim && anim.done) {
        const finished = anim
        dropRef.current = null
        commitDrop(finished)
      }
      if (phaseRef.current === 'playing' || dropRef.current) {
        rafRef.current = requestAnimationFrame(loop)
      }
    }
    rafRef.current = requestAnimationFrame(loop)
  }

  function draw(): void {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#1e3a5f'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    const board = boardRef.current
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const x = c * CELL + 2, y = r * CELL + 2
        ctx.fillStyle = '#0c1a2e'
        ctx.fillRect(x, y, CELL - 4, CELL - 4)
        const cell = board[r]?.[c]
        if (cell === 1) drawDisc(ctx, x, y, '#ef4444')
        else if (cell === 2) drawDisc(ctx, x, y, '#eab308')
      }
    }

    // In-flight drop
    const anim = dropRef.current
    if (anim) {
      const x = anim.col * CELL + 2
      drawDisc(ctx, x, anim.y + 2, anim.player === 1 ? '#ef4444' : '#eab308')
    }

    if (phaseRef.current === 'playing' && hoverColRef.current >= 0 && hoverColRef.current < COLS && currentPlayerRef.current === 1 && !anim) {
      const c = hoverColRef.current
      const x = c * CELL + 2, y = 2
      ctx.fillStyle = '#ef4444'
      ctx.globalAlpha = 0.5
      ctx.beginPath()
      ctx.arc(x + CELL / 2 - 2, y + CELL / 2 - 2, CELL / 2 - 6, 0, Math.PI * 2)
      ctx.fill()
      ctx.globalAlpha = 1
    }
  }

  function drawDisc(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(x + CELL / 2 - 2, y + CELL / 2 - 2, CELL / 2 - 6, 0, Math.PI * 2)
    ctx.fill()
  }

  return (
    <div className={styles.body}>
      <div className={styles.header}>
        <span>Wins <strong>{wins}</strong></span>
        <span>Losses <strong>{losses}</strong></span>
        <span>Draws <strong>{draws}</strong></span>
        {phase !== 'idle' && (
          <button className={styles.backBtn} onClick={backToMenu}>← Menu</button>
        )}
      </div>
      {phase === 'idle' ? (
        <div className={styles.result}>
          <span className={styles.title}>Connect Four</span>
          <button className={styles.btn} onClick={startGame}>PLAY vs AI</button>
        </div>
      ) : (
        <>
          <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className={styles.canvas} />
          {phase === 'won' && (
            <div className={styles.result}>
              <span className={styles.title}>{currentPlayerRef.current === 1 ? 'You Win!' : 'AI Wins'}</span>
              <button className={styles.btn} onClick={startGame}>PLAY AGAIN</button>
            </div>
          )}
          {phase === 'draw' && (
            <div className={styles.result}>
              <span className={styles.title}>Draw!</span>
              <button className={styles.btn} onClick={startGame}>PLAY AGAIN</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
