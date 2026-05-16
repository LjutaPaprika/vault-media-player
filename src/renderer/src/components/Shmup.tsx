import { useEffect, useRef, useState } from 'react'
import styles from './Shmup.module.css'

// Wave-based shoot 'em up. Enemies fly in from edges along bezier curves to
// formation slots, drift side-to-side, then occasionally peel off in dive-bomb
// attack runs aimed at the player.

const W = 480
const H = 600
const SAVE_KEY = 'shmupHighScore'

type Phase = 'idle' | 'waveIntro' | 'playing' | 'gameOver'
type EnemyType = 'grunt' | 'weaver' | 'tank' | 'scout' | 'bomber'
type EnemyState = 'entering' | 'formation' | 'diving' | 'returning'

interface Vec { x: number; y: number }
interface Bullet extends Vec { vy: number; vx?: number; from: 'player' | 'enemy' }
interface Particle extends Vec { vx: number; vy: number; life: number; color: string }
interface Star extends Vec { speed: number }

interface Enemy {
  id: number
  type: EnemyType
  state: EnemyState
  hp: number
  // Formation slot (column 0..6, row 0..2)
  col: number
  row: number
  // Position
  x: number
  y: number
  // Entry curve
  entryP0: Vec
  entryP1: Vec
  entryP2: Vec
  entryT: number
  entryDuration: number
  // Dive parameters
  diveT: number
  diveStartX: number
  diveStartY: number
  diveTargetX: number
  // Per-enemy attack cooldown
  cooldown: number
}

const PLAYER_SPEED = 280
const BULLET_SPEED = 480
const ENEMY_BULLET_SPEED = 200
const PLAYER_FIRE_INTERVAL = 0.14

// Formation grid
const FORM_COLS = 7
const FORM_ROWS = 3
const FORM_COL_W = 50
const FORM_ROW_H = 38
const FORM_TOP = 70
const FORM_DRIFT_AMP = 70
const FORM_DRIFT_PERIOD = 6  // seconds for full left-right-left cycle

const ENEMY_HP: Record<EnemyType, number> = { grunt: 1, weaver: 2, scout: 1, bomber: 3, tank: 6 }
const ENEMY_POINTS: Record<EnemyType, number> = { grunt: 100, weaver: 150, scout: 120, bomber: 200, tank: 400 }
const ENEMY_COLOR: Record<EnemyType, string> = {
  grunt: '#fb923c', weaver: '#c084fc', scout: '#22c55e', bomber: '#f472b6', tank: '#f87171'
}

let nextId = 1

interface WaveDef {
  spawns: { type: EnemyType; col: number; row: number; side: 'left' | 'right' | 'top'; delay: number }[]
}

function buildWave(n: number): WaveDef {
  // n = 1..∞. Mix of types depending on wave number.
  const spawns: WaveDef['spawns'] = []
  const slots: { col: number; row: number }[] = []
  // Fill slots from the front rows back as wave number rises
  const totalSlots = Math.min(FORM_COLS * FORM_ROWS, 10 + Math.floor(n * 3.5))
  for (let i = 0; i < totalSlots; i++) {
    slots.push({ col: i % FORM_COLS, row: Math.floor(i / FORM_COLS) % FORM_ROWS })
  }
  // Choose types
  const grunts = Math.max(2, Math.floor(totalSlots * 0.5) - n)
  const weavers = Math.min(totalSlots - 1, Math.floor(totalSlots * 0.2) + Math.floor(n * 0.3))
  const scouts = n >= 2 ? Math.min(3, Math.floor(n / 2)) : 0
  const bombers = n >= 3 ? Math.min(3, Math.floor((n - 1) / 2)) : 0
  const tanks = n >= 5 ? Math.min(2, Math.floor(n / 5)) : 0
  const order: EnemyType[] = []
  for (let i = 0; i < tanks; i++) order.push('tank')
  for (let i = 0; i < bombers; i++) order.push('bomber')
  for (let i = 0; i < weavers; i++) order.push('weaver')
  for (let i = 0; i < scouts; i++) order.push('scout')
  while (order.length < totalSlots) order.push('grunt')
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  let t = 0
  for (let i = 0; i < slots.length; i++) {
    const side: 'left' | 'right' | 'top' = (i % 3 === 0) ? 'left' : (i % 3 === 1) ? 'right' : 'top'
    spawns.push({ type: order[i], col: slots[i].col, row: slots[i].row, side, delay: t })
    t += Math.max(0.12, 0.35 - n * 0.025)
  }
  return { spawns }
}

function bezier(p0: Vec, p1: Vec, p2: Vec, t: number): Vec {
  const u = 1 - t
  return {
    x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y
  }
}

export default function Shmup(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const keysRef = useRef<Record<string, boolean>>({})
  const playerRef = useRef<Vec>({ x: W / 2, y: H - 60 })
  const bulletsRef = useRef<Bullet[]>([])
  const enemiesRef = useRef<Enemy[]>([])
  const particlesRef = useRef<Particle[]>([])
  const starsRef = useRef<Star[]>(
    Array.from({ length: 80 }, () => ({ x: Math.random() * W, y: Math.random() * H, speed: 40 + Math.random() * 120 }))
  )
  const lastTRef = useRef(performance.now())
  const playerFireCdRef = useRef(0)
  const livesRef = useRef(3)
  const invulnRef = useRef(0)
  const elapsedRef = useRef(0)
  const formationTRef = useRef(0)
  const waveRef = useRef(1)
  const waveDefRef = useRef<WaveDef>({ spawns: [] })
  const waveSpawnIndexRef = useRef(0)
  const waveSpawnTimerRef = useRef(0)
  const waveIntroTimerRef = useRef(0)
  const phaseRef = useRef<Phase>('idle')
  const scoreRef = useRef(0)
  const diveCooldownRef = useRef(1.2)
  const rafRef = useRef(0)

  const [score, setScore] = useState(0)
  const [lives, setLives] = useState(3)
  const [phase, setPhase] = useState<Phase>('idle')
  const [hi, setHi] = useState(0)
  const [wave, setWave] = useState(1)

  useEffect(() => {
    window.api.settings.get(SAVE_KEY, '0').then(v => setHi(parseInt(v, 10) || 0))
  }, [])

  useEffect(() => {
    function down(e: KeyboardEvent): void {
      const shmupKeys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'w', 'a', 's', 'd', 'W', 'A', 'S', 'D', 'z', 'Z']
      if (!shmupKeys.includes(e.key)) return
      if (phaseRef.current === 'idle' || phaseRef.current === 'gameOver') return
      e.preventDefault()
      e.stopImmediatePropagation()
      keysRef.current[e.key] = true
    }
    function up(e: KeyboardEvent): void { keysRef.current[e.key] = false }
    window.addEventListener('keydown', down, { capture: true })
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down, { capture: true }); window.removeEventListener('keyup', up) }
  }, [])

  useEffect(() => {
    function loop(t: number): void {
      const dt = Math.min(0.05, (t - lastTRef.current) / 1000)
      lastTRef.current = t
      if (phaseRef.current === 'playing' || phaseRef.current === 'waveIntro') update(dt)
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(rafRef.current)
  }, [])

  function update(dt: number): void {
    elapsedRef.current += dt
    formationTRef.current += dt
    invulnRef.current = Math.max(0, invulnRef.current - dt)
    const k = keysRef.current
    const p = playerRef.current

    if (phaseRef.current === 'waveIntro') {
      waveIntroTimerRef.current -= dt
      // Stars still move; player can still nudge into position
      if (waveIntroTimerRef.current <= 0) {
        phaseRef.current = 'playing'; setPhase('playing')
        waveSpawnIndexRef.current = 0
        waveSpawnTimerRef.current = 0
      }
    }

    // Player movement
    if (k['ArrowLeft']  || k['a'] || k['A']) p.x -= PLAYER_SPEED * dt
    if (k['ArrowRight'] || k['d'] || k['D']) p.x += PLAYER_SPEED * dt
    if (k['ArrowUp']    || k['w'] || k['W']) p.y -= PLAYER_SPEED * dt
    if (k['ArrowDown']  || k['s'] || k['S']) p.y += PLAYER_SPEED * dt
    p.x = Math.max(14, Math.min(W - 14, p.x))
    p.y = Math.max(H / 2, Math.min(H - 14, p.y))

    playerFireCdRef.current -= dt
    if (phaseRef.current === 'playing' && (k[' '] || k['z'] || k['Z']) && playerFireCdRef.current <= 0) {
      bulletsRef.current.push({ x: p.x - 6, y: p.y - 12, vy: -BULLET_SPEED, from: 'player' })
      bulletsRef.current.push({ x: p.x + 6, y: p.y - 12, vy: -BULLET_SPEED, from: 'player' })
      playerFireCdRef.current = PLAYER_FIRE_INTERVAL
    }

    // Stars
    for (const s of starsRef.current) {
      s.y += s.speed * dt
      if (s.y > H) { s.y = 0; s.x = Math.random() * W }
    }

    // Spawn next enemy in wave
    if (phaseRef.current === 'playing') {
      waveSpawnTimerRef.current += dt
      const def = waveDefRef.current
      while (waveSpawnIndexRef.current < def.spawns.length) {
        const next = def.spawns[waveSpawnIndexRef.current]
        if (waveSpawnTimerRef.current < next.delay) break
        spawnFromWave(next)
        waveSpawnIndexRef.current++
      }
    }

    // Compute formation drift (used for in-formation positions)
    const driftPhase = (formationTRef.current / FORM_DRIFT_PERIOD) * Math.PI * 2
    const driftX = Math.sin(driftPhase) * FORM_DRIFT_AMP

    // Maybe trigger a dive
    diveCooldownRef.current -= dt
    if (phaseRef.current === 'playing' && diveCooldownRef.current <= 0) {
      const eligible = enemiesRef.current.filter(e => e.state === 'formation' && e.type !== 'tank')
      if (eligible.length > 0) {
        const e = eligible[Math.floor(Math.random() * eligible.length)]
        e.state = 'diving'
        e.diveT = 0
        e.diveStartX = e.x
        e.diveStartY = e.y
        e.diveTargetX = p.x + (Math.random() - 0.5) * 80
      }
      // More frequent dives at higher waves
      diveCooldownRef.current = Math.max(0.4, 1.6 - waveRef.current * 0.1)
    }

    // Update enemies
    for (const e of enemiesRef.current) {
      e.cooldown -= dt
      if (e.state === 'entering') {
        e.entryT = Math.min(1, e.entryT + dt / e.entryDuration)
        const slotPos = formationSlotPos(e.col, e.row, driftX)
        const pos = bezier(e.entryP0, e.entryP1, slotPos, e.entryT)
        e.x = pos.x; e.y = pos.y
        if (e.entryT >= 1) e.state = 'formation'
      } else if (e.state === 'formation') {
        const slotPos = formationSlotPos(e.col, e.row, driftX)
        e.x = slotPos.x; e.y = slotPos.y
        // Occasional shot from formation — gets more aggressive at higher waves
        const formFireChance = Math.min(0.9, 0.6 + waveRef.current * 0.03)
        if (phaseRef.current === 'playing' && e.cooldown <= 0 && Math.random() < formFireChance) {
          enemyShoot(e, p)
          e.cooldown = Math.max(0.7, 1.4 + Math.random() * 1.8 - waveRef.current * 0.04)
        } else if (e.cooldown <= 0) {
          e.cooldown = Math.max(0.4, 0.9 + Math.random() - waveRef.current * 0.04)
        }
      } else if (e.state === 'diving') {
        e.diveT += dt
        // Curve: down toward target X, sweep past player level
        const t = e.diveT
        // Parametric: x interpolates toward diveTargetX over 1.5s; y rises down past H
        const tn = Math.min(1, t / 1.5)
        e.x = e.diveStartX + (e.diveTargetX - e.diveStartX) * tn + Math.sin(tn * Math.PI * 2) * 30
        e.y = e.diveStartY + tn * (H - e.diveStartY + 60)
        // Shoot more aggressively while diving
        if (phaseRef.current === 'playing' && e.cooldown <= 0 && e.y < H - 80) {
          enemyShoot(e, p)
          e.cooldown = 0.6
        }
        // Once past bottom, loop back to formation
        if (e.y > H + 30) {
          e.state = 'returning'
          e.entryT = 0
          e.entryDuration = 1.2
          e.entryP0 = { x: e.x, y: -30 }
          e.entryP1 = { x: e.x < W / 2 ? -30 : W + 30, y: 100 }
        }
      } else if (e.state === 'returning') {
        // Reuse entry-style bezier from top back to slot
        e.entryT = Math.min(1, e.entryT + dt / e.entryDuration)
        const slotPos = formationSlotPos(e.col, e.row, driftX)
        const pos = bezier(e.entryP0, e.entryP1, slotPos, e.entryT)
        e.x = pos.x; e.y = pos.y
        if (e.entryT >= 1) e.state = 'formation'
      }
    }

    // Bullets
    for (const b of bulletsRef.current) {
      b.y += b.vy * dt
      if (b.vx) b.x += b.vx * dt
    }
    bulletsRef.current = bulletsRef.current.filter(b => b.y > -20 && b.y < H + 20 && b.x > -20 && b.x < W + 20)

    // Player bullets vs enemies
    for (const b of bulletsRef.current) {
      if (b.from !== 'player') continue
      for (const e of enemiesRef.current) {
        if (e.state === 'entering' || e.state === 'returning') {
          // half-vulnerable while entering
          if (Math.abs(b.x - e.x) < 14 && Math.abs(b.y - e.y) < 14) {
            e.hp -= 1
            b.y = -100
            burst(e.x, e.y, ENEMY_COLOR[e.type])
            break
          }
        } else if (Math.abs(b.x - e.x) < 16 && Math.abs(b.y - e.y) < 16) {
          e.hp -= 1
          b.y = -100
          burst(e.x, e.y, ENEMY_COLOR[e.type])
          if (e.hp <= 0) {
            scoreRef.current += ENEMY_POINTS[e.type]
            setScore(scoreRef.current)
            burst(e.x, e.y, ENEMY_COLOR[e.type], 12)
          }
          break
        }
      }
    }
    enemiesRef.current = enemiesRef.current.filter(e => e.hp > 0)

    // Enemy bullets vs player
    if (invulnRef.current <= 0 && phaseRef.current === 'playing') {
      for (const b of bulletsRef.current) {
        if (b.from !== 'enemy') continue
        if (Math.abs(b.x - p.x) < 12 && Math.abs(b.y - p.y) < 12) {
          hitPlayer()
          b.y = H + 100
          break
        }
      }
      // Enemy bodies vs player (only diving)
      for (const e of enemiesRef.current) {
        if (e.state !== 'diving') continue
        if (Math.abs(e.x - p.x) < 18 && Math.abs(e.y - p.y) < 18) {
          hitPlayer()
          e.hp = 0
          burst(e.x, e.y, ENEMY_COLOR[e.type], 12)
          break
        }
      }
    }
    bulletsRef.current = bulletsRef.current.filter(b => b.y > -20 && b.y < H + 20)
    enemiesRef.current = enemiesRef.current.filter(e => e.hp > 0)

    // Particles
    for (const pt of particlesRef.current) {
      pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.life -= dt
    }
    particlesRef.current = particlesRef.current.filter(pt => pt.life > 0)

    // Wave clear?
    if (phaseRef.current === 'playing' && enemiesRef.current.length === 0 && waveSpawnIndexRef.current >= waveDefRef.current.spawns.length) {
      // Award bonus + advance wave
      scoreRef.current += 500 + waveRef.current * 100
      setScore(scoreRef.current)
      // Restore one life every 3 waves
      if (waveRef.current % 3 === 0 && livesRef.current < 5) {
        livesRef.current++
        setLives(livesRef.current)
      }
      startWave(waveRef.current + 1)
    }
  }

  function formationSlotPos(col: number, row: number, driftX: number): Vec {
    const baseX = (W - FORM_COLS * FORM_COL_W) / 2 + FORM_COL_W / 2
    return { x: baseX + col * FORM_COL_W + driftX, y: FORM_TOP + row * FORM_ROW_H }
  }

  function spawnFromWave(s: { type: EnemyType; col: number; row: number; side: 'left' | 'right' | 'top' }): void {
    let p0: Vec, p1: Vec
    if (s.side === 'left') {
      p0 = { x: -30, y: 60 + Math.random() * 120 }
      p1 = { x: 80, y: 220 }
    } else if (s.side === 'right') {
      p0 = { x: W + 30, y: 60 + Math.random() * 120 }
      p1 = { x: W - 80, y: 220 }
    } else {
      p0 = { x: 40 + Math.random() * (W - 80), y: -30 }
      p1 = { x: W / 2, y: 200 }
    }
    enemiesRef.current.push({
      id: nextId++, type: s.type, state: 'entering',
      hp: ENEMY_HP[s.type],
      col: s.col, row: s.row,
      x: p0.x, y: p0.y,
      entryP0: p0, entryP1: p1, entryP2: { x: 0, y: 0 },
      entryT: 0, entryDuration: 1.4,
      diveT: 0, diveStartX: 0, diveStartY: 0, diveTargetX: 0,
      cooldown: 2 + Math.random() * 2
    })
  }

  function startWave(n: number): void {
    waveRef.current = n
    setWave(n)
    waveDefRef.current = buildWave(n)
    waveSpawnIndexRef.current = 0
    waveSpawnTimerRef.current = 0
    waveIntroTimerRef.current = 1.6
    phaseRef.current = 'waveIntro'
    setPhase('waveIntro')
  }

  function enemyShoot(e: Enemy, p: Vec): void {
    if (e.type === 'scout' || e.type === 'bomber') {
      // Aimed
      const dx = p.x - e.x, dy = p.y - e.y
      const d = Math.hypot(dx, dy) || 1
      const speed = ENEMY_BULLET_SPEED * (e.type === 'bomber' ? 1.2 : 1)
      bulletsRef.current.push({ x: e.x, y: e.y + 8, vx: (dx / d) * speed, vy: (dy / d) * speed, from: 'enemy' })
    } else {
      bulletsRef.current.push({ x: e.x, y: e.y + 8, vy: ENEMY_BULLET_SPEED, from: 'enemy' })
    }
  }

  function hitPlayer(): void {
    livesRef.current--
    setLives(livesRef.current)
    invulnRef.current = 1.6
    burst(playerRef.current.x, playerRef.current.y, '#60a5fa', 16)
    if (livesRef.current <= 0) {
      phaseRef.current = 'gameOver'; setPhase('gameOver')
      if (scoreRef.current > hi) {
        setHi(scoreRef.current)
        window.api.settings.set(SAVE_KEY, String(scoreRef.current)).catch(() => {})
      }
    }
  }

  function burst(x: number, y: number, color: string, n = 6): void {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2
      const s = 60 + Math.random() * 120
      particlesRef.current.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.4 + Math.random() * 0.3, color })
    }
  }

  function startGame(): void {
    bulletsRef.current = []
    enemiesRef.current = []
    particlesRef.current = []
    playerRef.current = { x: W / 2, y: H - 60 }
    livesRef.current = 3; setLives(3)
    scoreRef.current = 0; setScore(0)
    elapsedRef.current = 0
    formationTRef.current = 0
    invulnRef.current = 0
    diveCooldownRef.current = 3
    startWave(1)
  }

  function draw(): void {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#02050a'
    ctx.fillRect(0, 0, W, H)

    // Stars
    ctx.fillStyle = '#fff'
    for (const s of starsRef.current) {
      const a = s.speed / 160
      ctx.globalAlpha = Math.min(1, a)
      ctx.fillRect(s.x, s.y, 1.5, 1.5)
    }
    ctx.globalAlpha = 1

    // Player
    if (phaseRef.current !== 'idle' && phaseRef.current !== 'gameOver') {
      const p = playerRef.current
      const blink = invulnRef.current > 0 && Math.floor(invulnRef.current * 16) % 2 === 0
      if (!blink) drawShip(ctx, p.x, p.y, '#60a5fa')
    }

    // Enemies
    for (const e of enemiesRef.current) {
      drawEnemy(ctx, e.x, e.y, ENEMY_COLOR[e.type], e.type, e.state === 'diving')
    }

    // Bullets
    for (const b of bulletsRef.current) {
      ctx.fillStyle = b.from === 'player' ? '#fde047' : '#f472b6'
      if (b.from === 'player') {
        ctx.fillRect(b.x - 1.5, b.y - 6, 3, 10)
      } else {
        ctx.beginPath()
        ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2)
        ctx.fill()
      }
    }

    // Particles
    for (const pt of particlesRef.current) {
      ctx.globalAlpha = Math.max(0, pt.life / 0.6)
      ctx.fillStyle = pt.color
      ctx.fillRect(pt.x - 1.5, pt.y - 1.5, 3, 3)
    }
    ctx.globalAlpha = 1

    // Wave intro text
    if (phaseRef.current === 'waveIntro') {
      ctx.fillStyle = 'rgba(0,0,0,0.4)'
      ctx.fillRect(0, H / 2 - 40, W, 80)
      ctx.fillStyle = '#60a5fa'
      ctx.font = 'bold 28px ui-monospace, Consolas, monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(`WAVE ${waveRef.current}`, W / 2, H / 2)
    }
  }

  function drawShip(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    ctx.fillStyle = color
    ctx.beginPath()
    ctx.moveTo(x, y - 12)
    ctx.lineTo(x - 12, y + 10)
    ctx.lineTo(x, y + 4)
    ctx.lineTo(x + 12, y + 10)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = '#fff'
    ctx.fillRect(x - 1.5, y - 4, 3, 8)
  }

  function drawEnemy(ctx: CanvasRenderingContext2D, x: number, y: number, color: string, type: EnemyType, diving: boolean): void {
    ctx.fillStyle = color
    if (diving) {
      ctx.shadowColor = color
      ctx.shadowBlur = 8
    }
    if (type === 'tank') {
      ctx.fillRect(x - 16, y - 12, 32, 22)
      ctx.fillStyle = '#7f1d1d'
      ctx.fillRect(x - 10, y - 4, 20, 6)
    } else if (type === 'weaver') {
      ctx.beginPath()
      ctx.moveTo(x, y + 10)
      ctx.lineTo(x - 14, y - 6)
      ctx.lineTo(x, y - 2)
      ctx.lineTo(x + 14, y - 6)
      ctx.closePath()
      ctx.fill()
    } else if (type === 'scout') {
      ctx.beginPath()
      ctx.moveTo(x, y - 10)
      ctx.lineTo(x + 8, y + 8)
      ctx.lineTo(x - 8, y + 8)
      ctx.closePath()
      ctx.fill()
    } else if (type === 'bomber') {
      // Pink bomber: hex
      ctx.beginPath()
      ctx.moveTo(x - 12, y)
      ctx.lineTo(x - 6, y - 10)
      ctx.lineTo(x + 6, y - 10)
      ctx.lineTo(x + 12, y)
      ctx.lineTo(x + 6, y + 10)
      ctx.lineTo(x - 6, y + 10)
      ctx.closePath()
      ctx.fill()
      ctx.fillStyle = '#7a1a3f'
      ctx.fillRect(x - 4, y - 3, 8, 6)
    } else {
      ctx.beginPath()
      ctx.arc(x, y, 11, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#7c2d12'
      ctx.fillRect(x - 4, y - 2, 8, 4)
    }
    ctx.shadowBlur = 0
  }

  return (
    <div className={styles.body}>
      <div className={styles.header}>
        <span>Score <strong>{score}</strong></span>
        <span>Wave <strong>{wave}</strong></span>
        <span>Lives <strong>{lives}</strong></span>
        <span>High <strong>{hi}</strong></span>
      </div>
      <div className={styles.stage}>
        <canvas ref={canvasRef} width={W} height={H} className={styles.canvas} />
        {phase === 'idle' && (
          <div className={styles.overlay}>
            <div className={styles.title}>SHOOT 'EM UP</div>
            <div className={styles.subtitle}>WASD / arrows · Space or Z to fire</div>
            <button className={styles.btn} onClick={startGame}>Start</button>
          </div>
        )}
        {phase === 'gameOver' && (
          <div className={styles.overlay}>
            <div className={styles.title}>GAME OVER</div>
            <div className={styles.subtitle}>{score} pts · Wave {wave}</div>
            <button className={styles.btn} onClick={startGame}>Play Again</button>
          </div>
        )}
      </div>
    </div>
  )
}
