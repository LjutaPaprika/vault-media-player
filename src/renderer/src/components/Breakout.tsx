import { useEffect, useRef, useState } from 'react'
import styles from './Breakout.module.css'

const SAVE_KEY = 'breakoutBest'
const W = 480, H = 560
const PADDLE_W = 80, PADDLE_H = 12
const PADDLE_Y = H - 40
const BALL_R = 8
const BRICK_COLS = 10
const BRICK_W = 44, BRICK_H = 18, BRICK_GAP = 4
const BRICK_TOP = 60
const BRICK_LEFT = (W - (BRICK_COLS * (BRICK_W + BRICK_GAP) - BRICK_GAP)) / 2
const BALL_SPEED_BASE = 5
const BALL_SPEED_PER_LEVEL = 0.6
const BALL_SPEED_INCREMENT = 0.05
const LIVES_INITIAL = 3
const PADDLE_SPEED = 8
const POWERUP_W = 18, POWERUP_H = 18
const POWERUP_FALL_SPEED = 80 / 60 // pixels per frame
const POWERUP_SPAWN_CHANCE = 0.15

const BRICK_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#64748b']
const BRICK_POINTS = [7, 6, 5, 4, 3, 2, 1, 1]

// Level layouts: each cell is row index (0-7) for color/points, or -1 for empty.
// Grid is BRICK_COLS wide, up to 10 rows tall.
type LevelMap = number[][]

type PowerupKind = 'multiball' | 'widePaddle' | 'slowBall' | 'extraLife' | 'laser'

interface Powerup {
  kind: PowerupKind
  x: number
  y: number
  active: boolean
  endsAt: number
}

interface ActiveEffect {
  kind: PowerupKind
  endsAt: number
}

const LEVELS: LevelMap[] = [
  // Level 1: full 8-row rectangle (classic)
  [
    [0,0,0,0,0,0,0,0,0,0],
    [1,1,1,1,1,1,1,1,1,1],
    [2,2,2,2,2,2,2,2,2,2],
    [3,3,3,3,3,3,3,3,3,3],
    [4,4,4,4,4,4,4,4,4,4],
    [5,5,5,5,5,5,5,5,5,5],
    [6,6,6,6,6,6,6,6,6,6],
    [7,7,7,7,7,7,7,7,7,7]
  ],
  // Level 2: pyramid
  [
    [-1,-1,-1,-1,0,0,-1,-1,-1,-1],
    [-1,-1,-1,1,1,1,1,-1,-1,-1],
    [-1,-1,2,2,2,2,2,2,-1,-1],
    [-1,3,3,3,3,3,3,3,3,-1],
    [4,4,4,4,4,4,4,4,4,4],
    [5,5,5,5,5,5,5,5,5,5],
    [6,6,6,6,6,6,6,6,6,6]
  ],
  // Level 3: checkerboard
  [
    [0,-1,0,-1,0,-1,0,-1,0,-1],
    [-1,1,-1,1,-1,1,-1,1,-1,1],
    [2,-1,2,-1,2,-1,2,-1,2,-1],
    [-1,3,-1,3,-1,3,-1,3,-1,3],
    [4,-1,4,-1,4,-1,4,-1,4,-1],
    [-1,5,-1,5,-1,5,-1,5,-1,5],
    [6,-1,6,-1,6,-1,6,-1,6,-1],
    [-1,7,-1,7,-1,7,-1,7,-1,7]
  ],
  // Level 4: fortress walls + interior
  [
    [0,0,0,0,0,0,0,0,0,0],
    [1,-1,-1,-1,-1,-1,-1,-1,-1,1],
    [2,-1,3,3,3,3,3,3,-1,2],
    [2,-1,3,4,4,4,4,3,-1,2],
    [2,-1,3,4,5,5,4,3,-1,2],
    [2,-1,3,3,3,3,3,3,-1,2],
    [1,-1,-1,-1,-1,-1,-1,-1,-1,1],
    [0,0,0,0,0,0,0,0,0,0]
  ],
  // Level 5: full + dense (final challenge)
  [
    [0,0,0,0,0,0,0,0,0,0],
    [1,1,1,1,1,1,1,1,1,1],
    [2,2,2,2,2,2,2,2,2,2],
    [3,3,3,3,3,3,3,3,3,3],
    [4,4,4,4,4,4,4,4,4,4],
    [5,5,5,5,5,5,5,5,5,5],
    [6,6,6,6,6,6,6,6,6,6],
    [7,7,7,7,7,7,7,7,7,7],
    [-1,7,-1,7,-1,7,-1,7,-1,7],
    [7,-1,7,-1,7,-1,7,-1,7,-1]
  ]
]

type Phase = 'idle' | 'playing' | 'paused' | 'lost' | 'won' | 'levelComplete'

interface Brick { alive: boolean; color: string; points: number }

interface BreakoutProps {
  onNewBest?: (score: number) => void
}

export default function Breakout({ onNewBest }: BreakoutProps): JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(LIVES_INITIAL)
  const [level, setLevel] = useState(1)
  const [highScore, setHighScore] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phaseRef = useRef<Phase>('idle')
  const levelRef = useRef(1)
  const paddleXRef = useRef(W / 2)
  const ballRef = useRef({ x: W / 2, y: PADDLE_Y - BALL_R - 4, dx: 0, dy: 0 })
  const ballsRef = useRef([ballRef.current])
  const baseSpeedRef = useRef(BALL_SPEED_BASE)
  const bricksRef = useRef<Brick[][]>([])
  const scoreRef = useRef(0)
  const livesRef = useRef(LIVES_INITIAL)
  const hiRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const keysRef = useRef<Set<string>>(new Set())
  const powerupsRef = useRef<Powerup[]>([])
  const activeEffectsRef = useRef<ActiveEffect[]>([])
  const paddleWidthRef = useRef(PADDLE_W)
  const widePaddleStacksRef = useRef(0)
  const lasersRef = useRef<{ x: number; y: number }[]>([])
  const lastLaserShotRef = useRef(0)

  useEffect(() => {
    window.api.settings.get(SAVE_KEY, '{}').then(v => {
      try {
        const data = JSON.parse(v) as { score?: number }
        hiRef.current = data.score ?? 0
        setHighScore(hiRef.current)
      } catch { /* defaults */ }
    })
    initializeGame()
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      // Capture all the keys we use to prevent app navigation
      const captureKeys = ['ArrowLeft', 'ArrowRight', ' ', 'Spacebar', 'Enter', 'p', 'P']
      if (captureKeys.includes(e.key)) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        keysRef.current.add(e.key)
      }
      if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'Enter') {
        if (phaseRef.current === 'idle' || phaseRef.current === 'lost' || phaseRef.current === 'won') {
          levelRef.current = 1
          setLevel(1)
          scoreRef.current = 0
          setScore(0)
          livesRef.current = LIVES_INITIAL
          setLives(LIVES_INITIAL)
          loadLevel(1)
          startGame()
        } else if (phaseRef.current === 'levelComplete') {
          loadLevel(levelRef.current)
          startGame()
        }
      }
      if (e.key === 'p' || e.key === 'P') {
        if (phaseRef.current === 'playing') {
          phaseRef.current = 'paused'
          setPhase('paused')
        } else if (phaseRef.current === 'paused') {
          phaseRef.current = 'playing'
          setPhase('playing')
          startLoop()
        }
      }
    }
    function onKeyUp(e: KeyboardEvent): void {
      keysRef.current.delete(e.key)
    }
    window.addEventListener('keydown', onKey, { capture: true })
    window.addEventListener('keyup', onKeyUp, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true })
      window.removeEventListener('keyup', onKeyUp, { capture: true })
    }
  }, [])

  function loadLevel(lvl: number): void {
    const layout = LEVELS[Math.min(lvl - 1, LEVELS.length - 1)]
    const rows = layout.length
    bricksRef.current = Array.from({ length: rows }, (_, r) =>
      Array.from({ length: BRICK_COLS }, (_, c) => {
        const colorIdx = layout[r][c]
        return {
          alive: colorIdx >= 0,
          color: colorIdx >= 0 ? BRICK_COLORS[colorIdx] : 'transparent',
          points: colorIdx >= 0 ? BRICK_POINTS[colorIdx] : 0
        }
      })
    )
    paddleXRef.current = W / 2
    paddleWidthRef.current = PADDLE_W
    widePaddleStacksRef.current = 0
    baseSpeedRef.current = BALL_SPEED_BASE + (lvl - 1) * BALL_SPEED_PER_LEVEL
    ballsRef.current = [{ x: W / 2, y: PADDLE_Y - BALL_R - 4, dx: 0, dy: 0 }]
    ballRef.current = ballsRef.current[0]
    powerupsRef.current = []
    activeEffectsRef.current = []
    lasersRef.current = []
    resetBall()
    levelRef.current = lvl
    setLevel(lvl)
    draw()
  }

  function initializeGame(): void {
    levelRef.current = 1
    setLevel(1)
    scoreRef.current = 0
    livesRef.current = LIVES_INITIAL
    setScore(0)
    setLives(LIVES_INITIAL)
    loadLevel(1)
    phaseRef.current = 'idle'
    setPhase('idle')
  }

  function resetBall(): void {
    const speed = baseSpeedRef.current
    const isSlow = activeEffectsRef.current.some(e => e.kind === 'slowBall')
    const finalSpeed = isSlow ? speed * 0.7 : speed
    const newBall = {
      x: paddleXRef.current,
      y: PADDLE_Y - BALL_R - 4,
      dx: (Math.random() < 0.5 ? -1 : 1) * finalSpeed * 0.5,
      dy: -finalSpeed
    }
    ballsRef.current = [newBall]
    ballRef.current = newBall
  }

  function startGame(): void {
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

  function applyPowerup(kind: PowerupKind): void {
    const duration = 20_000
    const now = Date.now()
    switch (kind) {
      case 'multiball': {
        const ball = ballsRef.current[0]
        if (ball) {
          ballsRef.current.push(
            { x: ball.x, y: ball.y, dx: ball.dx * 0.866 - ball.dy * 0.5, dy: ball.dy * 0.866 + ball.dx * 0.5 },
            { x: ball.x, y: ball.y, dx: ball.dx * 0.866 + ball.dy * 0.5, dy: ball.dy * 0.866 - ball.dx * 0.5 }
          )
        }
        break
      }
      case 'widePaddle': {
        // Diminishing stacks: 30% + 15% + 7.5% + … of PADDLE_W (max ~60%)
        widePaddleStacksRef.current = Math.min(8, widePaddleStacksRef.current + 1)
        let bonus = 0
        let step = 0.30
        for (let i = 0; i < widePaddleStacksRef.current; i++) { bonus += step; step *= 0.5 }
        paddleWidthRef.current = PADDLE_W * (1 + bonus)
        // Replace any existing widePaddle effect — duration resets on every pickup
        activeEffectsRef.current = activeEffectsRef.current.filter(e => e.kind !== 'widePaddle')
        activeEffectsRef.current.push({ kind: 'widePaddle', endsAt: now + duration })
        break
      }
      case 'slowBall':
        for (const ball of ballsRef.current) {
          const speed = Math.hypot(ball.dx, ball.dy)
          const newSpeed = speed * 0.7
          const norm = speed > 0 ? newSpeed / speed : 1
          ball.dx *= norm
          ball.dy *= norm
        }
        activeEffectsRef.current.push({ kind: 'slowBall', endsAt: now + duration })
        break
      case 'extraLife':
        // +1 life per pickup, no upper cap.
        livesRef.current = livesRef.current + 1
        setLives(livesRef.current)
        break
      case 'laser':
        activeEffectsRef.current.push({ kind: 'laser', endsAt: now + duration })
        break
    }
  }

  function step(): void {
    if (phaseRef.current !== 'playing') return

    const now = Date.now()
    const hadWide = activeEffectsRef.current.some(e => e.kind === 'widePaddle')
    activeEffectsRef.current = activeEffectsRef.current.filter(e => e.endsAt > now)
    const hasWide = activeEffectsRef.current.some(e => e.kind === 'widePaddle')
    if (hadWide && !hasWide) {
      widePaddleStacksRef.current = 0
      paddleWidthRef.current = PADDLE_W
    }

    const keys = keysRef.current
    const paddleW = paddleWidthRef.current
    if (keys.has('ArrowLeft'))  paddleXRef.current = Math.max(paddleW / 2, paddleXRef.current - PADDLE_SPEED)
    if (keys.has('ArrowRight')) paddleXRef.current = Math.min(W - paddleW / 2, paddleXRef.current + PADDLE_SPEED)

    const balls = ballsRef.current
    for (let i = balls.length - 1; i >= 0; i--) {
      const ball = balls[i]
      ball.x += ball.dx
      ball.y += ball.dy

      if (ball.x - BALL_R < 0) { ball.x = BALL_R; ball.dx = -ball.dx }
      if (ball.x + BALL_R > W) { ball.x = W - BALL_R; ball.dx = -ball.dx }
      if (ball.y - BALL_R < 0) { ball.y = BALL_R; ball.dy = -ball.dy }

      if (ball.y - BALL_R > H) {
        balls.splice(i, 1)
        if (balls.length === 0) {
          livesRef.current--
          setLives(livesRef.current)
          if (livesRef.current <= 0) {
            phaseRef.current = 'lost'
            setPhase('lost')
            if (scoreRef.current > hiRef.current) {
              hiRef.current = scoreRef.current
              setHighScore(hiRef.current)
              window.api.settings.set(SAVE_KEY, JSON.stringify({ score: hiRef.current })).catch(() => {})
              onNewBest?.(hiRef.current)
            }
          } else {
            resetBall()
          }
        }
        continue
      }

      const paddleX = paddleXRef.current
      if (ball.dy > 0 && ball.y + BALL_R >= PADDLE_Y && ball.y - BALL_R <= PADDLE_Y + PADDLE_H) {
        const left = paddleX - paddleW / 2, right = paddleX + paddleW / 2
        if (ball.x >= left && ball.x <= right) {
          const hit = (ball.x - paddleX) / (paddleW / 2)
          const angle = hit * (Math.PI / 3)
          const speed = Math.hypot(ball.dx, ball.dy)
          ball.dx = speed * Math.sin(angle)
          ball.dy = -Math.abs(speed * Math.cos(angle))
          ball.y = PADDLE_Y - BALL_R
        }
      }
    }

    powerupsRef.current = powerupsRef.current.filter(p => {
      p.y += POWERUP_FALL_SPEED
      if (p.y > H) return false

      const paddleX = paddleXRef.current
      const left = paddleX - paddleW / 2, right = paddleX + paddleW / 2
      if (p.x >= left - POWERUP_W / 2 && p.x <= right + POWERUP_W / 2 &&
          p.y >= PADDLE_Y - POWERUP_H && p.y <= PADDLE_Y + PADDLE_H) {
        applyPowerup(p.kind)
        return false
      }
      return true
    })

    const bricks = bricksRef.current

    // Laser: auto-fire from paddle edges while effect active
    const laserActive = activeEffectsRef.current.some(e => e.kind === 'laser')
    if (laserActive && now - lastLaserShotRef.current > 240) {
      const px = paddleXRef.current, pw = paddleWidthRef.current
      lasersRef.current.push({ x: px - pw / 2 + 4, y: PADDLE_Y - 2 })
      lasersRef.current.push({ x: px + pw / 2 - 4, y: PADDLE_Y - 2 })
      lastLaserShotRef.current = now
    }
    // Move and resolve lasers vs bricks
    lasersRef.current = lasersRef.current.filter(l => {
      l.y -= 10
      if (l.y < 0) return false
      for (let r = 0; r < bricks.length; r++) {
        for (let c = 0; c < BRICK_COLS; c++) {
          const brick = bricks[r][c]
          if (!brick.alive) continue
          const bx = BRICK_LEFT + c * (BRICK_W + BRICK_GAP)
          const by = BRICK_TOP + r * (BRICK_H + BRICK_GAP)
          if (l.x >= bx && l.x <= bx + BRICK_W && l.y >= by && l.y <= by + BRICK_H) {
            brick.alive = false
            scoreRef.current += brick.points * levelRef.current
            setScore(scoreRef.current)
            return false
          }
        }
      }
      return true
    })

    let aliveCount = 0
    for (let i = 0; i < balls.length; i++) {
      const ball = balls[i]
      for (let r = 0; r < bricks.length; r++) {
        for (let c = 0; c < BRICK_COLS; c++) {
          const brick = bricks[r][c]
          if (!brick.alive) continue
          const bx = BRICK_LEFT + c * (BRICK_W + BRICK_GAP)
          const by = BRICK_TOP + r * (BRICK_H + BRICK_GAP)
          if (
            ball.x + BALL_R > bx && ball.x - BALL_R < bx + BRICK_W &&
            ball.y + BALL_R > by && ball.y - BALL_R < by + BRICK_H
          ) {
            brick.alive = false
            scoreRef.current += brick.points * levelRef.current
            setScore(scoreRef.current)

            if (Math.random() < POWERUP_SPAWN_CHANCE) {
              const kinds: PowerupKind[] = ['multiball', 'widePaddle', 'slowBall', 'extraLife', 'laser']
              const kind = kinds[Math.floor(Math.random() * kinds.length)]
              powerupsRef.current.push({
                kind,
                x: bx + BRICK_W / 2,
                y: by + BRICK_H / 2,
                active: true,
                endsAt: Date.now() + 10_000
              })
            }

            const overlapX = Math.min(Math.abs(ball.x + BALL_R - bx), Math.abs(ball.x - BALL_R - (bx + BRICK_W)))
            const overlapY = Math.min(Math.abs(ball.y + BALL_R - by), Math.abs(ball.y - BALL_R - (by + BRICK_H)))
            if (overlapX < overlapY) ball.dx = -ball.dx
            else ball.dy = -ball.dy

            const speed = Math.hypot(ball.dx, ball.dy) + BALL_SPEED_INCREMENT
            const norm = Math.hypot(ball.dx, ball.dy)
            ball.dx = (ball.dx / norm) * speed
            ball.dy = (ball.dy / norm) * speed
            break
          }
        }
      }
    }

    for (let r = 0; r < bricks.length; r++) {
      for (let c = 0; c < BRICK_COLS; c++) {
        if (bricks[r][c].alive) aliveCount++
      }
    }

    if (aliveCount === 0) {
      if (levelRef.current >= LEVELS.length) {
        phaseRef.current = 'won'
        setPhase('won')
        scoreRef.current += 500 // bonus
        setScore(scoreRef.current)
        if (scoreRef.current > hiRef.current) {
          hiRef.current = scoreRef.current
          setHighScore(hiRef.current)
          window.api.settings.set(SAVE_KEY, JSON.stringify({ score: hiRef.current })).catch(() => {})
          onNewBest?.(hiRef.current)
        }
      } else {
        phaseRef.current = 'levelComplete'
        setPhase('levelComplete')
        scoreRef.current += 100 * levelRef.current
        setScore(scoreRef.current)
        levelRef.current++
        setLevel(levelRef.current)
      }
    }
  }

  function draw(): void {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#08080f'
    ctx.fillRect(0, 0, W, H)

    const bricks = bricksRef.current
    for (let r = 0; r < bricks.length; r++) {
      for (let c = 0; c < BRICK_COLS; c++) {
        const brick = bricks[r]?.[c]
        if (!brick?.alive) continue
        const bx = BRICK_LEFT + c * (BRICK_W + BRICK_GAP)
        const by = BRICK_TOP + r * (BRICK_H + BRICK_GAP)
        ctx.fillStyle = brick.color
        ctx.fillRect(bx, by, BRICK_W, BRICK_H)
        ctx.strokeStyle = 'rgba(0,0,0,0.25)'
        ctx.lineWidth = 1
        ctx.strokeRect(bx + 0.5, by + 0.5, BRICK_W - 1, BRICK_H - 1)
      }
    }

    const paddleX = paddleXRef.current
    const paddleW = paddleWidthRef.current
    const laserActive = activeEffectsRef.current.some(e => e.kind === 'laser')
    ctx.fillStyle = laserActive ? '#ef4444' : '#4ade80'
    ctx.fillRect(paddleX - paddleW / 2, PADDLE_Y, paddleW, PADDLE_H)
    if (laserActive) {
      ctx.fillStyle = '#fbbf24'
      ctx.fillRect(paddleX - paddleW / 2 + 2, PADDLE_Y - 3, 4, 3)
      ctx.fillRect(paddleX + paddleW / 2 - 6, PADDLE_Y - 3, 4, 3)
    }
    // Draw lasers
    ctx.fillStyle = '#fde047'
    ctx.shadowColor = 'rgba(253,224,71,0.7)'
    ctx.shadowBlur = 6
    lasersRef.current.forEach(l => ctx.fillRect(l.x - 1.5, l.y - 8, 3, 10))
    ctx.shadowBlur = 0
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth = 1
    ctx.strokeRect(paddleX - paddleW / 2 + 0.5, PADDLE_Y + 0.5, paddleW - 1, PADDLE_H - 1)

    const balls = ballsRef.current
    balls.forEach(ball => {
      ctx.fillStyle = '#e8b44b'
      ctx.shadowColor = 'rgba(232,180,75,0.7)'
      ctx.shadowBlur = 12
      ctx.beginPath()
      ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2)
      ctx.fill()
      ctx.shadowBlur = 0
    })

    powerupsRef.current.forEach(p => {
      const colors: Record<PowerupKind, string> = {
        multiball: '#fb923c',
        widePaddle: '#3b82f6',
        slowBall: '#22c55e',
        extraLife: '#ec4899',
        laser: '#ef4444'
      }
      const labels: Record<PowerupKind, string> = { multiball: 'M', widePaddle: 'W', slowBall: 'S', extraLife: 'L', laser: 'F' }
      ctx.fillStyle = colors[p.kind]
      ctx.fillRect(p.x - POWERUP_W / 2, p.y - POWERUP_H / 2, POWERUP_W, POWERUP_H)
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'
      ctx.lineWidth = 1
      ctx.strokeRect(p.x - POWERUP_W / 2 + 0.5, p.y - POWERUP_H / 2 + 0.5, POWERUP_W - 1, POWERUP_H - 1)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 10px monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(labels[p.kind], p.x, p.y)
    })
  }

  function startNew(): void {
    levelRef.current = 1
    scoreRef.current = 0
    livesRef.current = LIVES_INITIAL
    setLevel(1)
    setScore(0)
    setLives(LIVES_INITIAL)
    loadLevel(1)
    startGame()
  }

  function continueLevel(): void {
    loadLevel(levelRef.current)
    startGame()
  }

  return (
    <div className={styles.body}>
      <div className={styles.hud}>
        <span>Level <strong>{level}</strong></span>
        <span>Score <strong>{score}</strong></span>
        <span>Lives <strong>{lives}</strong></span>
        {highScore > 0 && <span className={styles.best}>Best: {highScore}</span>}
      </div>
      <div className={styles.canvasWrap}>
        <canvas ref={canvasRef} width={W} height={H} className={styles.canvas} />
        {phase !== 'playing' && (
          <div className={styles.overlay}>
            {phase === 'idle' && <span className={styles.title}>🧱 Breakout</span>}
            {phase === 'lost' && <><span className={styles.title}>Game Over</span><span className={styles.score}>Final score: {score}</span></>}
            {phase === 'won' && <><span className={styles.title}>✨ All Cleared!</span><span className={styles.score}>+500 bonus · {score} pts</span></>}
            {phase === 'paused' && <span className={styles.title}>⏸ Paused</span>}
            {phase === 'levelComplete' && <><span className={styles.title}>Level {level - 1} Cleared!</span><span className={styles.score}>+{(level - 1) * 100} bonus</span></>}
            {phase === 'paused' ? (
              <span className={styles.hint}>Press P to resume</span>
            ) : phase === 'levelComplete' ? (
              <button className={styles.btn} onClick={continueLevel}>Continue to Level {level}</button>
            ) : (
              <button className={styles.btn} onClick={startNew}>
                {phase === 'idle' ? 'Start' : 'Play Again'}
              </button>
            )}
            {phase !== 'paused' && (
              <span className={styles.hint}>← / → to move · Space to start · P to pause</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
