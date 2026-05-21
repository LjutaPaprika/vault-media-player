import { useEffect, useRef, useState } from 'react'
import styles from './Roguelike.module.css'

// Roguelike dungeon — procedurally generated rooms, turn-based combat,
// 6 floors deep. Permadeath. Soul Forge persists between runs.

// ── Constants ──────────────────────────────────────────────────────────────

const MAP_W = 50
const MAP_H = 30
const VIEW_W = 30
const VIEW_H = 18
const CELL = 22
const CANVAS_W = VIEW_W * CELL
const CANVAS_H = VIEW_H * CELL
const FOV_RADIUS = 8
const TOTAL_FLOORS = 6

const SAVE_KEY = 'roguelikeMeta'

// ── Types ──────────────────────────────────────────────────────────────────

type Tile = '#' | '.' | '+' | '>'

interface Rect { x: number; y: number; w: number; h: number }

interface Player {
  x: number; y: number
  hp: number; maxHp: number
  atk: number; def: number
  speed: number
  accumulated: number       // turn timing
  gold: number
  kills: number
  floor: number
  inventory: Item[]
  weapon: Item | null
  armor: Item | null
}

interface Enemy {
  x: number; y: number
  hp: number; maxHp: number
  atk: number; def: number
  speed: number
  accumulated: number
  kind: EnemyKind
  alive: boolean
}

type EnemyKind = 'rat' | 'goblin' | 'orc' | 'skeleton' | 'troll' | 'demon' | 'demonLord'

interface ItemTemplate {
  name: string
  glyph: string
  color: string
  kind: 'weapon' | 'armor' | 'potion' | 'scroll' | 'gold'
  atk?: number
  def?: number
  effect?: 'heal' | 'strength' | 'teleport' | 'fireball' | 'mapping'
  power?: number
}

interface Item extends ItemTemplate {
  uid: number
}

// ── Meta-progression ────────────────────────────────────────────────────────

interface Meta {
  souls: number
  hpUp: number       // 0-3
  atkUp: number      // 0-3
  defUp: number      // 0-3
  startPotion: number // 0-3 (how many potions you start with)
}

const META_DEFAULT: Meta = { souls: 0, hpUp: 0, atkUp: 0, defUp: 0, startPotion: 0 }

const FORGE_UPGRADES = [
  { id: 'hpUp' as const,        name: 'Vigor',         desc: '+5 max HP per tier', max: 3, costs: [50, 120, 280] },
  { id: 'atkUp' as const,       name: 'Strength',      desc: '+1 attack per tier', max: 3, costs: [80, 180, 400] },
  { id: 'defUp' as const,       name: 'Toughness',     desc: '+1 defense per tier', max: 3, costs: [80, 180, 400] },
  { id: 'startPotion' as const, name: 'Provisioned',   desc: '+1 healing potion at start', max: 3, costs: [60, 140, 320] }
]

// ── Item pool by floor ──────────────────────────────────────────────────────

let nextUid = 1
function makeItem(t: ItemTemplate): Item { return { ...t, uid: nextUid++ } }

const POTION_HEAL: ItemTemplate = { name: 'Healing Potion', glyph: '!', color: '#dc2626', kind: 'potion', effect: 'heal', power: 25 }
const POTION_STR:  ItemTemplate = { name: 'Strength Potion', glyph: '!', color: '#f97316', kind: 'potion', effect: 'strength', power: 2 }
const POTION_TEL:  ItemTemplate = { name: 'Teleport Potion', glyph: '!', color: '#a855f7', kind: 'potion', effect: 'teleport' }
const SCROLL_MAP:  ItemTemplate = { name: 'Scroll of Mapping', glyph: '?', color: '#67e8f9', kind: 'scroll', effect: 'mapping' }
const SCROLL_FIRE: ItemTemplate = { name: 'Scroll of Fireball', glyph: '?', color: '#f59e0b', kind: 'scroll', effect: 'fireball', power: 18 }

function weaponPool(floor: number): ItemTemplate[] {
  const tier = Math.min(3, Math.floor((floor - 1) / 2) + 1)
  if (tier === 1) return [
    { name: 'Dagger',       glyph: ')', color: '#cbd5e1', kind: 'weapon', atk: 2 },
    { name: 'Short Sword',  glyph: ')', color: '#cbd5e1', kind: 'weapon', atk: 3 }
  ]
  if (tier === 2) return [
    { name: 'Long Sword',   glyph: ')', color: '#e2e8f0', kind: 'weapon', atk: 5 },
    { name: 'Battle Axe',   glyph: ')', color: '#e2e8f0', kind: 'weapon', atk: 6 }
  ]
  return [
    { name: 'Runesword',    glyph: ')', color: '#fef3c7', kind: 'weapon', atk: 8 },
    { name: 'Warhammer',    glyph: ')', color: '#fef3c7', kind: 'weapon', atk: 10 }
  ]
}

function armorPool(floor: number): ItemTemplate[] {
  const tier = Math.min(3, Math.floor((floor - 1) / 2) + 1)
  if (tier === 1) return [
    { name: 'Leather Armor', glyph: '[', color: '#a16207', kind: 'armor', def: 1 }
  ]
  if (tier === 2) return [
    { name: 'Chain Mail',    glyph: '[', color: '#94a3b8', kind: 'armor', def: 3 }
  ]
  return [
    { name: 'Plate Mail',    glyph: '[', color: '#e2e8f0', kind: 'armor', def: 5 }
  ]
}

function rollFloorItem(floor: number): Item {
  const r = Math.random()
  if (r < 0.35) return makeItem(POTION_HEAL)
  if (r < 0.45) return makeItem(POTION_STR)
  if (r < 0.55) return makeItem(POTION_TEL)
  if (r < 0.62) return makeItem(SCROLL_MAP)
  if (r < 0.72) return makeItem(SCROLL_FIRE)
  if (r < 0.86) {
    const pool = weaponPool(floor)
    return makeItem(pool[Math.floor(Math.random() * pool.length)])
  }
  const pool = armorPool(floor)
  return makeItem(pool[Math.floor(Math.random() * pool.length)])
}

// ── Enemy templates ────────────────────────────────────────────────────────

function makeEnemy(kind: EnemyKind, x: number, y: number): Enemy {
  const t = ENEMY_STATS[kind]
  return {
    x, y,
    hp: t.hp, maxHp: t.hp,
    atk: t.atk, def: t.def,
    speed: t.speed,
    accumulated: 0,
    kind,
    alive: true
  }
}

const ENEMY_STATS: Record<EnemyKind, { hp: number; atk: number; def: number; speed: number; glyph: string; color: string; xp: number }> = {
  rat:       { hp: 5,   atk: 2,  def: 0, speed: 10, glyph: 'r', color: '#a3a3a3', xp: 1 },
  goblin:    { hp: 8,   atk: 3,  def: 0, speed: 10, glyph: 'g', color: '#65a30d', xp: 2 },
  orc:       { hp: 14,  atk: 5,  def: 1, speed: 10, glyph: 'o', color: '#16a34a', xp: 4 },
  skeleton:  { hp: 11,  atk: 4,  def: 2, speed: 10, glyph: 's', color: '#e7e5e4', xp: 4 },
  troll:     { hp: 24,  atk: 7,  def: 2, speed: 8,  glyph: 'T', color: '#0d9488', xp: 8 },
  demon:     { hp: 20,  atk: 9,  def: 3, speed: 14, glyph: 'd', color: '#dc2626', xp: 10 },
  demonLord: { hp: 80,  atk: 14, def: 5, speed: 10, glyph: 'D', color: '#7f1d1d', xp: 50 }
}

function rollEnemies(floor: number, rooms: Rect[]): Enemy[] {
  const enemies: Enemy[] = []
  if (floor === TOTAL_FLOORS) {
    // Boss in last room
    const lastRoom = rooms[rooms.length - 1]
    enemies.push(makeEnemy('demonLord', lastRoom.x + Math.floor(lastRoom.w / 2), lastRoom.y + Math.floor(lastRoom.h / 2)))
    // Plus some demons
    for (let i = 0; i < 3; i++) {
      const r = rooms[1 + Math.floor(Math.random() * (rooms.length - 2))]
      if (!r) continue
      const ex = r.x + 1 + Math.floor(Math.random() * (r.w - 2))
      const ey = r.y + 1 + Math.floor(Math.random() * (r.h - 2))
      enemies.push(makeEnemy('demon', ex, ey))
    }
    return enemies
  }
  const types: EnemyKind[] = []
  if (floor <= 2) types.push('rat', 'rat', 'goblin')
  else if (floor <= 3) types.push('goblin', 'goblin', 'skeleton', 'orc')
  else if (floor <= 4) types.push('orc', 'skeleton', 'skeleton', 'troll')
  else types.push('orc', 'troll', 'demon', 'demon')

  const count = 4 + floor * 2
  for (let i = 0; i < count; i++) {
    // Pick a room (not the starting one) and a random tile within it
    const r = rooms[1 + Math.floor(Math.random() * (rooms.length - 1))]
    if (!r) continue
    const ex = r.x + 1 + Math.floor(Math.random() * (r.w - 2))
    const ey = r.y + 1 + Math.floor(Math.random() * (r.h - 2))
    const kind = types[Math.floor(Math.random() * types.length)]
    enemies.push(makeEnemy(kind, ex, ey))
  }
  return enemies
}

// ── Map generation ─────────────────────────────────────────────────────────

interface FloorData {
  map: Tile[]
  rooms: Rect[]
  enemies: Enemy[]
  items: { x: number; y: number; item: Item }[]
  stairsX: number
  stairsY: number
  visible: boolean[]
  seen: boolean[]
}

function idx(x: number, y: number): number { return y * MAP_W + x }

function generateFloor(floor: number): FloorData {
  const map: Tile[] = new Array(MAP_W * MAP_H).fill('#')
  const rooms: Rect[] = []

  // Place rooms
  for (let attempt = 0; attempt < 80 && rooms.length < 10; attempt++) {
    const w = 4 + Math.floor(Math.random() * 6)
    const h = 3 + Math.floor(Math.random() * 5)
    const x = 1 + Math.floor(Math.random() * (MAP_W - w - 2))
    const y = 1 + Math.floor(Math.random() * (MAP_H - h - 2))
    const r: Rect = { x, y, w, h }
    let overlaps = false
    for (const o of rooms) {
      if (r.x < o.x + o.w + 1 && r.x + r.w + 1 > o.x &&
          r.y < o.y + o.h + 1 && r.y + r.h + 1 > o.y) {
        overlaps = true; break
      }
    }
    if (overlaps) continue
    rooms.push(r)
    for (let yy = r.y; yy < r.y + r.h; yy++) {
      for (let xx = r.x; xx < r.x + r.w; xx++) {
        map[idx(xx, yy)] = '.'
      }
    }
  }

  // Connect rooms with L-shaped corridors
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1]
    const b = rooms[i]
    const ax = a.x + Math.floor(a.w / 2)
    const ay = a.y + Math.floor(a.h / 2)
    const bx = b.x + Math.floor(b.w / 2)
    const by = b.y + Math.floor(b.h / 2)
    if (Math.random() < 0.5) {
      carveH(map, ax, bx, ay)
      carveV(map, ay, by, bx)
    } else {
      carveV(map, ay, by, ax)
      carveH(map, ax, bx, by)
    }
  }

  // Stairs in last room
  const last = rooms[rooms.length - 1]
  const stairsX = last.x + Math.floor(last.w / 2)
  const stairsY = last.y + Math.floor(last.h / 2)
  map[idx(stairsX, stairsY)] = '>'

  // Place items
  const items: { x: number; y: number; item: Item }[] = []
  const itemCount = 2 + Math.floor(Math.random() * 3)
  for (let i = 0; i < itemCount; i++) {
    const r = rooms[1 + Math.floor(Math.random() * (rooms.length - 1))]
    if (!r) continue
    const ix = r.x + 1 + Math.floor(Math.random() * Math.max(1, r.w - 2))
    const iy = r.y + 1 + Math.floor(Math.random() * Math.max(1, r.h - 2))
    if (ix === stairsX && iy === stairsY) continue
    items.push({ x: ix, y: iy, item: rollFloorItem(floor) })
  }
  // Gold piles
  const goldCount = 3 + Math.floor(Math.random() * 3)
  for (let i = 0; i < goldCount; i++) {
    const r = rooms[Math.floor(Math.random() * rooms.length)]
    const ix = r.x + 1 + Math.floor(Math.random() * Math.max(1, r.w - 2))
    const iy = r.y + 1 + Math.floor(Math.random() * Math.max(1, r.h - 2))
    items.push({ x: ix, y: iy, item: makeItem({ name: 'Gold', glyph: '$', color: '#fbbf24', kind: 'gold', power: 5 + Math.floor(Math.random() * 15) * floor }) })
  }

  const enemies = rollEnemies(floor, rooms)

  return {
    map,
    rooms,
    enemies,
    items,
    stairsX, stairsY,
    visible: new Array(MAP_W * MAP_H).fill(false),
    seen: new Array(MAP_W * MAP_H).fill(false)
  }
}

function carveH(map: Tile[], x1: number, x2: number, y: number): void {
  const [a, b] = x1 < x2 ? [x1, x2] : [x2, x1]
  for (let x = a; x <= b; x++) if (map[idx(x, y)] === '#') map[idx(x, y)] = '.'
}
function carveV(map: Tile[], y1: number, y2: number, x: number): void {
  const [a, b] = y1 < y2 ? [y1, y2] : [y2, y1]
  for (let y = a; y <= b; y++) if (map[idx(x, y)] === '#') map[idx(x, y)] = '.'
}

// ── FOV (shadowcasting) ────────────────────────────────────────────────────

const OCTANTS = [
  [1, 0, 0, 1], [0, 1, 1, 0], [0, -1, 1, 0], [-1, 0, 0, 1],
  [-1, 0, 0, -1], [0, -1, -1, 0], [0, 1, -1, 0], [1, 0, 0, -1]
]

function computeFOV(floor: FloorData, px: number, py: number, radius: number): void {
  floor.visible.fill(false)
  floor.visible[idx(px, py)] = true
  floor.seen[idx(px, py)] = true
  for (const oct of OCTANTS) {
    castLight(floor, px, py, 1, 1, 0, oct[0], oct[1], oct[2], oct[3], radius)
  }
}

function castLight(
  floor: FloorData,
  cx: number, cy: number,
  row: number,
  start: number, end: number,
  xx: number, xy: number, yx: number, yy: number,
  radius: number
): void {
  if (start < end) return
  let newStart = 0
  let blocked = false
  for (let distance = row; distance <= radius && !blocked; distance++) {
    const deltaY = -distance
    for (let deltaX = -distance; deltaX <= 0; deltaX++) {
      const currentX = cx + deltaX * xx + deltaY * xy
      const currentY = cy + deltaX * yx + deltaY * yy
      const leftSlope = (deltaX - 0.5) / (deltaY + 0.5)
      const rightSlope = (deltaX + 0.5) / (deltaY - 0.5)
      if (currentX < 0 || currentY < 0 || currentX >= MAP_W || currentY >= MAP_H) continue
      if (start < rightSlope) continue
      if (end > leftSlope) break
      if (deltaX * deltaX + deltaY * deltaY <= radius * radius) {
        floor.visible[idx(currentX, currentY)] = true
        floor.seen[idx(currentX, currentY)] = true
      }
      const opaque = floor.map[idx(currentX, currentY)] === '#'
      if (blocked) {
        if (opaque) {
          newStart = rightSlope
        } else {
          blocked = false
          start = newStart
        }
      } else {
        if (opaque && distance < radius) {
          blocked = true
          castLight(floor, cx, cy, distance + 1, start, leftSlope, xx, xy, yx, yy, radius)
          newStart = rightSlope
        }
      }
    }
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Roguelike(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const metaRef = useRef<Meta>(META_DEFAULT)
  const [meta, setMeta] = useState<Meta>(META_DEFAULT)
  const playerRef = useRef<Player>(makePlayerForRun(META_DEFAULT))
  const floorRef = useRef<FloorData>(generateFloor(1))
  const logRef = useRef<{ text: string; cls: string }[]>([])
  const [logTick, setLogTick] = useState(0)
  const [hudTick, setHudTick] = useState(0)
  const [phase, setPhase] = useState<'title' | 'playing' | 'dead' | 'won' | 'forge'>('title')

  useEffect(() => {
    window.api.settings.get(SAVE_KEY, '{}').then(v => {
      try {
        const m = JSON.parse(v) as Partial<Meta>
        const next = { ...META_DEFAULT, ...m }
        metaRef.current = next
        setMeta(next)
      } catch { /* ignore */ }
    })
  }, [])

  function makePlayerForRun(m: Meta): Player {
    const maxHp = 30 + m.hpUp * 5
    const atk = 3 + m.atkUp
    const def = 0 + m.defUp
    const inv: Item[] = []
    for (let i = 0; i < m.startPotion; i++) inv.push(makeItem(POTION_HEAL))
    return {
      x: 0, y: 0,
      hp: maxHp, maxHp,
      atk, def,
      speed: 10,
      accumulated: 0,
      gold: 0,
      kills: 0,
      floor: 1,
      inventory: inv,
      weapon: null,
      armor: null
    }
  }

  function startRun(): void {
    const m = metaRef.current
    const p = makePlayerForRun(m)
    const fd = generateFloor(1)
    // Place player in first room
    const r0 = fd.rooms[0]
    p.x = r0.x + Math.floor(r0.w / 2)
    p.y = r0.y + Math.floor(r0.h / 2)
    playerRef.current = p
    floorRef.current = fd
    logRef.current = []
    computeFOV(fd, p.x, p.y, FOV_RADIUS)
    log(`Floor 1 — the dungeon yawns open.`, 'kill')
    setPhase('playing')
    setHudTick(t => t + 1)
    canvasRef.current?.focus()
  }

  function log(text: string, cls = ''): void {
    logRef.current.unshift({ text, cls })
    if (logRef.current.length > 80) logRef.current.length = 80
    setLogTick(t => t + 1)
  }

  // ── Turn ordering ────────────────────────────────────────────────────────

  function endPlayerTurn(): void {
    const p = playerRef.current
    const fd = floorRef.current
    // Each enemy acts `speed / 10` times per player turn (fractional accumulator)
    for (const e of fd.enemies) {
      if (!e.alive) continue
      const turns = e.speed / 10
      // accumulate fractional turns
      const enemyAny = e as Enemy & { _frac?: number }
      enemyAny._frac = (enemyAny._frac ?? 0) + turns
      while (enemyAny._frac >= 1) {
        enemyAny._frac -= 1
        enemyTurn(e)
        if (!playerAlive()) return
      }
    }
    computeFOV(fd, p.x, p.y, FOV_RADIUS)
    setHudTick(t => t + 1)
  }

  function playerAlive(): boolean {
    return playerRef.current.hp > 0
  }

  function enemyTurn(e: Enemy): void {
    const p = playerRef.current
    const fd = floorRef.current
    // Only chase if visible to player (proxy for "enemy can see player")
    if (!fd.visible[idx(e.x, e.y)]) {
      // wander
      if (Math.random() < 0.3) {
        const dirs = [[0,1],[1,0],[-1,0],[0,-1]]
        const [dx, dy] = dirs[Math.floor(Math.random() * 4)]
        const nx = e.x + dx, ny = e.y + dy
        if (passable(nx, ny) && !enemyAt(nx, ny) && !(p.x === nx && p.y === ny)) {
          e.x = nx; e.y = ny
        }
      }
      return
    }
    // Adjacent? attack
    const dx = p.x - e.x
    const dy = p.y - e.y
    if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && !(dx === 0 && dy === 0)) {
      const dmg = Math.max(1, e.atk + Math.floor(Math.random() * 3) - p.def - (p.armor?.def ?? 0))
      p.hp -= dmg
      log(`${ENEMY_STATS[e.kind].glyph === e.kind[0] ? e.kind : e.kind} hits you for ${dmg}.`, 'dmg')
      if (p.hp <= 0) {
        finishRun(false)
      }
      return
    }
    // Step toward player (greedy with simple obstacle avoidance)
    const sx = Math.sign(dx)
    const sy = Math.sign(dy)
    const tryOrder: [number, number][] = []
    if (Math.abs(dx) > Math.abs(dy)) {
      tryOrder.push([sx, 0], [0, sy], [sx, sy])
    } else {
      tryOrder.push([0, sy], [sx, 0], [sx, sy])
    }
    for (const [tx, ty] of tryOrder) {
      if (tx === 0 && ty === 0) continue
      const nx = e.x + tx, ny = e.y + ty
      if (!passable(nx, ny)) continue
      if (enemyAt(nx, ny)) continue
      if (p.x === nx && p.y === ny) continue
      e.x = nx; e.y = ny
      return
    }
  }

  function passable(x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return false
    const t = floorRef.current.map[idx(x, y)]
    return t === '.' || t === '+' || t === '>'
  }

  function enemyAt(x: number, y: number): Enemy | null {
    for (const e of floorRef.current.enemies) {
      if (e.alive && e.x === x && e.y === y) return e
    }
    return null
  }

  // ── Player actions ───────────────────────────────────────────────────────

  function move(dx: number, dy: number): void {
    if (phase !== 'playing') return
    const p = playerRef.current
    const fd = floorRef.current
    const nx = p.x + dx
    const ny = p.y + dy
    const target = enemyAt(nx, ny)
    if (target) {
      const dmg = Math.max(1, p.atk + (p.weapon?.atk ?? 0) + Math.floor(Math.random() * 4) - target.def)
      target.hp -= dmg
      if (target.hp <= 0) {
        target.alive = false
        p.kills += 1
        const xp = ENEMY_STATS[target.kind].xp
        log(`You slay the ${target.kind}. (+${xp} soul)`, 'kill')
        if (target.kind === 'demonLord') {
          finishRun(true)
          return
        }
      } else {
        log(`You hit the ${target.kind} for ${dmg}.`, '')
      }
      endPlayerTurn()
      return
    }
    if (!passable(nx, ny)) return
    p.x = nx; p.y = ny
    // pickup
    const pickIdx = fd.items.findIndex(it => it.x === nx && it.y === ny)
    if (pickIdx >= 0) {
      const it = fd.items[pickIdx]
      fd.items.splice(pickIdx, 1)
      if (it.item.kind === 'gold') {
        p.gold += it.item.power ?? 0
        log(`You pick up ${it.item.power} gold.`, 'pickup')
      } else {
        p.inventory.push(it.item)
        log(`Picked up ${it.item.name}.`, 'pickup')
      }
    }
    endPlayerTurn()
  }

  function descend(): void {
    if (phase !== 'playing') return
    const p = playerRef.current
    const fd = floorRef.current
    if (p.x !== fd.stairsX || p.y !== fd.stairsY) {
      log('No stairs here.', '')
      return
    }
    p.floor += 1
    if (p.floor > TOTAL_FLOORS) {
      // shouldn't happen; demon lord ends the run
      finishRun(true)
      return
    }
    const newFloor = generateFloor(p.floor)
    const r0 = newFloor.rooms[0]
    p.x = r0.x + Math.floor(r0.w / 2)
    p.y = r0.y + Math.floor(r0.h / 2)
    floorRef.current = newFloor
    computeFOV(newFloor, p.x, p.y, FOV_RADIUS)
    log(`Descend to floor ${p.floor}.`, 'kill')
    setHudTick(t => t + 1)
  }

  function useInvSlot(i: number): void {
    if (phase !== 'playing') return
    const p = playerRef.current
    const it = p.inventory[i]
    if (!it) return
    if (it.kind === 'weapon') {
      if (p.weapon) {
        log(`Swap to ${it.name}, stowed ${p.weapon.name}.`, '')
      } else {
        log(`Wield ${it.name}.`, '')
      }
      const prev = p.weapon
      p.weapon = it
      p.inventory.splice(i, 1)
      if (prev) p.inventory.push(prev)
      endPlayerTurn()
      return
    }
    if (it.kind === 'armor') {
      const prev = p.armor
      p.armor = it
      p.inventory.splice(i, 1)
      if (prev) p.inventory.push(prev)
      log(`Don ${it.name}.`, '')
      endPlayerTurn()
      return
    }
    if (it.kind === 'potion') {
      p.inventory.splice(i, 1)
      if (it.effect === 'heal') {
        const heal = it.power ?? 25
        const before = p.hp
        p.hp = Math.min(p.maxHp, p.hp + heal)
        log(`Quaff ${it.name}. (+${p.hp - before} hp)`, 'heal')
      } else if (it.effect === 'strength') {
        p.atk += it.power ?? 2
        log(`Quaff ${it.name}. Permanent +${it.power ?? 2} attack.`, 'heal')
      } else if (it.effect === 'teleport') {
        // Teleport to random walkable tile
        const fd = floorRef.current
        for (let tries = 0; tries < 200; tries++) {
          const tx = Math.floor(Math.random() * MAP_W)
          const ty = Math.floor(Math.random() * MAP_H)
          if (passable(tx, ty) && !enemyAt(tx, ty)) {
            p.x = tx; p.y = ty
            computeFOV(fd, p.x, p.y, FOV_RADIUS)
            log(`Reality blurs. You appear elsewhere.`, 'pickup')
            break
          }
        }
      }
      endPlayerTurn()
      return
    }
    if (it.kind === 'scroll') {
      if (it.effect === 'mapping') {
        const fd = floorRef.current
        for (let k = 0; k < fd.seen.length; k++) fd.seen[k] = true
        log(`The floor's map blooms in your mind.`, 'pickup')
        p.inventory.splice(i, 1)
        endPlayerTurn()
        return
      }
      if (it.effect === 'fireball') {
        // Detonate around all enemies in FOV
        const fd = floorRef.current
        const dmg = it.power ?? 18
        let hits = 0
        for (const e of fd.enemies) {
          if (e.alive && fd.visible[idx(e.x, e.y)]) {
            e.hp -= dmg
            hits += 1
            if (e.hp <= 0) {
              e.alive = false
              p.kills += 1
              if (e.kind === 'demonLord') { finishRun(true); return }
            }
          }
        }
        log(`Fireball erupts — ${hits} struck.`, 'dmg')
        p.inventory.splice(i, 1)
        endPlayerTurn()
        return
      }
    }
  }

  // ── End conditions ───────────────────────────────────────────────────────

  function finishRun(won: boolean): void {
    const p = playerRef.current
    const souls = p.floor * 50 + p.kills * 5 + p.gold + (won ? 500 : 0)
    const m = metaRef.current
    const next: Meta = { ...m, souls: m.souls + souls }
    metaRef.current = next
    setMeta(next)
    window.api.settings.set(SAVE_KEY, JSON.stringify(next)).catch(() => {})
    log(`Earned ${souls} souls.`, 'kill')
    setPhase(won ? 'won' : 'dead')
  }

  function buyForge(id: 'hpUp' | 'atkUp' | 'defUp' | 'startPotion'): void {
    const m = metaRef.current
    const upgrade = FORGE_UPGRADES.find(u => u.id === id)
    if (!upgrade) return
    const cur = m[id]
    if (cur >= upgrade.max) return
    const cost = upgrade.costs[cur]
    if (m.souls < cost) return
    const next: Meta = { ...m, souls: m.souls - cost, [id]: cur + 1 }
    metaRef.current = next
    setMeta(next)
    window.api.settings.set(SAVE_KEY, JSON.stringify(next)).catch(() => {})
  }

  // ── Input ────────────────────────────────────────────────────────────────

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    function onKey(e: KeyboardEvent): void {
      if (phase !== 'playing') return
      const k = e.key
      if (k === 'ArrowUp' || k === 'w' || k === 'W') { e.preventDefault(); move(0, -1) }
      else if (k === 'ArrowDown' || k === 's' || k === 'S') { e.preventDefault(); move(0, 1) }
      else if (k === 'ArrowLeft' || k === 'a' || k === 'A') { e.preventDefault(); move(-1, 0) }
      else if (k === 'ArrowRight' || k === 'd' || k === 'D') { e.preventDefault(); move(1, 0) }
      else if (k === '.' || k === '>') { e.preventDefault(); descend() }
      else if (k === ' ') { e.preventDefault(); endPlayerTurn() }    // wait
      else if (/^[1-9]$/.test(k)) { e.preventDefault(); useInvSlot(parseInt(k, 10) - 1) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // ── Drawing ──────────────────────────────────────────────────────────────

  useEffect(() => {
    let raf = 0
    const loop = (): void => {
      draw()
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function draw(): void {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    const p = playerRef.current
    const fd = floorRef.current
    ctx.fillStyle = '#0a0805'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    // Camera centered on player, clamped to map bounds
    let camX = p.x - Math.floor(VIEW_W / 2)
    let camY = p.y - Math.floor(VIEW_H / 2)
    camX = Math.max(0, Math.min(MAP_W - VIEW_W, camX))
    camY = Math.max(0, Math.min(MAP_H - VIEW_H, camY))

    ctx.font = `bold ${CELL - 4}px ui-monospace, Consolas, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    for (let vy = 0; vy < VIEW_H; vy++) {
      for (let vx = 0; vx < VIEW_W; vx++) {
        const mx = camX + vx
        const my = camY + vy
        const tile = fd.map[idx(mx, my)]
        const visible = fd.visible[idx(mx, my)]
        const seen = fd.seen[idx(mx, my)]
        if (!seen) continue
        const px = vx * CELL
        const py = vy * CELL
        let bg = ''
        let fg = ''
        let g = ''
        if (tile === '#') {
          bg = visible ? '#3f3424' : '#1a1610'
          fg = visible ? '#78716c' : '#3f3424'
          g = '#'
        } else if (tile === '.') {
          bg = visible ? '#181410' : '#0d0b08'
          fg = visible ? '#57534e' : '#292524'
          g = '·'
        } else if (tile === '+') {
          bg = visible ? '#1f1815' : '#0d0b08'
          fg = visible ? '#a16207' : '#451a03'
          g = '+'
        } else if (tile === '>') {
          bg = visible ? '#1a1410' : '#0d0b08'
          fg = visible ? '#fbbf24' : '#78350f'
          g = '>'
        }
        ctx.fillStyle = bg
        ctx.fillRect(px, py, CELL, CELL)
        ctx.fillStyle = fg
        ctx.fillText(g, px + CELL / 2, py + CELL / 2 + 1)
      }
    }

    // Items (only if visible)
    for (const it of fd.items) {
      if (!fd.visible[idx(it.x, it.y)]) continue
      const px = (it.x - camX) * CELL
      const py = (it.y - camY) * CELL
      ctx.fillStyle = it.item.color
      ctx.fillText(it.item.glyph, px + CELL / 2, py + CELL / 2 + 1)
    }

    // Enemies (only if visible)
    for (const e of fd.enemies) {
      if (!e.alive) continue
      if (!fd.visible[idx(e.x, e.y)]) continue
      const px = (e.x - camX) * CELL
      const py = (e.y - camY) * CELL
      const t = ENEMY_STATS[e.kind]
      ctx.fillStyle = t.color
      ctx.fillText(t.glyph, px + CELL / 2, py + CELL / 2 + 1)
      // HP indicator for damaged enemies
      if (e.hp < e.maxHp) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'
        ctx.fillRect(px + 2, py + CELL - 4, CELL - 4, 2)
        ctx.fillStyle = '#dc2626'
        ctx.fillRect(px + 2, py + CELL - 4, (CELL - 4) * (e.hp / e.maxHp), 2)
      }
    }

    // Player
    const ppx = (p.x - camX) * CELL
    const ppy = (p.y - camY) * CELL
    ctx.fillStyle = '#fef3c7'
    ctx.fillText('@', ppx + CELL / 2, ppy + CELL / 2 + 1)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const p = playerRef.current
  const totalAtk = p.atk + (p.weapon?.atk ?? 0)
  const totalDef = p.def + (p.armor?.def ?? 0)

  return (
    <div className={styles.body}>
      <div className={styles.header}>
        <span className={p.hp < p.maxHp / 3 ? styles.statRed : ''}>HP <strong>{Math.max(0, p.hp)} / {p.maxHp}</strong></span>
        <span>Atk <strong>{totalAtk}</strong></span>
        <span>Def <strong>{totalDef}</strong></span>
        <span>Gold <strong>{p.gold}</strong></span>
        <span>Floor <strong>{p.floor} / {TOTAL_FLOORS}</strong></span>
        <span>Kills <strong>{p.kills}</strong></span>
        <span>Souls <strong>{meta.souls}</strong></span>
        {phase === 'playing' && <button className={styles.resetBtn} onClick={() => setPhase('title')}>Give Up</button>}
      </div>
      <div className={styles.layout}>
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          className={styles.canvas}
          tabIndex={0}
          onMouseDown={() => canvasRef.current?.focus()}
        />
        <div className={styles.sidebar}>
          <div className={styles.section}>Equipped</div>
          <ul className={styles.invList}>
            <li className={p.weapon ? styles.equipped : ''}>weapon: {p.weapon ? `${p.weapon.name} (+${p.weapon.atk})` : '—'}</li>
            <li className={p.armor ? styles.equipped : ''}>armor: {p.armor ? `${p.armor.name} (+${p.armor.def})` : '—'}</li>
          </ul>
          <div className={styles.section}>Inventory (1-9 to use)</div>
          <ul className={styles.invList}>
            {p.inventory.length === 0 && <li style={{ opacity: 0.4 }}>empty</li>}
            {p.inventory.slice(0, 9).map((it, i) => (
              <li key={it.uid}>{i + 1}. {it.glyph} {it.name}</li>
            ))}
          </ul>
          <div className={styles.section}>Log</div>
          <div className={styles.log} key={logTick}>
            {logRef.current.slice(0, 14).map((l, i) => (
              <p key={i} className={l.cls ? (styles[l.cls as keyof typeof styles] ?? '') : ''}>{l.text}</p>
            ))}
          </div>
        </div>
      </div>
      <div className={styles.hint}>
        Arrows/WASD to move · bump enemies to attack · &gt; descend stairs · 1-9 use item · Space wait
      </div>

      {phase === 'title' && (
        <div className={styles.overlay}>
          <div className={styles.title}>SOUL FORGE</div>
          <div className={styles.subtitle}>
            Souls earned: <strong style={{ color: '#fbbf24' }}>{meta.souls}</strong><br />
            Spend them to strengthen the next descent.
          </div>
          <div className={styles.forgeRow}>
            {FORGE_UPGRADES.map(u => {
              const cur = meta[u.id]
              const maxed = cur >= u.max
              const cost = maxed ? 0 : u.costs[cur]
              return (
                <div key={u.id} className={styles.forgeCard}>
                  <div className={styles.forgeName}>{u.name} {cur > 0 && `(${cur}/${u.max})`}</div>
                  <div className={styles.forgeDesc}>{u.desc}</div>
                  <button
                    className={styles.forgeBuy}
                    disabled={maxed || meta.souls < cost}
                    onClick={() => buyForge(u.id)}
                  >
                    {maxed ? 'maxed' : `buy — ${cost} souls`}
                  </button>
                </div>
              )
            })}
          </div>
          <button className={styles.btn} onClick={startRun}>Descend</button>
        </div>
      )}

      {phase === 'dead' && (
        <div className={styles.overlay}>
          <div className={styles.title}>YOU DIED</div>
          <div className={styles.subtitle}>
            Floor {p.floor} · {p.kills} kills · {p.gold} gold<br />
            Souls collected this run added to your forge.
          </div>
          <button className={styles.btn} onClick={() => setPhase('title')}>To the Forge</button>
        </div>
      )}

      {phase === 'won' && (
        <div className={styles.overlay}>
          <div className={styles.title}>THE DEMON LORD FALLS</div>
          <div className={styles.subtitle}>
            You emerge victorious. Floor {p.floor} · {p.kills} kills · {p.gold} gold<br />
            +500 bonus souls for clearing the dungeon.
          </div>
          <button className={styles.btn} onClick={() => setPhase('title')}>To the Forge</button>
        </div>
      )}

      {/* keep hudTick state participating */}
      <span style={{ display: 'none' }}>{hudTick}</span>
    </div>
  )
}
