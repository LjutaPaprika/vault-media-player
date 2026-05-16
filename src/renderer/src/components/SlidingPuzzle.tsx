import { useEffect, useRef, useState } from 'react'
import styles from './SlidingPuzzle.module.css'

const CANVAS_SIZE = 450
const SAVE_KEY = 'slidingPuzzleBest'
const ANIM_DURATION_MS = 140

type GridSize = 3 | 4 | 5
type Phase = 'idle' | 'playing' | 'solved'

interface Animation {
  num: number
  fromCol: number
  fromRow: number
  toCol: number
  toRow: number
  startTime: number
}

export default function SlidingPuzzle(): JSX.Element {
  const [gridSize, setGridSize] = useState<GridSize>(3)
  const [phase, setPhase] = useState<Phase>('idle')
  const [moves, setMoves] = useState(0)
  const [bestMoves, setBestMoves] = useState<Record<GridSize, number>>({ 3: 0, 4: 0, 5: 0 })

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gridSizeRef = useRef<GridSize>(3)
  const phaseRef = useRef<Phase>('idle')
  const tilesRef = useRef<number[][]>([])
  const movesRef = useRef(0)
  const hiRef = useRef<Record<GridSize, number>>({ 3: 0, 4: 0, 5: 0 })
  const animRef = useRef<Animation | null>(null)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    window.api.settings.get(SAVE_KEY, '{}').then(v => {
      try {
        const data = JSON.parse(v) as Record<string, number>
        hiRef.current = { 3: data['3'] || 0, 4: data['4'] || 0, 5: data['5'] || 0 }
        setBestMoves(hiRef.current)
      } catch { /* defaults */ }
    })
    initBoard(gridSizeRef.current)
    shuffleSilent()
    startRenderLoop()
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (phaseRef.current !== 'playing') return
      if (animRef.current) return
      // Up arrow → tile below empty moves up (or: empty moves down to row+1)
      // Convention: arrow direction = direction the tile slides
      if (e.key === 'ArrowUp')    { e.preventDefault(); slideAdjacent(0, 1) }   // tile below empty slides up
      if (e.key === 'ArrowDown')  { e.preventDefault(); slideAdjacent(0, -1) }  // tile above empty slides down
      if (e.key === 'ArrowLeft')  { e.preventDefault(); slideAdjacent(1, 0) }   // tile right of empty slides left
      if (e.key === 'ArrowRight') { e.preventDefault(); slideAdjacent(-1, 0) }  // tile left of empty slides right
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [])

  useEffect(() => {
    function onClick(e: MouseEvent): void {
      const canvas = canvasRef.current
      if (!canvas || phaseRef.current !== 'playing' || animRef.current) return
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left, y = e.clientY - rect.top
      const cellSize = CANVAS_SIZE / gridSizeRef.current
      const col = Math.floor(x / cellSize), row = Math.floor(y / cellSize)
      const empty = findEmpty()
      const dx = empty[0] - col, dy = empty[1] - row
      // Must be exactly one step orthogonally adjacent
      if ((Math.abs(dx) === 1 && dy === 0) || (Math.abs(dy) === 1 && dx === 0)) {
        slideTile(col, row, empty[0], empty[1])
      }
    }
    const canvas = canvasRef.current
    canvas?.addEventListener('click', onClick)
    return () => canvas?.removeEventListener('click', onClick)
  }, [])

  function findEmpty(): [number, number] {
    const size = gridSizeRef.current
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (tilesRef.current[r][c] === 0) return [c, r]
      }
    }
    return [0, 0]
  }

  // Slide the tile adjacent to empty in (dx, dy) direction relative to empty.
  // dx=1 means tile to the right of empty slides into empty (moves left).
  function slideAdjacent(dx: number, dy: number): void {
    const [ex, ey] = findEmpty()
    const tx = ex + dx, ty = ey + dy
    const size = gridSizeRef.current
    if (tx < 0 || tx >= size || ty < 0 || ty >= size) return
    slideTile(tx, ty, ex, ey)
  }

  function slideTile(fromCol: number, fromRow: number, toCol: number, toRow: number, silent = false): void {
    const num = tilesRef.current[fromRow][fromCol]
    tilesRef.current[toRow][toCol] = num
    tilesRef.current[fromRow][fromCol] = 0
    if (!silent) {
      animRef.current = {
        num,
        fromCol, fromRow, toCol, toRow,
        startTime: performance.now()
      }
      movesRef.current++
      setMoves(movesRef.current)
      // Check solved after animation completes; check immediately too (state is correct)
      if (checkSolved()) {
        const size = gridSizeRef.current
        if (hiRef.current[size] === 0 || movesRef.current < hiRef.current[size]) {
          hiRef.current = { ...hiRef.current, [size]: movesRef.current }
          setBestMoves(hiRef.current)
          window.api.settings.set(SAVE_KEY, JSON.stringify(hiRef.current)).catch(() => {})
        }
        // Defer phase change until anim finishes for a smoother feel
        setTimeout(() => {
          phaseRef.current = 'solved'
          setPhase('solved')
        }, ANIM_DURATION_MS)
      }
    }
  }

  function checkSolved(): boolean {
    const size = gridSizeRef.current
    let expected = 1
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const last = r === size - 1 && c === size - 1
        const want = last ? 0 : expected++
        if (tilesRef.current[r][c] !== want) return false
      }
    }
    return true
  }

  function initBoard(size: GridSize): void {
    gridSizeRef.current = size
    tilesRef.current = Array.from({ length: size }, (_, r) =>
      Array.from({ length: size }, (_, c) => {
        const idx = r * size + c
        return idx === size * size - 1 ? 0 : idx + 1
      })
    )
  }

  function shuffleSilent(): void {
    const size = gridSizeRef.current
    let prevMove: [number, number] | null = null  // (dx, dy) that was last applied; avoid reversing it
    const target = 80 + size * 80  // 240 / 320 / 480 random valid moves
    for (let i = 0; i < target; i++) {
      const [ex, ey] = findEmpty()
      const candidates: [number, number][] = []
      for (const [dx, dy] of [[0,-1],[0,1],[-1,0],[1,0]] as [number,number][]) {
        const tx = ex + dx, ty = ey + dy
        if (tx < 0 || tx >= size || ty < 0 || ty >= size) continue
        if (prevMove && prevMove[0] === -dx && prevMove[1] === -dy) continue
        candidates.push([dx, dy])
      }
      if (candidates.length === 0) { prevMove = null; continue }
      const [dx, dy] = candidates[Math.floor(Math.random() * candidates.length)]
      slideTile(ex + dx, ey + dy, ex, ey, true)
      prevMove = [dx, dy]
    }
  }

  function startGame(size: GridSize): void {
    setGridSize(size)
    initBoard(size)
    shuffleSilent()
    movesRef.current = 0
    setMoves(0)
    animRef.current = null
    phaseRef.current = 'playing'
    setPhase('playing')
  }

  function startRenderLoop(): void {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const loop = (): void => {
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }

  function easeOut(t: number): number {
    return 1 - Math.pow(1 - t, 3)
  }

  function draw(): void {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.imageSmoothingEnabled = false
    ctx.fillStyle = '#08080f'
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)

    const size = gridSizeRef.current
    const cellSize = CANVAS_SIZE / size
    const tilePad = 3

    // Background grid (empty cell wells)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.03)'
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        ctx.fillRect(c * cellSize + tilePad, r * cellSize + tilePad, cellSize - tilePad * 2, cellSize - tilePad * 2)
      }
    }

    // Animation progress
    const anim = animRef.current
    let animProgress = 1
    if (anim) {
      animProgress = Math.min(1, (performance.now() - anim.startTime) / ANIM_DURATION_MS)
      if (animProgress >= 1) {
        animRef.current = null
      }
    }

    // Draw tiles
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const num = tilesRef.current[r][c]
        if (num === 0) continue
        // If this tile is the animating one, interpolate position
        let drawCol = c, drawRow = r
        if (anim && num === anim.num && c === anim.toCol && r === anim.toRow) {
          const t = easeOut(animProgress)
          drawCol = anim.fromCol + (anim.toCol - anim.fromCol) * t
          drawRow = anim.fromRow + (anim.toRow - anim.fromRow) * t
        }
        drawTile(ctx, num, drawCol, drawRow, cellSize, tilePad)
      }
    }
  }

  function drawTile(ctx: CanvasRenderingContext2D, num: number, col: number, row: number, cellSize: number, pad: number): void {
    const x = col * cellSize + pad
    const y = row * cellSize + pad
    const w = cellSize - pad * 2

    // Tile background — gradient gold
    const grad = ctx.createLinearGradient(x, y, x, y + w)
    grad.addColorStop(0, 'rgba(232, 180, 75, 0.28)')
    grad.addColorStop(1, 'rgba(232, 180, 75, 0.12)')
    ctx.fillStyle = grad
    ctx.fillRect(x, y, w, w)

    // Border
    ctx.strokeStyle = 'rgba(232, 180, 75, 0.55)'
    ctx.lineWidth = 1.5
    ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, w - 1.5)

    // Inner highlight
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)'
    ctx.lineWidth = 1
    ctx.strokeRect(x + 2.5, y + 2.5, w - 5, w - 5)

    // Number
    ctx.fillStyle = '#ffe7b3'
    const fontSize = Math.floor(cellSize * 0.42)
    ctx.font = `bold ${fontSize}px ui-monospace, "Cascadia Mono", "Consolas", "Courier New", monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(num), x + w / 2, y + w / 2 + 1)
  }

  return (
    <div className={styles.body}>
      <div className={styles.header}>
        {phase === 'idle' ? (
          <div className={styles.sizes}>
            <span className={styles.label}>Size:</span>
            {[3, 4, 5].map(s => (
              <button key={s} className={styles.sizeBtn} onClick={() => startGame(s as GridSize)}>
                {s}×{s}
              </button>
            ))}
          </div>
        ) : (
          <>
            <span>Moves <strong>{moves}</strong></span>
            <span className={styles.dim}>{gridSize}×{gridSize}</span>
            {bestMoves[gridSize] > 0 && <span className={styles.best}>Best: {bestMoves[gridSize]}</span>}
            <button className={styles.resetBtn} onClick={() => { phaseRef.current = 'idle'; setPhase('idle') }}>NEW</button>
          </>
        )}
      </div>
      <div className={styles.canvasWrap}>
        <canvas ref={canvasRef} width={CANVAS_SIZE} height={CANVAS_SIZE} className={styles.canvas} />
        {phase === 'solved' && (
          <div className={styles.overlay}>
            <span className={styles.title}>Solved!</span>
            <span className={styles.movesText}>{moves} moves</span>
            {bestMoves[gridSize] === moves && <span className={styles.newBest}>✨ New Best!</span>}
            <div className={styles.againRow}>
              <button className={styles.btn} onClick={() => startGame(gridSize)}>Same Size</button>
              <button className={styles.btnSecondary} onClick={() => { phaseRef.current = 'idle'; setPhase('idle') }}>Change Size</button>
            </div>
          </div>
        )}
      </div>
      {phase === 'playing' && (
        <div className={styles.hint}>Arrow keys or click adjacent tile</div>
      )}
    </div>
  )
}
