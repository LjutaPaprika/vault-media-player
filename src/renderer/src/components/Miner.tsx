import { useEffect, useRef, useState } from 'react'
import { generateLevel, MAP_W, MAP_H, type TileKind, type EnemyType } from '../utils/minerGen'
import { CELL, drawSprite, variantFor, getWallVariant, SPRITE_FLOOR_A, SPRITE_FLOOR_B, SPRITE_FLOOR_C, SPRITE_DIRT_A, SPRITE_DIRT_B, SPRITE_DIRT_C, SPRITE_STONE, SPRITE_GEM_DIRT, SPRITE_GOLD_DIRT, SPRITE_STAIRS, SPRITE_VAULT_DOOR, SPRITE_VAULT_FLOOR, SPRITE_WALL, SPRITE_PLAYER_0, SPRITE_PLAYER_1, SPRITE_CRAWLER_0, SPRITE_CRAWLER_1, SPRITE_GUARD_0, SPRITE_GUARD_1, SPRITE_BRUTE_0, SPRITE_BRUTE_1, SPRITE_SHOOTER_0, SPRITE_SHOOTER_1, SPRITE_PROJECTILE, PAL, type Sprite } from '../utils/minerSprites'
import styles from './Miner.module.css'

const W = MAP_W * CELL
const H = MAP_H * CELL

const KEY_CHANCE = 0.03
const LOS_RADIUS = 7
const PATROL_WANDER_CHANCE = 0.2
const PROJECTILE_RANGE = 8

interface Player {
  x: number; y: number
  hp: number; maxHp: number
  atk: number
  hasKey: boolean
}

type EnemyState = 'patrol' | 'chase' | 'charge'
type Direction = 'U' | 'D' | 'L' | 'R' | 'N'

interface Enemy {
  id: number
  x: number; y: number
  type: EnemyType
  hp: number; maxHp: number
  atk: number
  state: EnemyState
  dir: Direction
  patrolTarget: { x: number; y: number } | null
  patrolOrigin: { x: number; y: number } | null
  shootCooldown: number
  chargeDir: Direction | null
  lostSightTurns: number
}

interface Projectile {
  x: number; y: number
  dx: number; dy: number
  stepsLeft: number
}

const ENEMY_STATS: Record<EnemyType, { hp: number; atk: number; score: number }> = {
  crawler: { hp: 1,  atk: 1, score: 5  },
  guard:   { hp: 3,  atk: 2, score: 15 },
  brute:   { hp: 6,  atk: 3, score: 30 },
  shooter: { hp: 2,  atk: 1, score: 20 },
}

type Phase = 'idle' | 'playing' | 'dead'

interface BestScore { score: number; depth: number }

let _eid = 0

interface MinerProps {
  onNewBest?: (score: number, depth: number) => void
}

export default function Miner({ onNewBest }: MinerProps): JSX.Element {
  const [phase, setPhase]       = useState<Phase>('idle')
  const [hp, setHp]             = useState(10)
  const [maxHp]                 = useState(10)
  const [score, setScore]       = useState(0)
  const [floor, setFloor]       = useState(1)
  const [hasKey, setHasKey]     = useState(false)
  const [message, setMessage]   = useState('')
  const [best, setBest]         = useState<BestScore>({ score: 0, depth: 0 })

  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const phaseRef     = useRef<Phase>('idle')
  const gridRef      = useRef<TileKind[][]>([])
  const stoneHits    = useRef<Map<string, number>>(new Map())
  const playerRef    = useRef<Player>({ x: 0, y: 0, hp: 10, maxHp: 10, atk: 1, hasKey: false })
  const enemiesRef   = useRef<Enemy[]>([])
  const projectilesRef = useRef<Projectile[]>([])
  const scoreRef     = useRef(0)
  const floorRef     = useRef(1)
  const msgTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)
  const visitedRef   = useRef<boolean[][]>([])
  const visibleRef   = useRef<Set<string>>(new Set())
  const playerFacingRef = useRef<'L' | 'R'>('R')
  const animTickRef  = useRef(0)

  useEffect(() => {
    window.api.settings.get('vaultDelverBest', '').then(v => {
      if (!v) return
      try { setBest(JSON.parse(v) as BestScore) } catch { /* corrupt */ }
    })
    requestAnimationFrame(draw)
    return () => { if (msgTimer.current) clearTimeout(msgTimer.current) }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (phaseRef.current !== 'playing') {
        if (e.key === 'Enter' || e.key === ' ') startGame()
        return
      }
      const dx = e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D' ? 1
               : e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A' ? -1 : 0
      const dy = e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S' ? 1
               : e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'W' ? -1 : 0
      if (dx === 0 && dy === 0) return
      if (e.key.startsWith('Arrow')) { e.preventDefault(); e.stopImmediatePropagation() }
      processTurn(dx, dy)
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [])

  // ── Helpers ───────────────────────────────────────────────────────────────

  function showMsg(msg: string, ms = 2200): void {
    setMessage(msg)
    if (msgTimer.current) clearTimeout(msgTimer.current)
    msgTimer.current = setTimeout(() => setMessage(''), ms)
  }

  // ── Line of sight (Bresenham) ─────────────────────────────────────────────

  function hasLoS(x1: number, y1: number, x2: number, y2: number): boolean {
    const dx = Math.abs(x2 - x1)
    const dy = Math.abs(y2 - y1)
    const sx = x1 < x2 ? 1 : -1
    const sy = y1 < y2 ? 1 : -1
    let err = dx - dy
    let x = x1, y = y1
    const grid = gridRef.current

    while (true) {
      if (x < 0 || x >= MAP_W || y < 0 || y >= MAP_H) return false
      const tile = grid[y]?.[x]
      if (tile === 'wall') return false
      if (x === x2 && y === y2) return true

      const e2 = 2 * err
      if (e2 > -dy) { err -= dy; x += sx }
      if (e2 < dx) { err += dx; y += sy }
    }
  }

  // ── Fog of War ────────────────────────────────────────────────────────────

  function computeVisible(): void {
    const p = playerRef.current
    const vis = new Set<string>()
    const grid = gridRef.current

    for (let y = Math.max(0, p.y - LOS_RADIUS); y <= Math.min(MAP_H - 1, p.y + LOS_RADIUS); y++) {
      for (let x = Math.max(0, p.x - LOS_RADIUS); x <= Math.min(MAP_W - 1, p.x + LOS_RADIUS); x++) {
        const dist = Math.max(Math.abs(x - p.x), Math.abs(y - p.y))
        if (dist <= LOS_RADIUS && hasLoS(p.x, p.y, x, y)) {
          vis.add(`${x},${y}`)
          visitedRef.current[y][x] = true
        }
      }
    }
    visibleRef.current = vis
  }

  function loadFloor(fl: number, preserveKey: boolean): void {
    const { grid, playerStart, enemies } = generateLevel(fl)
    gridRef.current = grid
    stoneHits.current.clear()
    projectilesRef.current = []
    floorRef.current = fl
    const p = playerRef.current
    p.x = playerStart.x; p.y = playerStart.y
    p.atk = 1 + Math.floor(fl / 5)
    if (!preserveKey) p.hasKey = false
    visitedRef.current = Array.from({ length: MAP_H }, () => Array(MAP_W).fill(false))
    visibleRef.current = new Set()
    enemiesRef.current = enemies.map(e => {
      const base = ENEMY_STATS[e.type]
      const hpBoost = Math.floor(fl / 5)
      return {
        id: _eid++, x: e.x, y: e.y, type: e.type,
        hp: base.hp + hpBoost, maxHp: base.hp + hpBoost, atk: base.atk,
        state: 'patrol', dir: 'U', patrolTarget: null, patrolOrigin: null,
        shootCooldown: 0, chargeDir: null, lostSightTurns: 0
      }
    })
  }

  function startGame(): void {
    _eid = 0
    scoreRef.current = 0
    playerRef.current = { x: 0, y: 0, hp: 10, maxHp: 10, atk: 1, hasKey: false }
    loadFloor(1, false)
    phaseRef.current = 'playing'
    setPhase('playing'); setHp(10); setScore(0); setFloor(1); setHasKey(false); setMessage('')
    draw()
  }

  // ── Vault opening ─────────────────────────────────────────────────────────

  function openVault(tx: number, ty: number): void {
    const p = playerRef.current
    p.hasKey = false
    setHasKey(false)

    const grid = gridRef.current
    const visited = new Set<string>()
    const queue: { x: number; y: number }[] = []

    for (const [ndx, ndy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
      const nx = tx + ndx, ny = ty + ndy
      if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H && grid[ny][nx] === 'vaultFloor') {
        visited.add(`${nx},${ny}`)
        queue.push({ x: nx, y: ny })
      }
    }

    let count = 0
    while (queue.length > 0) {
      const { x, y } = queue.shift()!
      grid[y][x] = 'floor'; count++
      for (const [ndx, ndy] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) {
        const nx = x + ndx, ny = y + ndy, k = `${nx},${ny}`
        if (!visited.has(k) && nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H && grid[ny][nx] === 'vaultFloor') {
          visited.add(k); queue.push({ x: nx, y: ny })
        }
      }
    }
    grid[ty][tx] = 'floor'

    const bonus = 200 + floorRef.current * 25 + count * 8
    scoreRef.current += bonus
    p.x = tx; p.y = ty
    showMsg(`🔓 Vault opened! +${bonus}`)
  }

  // ── Turn processing ────────────────────────────────────────────────────────

  function processTurn(dx: number, dy: number): void {
    const p = playerRef.current
    const grid = gridRef.current
    const tx = p.x + dx, ty = p.y + dy

    // Track facing and animation
    if (dx !== 0) playerFacingRef.current = dx > 0 ? 'R' : 'L'
    animTickRef.current++

    if (tx < 0 || tx >= MAP_W || ty < 0 || ty >= MAP_H) return

    const tile = grid[ty][tx]
    const eidx = enemiesRef.current.findIndex(e => e.x === tx && e.y === ty)

    // Attack
    if (eidx >= 0) {
      const enemy = enemiesRef.current[eidx]
      enemy.hp -= p.atk
      if (enemy.hp <= 0) {
        scoreRef.current += ENEMY_STATS[enemy.type].score
        enemiesRef.current.splice(eidx, 1)
      }
    }
    // Impassable
    else if (tile === 'wall') return
    // Dig soft
    else if (tile === 'dirt' || tile === 'gemDirt' || tile === 'goldDirt') {
      if (tile === 'gemDirt')  scoreRef.current += 10
      if (tile === 'goldDirt') scoreRef.current += 5
      grid[ty][tx] = 'floor'
      if (Math.random() < KEY_CHANCE && !p.hasKey) {
        p.hasKey = true; setHasKey(true); showMsg('🗝️ Found a key!')
      }
    }
    // Dig stone (2 hits)
    else if (tile === 'stone') {
      const k = `${tx},${ty}`
      const hits = (stoneHits.current.get(k) ?? 0) + 1
      if (hits >= 2) {
        grid[ty][tx] = 'floor'; stoneHits.current.delete(k)
        if (Math.random() < 0.35) scoreRef.current += 10
        if (Math.random() < 0.15) scoreRef.current += 5
        if (Math.random() < KEY_CHANCE && !p.hasKey) {
          p.hasKey = true; setHasKey(true); showMsg('🗝️ Found a key!')
        }
      } else {
        stoneHits.current.set(k, hits)
      }
    }
    // Move
    else if (tile === 'floor' || tile === 'vaultFloor') {
      p.x = tx; p.y = ty
    }
    // Descend
    else if (tile === 'stairs') {
      const fl = floorRef.current + 1
      scoreRef.current += 20 + fl * 5
      loadFloor(fl, p.hasKey)
      p.hp = Math.min(p.maxHp, p.hp + 2)
      setFloor(fl); setScore(scoreRef.current); setHp(p.hp); setHasKey(p.hasKey)
      showMsg(`Floor ${fl}`)
      draw()
      return
    }
    // Vault door
    else if (tile === 'vaultDoor') {
      if (p.hasKey) openVault(tx, ty)
      else showMsg('Need a key to open the vault')
      // vault attempt doesn't advance enemy turn
      setMessage(p.hasKey ? message : 'Need a key to open the vault')
      draw()
      return
    }
    else return

    // Enemy turns and projectiles
    computeVisible()
    processEnemies()
    processProjectiles()

    setScore(scoreRef.current); setHp(p.hp); setHasKey(p.hasKey)

    if (p.hp <= 0) { gameOver(); return }

    draw()
  }

  function processProjectiles(): void {
    const p = playerRef.current
    const grid = gridRef.current
    const updated: Projectile[] = []

    for (const proj of projectilesRef.current) {
      proj.x += proj.dx
      proj.y += proj.dy
      proj.stepsLeft--

      const ix = Math.round(proj.x), iy = Math.round(proj.y)
      if (ix < 0 || ix >= MAP_W || iy < 0 || iy >= MAP_H) continue
      if (grid[iy]?.[ix] === 'wall') continue

      // Hit player
      if (ix === p.x && iy === p.y) {
        p.hp -= 1
        continue
      }

      if (proj.stepsLeft > 0) updated.push(proj)
    }

    projectilesRef.current = updated
  }

  function processEnemies(): void {
    const p = playerRef.current
    const grid = gridRef.current

    for (const enemy of enemiesRef.current) {
      const eyeLos = hasLoS(enemy.x, enemy.y, p.x, p.y)
      const dist = Math.abs(enemy.x - p.x) + Math.abs(enemy.y - p.y)

      // Get valid adjacent moves
      const adjacent = ([[-1, 0], [1, 0], [0, -1], [0, 1]] as const).filter(([ndx, ndy]) => {
        const nx = enemy.x + ndx, ny = enemy.y + ndy
        if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) return false
        const t = grid[ny][nx]
        if (t !== 'floor' && t !== 'vaultFloor' && t !== 'stairs') return false
        if (enemiesRef.current.some(e2 => e2 !== enemy && e2.x === nx && e2.y === ny)) return false
        return true
      })

      // Melee combat
      if (dist <= 1) { p.hp -= enemy.atk; continue }

      if (enemy.type === 'shooter') {
        // Shooter AI: maintain distance 4-7 and shoot
        if (eyeLos && dist >= 4 && dist <= 7) {
          // Shoot
          const dx = (p.x - enemy.x) / dist
          const dy = (p.y - enemy.y) / dist
          projectilesRef.current.push({ x: enemy.x + 0.5, y: enemy.y + 0.5, dx, dy, stepsLeft: 8 })
          if (adjacent.length > 0) {
            const m = adjacent[Math.floor(Math.random() * adjacent.length)]
            enemy.x += m[0]; enemy.y += m[1]
          }
        } else if (eyeLos && dist < 4) {
          // Too close, back away
          let bestDist = dist, bestMove = null as readonly [number, number] | null
          for (const m of adjacent) {
            const d = Math.abs(enemy.x + m[0] - p.x) + Math.abs(enemy.y + m[1] - p.y)
            if (d > bestDist) { bestDist = d; bestMove = m }
          }
          if (bestMove) { enemy.x += bestMove[0]; enemy.y += bestMove[1] }
        } else if (eyeLos) {
          // Too far, approach
          let bestDist = dist, bestMove = null as readonly [number, number] | null
          for (const m of adjacent) {
            const d = Math.abs(enemy.x + m[0] - p.x) + Math.abs(enemy.y + m[1] - p.y)
            if (d < bestDist) { bestDist = d; bestMove = m }
          }
          if (bestMove) { enemy.x += bestMove[0]; enemy.y += bestMove[1] }
        } else if (adjacent.length > 0) {
          const m = adjacent[Math.floor(Math.random() * adjacent.length)]
          enemy.x += m[0]; enemy.y += m[1]
        }
      } else if (enemy.type === 'brute') {
        // Brute: stationary patrol, charges when LoS
        if (eyeLos && dist <= 7) {
          enemy.state = 'charge'
          enemy.chargeDir = p.x > enemy.x ? 'R' : p.x < enemy.x ? 'L' : p.y > enemy.y ? 'D' : 'U'
        }

        if (enemy.state === 'charge' && enemy.chargeDir) {
          const dirs: Record<Direction, readonly [number, number]> = { U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0], N: [0, 0] }
          const [dx, dy] = dirs[enemy.chargeDir]
          const nx = enemy.x + dx, ny = enemy.y + dy
          if (nx >= 0 && nx < MAP_W && ny >= 0 && ny < MAP_H && grid[ny]?.[nx] !== 'wall' && !enemiesRef.current.some(e => e !== enemy && e.x === nx && e.y === ny)) {
            enemy.x = nx; enemy.y = ny
          } else {
            enemy.chargeDir = null; enemy.state = 'patrol'
          }
        } else if (adjacent.length > 0 && Math.random() < PATROL_WANDER_CHANCE) {
          const m = adjacent[Math.floor(Math.random() * adjacent.length)]
          enemy.x += m[0]; enemy.y += m[1]
        }
      } else {
        // Crawler/Guard: patrol with waypoints, chase on LoS
        if (eyeLos) {
          enemy.state = 'chase'
          enemy.lostSightTurns = 0
        } else if (enemy.state === 'chase') {
          enemy.lostSightTurns++
          if (enemy.lostSightTurns > 3) {
            enemy.state = 'patrol'
            enemy.patrolTarget = null
          }
        }

        if (enemy.state === 'chase') {
          let bestDist = dist, bestMove = null as readonly [number, number] | null
          for (const m of adjacent) {
            const d = Math.abs(enemy.x + m[0] - p.x) + Math.abs(enemy.y + m[1] - p.y)
            if (d < bestDist) { bestDist = d; bestMove = m }
          }
          if (bestMove) { enemy.x += bestMove[0]; enemy.y += bestMove[1] }
        } else if (adjacent.length > 0) {
          if (!enemy.patrolTarget || (enemy.x === enemy.patrolTarget.x && enemy.y === enemy.patrolTarget.y)) {
            enemy.patrolTarget = adjacent[Math.floor(Math.random() * adjacent.length)]
            const offset = adjacent[Math.floor(Math.random() * adjacent.length)]
            enemy.patrolTarget = { x: enemy.x + offset[0], y: enemy.y + offset[1] }
          }
          if (enemy.patrolTarget) {
            let bestDist = Infinity, bestMove = null as readonly [number, number] | null
            for (const m of adjacent) {
              const d = Math.abs(enemy.x + m[0] - enemy.patrolTarget.x) + Math.abs(enemy.y + m[1] - enemy.patrolTarget.y)
              if (d < bestDist) { bestDist = d; bestMove = m }
            }
            if (bestMove) { enemy.x += bestMove[0]; enemy.y += bestMove[1] }
          }
        }
      }
    }
  }

  function gameOver(): void {
    phaseRef.current = 'dead'
    setPhase('dead')
    const s = scoreRef.current, d = floorRef.current
    setBest(prev => {
      const nb = { score: Math.max(s, prev.score), depth: Math.max(d, prev.depth) }
      if (nb.score !== prev.score || nb.depth !== prev.depth) {
        window.api.settings.set('vaultDelverBest', JSON.stringify(nb)).catch(() => {})
        onNewBest?.(nb.score, nb.depth)
      }
      return nb
    })
    draw()
  }

  // ── Rendering ─────────────────────────────────────────────────────────────

  function getTileSprite(x: number, y: number, tile: TileKind): Sprite {
    switch (tile) {
      case 'wall': return SPRITE_WALL[getWallVariant(x, y, gridRef.current)]
      case 'floor': return [SPRITE_FLOOR_A, SPRITE_FLOOR_B, SPRITE_FLOOR_C][variantFor(x, y, 3)]
      case 'dirt': return [SPRITE_DIRT_A, SPRITE_DIRT_B, SPRITE_DIRT_C][variantFor(x, y, 3)]
      case 'stone': return SPRITE_STONE
      case 'gemDirt': return SPRITE_GEM_DIRT
      case 'goldDirt': return SPRITE_GOLD_DIRT
      case 'stairs': return SPRITE_STAIRS
      case 'vaultDoor': return SPRITE_VAULT_DOOR
      case 'vaultFloor': return SPRITE_VAULT_FLOOR
    }
  }

  function draw(): void {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.imageSmoothingEnabled = false

    // Clear background
    ctx.fillStyle = PAL.black
    ctx.fillRect(0, 0, W, H)

    const grid = gridRef.current
    const p = playerRef.current
    const vis = visibleRef.current
    const visited = visitedRef.current

    // ── Tiles with fog of war ──
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (!grid[y]?.[x]) continue
        const key = `${x},${y}`
        const isVisible = vis.has(key)
        const isVisited = visited[y]?.[x] ?? false

        drawSprite(ctx, getTileSprite(x, y, grid[y][x]), x, y)

        // Fog overlay for visited-but-not-visible
        if (!isVisible && isVisited) {
          ctx.fillStyle = PAL.fogVisited
          ctx.fillRect(x * CELL, y * CELL, CELL, CELL)
        }
        // Black for unvisited
        else if (!isVisible && !isVisited) {
          ctx.fillStyle = PAL.black
          ctx.fillRect(x * CELL, y * CELL, CELL, CELL)
        }
      }
    }

    // ── Stone crack overlay ──
    stoneHits.current.forEach((_hits, key) => {
      const [sx, sy] = key.split(',').map(Number)
      if (gridRef.current[sy]?.[sx] === 'stone') {
        const k = `${sx},${sy}`
        if (vis.has(k)) {
          ctx.fillStyle = 'rgba(255,190,90,0.22)'
          ctx.fillRect(sx * CELL + 2, sy * CELL + 2, CELL - 4, CELL - 4)
        }
      }
    })

    // ── Projectiles ──
    for (const proj of projectilesRef.current) {
      drawSprite(ctx, SPRITE_PROJECTILE, Math.round(proj.x), Math.round(proj.y))
    }

    // ── Enemies ──
    for (const e of enemiesRef.current) {
      const k = `${e.x},${e.y}`
      const isVisible = vis.has(k)
      if (!isVisible && !visited[e.y]?.[e.x]) continue

      const alpha = isVisible ? 1 : 0.3
      ctx.globalAlpha = alpha

      let sprite: Sprite
      const frame = e.animFrame
      switch (e.type) {
        case 'crawler': sprite = frame === 0 ? SPRITE_CRAWLER_0 : SPRITE_CRAWLER_1; break
        case 'guard': sprite = frame === 0 ? SPRITE_GUARD_0 : SPRITE_GUARD_1; break
        case 'brute': sprite = frame === 0 ? SPRITE_BRUTE_0 : SPRITE_BRUTE_1; break
        case 'shooter': sprite = frame === 0 ? SPRITE_SHOOTER_0 : SPRITE_SHOOTER_1; break
      }

      drawSprite(ctx, sprite, e.x, e.y, { flipX: e.facing === 'L' })

      // HP bar
      if (e.hp < e.maxHp && isVisible) {
        const bx = e.x * CELL + 2, by = e.y * CELL + 1, bw = CELL - 4
        ctx.globalAlpha = 1
        ctx.fillStyle = 'rgba(0,0,0,0.7)'
        ctx.fillRect(bx, by, bw, 2)
        ctx.fillStyle = '#4ade80'
        ctx.fillRect(bx, by, Math.round(bw * e.hp / e.maxHp), 2)
      }
      ctx.globalAlpha = 1
    }

    // ── Player ──
    if (phaseRef.current === 'playing') {
      const playerFrame = animTickRef.current % 2
      const playerSprite = playerFrame === 0 ? SPRITE_PLAYER_0 : SPRITE_PLAYER_1
      drawSprite(ctx, playerSprite, p.x, p.y, { flipX: playerFacingRef.current === 'L' })
    }
  }


  // ── UI ────────────────────────────────────────────────────────────────────

  const hpPct = Math.max(0, hp / maxHp)
  const hpColor = hpPct > 0.5 ? '#4ade80' : hpPct > 0.25 ? '#e8b44b' : '#ef4444'

  return (
    <div className={styles.body}>
      <div className={styles.gameWrap}>
        <canvas ref={canvasRef} width={W} height={H} className={styles.canvas} />

        {phase !== 'playing' && (
          <div className={styles.overlay}>
            {phase === 'dead' ? (
              <>
                <span className={styles.overlayTitle}>You Died</span>
                <span className={styles.overlayScore}>Score {score} · Floor {floor}</span>
                {best.score > 0 && (
                  <span className={styles.overlayBest}>Best: {best.score} pts · Floor {best.depth}</span>
                )}
              </>
            ) : (
              <>
                <span className={styles.overlayTitle}>⛏️ Vault Delver</span>
                <div className={styles.legend}>
                  <span className={styles.legendItem}><span className={styles.dotGem} />Gem +10</span>
                  <span className={styles.legendItem}><span className={styles.dotGold} />Gold +5</span>
                  <span className={styles.legendItem}><span className={styles.dotStairs} />Descend</span>
                  <span className={styles.legendItem}><span className={styles.dotVault} />Vault (🗝️ key needed)</span>
                  <span className={styles.legendItem}><span className={styles.dotStone} />Stone (2 hits)</span>
                </div>
                {best.score > 0 && (
                  <span className={styles.overlayBest}>Best: {best.score} pts · Floor {best.depth}</span>
                )}
              </>
            )}
            <button className={styles.startBtn} onClick={startGame}>
              {phase === 'dead' ? 'Play Again' : 'Start'}
            </button>
            <span className={styles.overlayHint}>Arrow keys · WASD to move / dig / attack</span>
          </div>
        )}
      </div>

      {phase === 'playing' && (
        <div className={styles.hud}>
          <div className={styles.hudHp}>
            <span className={styles.hudLabel}>HP</span>
            <div className={styles.hpTrack}>
              <div className={styles.hpFill} style={{ width: `${hpPct * 100}%`, background: hpColor }} />
            </div>
            <span className={styles.hudVal} style={{ color: hpColor }}>{hp}/{maxHp}</span>
          </div>
          <span className={styles.hudStat}>Floor <strong>{floor}</strong></span>
          <span className={styles.hudStat}>Score <strong>{score}</strong></span>
          {hasKey && <span className={styles.hudKey}>🗝️ Key</span>}
          {message && <span key={message} className={styles.hudMsg}>{message}</span>}
        </div>
      )}
    </div>
  )
}
