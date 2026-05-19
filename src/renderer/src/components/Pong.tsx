import { useEffect, useRef, useState } from 'react'
import styles from './Pong.module.css'

const SAVE_KEY = 'pongRecord'
const W = 600, H = 400
const PADDLE_W = 10, PADDLE_H = 70
const PADDLE_MARGIN = 20
const BALL_R = 7
const PADDLE_SPEED = 6
const AI_SPEED = 4.5
const AI_JITTER = 22                       // px of intentional aim error
const BALL_SPEED_BASE = 5
const BALL_SPEED_INCREMENT = 0.18          // per bounce, capped
const BALL_SPEED_MAX = 11
const WIN_SCORE = 11

type Phase = 'idle' | 'playing' | 'won' | 'lost'

interface Ball { x: number; y: number; dx: number; dy: number }

export default function Pong(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle')
  const [playerScore, setPlayerScore] = useState(0)
  const [aiScore, setAiScore] = useState(0)
  const [wins, setWins] = useState(0)
  const [losses, setLosses] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phaseRef = useRef<Phase>('idle')
  const playerYRef = useRef((H - PADDLE_H) / 2)
  const aiYRef = useRef((H - PADDLE_H) / 2)
  const aiTargetRef = useRef((H - PADDLE_H) / 2)
  const ballRef = useRef<Ball>({ x: W / 2, y: H / 2, dx: 0, dy: 0 })
  const playerScoreRef = useRef(0)
  const aiScoreRef = useRef(0)
  const winsRef = useRef(0)
  const lossesRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const keysRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    window.api.settings.get(SAVE_KEY, '{}').then(v => {
      try {
        const data = JSON.parse(v) as { wins?: number; losses?: number }
        winsRef.current = data.wins ?? 0
        lossesRef.current = data.losses ?? 0
        setWins(winsRef.current)
        setLosses(lossesRef.current)
      } catch { /* defaults */ }
    })
    draw()
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const capture = ['ArrowUp', 'ArrowDown', 'w', 'W', 's', 'S', ' ', 'Spacebar', 'Enter']
      if (capture.includes(e.key)) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keysRef.current.add('up')
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keysRef.current.add('down')
      if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
        if (phaseRef.current === 'idle' || phaseRef.current === 'won' || phaseRef.current === 'lost') {
          startGame()
        }
      }
    }
    function onKeyUp(e: KeyboardEvent): void {
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') keysRef.current.delete('up')
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keysRef.current.delete('down')
    }
    window.addEventListener('keydown', onKey, { capture: true })
    window.addEventListener('keyup', onKeyUp, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true })
      window.removeEventListener('keyup', onKeyUp, { capture: true })
    }
  }, [])

  function serveBall(toward: 'player' | 'ai'): void {
    const angle = (Math.random() * 0.6 - 0.3) // ±0.3 rad off horizontal
    const dir = toward === 'ai' ? 1 : -1
    ballRef.current = {
      x: W / 2,
      y: H / 2,
      dx: dir * BALL_SPEED_BASE * Math.cos(angle),
      dy: BALL_SPEED_BASE * Math.sin(angle)
    }
  }

  function startGame(): void {
    playerScoreRef.current = 0
    aiScoreRef.current = 0
    setPlayerScore(0)
    setAiScore(0)
    playerYRef.current = (H - PADDLE_H) / 2
    aiYRef.current = (H - PADDLE_H) / 2
    serveBall(Math.random() < 0.5 ? 'player' : 'ai')
    phaseRef.current = 'playing'
    setPhase('playing')
    startLoop()
  }

  function startLoop(): void {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const loop = (): void => {
      step()
      draw()
      if (phaseRef.current === 'playing') {
        rafRef.current = requestAnimationFrame(loop)
      }
    }
    rafRef.current = requestAnimationFrame(loop)
  }

  // Predict where the ball will hit the AI's x position, accounting for top/bottom bounces.
  function predictBallY(ball: Ball): number {
    if (ball.dx <= 0) return H / 2 // ball moving away — AI drifts to center
    let { x, y, dx, dy } = ball
    const targetX = W - PADDLE_MARGIN - PADDLE_W
    while (x < targetX) {
      const stepX = Math.min(targetX - x, 4)
      const t = stepX / dx
      x += dx * t
      y += dy * t
      if (y < BALL_R) { y = BALL_R + (BALL_R - y); dy = -dy }
      if (y > H - BALL_R) { y = (H - BALL_R) - (y - (H - BALL_R)); dy = -dy }
    }
    return y
  }

  function step(): void {
    if (phaseRef.current !== 'playing') return

    // Player movement
    if (keysRef.current.has('up')) playerYRef.current = Math.max(0, playerYRef.current - PADDLE_SPEED)
    if (keysRef.current.has('down')) playerYRef.current = Math.min(H - PADDLE_H, playerYRef.current + PADDLE_SPEED)

    // AI: recompute target periodically using prediction, then drift toward it
    const ball = ballRef.current
    if (Math.random() < 0.04) {
      const predicted = predictBallY(ball)
      aiTargetRef.current = predicted - PADDLE_H / 2 + (Math.random() * 2 - 1) * AI_JITTER
    }
    const aiCenter = aiYRef.current + PADDLE_H / 2
    const targetCenter = aiTargetRef.current + PADDLE_H / 2
    const diff = targetCenter - aiCenter
    if (Math.abs(diff) > AI_SPEED) {
      aiYRef.current += Math.sign(diff) * AI_SPEED
    } else {
      aiYRef.current += diff
    }
    aiYRef.current = Math.max(0, Math.min(H - PADDLE_H, aiYRef.current))

    // Ball
    ball.x += ball.dx
    ball.y += ball.dy

    // Top/bottom walls
    if (ball.y - BALL_R < 0) { ball.y = BALL_R; ball.dy = -ball.dy }
    if (ball.y + BALL_R > H) { ball.y = H - BALL_R; ball.dy = -ball.dy }

    // Player paddle
    const playerLeft = PADDLE_MARGIN
    const playerRight = playerLeft + PADDLE_W
    if (ball.dx < 0 && ball.x - BALL_R <= playerRight && ball.x + BALL_R >= playerLeft) {
      if (ball.y >= playerYRef.current && ball.y <= playerYRef.current + PADDLE_H) {
        const hit = (ball.y - (playerYRef.current + PADDLE_H / 2)) / (PADDLE_H / 2)
        const angle = hit * (Math.PI / 3.5)
        const speed = Math.min(BALL_SPEED_MAX, Math.hypot(ball.dx, ball.dy) + BALL_SPEED_INCREMENT)
        ball.dx = speed * Math.cos(angle)
        ball.dy = speed * Math.sin(angle)
        ball.x = playerRight + BALL_R
      }
    }

    // AI paddle
    const aiLeft = W - PADDLE_MARGIN - PADDLE_W
    const aiRight = aiLeft + PADDLE_W
    if (ball.dx > 0 && ball.x + BALL_R >= aiLeft && ball.x - BALL_R <= aiRight) {
      if (ball.y >= aiYRef.current && ball.y <= aiYRef.current + PADDLE_H) {
        const hit = (ball.y - (aiYRef.current + PADDLE_H / 2)) / (PADDLE_H / 2)
        const angle = hit * (Math.PI / 3.5)
        const speed = Math.min(BALL_SPEED_MAX, Math.hypot(ball.dx, ball.dy) + BALL_SPEED_INCREMENT)
        ball.dx = -speed * Math.cos(angle)
        ball.dy = speed * Math.sin(angle)
        ball.x = aiLeft - BALL_R
      }
    }

    // Scoring
    if (ball.x + BALL_R < 0) {
      aiScoreRef.current++
      setAiScore(aiScoreRef.current)
      if (aiScoreRef.current >= WIN_SCORE) endGame('lost')
      else serveBall('player')
    } else if (ball.x - BALL_R > W) {
      playerScoreRef.current++
      setPlayerScore(playerScoreRef.current)
      if (playerScoreRef.current >= WIN_SCORE) endGame('won')
      else serveBall('ai')
    }
  }

  function endGame(result: 'won' | 'lost'): void {
    phaseRef.current = result
    setPhase(result)
    if (result === 'won') {
      winsRef.current++
      setWins(winsRef.current)
    } else {
      lossesRef.current++
      setLosses(lossesRef.current)
    }
    window.api.settings.set(SAVE_KEY, JSON.stringify({ wins: winsRef.current, losses: lossesRef.current })).catch(() => {})
  }

  function draw(): void {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#08080f'
    ctx.fillRect(0, 0, W, H)

    // Center dashed line
    ctx.strokeStyle = 'rgba(255,255,255,0.15)'
    ctx.lineWidth = 2
    ctx.setLineDash([8, 10])
    ctx.beginPath()
    ctx.moveTo(W / 2, 0)
    ctx.lineTo(W / 2, H)
    ctx.stroke()
    ctx.setLineDash([])

    // Score text
    ctx.fillStyle = 'rgba(255,255,255,0.25)'
    ctx.font = 'bold 48px monospace'
    ctx.textAlign = 'center'
    ctx.fillText(String(playerScoreRef.current), W / 4, 60)
    ctx.fillText(String(aiScoreRef.current), (W * 3) / 4, 60)

    // Paddles
    ctx.fillStyle = '#4ade80'
    ctx.fillRect(PADDLE_MARGIN, playerYRef.current, PADDLE_W, PADDLE_H)
    ctx.fillStyle = '#ef4444'
    ctx.fillRect(W - PADDLE_MARGIN - PADDLE_W, aiYRef.current, PADDLE_W, PADDLE_H)

    // Ball
    const ball = ballRef.current
    ctx.fillStyle = '#e8b44b'
    ctx.shadowColor = 'rgba(232,180,75,0.6)'
    ctx.shadowBlur = 10
    ctx.beginPath()
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
  }

  return (
    <div className={styles.body}>
      <div className={styles.hud}>
        <span>You <strong>{playerScore}</strong></span>
        <span>CPU <strong className={styles.cpuScore}>{aiScore}</strong></span>
        <span className={styles.best}>
          {wins + losses > 0 ? `${wins}W · ${losses}L` : 'First to 11'}
        </span>
      </div>
      <div className={styles.canvasWrap}>
        <canvas ref={canvasRef} width={W} height={H} className={styles.canvas} />
        {phase !== 'playing' && (
          <div className={styles.overlay}>
            {phase === 'idle' && <span className={styles.title}>🏓 Pong</span>}
            {phase === 'won' && <span className={styles.title}>🏆 You Win!</span>}
            {phase === 'lost' && <span className={styles.title}>💀 CPU Wins</span>}
            <button className={styles.btn} onClick={startGame}>
              {phase === 'idle' ? 'Start' : 'Play Again'}
            </button>
            <span className={styles.hint}>↑ / ↓ or W / S to move · Space to start · First to 11</span>
          </div>
        )}
      </div>
    </div>
  )
}
