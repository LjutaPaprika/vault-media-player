import { useEffect, useRef, useState } from 'react'
import styles from './Snake.module.css'

const COLS = 20
const ROWS = 20
const CELL = 16
const W = COLS * CELL
const H = ROWS * CELL
const SAVE_KEY = 'snakeHighScore'

type Dir = 'U' | 'D' | 'L' | 'R'
type Pt = { x: number; y: number }
type Phase = 'idle' | 'playing' | 'dead'

const OPPOSITE: Record<Dir, Dir> = { U: 'D', D: 'U', L: 'R', R: 'L' }

function rand(n: number): number { return Math.floor(Math.random() * n) }

function spawnFood(snake: Pt[]): Pt {
  const occ = new Set(snake.map(p => `${p.x},${p.y}`))
  let p: Pt
  do { p = { x: rand(COLS), y: rand(ROWS) } } while (occ.has(`${p.x},${p.y}`))
  return p
}

function tickMs(score: number): number {
  return Math.max(65, 150 - score * 4)
}

export default function Snake(): JSX.Element {
  const [open, setOpen] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [score, setScore] = useState(0)
  const [highScore, setHighScore] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const snakeRef  = useRef<Pt[]>([])
  const dirRef    = useRef<Dir>('R')
  const nextDir   = useRef<Dir>('R')
  const foodRef   = useRef<Pt>({ x: 0, y: 0 })
  const scoreRef  = useRef(0)
  const hiRef     = useRef(0)
  const timerRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const phaseRef  = useRef<Phase>('idle')
  const openRef   = useRef(false)

  useEffect(() => {
    window.api.settings.get(SAVE_KEY, '0').then(v => {
      const n = parseInt(v, 10) || 0
      hiRef.current = n
      setHighScore(n)
    })
    return () => stopTimer()
  }, [])

  useEffect(() => {
    openRef.current = open
    if (open) requestAnimationFrame(draw)
  }, [open])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (!openRef.current) return
      if (phaseRef.current !== 'playing') {
        if (e.key === 'Enter' || e.key === ' ') startGame()
        return
      }
      const map: Record<string, Dir> = {
        ArrowUp: 'U', w: 'U', W: 'U',
        ArrowDown: 'D', s: 'D', S: 'D',
        ArrowLeft: 'L', a: 'L', A: 'L',
        ArrowRight: 'R', d: 'R', D: 'R',
      }
      const d = map[e.key]
      if (!d) return
      if (d !== OPPOSITE[dirRef.current]) nextDir.current = d
      if (e.key.startsWith('Arrow')) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  function stopTimer(): void {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
  }

  function draw(): void {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#08080f'
    ctx.fillRect(0, 0, W, H)

    ctx.strokeStyle = 'rgba(255,255,255,0.025)'
    ctx.lineWidth = 0.5
    for (let x = 0; x <= COLS; x++) { ctx.beginPath(); ctx.moveTo(x*CELL,0); ctx.lineTo(x*CELL,H); ctx.stroke() }
    for (let y = 0; y <= ROWS; y++) { ctx.beginPath(); ctx.moveTo(0,y*CELL); ctx.lineTo(W,y*CELL); ctx.stroke() }

    const f = foodRef.current
    ctx.shadowColor = 'rgba(232,180,75,0.8)'
    ctx.shadowBlur = 12
    ctx.fillStyle = '#e8b44b'
    ctx.beginPath()
    ctx.arc(f.x*CELL + CELL/2, f.y*CELL + CELL/2, CELL/2 - 2, 0, Math.PI*2)
    ctx.fill()
    ctx.shadowBlur = 0

    const len = snakeRef.current.length
    snakeRef.current.forEach((p, i) => {
      if (i === 0) return
      const alpha = 1 - (i / len) * 0.55
      ctx.fillStyle = `rgba(22,163,74,${alpha})`
      ctx.fillRect(p.x*CELL+1, p.y*CELL+1, CELL-2, CELL-2)
    })

    if (len > 0) {
      const h = snakeRef.current[0]
      ctx.shadowColor = 'rgba(74,222,128,0.5)'
      ctx.shadowBlur = 8
      ctx.fillStyle = '#4ade80'
      ctx.fillRect(h.x*CELL+1, h.y*CELL+1, CELL-2, CELL-2)
      ctx.shadowBlur = 0
    }
  }

  function tick(): void {
    dirRef.current = nextDir.current
    const head = snakeRef.current[0]
    const next: Pt = {
      x: head.x + (dirRef.current === 'R' ? 1 : dirRef.current === 'L' ? -1 : 0),
      y: head.y + (dirRef.current === 'D' ? 1 : dirRef.current === 'U' ? -1 : 0),
    }

    if (
      next.x < 0 || next.x >= COLS || next.y < 0 || next.y >= ROWS ||
      snakeRef.current.some(p => p.x === next.x && p.y === next.y)
    ) {
      stopTimer()
      phaseRef.current = 'dead'
      setPhase('dead')
      const s = scoreRef.current
      if (s > hiRef.current) {
        hiRef.current = s
        setHighScore(s)
        window.api.settings.set(SAVE_KEY, String(s)).catch(() => {})
      }
      return
    }

    const ate = next.x === foodRef.current.x && next.y === foodRef.current.y
    if (ate) {
      snakeRef.current = [next, ...snakeRef.current]
      foodRef.current = spawnFood(snakeRef.current)
      scoreRef.current += 1
      setScore(scoreRef.current)
      stopTimer()
      timerRef.current = setInterval(tick, tickMs(scoreRef.current))
    } else {
      snakeRef.current = [next, ...snakeRef.current.slice(0, -1)]
    }

    draw()
  }

  function startGame(): void {
    const s: Pt[] = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]
    snakeRef.current = s
    dirRef.current   = 'R'
    nextDir.current  = 'R'
    foodRef.current  = spawnFood(s)
    scoreRef.current = 0
    setScore(0)
    phaseRef.current = 'playing'
    setPhase('playing')
    draw()
    stopTimer()
    timerRef.current = setInterval(tick, tickMs(0))
  }

  const isNewBest = phase === 'dead' && score > 0 && score >= hiRef.current

  return (
    <div className={styles.panel}>
      <button className={styles.toggleBar} onClick={() => setOpen(o => !o)}>
        <span className={styles.toggleTitle}>🐍 Snake</span>
        <span className={styles.toggleMeta}>
          {score > 0 && <span>{score} pts</span>}
          {highScore > 0 && <span className={styles.metaHi}> · best {highScore}</span>}
        </span>
        <span className={styles.toggleChevron}>{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className={styles.body}>
          <div className={styles.gameWrap}>
            <canvas ref={canvasRef} width={W} height={H} className={styles.canvas} />
            {phase !== 'playing' && (
              <div className={styles.overlay}>
                {phase === 'dead' ? (
                  <>
                    <span className={styles.overlayTitle}>Game Over</span>
                    <span className={styles.overlayScore}>{score} pts</span>
                    {isNewBest && <span className={styles.overlayNew}>✨ New Best!</span>}
                  </>
                ) : (
                  <span className={styles.overlayTitle}>🐍 Snake</span>
                )}
                <button className={styles.startBtn} onClick={startGame}>
                  {phase === 'dead' ? 'Play Again' : 'Start'}
                </button>
                <span className={styles.overlayHint}>Arrow keys · WASD</span>
              </div>
            )}
          </div>
          {phase === 'playing' && (
            <div className={styles.hud}>
              <span>Score: <strong>{score}</strong></span>
              {highScore > 0 && <span className={styles.hudBest}>Best: {highScore}</span>}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
