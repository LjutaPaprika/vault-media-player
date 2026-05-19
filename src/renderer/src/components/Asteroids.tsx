import { useEffect, useRef, useState } from 'react'
import styles from './Asteroids.module.css'

const SAVE_KEY = 'asteroidsHighScore'
const W = 640, H = 480
const SHIP_R = 12
const SHIP_ROT_SPEED = 0.09
const SHIP_THRUST = 0.15
const SHIP_DRAG = 0.992
const SHIP_MAX_SPEED = 7
const BULLET_SPEED = 8
const BULLET_LIFE = 60                  // frames
const BULLET_COOLDOWN = 8               // frames between shots
const ASTEROID_SPAWN_BASE = 4           // starting wave size
const ASTEROID_SPEED_BASE = 0.7
const RESPAWN_INVULN = 90               // frames of invulnerability after death
const LIVES_INITIAL = 3
const POINTS = { 3: 20, 2: 50, 1: 100 }  // by size

type Phase = 'idle' | 'playing' | 'gameOver'

interface Ship {
  x: number; y: number
  vx: number; vy: number
  angle: number              // radians, 0 = pointing up
  invulnUntil: number        // frame
}

interface Bullet { x: number; y: number; vx: number; vy: number; life: number }

interface Asteroid {
  x: number; y: number
  vx: number; vy: number
  size: 1 | 2 | 3            // 3 = large
  radius: number
  shape: number[]            // pre-generated jagged radii (12 points)
  spin: number               // visual rotation speed
  rot: number
}

function makeAsteroidShape(): number[] {
  const points = 12
  const arr: number[] = []
  for (let i = 0; i < points; i++) arr.push(0.7 + Math.random() * 0.6)
  return arr
}

function asteroidRadiusFor(size: 1 | 2 | 3): number {
  return size === 3 ? 36 : size === 2 ? 22 : 12
}

function spawnAsteroid(size: 1 | 2 | 3, x: number, y: number, speedMult: number): Asteroid {
  const angle = Math.random() * Math.PI * 2
  const speed = (ASTEROID_SPEED_BASE + Math.random() * 0.6) * speedMult * (size === 1 ? 1.6 : size === 2 ? 1.2 : 1)
  return {
    x, y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    size,
    radius: asteroidRadiusFor(size),
    shape: makeAsteroidShape(),
    spin: (Math.random() - 0.5) * 0.04,
    rot: 0
  }
}

function spawnWaveAsteroids(count: number, speedMult: number): Asteroid[] {
  const arr: Asteroid[] = []
  for (let i = 0; i < count; i++) {
    // Spawn on a screen edge, away from the center
    let x: number, y: number
    const side = Math.floor(Math.random() * 4)
    if (side === 0)      { x = Math.random() * W; y = -40 }
    else if (side === 1) { x = W + 40;            y = Math.random() * H }
    else if (side === 2) { x = Math.random() * W; y = H + 40 }
    else                 { x = -40;               y = Math.random() * H }
    arr.push(spawnAsteroid(3, x, y, speedMult))
  }
  return arr
}

export default function Asteroids(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle')
  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(LIVES_INITIAL)
  const [wave, setWave] = useState(1)
  const [highScore, setHighScore] = useState(0)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const phaseRef = useRef<Phase>('idle')
  const shipRef = useRef<Ship>({ x: W / 2, y: H / 2, vx: 0, vy: 0, angle: 0, invulnUntil: 0 })
  const bulletsRef = useRef<Bullet[]>([])
  const asteroidsRef = useRef<Asteroid[]>([])
  const scoreRef = useRef(0)
  const livesRef = useRef(LIVES_INITIAL)
  const waveRef = useRef(1)
  const hiRef = useRef(0)
  const frameRef = useRef(0)
  const lastShotRef = useRef(-999)
  const keysRef = useRef<Set<string>>(new Set())
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    window.api.settings.get(SAVE_KEY, '0').then((v) => {
      hiRef.current = parseInt(v, 10) || 0
      setHighScore(hiRef.current)
    })
    draw()
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const k = e.key
      const capture = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' ', 'Spacebar', 'Enter', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D']
      if (capture.includes(k)) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
      if (k === 'ArrowUp' || k === 'w' || k === 'W') keysRef.current.add('thrust')
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') keysRef.current.add('left')
      if (k === 'ArrowRight' || k === 'd' || k === 'D') keysRef.current.add('right')
      if (k === ' ' || k === 'Spacebar') {
        if (phaseRef.current === 'playing') keysRef.current.add('fire')
        else if (phaseRef.current === 'idle' || phaseRef.current === 'gameOver') startGame()
      }
      if (k === 'Enter' && (phaseRef.current === 'idle' || phaseRef.current === 'gameOver')) startGame()
    }
    function onKeyUp(e: KeyboardEvent): void {
      const k = e.key
      if (k === 'ArrowUp' || k === 'w' || k === 'W') keysRef.current.delete('thrust')
      if (k === 'ArrowLeft' || k === 'a' || k === 'A') keysRef.current.delete('left')
      if (k === 'ArrowRight' || k === 'd' || k === 'D') keysRef.current.delete('right')
      if (k === ' ' || k === 'Spacebar') keysRef.current.delete('fire')
    }
    window.addEventListener('keydown', onKey, { capture: true })
    window.addEventListener('keyup', onKeyUp, { capture: true })
    return () => {
      window.removeEventListener('keydown', onKey, { capture: true })
      window.removeEventListener('keyup', onKeyUp, { capture: true })
    }
  }, [])

  function startGame(): void {
    scoreRef.current = 0
    livesRef.current = LIVES_INITIAL
    waveRef.current = 1
    setScore(0)
    setLives(LIVES_INITIAL)
    setWave(1)
    shipRef.current = { x: W / 2, y: H / 2, vx: 0, vy: 0, angle: 0, invulnUntil: 0 }
    bulletsRef.current = []
    asteroidsRef.current = spawnWaveAsteroids(ASTEROID_SPAWN_BASE, 1)
    frameRef.current = 0
    lastShotRef.current = -999
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

  function wrap(v: number, max: number): number {
    if (v < 0) return v + max
    if (v >= max) return v - max
    return v
  }

  function step(): void {
    if (phaseRef.current !== 'playing') return
    frameRef.current++
    const f = frameRef.current

    const ship = shipRef.current
    const keys = keysRef.current
    if (keys.has('left')) ship.angle -= SHIP_ROT_SPEED
    if (keys.has('right')) ship.angle += SHIP_ROT_SPEED
    if (keys.has('thrust')) {
      ship.vx += Math.sin(ship.angle) * SHIP_THRUST
      ship.vy -= Math.cos(ship.angle) * SHIP_THRUST
    }
    ship.vx *= SHIP_DRAG
    ship.vy *= SHIP_DRAG
    const speed = Math.hypot(ship.vx, ship.vy)
    if (speed > SHIP_MAX_SPEED) {
      ship.vx = (ship.vx / speed) * SHIP_MAX_SPEED
      ship.vy = (ship.vy / speed) * SHIP_MAX_SPEED
    }
    ship.x = wrap(ship.x + ship.vx, W)
    ship.y = wrap(ship.y + ship.vy, H)

    if (keys.has('fire') && f - lastShotRef.current >= BULLET_COOLDOWN) {
      bulletsRef.current.push({
        x: ship.x + Math.sin(ship.angle) * SHIP_R,
        y: ship.y - Math.cos(ship.angle) * SHIP_R,
        vx: Math.sin(ship.angle) * BULLET_SPEED + ship.vx * 0.4,
        vy: -Math.cos(ship.angle) * BULLET_SPEED + ship.vy * 0.4,
        life: BULLET_LIFE
      })
      lastShotRef.current = f
    }

    bulletsRef.current = bulletsRef.current.filter((b) => {
      b.x = wrap(b.x + b.vx, W)
      b.y = wrap(b.y + b.vy, H)
      b.life--
      return b.life > 0
    })

    for (const a of asteroidsRef.current) {
      a.x = wrap(a.x + a.vx, W)
      a.y = wrap(a.y + a.vy, H)
      a.rot += a.spin
    }

    // Bullet vs asteroid collisions
    for (let i = bulletsRef.current.length - 1; i >= 0; i--) {
      const b = bulletsRef.current[i]
      let hit = false
      for (let j = asteroidsRef.current.length - 1; j >= 0; j--) {
        const a = asteroidsRef.current[j]
        if (Math.hypot(a.x - b.x, a.y - b.y) <= a.radius) {
          // Hit — split or destroy
          scoreRef.current += POINTS[a.size]
          if (a.size > 1) {
            const newSize = (a.size - 1) as 1 | 2
            asteroidsRef.current.push(
              spawnAsteroid(newSize, a.x, a.y, 1 + waveRef.current * 0.05),
              spawnAsteroid(newSize, a.x, a.y, 1 + waveRef.current * 0.05)
            )
          }
          asteroidsRef.current.splice(j, 1)
          bulletsRef.current.splice(i, 1)
          hit = true
          break
        }
      }
      if (hit) continue
    }

    // Ship vs asteroid (if not invulnerable)
    if (f > ship.invulnUntil) {
      for (const a of asteroidsRef.current) {
        if (Math.hypot(a.x - ship.x, a.y - ship.y) <= a.radius + SHIP_R - 2) {
          livesRef.current--
          setLives(livesRef.current)
          if (livesRef.current <= 0) {
            endGame()
            return
          }
          ship.x = W / 2
          ship.y = H / 2
          ship.vx = 0
          ship.vy = 0
          ship.invulnUntil = f + RESPAWN_INVULN
          break
        }
      }
    }

    // Wave clear
    if (asteroidsRef.current.length === 0) {
      waveRef.current++
      setWave(waveRef.current)
      const count = ASTEROID_SPAWN_BASE + Math.floor((waveRef.current - 1) / 2)
      const speedMult = 1 + (waveRef.current - 1) * 0.1
      asteroidsRef.current = spawnWaveAsteroids(count, speedMult)
      ship.invulnUntil = f + 60
    }

    setScore(scoreRef.current)
  }

  function endGame(): void {
    phaseRef.current = 'gameOver'
    setPhase('gameOver')
    if (scoreRef.current > hiRef.current) {
      hiRef.current = scoreRef.current
      setHighScore(hiRef.current)
      window.api.settings.set(SAVE_KEY, String(hiRef.current)).catch(() => {})
    }
  }

  function draw(): void {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#04040a'
    ctx.fillRect(0, 0, W, H)

    // Starfield (deterministic based on position)
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    for (let i = 0; i < 80; i++) {
      const x = (i * 137) % W
      const y = (i * 61) % H
      ctx.fillRect(x, y, 1, 1)
    }

    // Asteroids
    ctx.strokeStyle = '#9ca3af'
    ctx.lineWidth = 1.5
    for (const a of asteroidsRef.current) {
      ctx.beginPath()
      const points = a.shape.length
      for (let i = 0; i < points; i++) {
        const ang = (i / points) * Math.PI * 2 + a.rot
        const r = a.radius * a.shape[i]
        const px = a.x + Math.cos(ang) * r
        const py = a.y + Math.sin(ang) * r
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      }
      ctx.closePath()
      ctx.stroke()
    }

    // Bullets
    ctx.fillStyle = '#fde047'
    ctx.shadowColor = 'rgba(253,224,71,0.7)'
    ctx.shadowBlur = 6
    for (const b of bulletsRef.current) {
      ctx.beginPath()
      ctx.arc(b.x, b.y, 2, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.shadowBlur = 0

    // Ship
    const ship = shipRef.current
    const f = frameRef.current
    const blink = f < ship.invulnUntil && Math.floor(f / 4) % 2 === 0
    if (!blink) {
      ctx.save()
      ctx.translate(ship.x, ship.y)
      ctx.rotate(ship.angle)
      ctx.strokeStyle = '#4ade80'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(0, -SHIP_R)
      ctx.lineTo(SHIP_R * 0.7, SHIP_R)
      ctx.lineTo(0, SHIP_R * 0.5)
      ctx.lineTo(-SHIP_R * 0.7, SHIP_R)
      ctx.closePath()
      ctx.stroke()
      // Thrust flame
      if (keysRef.current.has('thrust') && f % 4 < 2) {
        ctx.strokeStyle = '#ef4444'
        ctx.beginPath()
        ctx.moveTo(-SHIP_R * 0.4, SHIP_R * 0.7)
        ctx.lineTo(0, SHIP_R * 1.4)
        ctx.lineTo(SHIP_R * 0.4, SHIP_R * 0.7)
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  return (
    <div className={styles.body}>
      <div className={styles.hud}>
        <span>Score <strong>{score}</strong></span>
        <span>Wave <strong>{wave}</strong></span>
        <span>Lives <strong>{lives}</strong></span>
        {highScore > 0 && <span className={styles.best}>Best: {highScore}</span>}
      </div>
      <div className={styles.canvasWrap}>
        <canvas ref={canvasRef} width={W} height={H} className={styles.canvas} />
        {phase !== 'playing' && (
          <div className={styles.overlay}>
            {phase === 'idle' && <span className={styles.title}>🚀 Asteroids</span>}
            {phase === 'gameOver' && (
              <>
                <span className={styles.title}>💥 Game Over</span>
                <span className={styles.score}>Score: {score} · Wave {wave}</span>
              </>
            )}
            <button className={styles.btn} onClick={startGame}>
              {phase === 'idle' ? 'Start' : 'Play Again'}
            </button>
            <span className={styles.hint}>← → rotate · ↑ thrust · Space fire</span>
          </div>
        )}
      </div>
    </div>
  )
}
