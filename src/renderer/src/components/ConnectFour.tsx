import { useEffect, useRef, useState } from 'react'
import styles from './ConnectFour.module.css'

const COLS = 7, ROWS = 6, CELL = 60
const CANVAS_W = COLS * CELL, CANVAS_H = ROWS * CELL
const SAVE_KEY = 'connectFourWins'

type Player = 0 | 1 | 2
type Phase = 'idle' | 'playing' | 'won' | 'draw'

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
      const rect = canvasRef.current.getBoundingClientRect()
      const x = e.clientX - rect.left
      const col = Math.floor(x / CELL)
      dropPiece(col)
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

  function dropPiece(col: number): void {
    if (col < 0 || col >= COLS) return
    const board = boardRef.current
    for (let row = ROWS - 1; row >= 0; row--) {
      if (board[row][col] === 0) {
        board[row][col] = currentPlayerRef.current
        if (checkWin(board, col, row)) {
          phaseRef.current = 'won'
          setPhase('won')
          if (currentPlayerRef.current === 1) { winsRef.current++; setWins(winsRef.current) }
          else { lossesRef.current++; setLosses(lossesRef.current) }
          persistRecord()
        } else if (board.every(r => r.every(c => c !== 0))) {
          phaseRef.current = 'draw'
          setPhase('draw')
          drawsRef.current++
          setDraws(drawsRef.current)
          persistRecord()
        } else {
          currentPlayerRef.current = (3 - currentPlayerRef.current) as Player
          if (currentPlayerRef.current === 2) setTimeout(aiTurn, 500)
        }
        return
      }
    }
  }

  function aiTurn(): void {
    if (phaseRef.current !== 'playing') return
    dropPiece(chooseCol())
  }

  function chooseCol(): number {
    const board = boardRef.current
    const winCol = canWin(board, 2)
    if (winCol !== -1) return winCol
    const blockCol = canWin(board, 1)
    if (blockCol !== -1) return blockCol
    const validCols = Array.from({ length: COLS }, (_, i) => i).filter(c => board[0][c] === 0)
    if (validCols.includes(3)) return 3
    return validCols[Math.floor(Math.random() * validCols.length)]
  }

  function canWin(board: Player[][], player: Player): number {
    for (let col = 0; col < COLS; col++) {
      for (let row = ROWS - 1; row >= 0; row--) {
        if (board[row][col] === 0) {
          board[row][col] = player
          if (checkWin(board, col, row)) { board[row][col] = 0; return col }
          board[row][col] = 0
          break
        }
      }
    }
    return -1
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
    phaseRef.current = 'playing'
    setPhase('playing')
    startRaf()
  }

  function backToMenu(): void {
    phaseRef.current = 'idle'
    setPhase('idle')
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
  }

  function startRaf(): void {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const loop = (): void => {
      draw()
      if (phaseRef.current === 'playing') rafRef.current = requestAnimationFrame(loop)
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
        if (cell === 1) {
          ctx.fillStyle = '#ef4444'
          ctx.beginPath()
          ctx.arc(x + CELL / 2 - 2, y + CELL / 2 - 2, CELL / 2 - 6, 0, Math.PI * 2)
          ctx.fill()
        } else if (cell === 2) {
          ctx.fillStyle = '#eab308'
          ctx.beginPath()
          ctx.arc(x + CELL / 2 - 2, y + CELL / 2 - 2, CELL / 2 - 6, 0, Math.PI * 2)
          ctx.fill()
        }
      }
    }

    if (phaseRef.current === 'playing' && hoverColRef.current >= 0 && hoverColRef.current < COLS && currentPlayerRef.current === 1) {
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
