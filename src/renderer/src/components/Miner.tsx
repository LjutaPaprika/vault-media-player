import { useEffect, useRef, useState } from 'react'
import { generateLevel, MAP_W, MAP_H, type TileKind, type EnemyType } from '../utils/minerGen'
import styles from './Miner.module.css'

const CELL = 20
const W = MAP_W * CELL  // 880
const H = MAP_H * CELL  // 480

const KEY_CHANCE = 0.03

interface Player {
  x: number; y: number
  hp: number; maxHp: number
  atk: number
  hasKey: boolean
}

interface Enemy {
  id: number
  x: number; y: number
  type: EnemyType
  hp: number; maxHp: number
  atk: number
}

const ENEMY_STATS: Record<EnemyType, { hp: number; atk: number; score: number; color: string }> = {
  crawler: { hp: 1,  atk: 1, score: 5,  color: '#ef4444' },
  guard:   { hp: 3,  atk: 2, score: 15, color: '#f97316' },
  brute:   { hp: 6,  atk: 3, score: 30, color: '#a855f7' },
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
  const scoreRef     = useRef(0)
  const floorRef     = useRef(1)
  const msgTimer     = useRef<ReturnType<typeof setTimeout> | null>(null)

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

  function loadFloor(fl: number, preserveKey: boolean): void {
    const { grid, playerStart, enemies } = generateLevel(fl)
    gridRef.current = grid
    stoneHits.current.clear()
    floorRef.current = fl
    const p = playerRef.current
    p.x = playerStart.x; p.y = playerStart.y
    p.atk = 1 + Math.floor(fl / 5)
    if (!preserveKey) p.hasKey = false
    enemiesRef.current = enemies.map(e => {
      const base = ENEMY_STATS[e.type]
      const hpBoost = Math.floor(fl / 5)
      return { id: _eid++, x: e.x, y: e.y, type: e.type, hp: base.hp + hpBoost, maxHp: base.hp + hpBoost, atk: base.atk }
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

    // Enemy turns
    processEnemies()

    setScore(scoreRef.current); setHp(p.hp); setHasKey(p.hasKey)

    if (p.hp <= 0) { gameOver(); return }

    draw()
  }

  function processEnemies(): void {
    const p = playerRef.current
    const grid = gridRef.current

    for (const enemy of enemiesRef.current) {
      const dist = Math.abs(enemy.x - p.x) + Math.abs(enemy.y - p.y)

      const adjacent = ([[-1, 0], [1, 0], [0, -1], [0, 1]] as const).filter(([ndx, ndy]) => {
        const nx = enemy.x + ndx, ny = enemy.y + ndy
        if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) return false
        const t = grid[ny][nx]
        if (t !== 'floor' && t !== 'vaultFloor' && t !== 'stairs') return false
        if (enemiesRef.current.some(e2 => e2 !== enemy && e2.x === nx && e2.y === ny)) return false
        return true
      })

      // Attack if adjacent to player
      const adjPlayer = adjacent.find(([ndx, ndy]) => enemy.x + ndx === p.x && enemy.y + ndy === p.y)
      if (adjPlayer || dist <= 1) { p.hp -= enemy.atk; continue }

      if (adjacent.length === 0) continue

      if (dist <= 10) {
        // Chase
        let bestDist = dist, bestMove = null as readonly [number, number] | null
        for (const m of adjacent) {
          const d = Math.abs(enemy.x + m[0] - p.x) + Math.abs(enemy.y + m[1] - p.y)
          if (d < bestDist) { bestDist = d; bestMove = m }
        }
        if (bestMove) { enemy.x += bestMove[0]; enemy.y += bestMove[1] }
      } else {
        // Wander
        const m = adjacent[Math.floor(Math.random() * adjacent.length)]
        enemy.x += m[0]; enemy.y += m[1]
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

  function draw(): void {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#08080f'
    ctx.fillRect(0, 0, W, H)

    // Tiles
    const grid = gridRef.current
    for (let y = 0; y < MAP_H; y++)
      for (let x = 0; x < MAP_W; x++)
        if (grid[y]?.[x]) drawTile(ctx, x, y, grid[y][x])

    // Cracked stone overlay
    stoneHits.current.forEach((_hits, key) => {
      const [sx, sy] = key.split(',').map(Number)
      if (gridRef.current[sy]?.[sx] === 'stone') {
        ctx.fillStyle = 'rgba(255,190,90,0.22)'
        ctx.fillRect(sx * CELL + 1, sy * CELL + 1, CELL - 2, CELL - 2)
      }
    })

    // Enemies
    for (const e of enemiesRef.current) {
      const { color } = ENEMY_STATS[e.type]
      drawEntity(ctx, e.x, e.y, color)
      if (e.hp < e.maxHp) {
        const bx = e.x * CELL + 2, by = e.y * CELL + 1, bw = CELL - 4
        ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(bx, by, bw, 2)
        ctx.fillStyle = '#4ade80'; ctx.fillRect(bx, by, Math.round(bw * e.hp / e.maxHp), 2)
      }
    }

    // Player
    if (phaseRef.current === 'playing') {
      const p = playerRef.current
      drawEntity(ctx, p.x, p.y, '#4ade80')
    }
  }

  function drawTile(ctx: CanvasRenderingContext2D, x: number, y: number, tile: TileKind): void {
    const px = x * CELL, py = y * CELL

    switch (tile) {
      case 'wall':
        ctx.fillStyle = '#08080d'
        ctx.fillRect(px, py, CELL, CELL)
        ctx.fillStyle = 'rgba(255,255,255,0.04)'
        ctx.fillRect(px, py, CELL, 1); ctx.fillRect(px, py, 1, CELL)
        break

      case 'floor':
        ctx.fillStyle = '#0c0c18'
        ctx.fillRect(px, py, CELL, CELL)
        break

      case 'vaultFloor':
        ctx.fillStyle = '#0c0c18'
        ctx.fillRect(px, py, CELL, CELL)
        ctx.fillStyle = 'rgba(232,180,75,0.07)'
        ctx.fillRect(px, py, CELL, CELL)
        break

      case 'dirt':
        ctx.fillStyle = '#2c1e0d'
        ctx.fillRect(px, py, CELL, CELL)
        ctx.fillStyle = 'rgba(0,0,0,0.22)'
        ctx.fillRect(px + 4, py + 5, 2, 2)
        ctx.fillRect(px + 13, py + 10, 2, 2)
        ctx.fillRect(px + 7, py + 15, 2, 2)
        break

      case 'stone':
        ctx.fillStyle = '#191926'
        ctx.fillRect(px, py, CELL, CELL)
        ctx.strokeStyle = 'rgba(255,255,255,0.07)'
        ctx.lineWidth = 0.5
        ctx.strokeRect(px + 1.5, py + 1.5, CELL - 3, CELL - 3)
        // crack lines
        ctx.beginPath()
        ctx.moveTo(px + 5, py + 3); ctx.lineTo(px + 9, py + 11)
        ctx.moveTo(px + 13, py + 7); ctx.lineTo(px + 11, py + 15)
        ctx.strokeStyle = 'rgba(255,255,255,0.05)'; ctx.lineWidth = 1
        ctx.stroke()
        break

      case 'gemDirt':
        ctx.fillStyle = '#2c1e0d'
        ctx.fillRect(px, py, CELL, CELL)
        ctx.shadowColor = 'rgba(34,211,238,0.9)'; ctx.shadowBlur = 8
        ctx.fillStyle = '#22d3ee'
        ctx.fillRect(px + CELL / 2 - 2, py + CELL / 2 - 2, 5, 5)
        ctx.shadowBlur = 0
        break

      case 'goldDirt':
        ctx.fillStyle = '#2c1e0d'
        ctx.fillRect(px, py, CELL, CELL)
        ctx.shadowColor = 'rgba(232,180,75,0.9)'; ctx.shadowBlur = 6
        ctx.fillStyle = '#e8b44b'
        ctx.fillRect(px + CELL / 2 - 2, py + CELL / 2 - 2, 5, 5)
        ctx.shadowBlur = 0
        break

      case 'stairs':
        ctx.fillStyle = '#0c0c18'
        ctx.fillRect(px, py, CELL, CELL)
        ctx.fillStyle = '#4ade80'
        ctx.shadowColor = 'rgba(74,222,128,0.7)'; ctx.shadowBlur = 10
        ctx.font = `${CELL - 4}px monospace`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('↓', px + CELL / 2, py + CELL / 2 + 1)
        ctx.shadowBlur = 0
        break

      case 'vaultDoor':
        ctx.fillStyle = '#1a1200'
        ctx.fillRect(px, py, CELL, CELL)
        ctx.strokeStyle = 'rgba(232,180,75,0.55)'
        ctx.lineWidth = 1
        ctx.strokeRect(px + 1.5, py + 1.5, CELL - 3, CELL - 3)
        ctx.fillStyle = '#e8b44b'
        ctx.shadowColor = 'rgba(232,180,75,0.8)'; ctx.shadowBlur = 8
        ctx.font = `bold ${CELL - 7}px monospace`
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('V', px + CELL / 2, py + CELL / 2 + 1)
        ctx.shadowBlur = 0
        break
    }
  }

  function drawEntity(ctx: CanvasRenderingContext2D, x: number, y: number, color: string): void {
    const px = x * CELL, py = y * CELL
    ctx.fillStyle = color
    ctx.shadowColor = color + '99'; ctx.shadowBlur = 9
    ctx.fillRect(px + 3, py + 3, CELL - 6, CELL - 6)
    ctx.shadowBlur = 0
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
