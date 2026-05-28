import { useEffect, useRef, useState } from 'react'
import styles from './Roguelike.module.css'

// Real-time roguelike — procedural dungeon, shadowcast FOV, swing-arc melee
// and ranged bow attacks. WASD move · arrow keys attack in direction.
// 1-9 to use items. > to descend stairs. Soul Forge persists between runs.

// ── Constants ──────────────────────────────────────────────────────────────

const MAP_W = 80
const MAP_H = 50
const VIEW_W = 30
const VIEW_H = 18
const CELL = 22
const CANVAS_W = VIEW_W * CELL
const CANVAS_H = VIEW_H * CELL
const FOV_RADIUS = 8
const TOTAL_FLOORS = 12

const PLAYER_SIZE = 14
const PLAYER_BASE_SPEED = 110     // px/sec
const ENEMY_BASE_SPEED = 60       // px/sec

const SAVE_KEY = 'roguelikeMeta'

// ── Types ──────────────────────────────────────────────────────────────────

type Tile = '#' | '.' | '+' | '>' | 'S' | 'L'
type WeaponClass = 'fist' | 'melee' | 'ranged'

interface Rect { x: number; y: number; w: number; h: number }

interface ItemTemplate {
  name: string
  glyph: string
  color: string
  kind: 'weapon' | 'armor' | 'potion' | 'scroll' | 'gold'
  weaponClass?: WeaponClass
  atk?: number
  def?: number
  reach?: number        // melee swing range in pixels
  swingTime?: number    // seconds — total swing animation duration
  cooldown?: number     // seconds before next attack
  arcSize?: number      // radians — half-arc
  effect?: 'heal' | 'strength' | 'teleport' | 'fireball' | 'mapping'
  power?: number
}

interface Item extends ItemTemplate {
  uid: number
}

interface Player {
  x: number; y: number       // pixel coords (center)
  hp: number; maxHp: number
  atk: number; def: number
  speed: number
  facing: number             // radians
  gold: number
  kills: number
  floor: number
  inventory: Item[]
  weapon: Item | null
  armor: Item | null
  attackCooldown: number     // seconds remaining before next attack possible
  swing: SwingState | null
}

interface SwingState {
  baseAngle: number          // center angle of the swing
  arcSize: number            // half-arc radians
  reach: number              // px
  duration: number           // seconds
  t: number                  // elapsed
  hitIds: Set<number>
  dmg: number
}

interface Enemy {
  id: number
  x: number; y: number       // pixel coords (center)
  hp: number; maxHp: number
  atk: number; def: number
  speed: number              // px/sec
  attackRange: number        // px
  attackCooldown: number     // seconds remaining
  attackInterval: number     // seconds between attacks
  kind: EnemyKind
  alive: boolean
  hitTimer: number
  swingTimer: number
  size: number               // px radius for collision
}

type EnemyKind = 'rat' | 'goblin' | 'orc' | 'skeleton' | 'troll' | 'demon' | 'demonLord'

interface Arrow {
  x: number; y: number
  vx: number; vy: number
  dmg: number
  life: number
}

interface Particle {
  x: number; y: number
  vx: number; vy: number
  life: number; maxLife: number
  color: string
  size: number
}

interface Meta {
  souls: number
  hpUp: number
  atkUp: number
  defUp: number
  startPotion: number
}

const META_DEFAULT: Meta = { souls: 0, hpUp: 0, atkUp: 0, defUp: 0, startPotion: 0 }

const FORGE_UPGRADES = [
  { id: 'hpUp' as const,        name: 'Vigor',       desc: '+5 max HP per tier',    max: 3, costs: [50, 120, 280] },
  { id: 'atkUp' as const,       name: 'Strength',    desc: '+1 attack per tier',    max: 3, costs: [80, 180, 400] },
  { id: 'defUp' as const,       name: 'Toughness',   desc: '+1 defense per tier',   max: 3, costs: [80, 180, 400] },
  { id: 'startPotion' as const, name: 'Provisioned', desc: '+1 healing potion at start', max: 3, costs: [60, 140, 320] }
]

// ── Items ──────────────────────────────────────────────────────────────────

let nextUid = 1
function makeItem(t: ItemTemplate): Item { return { ...t, uid: nextUid++ } }

const POTION_HEAL: ItemTemplate = { name: 'Healing Potion', glyph: '!', color: '#dc2626', kind: 'potion', effect: 'heal', power: 25 }
const POTION_STR:  ItemTemplate = { name: 'Strength Potion', glyph: '!', color: '#f97316', kind: 'potion', effect: 'strength', power: 2 }
const POTION_TEL:  ItemTemplate = { name: 'Teleport Potion', glyph: '!', color: '#a855f7', kind: 'potion', effect: 'teleport' }
const SCROLL_MAP:  ItemTemplate = { name: 'Scroll of Mapping', glyph: '?', color: '#67e8f9', kind: 'scroll', effect: 'mapping' }
const SCROLL_FIRE: ItemTemplate = { name: 'Scroll of Fireball', glyph: '?', color: '#f59e0b', kind: 'scroll', effect: 'fireball', power: 26 }
const VAULT_KEY: ItemTemplate   = { name: 'Vault Key', glyph: '⚷', color: '#fde047', kind: 'scroll' }

// Melee weapons: { atk, reach, swingTime, cooldown, arcSize }
const DAGGER: ItemTemplate     = { name: 'Dagger',      glyph: ')', color: '#cbd5e1', kind: 'weapon', weaponClass: 'melee', atk: 2,  reach: 26, swingTime: 0.16, cooldown: 0.30, arcSize: 1.0 }
const SHORTSWORD: ItemTemplate = { name: 'Short Sword', glyph: ')', color: '#cbd5e1', kind: 'weapon', weaponClass: 'melee', atk: 3,  reach: 30, swingTime: 0.20, cooldown: 0.35, arcSize: 1.1 }
const LONGSWORD: ItemTemplate  = { name: 'Long Sword',  glyph: ')', color: '#e2e8f0', kind: 'weapon', weaponClass: 'melee', atk: 5,  reach: 36, swingTime: 0.22, cooldown: 0.45, arcSize: 1.2 }
const AXE: ItemTemplate        = { name: 'Battle Axe',  glyph: ')', color: '#e2e8f0', kind: 'weapon', weaponClass: 'melee', atk: 6,  reach: 32, swingTime: 0.28, cooldown: 0.55, arcSize: 1.4 }
const RUNESWORD: ItemTemplate  = { name: 'Runesword',   glyph: ')', color: '#fef3c7', kind: 'weapon', weaponClass: 'melee', atk: 8,  reach: 38, swingTime: 0.22, cooldown: 0.45, arcSize: 1.3 }
const HAMMER: ItemTemplate     = { name: 'Warhammer',   glyph: ')', color: '#fef3c7', kind: 'weapon', weaponClass: 'melee', atk: 10, reach: 30, swingTime: 0.34, cooldown: 0.70, arcSize: 1.5 }

// Ranged weapons: atk = damage per arrow; cooldown = time between shots
const SHORTBOW: ItemTemplate = { name: 'Shortbow',  glyph: '}', color: '#a16207', kind: 'weapon', weaponClass: 'ranged', atk: 3, cooldown: 0.45 }
const LONGBOW: ItemTemplate  = { name: 'Longbow',   glyph: '}', color: '#ca8a04', kind: 'weapon', weaponClass: 'ranged', atk: 6, cooldown: 0.55 }
const CROSSBOW: ItemTemplate = { name: 'Crossbow',  glyph: '}', color: '#facc15', kind: 'weapon', weaponClass: 'ranged', atk: 10, cooldown: 0.80 }

const FIST: Item = { ...({ name: 'Bare Hands', glyph: '@', color: '#fff', kind: 'weapon', weaponClass: 'fist', atk: 1, reach: 22, swingTime: 0.18, cooldown: 0.35, arcSize: 0.9 } as ItemTemplate), uid: 0 }

const ARMOR_LEATHER: ItemTemplate = { name: 'Leather Armor', glyph: '[', color: '#a16207', kind: 'armor', def: 1 }
const ARMOR_CHAIN: ItemTemplate   = { name: 'Chain Mail',    glyph: '[', color: '#94a3b8', kind: 'armor', def: 3 }
const ARMOR_PLATE: ItemTemplate   = { name: 'Plate Mail',    glyph: '[', color: '#e2e8f0', kind: 'armor', def: 5 }

function weaponPool(floor: number): ItemTemplate[] {
  const tier = Math.min(3, Math.floor((floor - 1) / 2) + 1)
  if (tier === 1) return [DAGGER, SHORTSWORD, SHORTBOW]
  if (tier === 2) return [LONGSWORD, AXE, LONGBOW]
  return [RUNESWORD, HAMMER, CROSSBOW]
}

function armorPool(floor: number): ItemTemplate[] {
  const tier = Math.min(3, Math.floor((floor - 1) / 2) + 1)
  if (tier === 1) return [ARMOR_LEATHER]
  if (tier === 2) return [ARMOR_CHAIN]
  return [ARMOR_PLATE]
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

// ── Enemies ────────────────────────────────────────────────────────────────

let nextEnemyId = 1

const ENEMY_STATS: Record<EnemyKind, { hp: number; atk: number; def: number; speed: number; range: number; interval: number; size: number; glyph: string; color: string; xp: number }> = {
  rat:       { hp: 5,   atk: 2,  def: 0, speed: 56,  range: 14, interval: 0.7, size: 9,  glyph: 'r', color: '#a3a3a3', xp: 1 },
  goblin:    { hp: 8,   atk: 3,  def: 0, speed: 70,  range: 16, interval: 0.8, size: 10, glyph: 'g', color: '#65a30d', xp: 2 },
  orc:       { hp: 14,  atk: 5,  def: 1, speed: 64,  range: 16, interval: 0.9, size: 11, glyph: 'o', color: '#16a34a', xp: 4 },
  skeleton:  { hp: 11,  atk: 4,  def: 2, speed: 56,  range: 16, interval: 0.85, size: 11, glyph: 's', color: '#e7e5e4', xp: 4 },
  troll:     { hp: 24,  atk: 7,  def: 2, speed: 48,  range: 18, interval: 1.1, size: 12, glyph: 'T', color: '#0d9488', xp: 8 },
  demon:     { hp: 20,  atk: 9,  def: 3, speed: 82,  range: 16, interval: 0.7, size: 11, glyph: 'd', color: '#dc2626', xp: 10 },
  demonLord: { hp: 90,  atk: 14, def: 5, speed: 58,  range: 22, interval: 0.9, size: 16, glyph: 'D', color: '#7f1d1d', xp: 50 }
}

function makeEnemy(kind: EnemyKind, x: number, y: number): Enemy {
  const t = ENEMY_STATS[kind]
  return {
    id: nextEnemyId++,
    x, y,
    hp: t.hp, maxHp: t.hp,
    atk: t.atk, def: t.def,
    speed: t.speed,
    attackRange: t.range,
    attackCooldown: 0,
    attackInterval: t.interval,
    kind,
    alive: true,
    hitTimer: 0,
    swingTimer: 0,
    size: t.size
  }
}

function rollEnemies(floor: number, rooms: Rect[]): Enemy[] {
  const enemies: Enemy[] = []
  if (floor === TOTAL_FLOORS) {
    const lastRoom = rooms[rooms.length - 1]
    enemies.push(makeEnemy('demonLord', (lastRoom.x + Math.floor(lastRoom.w / 2)) * CELL + CELL / 2, (lastRoom.y + Math.floor(lastRoom.h / 2)) * CELL + CELL / 2))
    for (let i = 0; i < 3; i++) {
      const r = rooms[1 + Math.floor(Math.random() * Math.max(1, rooms.length - 2))]
      if (!r) continue
      const ex = (r.x + 1 + Math.floor(Math.random() * Math.max(1, r.w - 2))) * CELL + CELL / 2
      const ey = (r.y + 1 + Math.floor(Math.random() * Math.max(1, r.h - 2))) * CELL + CELL / 2
      enemies.push(makeEnemy('demon', ex, ey))
    }
    return enemies
  }
  const types: EnemyKind[] = []
  if (floor <= 2) types.push('rat', 'rat', 'goblin')
  else if (floor <= 4) types.push('goblin', 'goblin', 'skeleton', 'orc')
  else if (floor <= 6) types.push('orc', 'skeleton', 'skeleton', 'troll')
  else if (floor <= 9) types.push('orc', 'troll', 'troll', 'demon')
  else types.push('troll', 'demon', 'demon', 'demon')
  const count = 5 + floor * 2
  for (let i = 0; i < count; i++) {
    const r = rooms[1 + Math.floor(Math.random() * (rooms.length - 1))]
    if (!r) continue
    const ex = (r.x + 1 + Math.floor(Math.random() * Math.max(1, r.w - 2))) * CELL + CELL / 2
    const ey = (r.y + 1 + Math.floor(Math.random() * Math.max(1, r.h - 2))) * CELL + CELL / 2
    const kind = types[Math.floor(Math.random() * types.length)]
    enemies.push(makeEnemy(kind, ex, ey))
  }
  return enemies
}

// ── Map gen ────────────────────────────────────────────────────────────────

interface FloorData {
  map: Tile[]
  rooms: Rect[]
  enemies: Enemy[]
  items: { x: number; y: number; item: Item }[]
  stairsX: number; stairsY: number
  shops: { x: number; y: number; items: { item: Item; price: number; sold: boolean }[] }[]
  visible: boolean[]
  seen: boolean[]
}

function idx(x: number, y: number): number { return y * MAP_W + x }

function generateFloor(floor: number): FloorData {
  const map: Tile[] = new Array(MAP_W * MAP_H).fill('#')
  const rooms: Rect[] = []
  for (let attempt = 0; attempt < 200 && rooms.length < 18; attempt++) {
    const w = 5 + Math.floor(Math.random() * 7)
    const h = 4 + Math.floor(Math.random() * 6)
    const x = 1 + Math.floor(Math.random() * (MAP_W - w - 2))
    const y = 1 + Math.floor(Math.random() * (MAP_H - h - 2))
    const r: Rect = { x, y, w, h }
    let overlaps = false
    for (const o of rooms) {
      if (r.x < o.x + o.w + 1 && r.x + r.w + 1 > o.x &&
          r.y < o.y + o.h + 1 && r.y + r.h + 1 > o.y) { overlaps = true; break }
    }
    if (overlaps) continue
    rooms.push(r)
    for (let yy = r.y; yy < r.y + r.h; yy++)
      for (let xx = r.x; xx < r.x + r.w; xx++)
        map[idx(xx, yy)] = '.'
  }
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i]
    const ax = a.x + Math.floor(a.w / 2), ay = a.y + Math.floor(a.h / 2)
    const bx = b.x + Math.floor(b.w / 2), by = b.y + Math.floor(b.h / 2)
    if (Math.random() < 0.5) { carveH(map, ax, bx, ay); carveV(map, ay, by, bx) }
    else { carveV(map, ay, by, ax); carveH(map, ax, bx, by) }
  }
  const spawnRoom = rooms[0]
  const spawnCx = spawnRoom.x + spawnRoom.w / 2, spawnCy = spawnRoom.y + spawnRoom.h / 2
  let farthestIdx = rooms.length - 1
  let farthestDist = 0
  for (let ri = 1; ri < rooms.length; ri++) {
    const r = rooms[ri]
    const d = Math.abs(r.x + r.w / 2 - spawnCx) + Math.abs(r.y + r.h / 2 - spawnCy)
    if (d > farthestDist) { farthestDist = d; farthestIdx = ri }
  }
  const stairsRoom = rooms[farthestIdx]
  const stairsX = stairsRoom.x + Math.floor(stairsRoom.w / 2)
  const stairsY = stairsRoom.y + Math.floor(stairsRoom.h / 2)
  map[idx(stairsX, stairsY)] = '>'

  const items: { x: number; y: number; item: Item }[] = []
  const itemCount = 4 + Math.floor(Math.random() * 4)
  for (let i = 0; i < itemCount; i++) {
    const r = rooms[1 + Math.floor(Math.random() * (rooms.length - 1))]
    if (!r) continue
    const ix = r.x + 1 + Math.floor(Math.random() * Math.max(1, r.w - 2))
    const iy = r.y + 1 + Math.floor(Math.random() * Math.max(1, r.h - 2))
    if (ix === stairsX && iy === stairsY) continue
    items.push({ x: ix, y: iy, item: rollFloorItem(floor) })
  }
  const goldCount = 4 + Math.floor(Math.random() * 4)
  for (let i = 0; i < goldCount; i++) {
    const r = rooms[Math.floor(Math.random() * rooms.length)]
    const ix = r.x + 1 + Math.floor(Math.random() * Math.max(1, r.w - 2))
    const iy = r.y + 1 + Math.floor(Math.random() * Math.max(1, r.h - 2))
    items.push({ x: ix, y: iy, item: makeItem({ name: 'Gold', glyph: '$', color: '#fbbf24', kind: 'gold', power: 5 + Math.floor(Math.random() * 15) * floor }) })
  }
  const shops: FloorData['shops'] = []
  if (floor >= 2 && rooms.length > 2) {
    const candidates = rooms.filter((_, i) => i !== 0 && i !== farthestIdx)
    if (candidates.length > 0) {
      const shopRoom = candidates[Math.floor(Math.random() * candidates.length)]
      const sx = shopRoom.x + Math.floor(shopRoom.w / 2)
      const sy = shopRoom.y + Math.floor(shopRoom.h / 2)
      if (map[idx(sx, sy)] !== '>') {
        map[idx(sx, sy)] = 'S'
        const shopItems: FloorData['shops'][0]['items'] = []
        const count = 3 + Math.floor(Math.random() * 2)
        const usedNames = new Set<string>()
        for (let si = 0; si < count; si++) {
          let it: Item | null = null
          for (let tries = 0; tries < 12; tries++) {
            const candidate = rollFloorItem(floor)
            if (!usedNames.has(candidate.name)) { it = candidate; break }
          }
          if (!it) continue
          usedNames.add(it.name)
          const price = it.kind === 'weapon' ? 15 + floor * 5 : it.kind === 'armor' ? 12 + floor * 4 : 8 + floor * 2
          shopItems.push({ item: it, price, sold: false })
        }
        shops.push({ x: sx, y: sy, items: shopItems })
      }
    }
  }
  const enemies = rollEnemies(floor, rooms)
  return { map, rooms, enemies, items, stairsX, stairsY, shops, visible: new Array(MAP_W * MAP_H).fill(false), seen: new Array(MAP_W * MAP_H).fill(false) }
}

function carveH(map: Tile[], x1: number, x2: number, y: number): void {
  const [a, b] = x1 < x2 ? [x1, x2] : [x2, x1]
  for (let x = a; x <= b; x++) if (map[idx(x, y)] === '#') map[idx(x, y)] = '.'
}
function carveV(map: Tile[], y1: number, y2: number, x: number): void {
  const [a, b] = y1 < y2 ? [y1, y2] : [y2, y1]
  for (let y = a; y <= b; y++) if (map[idx(x, y)] === '#') map[idx(x, y)] = '.'
}

function sealVaultRoom(map: Tile[], room: Rect): void {
  for (let x = room.x - 1; x <= room.x + room.w; x++) {
    for (let y = room.y - 1; y <= room.y + room.h; y++) {
      if (x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h) continue
      if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) continue
      if (map[idx(x, y)] !== '.' && map[idx(x, y)] !== '+') continue
      const adj: [number, number][] = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]
      for (const [nx, ny] of adj) {
        if (nx >= room.x && nx < room.x + room.w && ny >= room.y && ny < room.y + room.h) {
          map[idx(x, y)] = 'L'
          break
        }
      }
    }
  }
}

// ── FOV ────────────────────────────────────────────────────────────────────

const OCTANTS = [
  [1, 0, 0, 1], [0, 1, 1, 0], [0, -1, 1, 0], [-1, 0, 0, 1],
  [-1, 0, 0, -1], [0, -1, -1, 0], [0, 1, -1, 0], [1, 0, 0, -1]
]

function computeFOV(floor: FloorData, px: number, py: number, radius: number): void {
  floor.visible.fill(false)
  floor.visible[idx(px, py)] = true
  floor.seen[idx(px, py)] = true
  for (const oct of OCTANTS) castLight(floor, px, py, 1, 1, 0, oct[0], oct[1], oct[2], oct[3], radius)
}

function castLight(
  floor: FloorData, cx: number, cy: number, row: number,
  start: number, end: number,
  xx: number, xy: number, yx: number, yy: number,
  radius: number
): void {
  if (start < end) return
  let newStart = 0
  let blocked = false
  for (let distance = row; distance <= radius && !blocked; distance++) {
    const dy = -distance
    for (let dx = -distance; dx <= 0; dx++) {
      const cxx = cx + dx * xx + dy * xy
      const cyy = cy + dx * yx + dy * yy
      const leftSlope = (dx - 0.5) / (dy + 0.5)
      const rightSlope = (dx + 0.5) / (dy - 0.5)
      if (cxx < 0 || cyy < 0 || cxx >= MAP_W || cyy >= MAP_H) continue
      if (start < rightSlope) continue
      if (end > leftSlope) break
      if (dx * dx + dy * dy <= radius * radius) {
        floor.visible[idx(cxx, cyy)] = true
        floor.seen[idx(cxx, cyy)] = true
      }
      const opaque = floor.map[idx(cxx, cyy)] === '#'
      if (blocked) {
        if (opaque) newStart = rightSlope
        else { blocked = false; start = newStart }
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
  const arrowsRef = useRef<Arrow[]>([])
  const particlesRef = useRef<Particle[]>([])
  const logRef = useRef<{ text: string; cls: string }[]>([])
  const [logTick, setLogTick] = useState(0)
  const [hudTick, setHudTick] = useState(0)
  const [phase, setPhase] = useState<'title' | 'playing' | 'dead' | 'won' | 'shop'>('title')
  const phaseRef = useRef<'title' | 'playing' | 'dead' | 'won' | 'shop'>('title')
  const inputRef = useRef({ up: false, down: false, left: false, right: false, aimUp: false, aimDown: false, aimLeft: false, aimRight: false })
  const lastFrameRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const fovTickRef = useRef(0)
  const lastTileXRef = useRef(-1)
  const lastTileYRef = useRef(-1)
  const activeShopRef = useRef<FloorData['shops'][0] | null>(null)
  const vaultKeyFloorRef = useRef(0)
  const vaultRoomSpawnedRef = useRef(false)
  const wasOnShopRef = useRef(false)
  const damageTextsRef = useRef<{ x: number; y: number; vy: number; life: number; text: string; color: string }[]>([])

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
      speed: PLAYER_BASE_SPEED,
      facing: 0,
      gold: 0, kills: 0, floor: 1,
      inventory: inv,
      weapon: null, armor: null,
      attackCooldown: 0,
      swing: null
    }
  }

  function startRun(): void {
    const m = metaRef.current
    const p = makePlayerForRun(m)
    const fd = generateFloor(1)
    const r0 = fd.rooms[0]
    p.x = (r0.x + Math.floor(r0.w / 2)) * CELL + CELL / 2
    p.y = (r0.y + Math.floor(r0.h / 2)) * CELL + CELL / 2
    playerRef.current = p
    floorRef.current = fd
    logRef.current = []
    arrowsRef.current = []
    particlesRef.current = []
    damageTextsRef.current = []
    fovTickRef.current = 0
    lastTileXRef.current = -1
    lastTileYRef.current = -1
    activeShopRef.current = null
    vaultKeyFloorRef.current = 0
    vaultRoomSpawnedRef.current = false
    wasOnShopRef.current = false
    updateFOVIfNeeded()
    log(`Floor 1 — explore every room, find the stairs (>) to descend. Shops sell items for gold.`, 'kill')
    phaseRef.current = 'playing'
    setPhase('playing')
    setHudTick(t => t + 1)
    canvasRef.current?.focus()
  }

  function log(text: string, cls = ''): void {
    logRef.current.unshift({ text, cls })
    if (logRef.current.length > 80) logRef.current.length = 80
    setLogTick(t => t + 1)
  }

  // ── Collision helpers ────────────────────────────────────────────────────

  function passable(tx: number, ty: number): boolean {
    if (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H) return false
    const t = floorRef.current.map[idx(tx, ty)]
    return t === '.' || t === '+' || t === '>' || t === 'S'
  }

  function passableAtPixel(px: number, py: number, radius: number): boolean {
    // Check 4 corners of the player AABB against tile walls
    const corners: [number, number][] = [
      [px - radius, py - radius],
      [px + radius, py - radius],
      [px - radius, py + radius],
      [px + radius, py + radius]
    ]
    for (const [cx, cy] of corners) {
      const tx = Math.floor(cx / CELL)
      const ty = Math.floor(cy / CELL)
      if (!passable(tx, ty)) return false
    }
    return true
  }

  function updateFOVIfNeeded(): void {
    const p = playerRef.current
    const fd = floorRef.current
    const tx = Math.floor(p.x / CELL)
    const ty = Math.floor(p.y / CELL)
    if (tx !== lastTileXRef.current || ty !== lastTileYRef.current) {
      lastTileXRef.current = tx
      lastTileYRef.current = ty
      computeFOV(fd, tx, ty, FOV_RADIUS)
    }
  }

  // ── Step ─────────────────────────────────────────────────────────────────

  function step(dt: number): void {
    if (phaseRef.current !== 'playing') return
    const p = playerRef.current
    const fd = floorRef.current

    // Movement
    let dx = 0, dy = 0
    if (inputRef.current.up) dy -= 1
    if (inputRef.current.down) dy += 1
    if (inputRef.current.left) dx -= 1
    if (inputRef.current.right) dx += 1
    if (dx !== 0 || dy !== 0) {
      const m = Math.hypot(dx, dy)
      dx /= m; dy /= m
      const sx = p.x + dx * p.speed * dt
      if (passableAtPixel(sx, p.y, PLAYER_SIZE / 2)) p.x = sx
      const sy = p.y + dy * p.speed * dt
      if (passableAtPixel(p.x, sy, PLAYER_SIZE / 2)) p.y = sy
      p.facing = Math.atan2(dy, dx)
    }

    // Aim (arrow keys) — if pressed, attack in that direction
    let ax = 0, ay = 0
    if (inputRef.current.aimUp) ay -= 1
    if (inputRef.current.aimDown) ay += 1
    if (inputRef.current.aimLeft) ax -= 1
    if (inputRef.current.aimRight) ax += 1
    p.attackCooldown -= dt
    if ((ax !== 0 || ay !== 0) && p.attackCooldown <= 0) {
      const m = Math.hypot(ax, ay)
      ax /= m; ay /= m
      const weapon: Item = p.weapon ?? FIST
      const wclass = weapon.weaponClass ?? 'fist'
      if (wclass === 'ranged') {
        // Fire an arrow
        const v = 320
        arrowsRef.current.push({
          x: p.x, y: p.y,
          vx: ax * v, vy: ay * v,
          dmg: p.atk + (weapon.atk ?? 0),
          life: 1.4
        })
        p.attackCooldown = weapon.cooldown ?? 0.5
        p.facing = Math.atan2(ay, ax)
      } else {
        // Melee swing
        const reach = weapon.reach ?? 20
        const swingTime = weapon.swingTime ?? 0.2
        const arc = weapon.arcSize ?? 1.0
        const baseAngle = Math.atan2(ay, ax)
        p.swing = {
          baseAngle,
          arcSize: arc,
          reach,
          duration: swingTime,
          t: 0,
          hitIds: new Set(),
          dmg: p.atk + (weapon.atk ?? 0)
        }
        p.attackCooldown = weapon.cooldown ?? 0.4
        p.facing = baseAngle
      }
    }

    // Swing progression — guard against bad duration values that would freeze the swing
    if (p.swing) {
      if (!(p.swing.duration > 0)) p.swing.duration = 0.2
      p.swing.t += dt
      // Damage enemies within arc once per swing
      const sw = p.swing
      const arcProgress = Math.min(1, sw.t / sw.duration)
      // The "current" angle sweeps across the arc, but for hit detection any enemy whose angle from player
      // is within the swing arc and within reach is hit.
      for (const e of fd.enemies) {
        if (!e.alive || sw.hitIds.has(e.id)) continue
        const ex = e.x - p.x, ey = e.y - p.y
        const dist = Math.hypot(ex, ey)
        if (dist > sw.reach + e.size) continue
        const aDiff = angleDelta(Math.atan2(ey, ex), sw.baseAngle)
        if (Math.abs(aDiff) > sw.arcSize) continue
        // Only register hits as the swing reaches that part of the arc
        // Map arcProgress 0→1 to angle sweep from -arc to +arc; hit if aDiff <= sweepFront
        const sweepFront = -sw.arcSize + 2 * sw.arcSize * arcProgress
        if (aDiff > sweepFront + 0.1) continue
        damageEnemy(e, sw.dmg)
        sw.hitIds.add(e.id)
      }
      if (p.swing.t >= p.swing.duration || p.swing.t > 2) p.swing = null
    }
    // Safety: if attackCooldown drifts very far negative, snap it back
    if (p.attackCooldown < -1) p.attackCooldown = 0

    // Enemies
    for (const e of fd.enemies) {
      if (!e.alive) continue
      if (e.hitTimer > 0) e.hitTimer -= dt
      if (e.swingTimer > 0) e.swingTimer -= dt
      e.attackCooldown -= dt

      // Only act if visible to player
      const etx = Math.floor(e.x / CELL)
      const ety = Math.floor(e.y / CELL)
      if (!fd.visible[idx(etx, ety)]) continue

      const ex = p.x - e.x, ey = p.y - e.y
      const dist = Math.hypot(ex, ey)
      if (dist > e.attackRange + e.size) {
        const m = dist || 1
        const nx = (ex / m), ny = (ey / m)
        const sx = e.x + nx * e.speed * dt
        const sy = e.y + ny * e.speed * dt
        const canX = passableAtPixel(sx, e.y, e.size - 1) && !enemyOverlap(e, sx, e.y)
        const canY = passableAtPixel(e.x, sy, e.size - 1) && !enemyOverlap(e, e.x, sy)
        if (canX) e.x = sx
        if (canY) e.y = sy
        if (!canX && !canY) {
          const base = Math.atan2(ey, ex)
          const offsets = [Math.PI / 4, -Math.PI / 4, Math.PI / 2, -Math.PI / 2, 3 * Math.PI / 4, -3 * Math.PI / 4]
          for (const off of offsets) {
            const a = base + off
            const tx = e.x + Math.cos(a) * e.speed * dt
            const ty = e.y + Math.sin(a) * e.speed * dt
            if (passableAtPixel(tx, ty, e.size - 1) && !enemyOverlap(e, tx, ty)) {
              e.x = tx; e.y = ty; break
            }
          }
        }
      } else if (e.attackCooldown <= 0) {
        const dmg = Math.max(1, e.atk + Math.floor(Math.random() * 3) - p.def - (p.armor?.def ?? 0))
        p.hp -= dmg
        e.attackCooldown = e.attackInterval
        e.swingTimer = 0.2
        log(`The ${e.kind} hits you for ${dmg}.`, 'dmg')
        spawnParticles(p.x, p.y, '#dc2626', 5)
        if (p.hp <= 0) { finishRun(false); return }
      }
    }

    // Arrows
    for (const a of arrowsRef.current) {
      a.x += a.vx * dt
      a.y += a.vy * dt
      a.life -= dt
      // Hit wall?
      const tx = Math.floor(a.x / CELL), ty = Math.floor(a.y / CELL)
      if (!passable(tx, ty)) { a.life = 0; continue }
      // Hit enemy?
      for (const e of fd.enemies) {
        if (!e.alive) continue
        if (Math.hypot(a.x - e.x, a.y - e.y) < e.size + 3) {
          damageEnemy(e, a.dmg)
          a.life = 0
          break
        }
      }
    }
    arrowsRef.current = arrowsRef.current.filter(a => a.life > 0)

    // Auto-descend when standing on stairs tile
    const ptx = Math.floor(p.x / CELL), pty = Math.floor(p.y / CELL)
    if (ptx === fd.stairsX && pty === fd.stairsY) {
      descend()
      return
    }
    // Shop interaction — only trigger on first step onto tile, not while standing
    const onShopNow = fd.shops.some(s => ptx === s.x && pty === s.y && s.items.some(si => !si.sold))
    if (onShopNow && !wasOnShopRef.current) {
      const shop = fd.shops.find(s => ptx === s.x && pty === s.y)!
      activeShopRef.current = shop
      wasOnShopRef.current = true
      phaseRef.current = 'shop'
      setPhase('shop')
      inputRef.current = { up: false, down: false, left: false, right: false, aimUp: false, aimDown: false, aimLeft: false, aimRight: false }
      return
    }
    wasOnShopRef.current = onShopNow
    // Vault door — auto-unlock when adjacent with key
    const adjTiles: [number, number][] = [[ptx - 1, pty], [ptx + 1, pty], [ptx, pty - 1], [ptx, pty + 1]]
    for (const [ax, ay] of adjTiles) {
      if (ax >= 0 && ay >= 0 && ax < MAP_W && ay < MAP_H && fd.map[idx(ax, ay)] === 'L') {
        const vkIdx = p.inventory.findIndex(it => it.name === 'Vault Key')
        if (vkIdx >= 0) {
          p.inventory.splice(vkIdx, 1)
          for (let mi = 0; mi < fd.map.length; mi++) { if (fd.map[mi] === 'L') fd.map[mi] = '.' }
          log('The Vault Key clicks — the sealed door swings open!', 'pickup')
          setHudTick(t => t + 1)
          break
        }
      }
    }
    // Item pickup (when player is on item tile)
    const pickIdx = fd.items.findIndex(it => it.x === ptx && it.y === pty)
    if (pickIdx >= 0) {
      const it = fd.items[pickIdx]
      fd.items.splice(pickIdx, 1)
      if (it.item.kind === 'gold') {
        p.gold += it.item.power ?? 0
        log(`Picked up ${it.item.power} gold.`, 'pickup')
      } else if (it.item.kind === 'weapon') {
        const cur = p.weapon
        const incomingAtk = it.item.atk ?? 0
        const currentAtk = cur?.atk ?? 0
        if (!cur) {
          p.weapon = it.item
          log(`Pick up & wield ${it.item.name}.`, 'pickup')
        } else if (incomingAtk > currentAtk) {
          p.weapon = it.item
          p.gold += 3
          log(`Swap to ${it.item.name}. Old weapon scrapped for 3 gold.`, 'pickup')
        } else {
          p.gold += 3
          log(`Scrap ${it.item.name} for 3 gold (your ${cur.name} is better).`, 'pickup')
        }
      } else if (it.item.kind === 'armor') {
        const cur = p.armor
        const incomingDef = it.item.def ?? 0
        const currentDef = cur?.def ?? 0
        if (!cur) {
          p.armor = it.item
          log(`Don ${it.item.name}.`, 'pickup')
        } else if (incomingDef > currentDef) {
          p.armor = it.item
          p.gold += 3
          log(`Swap to ${it.item.name}. Old armor scrapped for 3 gold.`, 'pickup')
        } else {
          p.gold += 3
          log(`Scrap ${it.item.name} for 3 gold (your ${cur.name} is better).`, 'pickup')
        }
      } else {
        p.inventory.push(it.item)
        log(`Picked up ${it.item.name}.`, 'pickup')
      }
    }

    // Particles
    for (const pa of particlesRef.current) {
      pa.x += pa.vx * dt
      pa.y += pa.vy * dt
      pa.vx *= 0.92
      pa.vy *= 0.92
      pa.life -= dt
    }
    particlesRef.current = particlesRef.current.filter(pa => pa.life > 0)

    for (const d of damageTextsRef.current) { d.y += d.vy * dt; d.life -= dt }
    damageTextsRef.current = damageTextsRef.current.filter(d => d.life > 0)

    updateFOVIfNeeded()
    setHudTick(t => t + 1)
  }

  function enemyOverlap(self: Enemy, x: number, y: number): boolean {
    for (const e of floorRef.current.enemies) {
      if (e === self || !e.alive) continue
      if (Math.hypot(e.x - x, e.y - y) < e.size + self.size - 2) return true
    }
    return false
  }

  function damageEnemy(e: Enemy, dmg: number): void {
    const final = Math.max(1, dmg - e.def + Math.floor(Math.random() * 3) - 1)
    e.hp -= final
    e.hitTimer = 0.12
    damageTextsRef.current.push({
      x: e.x, y: e.y - e.size - 4, vy: -30, life: 0.5,
      text: String(Math.floor(final)),
      color: '#fff'
    })
    if (e.hp <= 0) {
      e.alive = false
      playerRef.current.kills += 1
      const xp = ENEMY_STATS[e.kind].xp
      log(`You slay the ${e.kind}. (+${xp} soul)`, 'kill')
      spawnParticles(e.x, e.y, '#dc2626', 10)
      if (e.kind === 'demonLord') finishRun(true)
    }
  }

  function spawnParticles(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2
      const v = 60 + Math.random() * 80
      particlesRef.current.push({
        x, y,
        vx: Math.cos(a) * v, vy: Math.sin(a) * v,
        life: 0.35 + Math.random() * 0.25,
        maxLife: 0.6,
        color, size: 2 + Math.random() * 2
      })
    }
  }

  function angleDelta(a: number, b: number): number {
    let d = a - b
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    return d
  }

  function buyShopItem(slotIdx: number): void {
    const shop = activeShopRef.current
    if (!shop) return
    const entry = shop.items[slotIdx]
    if (!entry || entry.sold) return
    const p = playerRef.current
    if (p.gold < entry.price) { log('Not enough gold.', 'dmg'); setHudTick(t => t + 1); return }
    p.gold -= entry.price
    entry.sold = true
    if (entry.item.kind === 'weapon') {
      if (!p.weapon || (entry.item.atk ?? 0) > (p.weapon.atk ?? 0)) {
        if (p.weapon) p.gold += 3
        p.weapon = entry.item
        log(`Bought & equipped ${entry.item.name}.`, 'pickup')
      } else {
        p.inventory.push(entry.item)
        log(`Bought ${entry.item.name}.`, 'pickup')
      }
    } else if (entry.item.kind === 'armor') {
      if (!p.armor || (entry.item.def ?? 0) > (p.armor.def ?? 0)) {
        if (p.armor) p.gold += 3
        p.armor = entry.item
        log(`Bought & donned ${entry.item.name}.`, 'pickup')
      } else {
        p.inventory.push(entry.item)
        log(`Bought ${entry.item.name}.`, 'pickup')
      }
    } else {
      p.inventory.push(entry.item)
      log(`Bought ${entry.item.name}.`, 'pickup')
    }
    setHudTick(t => t + 1)
  }

  function descend(): void {
    const p = playerRef.current
    p.floor += 1
    if (p.floor > TOTAL_FLOORS) { finishRun(true); return }
    const newFloor = generateFloor(p.floor)
    const r0 = newFloor.rooms[0]
    p.x = (r0.x + Math.floor(r0.w / 2)) * CELL + CELL / 2
    p.y = (r0.y + Math.floor(r0.h / 2)) * CELL + CELL / 2
    // Vault key spawning — once per run, higher chance on deeper floors
    if (vaultKeyFloorRef.current === 0) {
      const spawnChance = 0.03 + Math.min(0.22, p.floor * 0.03)
      if (Math.random() < spawnChance && newFloor.rooms.length > 2) {
        const kr = newFloor.rooms[1 + Math.floor(Math.random() * Math.max(1, newFloor.rooms.length - 2))]
        if (kr) {
          newFloor.items.push({ x: kr.x + 1, y: kr.y + 1, item: makeItem(VAULT_KEY) })
          vaultKeyFloorRef.current = p.floor
        }
      }
    }
    // Vault room spawning — must be on a floor AFTER the key was placed
    if (vaultKeyFloorRef.current > 0 && p.floor > vaultKeyFloorRef.current && !vaultRoomSpawnedRef.current) {
      const vaultChance = 0.4 + (p.floor - vaultKeyFloorRef.current) * 0.15
      if (Math.random() < vaultChance && newFloor.rooms.length > 3) {
        const vaultCandidates = newFloor.rooms.filter((r, i) => {
          if (i === 0) return false
          const cx = r.x + Math.floor(r.w / 2), cy = r.y + Math.floor(r.h / 2)
          return !(cx === newFloor.stairsX && cy === newFloor.stairsY)
        })
        if (vaultCandidates.length > 0) {
          const vRoom = vaultCandidates[Math.floor(Math.random() * vaultCandidates.length)]
          sealVaultRoom(newFloor.map, vRoom)
          for (let vi = 0; vi < 4; vi++) {
            const ix = vRoom.x + 1 + Math.floor(Math.random() * Math.max(1, vRoom.w - 2))
            const iy = vRoom.y + 1 + Math.floor(Math.random() * Math.max(1, vRoom.h - 2))
            newFloor.items.push({ x: ix, y: iy, item: makeItem({ name: 'Gold', glyph: '$', color: '#fbbf24', kind: 'gold', power: 25 + Math.floor(Math.random() * 40) }) })
          }
          newFloor.items.push({ x: vRoom.x + Math.floor(vRoom.w / 2), y: vRoom.y + Math.floor(vRoom.h / 2), item: rollFloorItem(Math.min(12, p.floor + 2)) })
          newFloor.items.push({ x: vRoom.x + 1, y: vRoom.y + 1, item: rollFloorItem(Math.min(12, p.floor + 2)) })
          vaultRoomSpawnedRef.current = true
        }
      }
    }
    floorRef.current = newFloor
    arrowsRef.current = []
    lastTileXRef.current = -1
    lastTileYRef.current = -1
    updateFOVIfNeeded()
    log(`Descend to floor ${p.floor}. Find the stairs (>) to go deeper.`, 'kill')
  }

  function useInvSlot(i: number): void {
    if (phaseRef.current !== 'playing') return
    const p = playerRef.current
    const it = p.inventory[i]
    if (!it) return
    if (it.kind === 'weapon') {
      const prev = p.weapon
      p.weapon = it
      p.inventory.splice(i, 1)
      if (prev) p.inventory.push(prev)
      log(`Equip ${it.name}.`)
      return
    }
    if (it.kind === 'armor') {
      const prev = p.armor
      p.armor = it
      p.inventory.splice(i, 1)
      if (prev) p.inventory.push(prev)
      log(`Don ${it.name}.`)
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
        for (let tries = 0; tries < 200; tries++) {
          const tx = Math.floor(Math.random() * MAP_W)
          const ty = Math.floor(Math.random() * MAP_H)
          if (passable(tx, ty)) {
            p.x = tx * CELL + CELL / 2
            p.y = ty * CELL + CELL / 2
            lastTileXRef.current = -1
            updateFOVIfNeeded()
            log(`Reality blurs.`, 'pickup')
            break
          }
        }
      }
      return
    }
    if (it.kind === 'scroll') {
      if (it.effect === 'mapping') {
        for (let k = 0; k < floorRef.current.seen.length; k++) floorRef.current.seen[k] = true
        log(`The floor's map blooms.`, 'pickup')
        p.inventory.splice(i, 1)
        return
      }
      if (it.effect === 'fireball') {
        const dmg = it.power ?? 26
        let hits = 0
        for (const e of floorRef.current.enemies) {
          if (e.alive && floorRef.current.visible[idx(Math.floor(e.x / CELL), Math.floor(e.y / CELL))]) {
            damageEnemy(e, dmg)
            hits += 1
          }
        }
        log(`Fireball erupts — ${hits} struck.`, 'dmg')
        p.inventory.splice(i, 1)
        return
      }
    }
  }

  function finishRun(won: boolean): void {
    if (phaseRef.current === 'dead' || phaseRef.current === 'won') return
    const p = playerRef.current
    const souls = p.floor * 50 + p.kills * 5 + p.gold + (won ? 500 : 0)
    const m = metaRef.current
    const next: Meta = { ...m, souls: m.souls + souls }
    metaRef.current = next
    setMeta(next)
    window.api.settings.set(SAVE_KEY, JSON.stringify(next)).catch(() => {})
    log(`Earned ${souls} souls.`, 'kill')
    phaseRef.current = won ? 'won' : 'dead'
    setPhase(won ? 'won' : 'dead')
  }

  function resetMeta(): void {
    if (!window.confirm('Reset all Soul Forge progress? Souls and upgrades will be wiped.')) return
    metaRef.current = META_DEFAULT
    setMeta(META_DEFAULT)
    window.api.settings.set(SAVE_KEY, JSON.stringify(META_DEFAULT)).catch(() => {})
  }

  function buyForge(id: 'hpUp' | 'atkUp' | 'defUp' | 'startPotion'): void {
    const m = metaRef.current
    const u = FORGE_UPGRADES.find(u => u.id === id)
    if (!u) return
    const cur = m[id]
    if (cur >= u.max) return
    const cost = u.costs[cur]
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
    function setKey(e: KeyboardEvent, down: boolean): void {
      // Only consume keys when the canvas owns focus — keeps app shortcuts working
      if (document.activeElement !== canvasRef.current) return
      const k = e.key.toLowerCase()
      if (phaseRef.current === 'shop') {
        if (down) {
          e.preventDefault(); e.stopPropagation()
          if (k === 'escape' || k === 'enter' || k === ' ') {
            activeShopRef.current = null
            phaseRef.current = 'playing'
            setPhase('playing')
          } else if (/^[1-9]$/.test(k)) {
            buyShopItem(parseInt(k, 10) - 1)
          }
        }
        return
      }
      if (phaseRef.current !== 'playing') {
        if (down && (e.key === 'Enter' || e.key === ' ') && (phaseRef.current === 'dead' || phaseRef.current === 'won')) {
          e.preventDefault(); e.stopPropagation()
          phaseRef.current = 'title'
          setPhase('title')
        }
        return
      }
      if (k === 'w') { e.preventDefault(); e.stopPropagation(); inputRef.current.up = down }
      else if (k === 's') { e.preventDefault(); e.stopPropagation(); inputRef.current.down = down }
      else if (k === 'a') { e.preventDefault(); e.stopPropagation(); inputRef.current.left = down }
      else if (k === 'd') { e.preventDefault(); e.stopPropagation(); inputRef.current.right = down }
      else if (k === 'arrowup') { e.preventDefault(); e.stopPropagation(); inputRef.current.aimUp = down }
      else if (k === 'arrowdown') { e.preventDefault(); e.stopPropagation(); inputRef.current.aimDown = down }
      else if (k === 'arrowleft') { e.preventDefault(); e.stopPropagation(); inputRef.current.aimLeft = down }
      else if (k === 'arrowright') { e.preventDefault(); e.stopPropagation(); inputRef.current.aimRight = down }
      else if (down && /^[1-9]$/.test(k)) { e.preventDefault(); e.stopPropagation(); useInvSlot(parseInt(k, 10) - 1) }
    }
    function onDown(e: KeyboardEvent): void { setKey(e, true) }
    function onUp(e: KeyboardEvent): void { setKey(e, false) }
    // Capture-phase so we intercept before any global app-shortcut handler runs
    window.addEventListener('keydown', onDown, true)
    window.addEventListener('keyup', onUp, true)
    return () => {
      window.removeEventListener('keydown', onDown, true)
      window.removeEventListener('keyup', onUp, true)
    }
  }, [])

  // ── RAF ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    lastFrameRef.current = performance.now()
    const loop = (t: number): void => {
      const dt = Math.min(0.05, (t - lastFrameRef.current) / 1000)
      lastFrameRef.current = t
      step(dt)
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Draw ─────────────────────────────────────────────────────────────────

  function drawHero(ctx: CanvasRenderingContext2D, x: number, y: number, p: Player): void {
    // Tiny adventurer: hooded cloak, body, sword pip in facing direction
    // Body
    ctx.fillStyle = '#7c2d12'
    ctx.fillRect(x - 5, y - 2, 10, 8)
    // Cloak edges
    ctx.fillStyle = '#451a03'
    ctx.fillRect(x - 6, y + 2, 2, 5)
    ctx.fillRect(x + 4, y + 2, 2, 5)
    // Head
    ctx.fillStyle = '#fde68a'
    ctx.fillRect(x - 3, y - 7, 6, 5)
    // Hood
    ctx.fillStyle = '#451a03'
    ctx.fillRect(x - 4, y - 8, 8, 2)
    // Eyes
    ctx.fillStyle = '#0a0805'
    ctx.fillRect(x - 2, y - 5, 1, 1)
    ctx.fillRect(x + 1, y - 5, 1, 1)
    // Feet
    ctx.fillStyle = '#1c1917'
    ctx.fillRect(x - 4, y + 6, 3, 2)
    ctx.fillRect(x + 1, y + 6, 3, 2)
    // Facing pip (weapon direction)
    const fx = Math.cos(p.facing) * 7
    const fy = Math.sin(p.facing) * 7
    ctx.fillStyle = p.weapon?.weaponClass === 'ranged' ? '#a16207' : '#e2e8f0'
    ctx.fillRect(x + fx - 1, y + fy - 1, 2, 2)
  }

  function drawEnemyFigure(ctx: CanvasRenderingContext2D, x: number, y: number, e: Enemy): void {
    const flash = e.hitTimer > 0
    const t = ENEMY_STATS[e.kind]
    const base = flash ? '#fff' : t.color
    if (e.kind === 'rat') {
      ctx.fillStyle = base
      ctx.fillRect(x - 6, y - 1, 12, 5)         // body
      ctx.fillRect(x - 8, y - 2, 3, 4)          // head
      ctx.fillStyle = '#fca5a5'
      ctx.fillRect(x - 8, y - 4, 1, 2)          // ear
      ctx.fillRect(x - 6, y - 4, 1, 2)
      ctx.fillStyle = '#0a0805'
      ctx.fillRect(x - 7, y - 1, 1, 1)          // eye
      ctx.strokeStyle = base
      ctx.beginPath(); ctx.moveTo(x + 6, y + 1); ctx.lineTo(x + 10, y - 2); ctx.stroke()  // tail
    } else if (e.kind === 'goblin') {
      ctx.fillStyle = base
      ctx.fillRect(x - 4, y - 2, 8, 7)          // body
      ctx.fillRect(x - 3, y - 7, 6, 5)          // head
      ctx.fillStyle = '#3f6212'
      ctx.fillRect(x - 5, y - 7, 2, 3)          // pointed ears
      ctx.fillRect(x + 3, y - 7, 2, 3)
      ctx.fillStyle = '#facc15'
      ctx.fillRect(x - 2, y - 5, 1, 1)
      ctx.fillRect(x + 1, y - 5, 1, 1)
      // dagger
      ctx.fillStyle = '#cbd5e1'
      ctx.fillRect(x + 4, y - 1, 4, 1)
    } else if (e.kind === 'orc') {
      ctx.fillStyle = base
      ctx.fillRect(x - 5, y - 2, 10, 8)
      ctx.fillRect(x - 4, y - 8, 8, 6)
      ctx.fillStyle = '#fff'
      ctx.fillRect(x - 2, y - 3, 1, 2)          // tusks
      ctx.fillRect(x + 1, y - 3, 1, 2)
      ctx.fillStyle = '#0a0805'
      ctx.fillRect(x - 3, y - 6, 2, 1)
      ctx.fillRect(x + 1, y - 6, 2, 1)
      // club
      ctx.fillStyle = '#78350f'
      ctx.fillRect(x + 5, y - 4, 2, 8)
    } else if (e.kind === 'skeleton') {
      ctx.fillStyle = base
      ctx.fillRect(x - 3, y - 8, 6, 6)           // skull
      ctx.fillRect(x - 4, y - 2, 8, 6)           // ribs
      ctx.fillStyle = '#0a0805'
      ctx.fillRect(x - 2, y - 6, 2, 2)           // eye sockets
      ctx.fillRect(x, y - 6, 2, 2)
      ctx.fillStyle = base
      ctx.fillRect(x - 4, y - 1, 8, 1)           // rib lines
      ctx.fillRect(x - 4, y + 1, 8, 1)
      // sword
      ctx.fillStyle = '#cbd5e1'
      ctx.fillRect(x + 4, y - 3, 5, 1)
    } else if (e.kind === 'troll') {
      ctx.fillStyle = base
      ctx.fillRect(x - 6, y - 3, 12, 9)
      ctx.fillRect(x - 5, y - 9, 10, 6)
      ctx.fillStyle = '#0f766e'
      ctx.fillRect(x - 3, y - 11, 2, 3)          // horns
      ctx.fillRect(x + 1, y - 11, 2, 3)
      ctx.fillStyle = '#fbbf24'
      ctx.fillRect(x - 3, y - 7, 2, 2)
      ctx.fillRect(x + 1, y - 7, 2, 2)
      ctx.fillStyle = '#fff'
      ctx.fillRect(x - 1, y - 3, 1, 2)
    } else if (e.kind === 'demon') {
      ctx.fillStyle = base
      ctx.fillRect(x - 5, y - 2, 10, 8)
      ctx.fillRect(x - 4, y - 8, 8, 6)
      // horns
      ctx.fillStyle = '#7f1d1d'
      ctx.fillRect(x - 5, y - 10, 2, 3)
      ctx.fillRect(x + 3, y - 10, 2, 3)
      // glowing eyes
      ctx.fillStyle = '#fef08a'
      ctx.fillRect(x - 2, y - 5, 2, 2)
      ctx.fillRect(x + 1, y - 5, 2, 2)
      // wings
      ctx.fillStyle = '#7f1d1d'
      ctx.fillRect(x - 9, y - 1, 4, 2)
      ctx.fillRect(x + 5, y - 1, 4, 2)
    } else if (e.kind === 'demonLord') {
      ctx.fillStyle = base
      ctx.fillRect(x - 9, y - 4, 18, 12)
      ctx.fillRect(x - 7, y - 12, 14, 8)
      // crown horns
      ctx.fillStyle = '#fbbf24'
      ctx.fillRect(x - 9, y - 15, 3, 4)
      ctx.fillRect(x - 2, y - 16, 4, 5)
      ctx.fillRect(x + 6, y - 15, 3, 4)
      // burning eyes
      ctx.fillStyle = '#fde047'
      ctx.fillRect(x - 4, y - 8, 3, 3)
      ctx.fillRect(x + 1, y - 8, 3, 3)
      // mouth
      ctx.fillStyle = '#0a0805'
      ctx.fillRect(x - 5, y - 3, 10, 2)
      ctx.fillStyle = '#fff'
      for (let i = 0; i < 5; i++) ctx.fillRect(x - 5 + i * 2, y - 3, 1, 2)
      // wings
      ctx.fillStyle = '#450a0a'
      ctx.fillRect(x - 14, y - 2, 5, 6)
      ctx.fillRect(x + 9, y - 2, 5, 6)
    }
  }

  function draw(): void {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    const p = playerRef.current
    const fd = floorRef.current
    ctx.fillStyle = '#0a0805'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    // Camera: centered on player tile, clamped
    const ptileX = p.x / CELL
    const ptileY = p.y / CELL
    let camX = ptileX - VIEW_W / 2
    let camY = ptileY - VIEW_H / 2
    camX = Math.max(0, Math.min(MAP_W - VIEW_W, camX))
    camY = Math.max(0, Math.min(MAP_H - VIEW_H, camY))
    const camPxX = camX * CELL
    const camPxY = camY * CELL

    ctx.font = `bold ${CELL - 4}px ui-monospace, Consolas, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // Tiles
    for (let vy = 0; vy < VIEW_H + 1; vy++) {
      for (let vx = 0; vx < VIEW_W + 1; vx++) {
        const mx = Math.floor(camX) + vx
        const my = Math.floor(camY) + vy
        if (mx < 0 || my < 0 || mx >= MAP_W || my >= MAP_H) continue
        const tile = fd.map[idx(mx, my)]
        const visible = fd.visible[idx(mx, my)]
        const seen = fd.seen[idx(mx, my)]
        if (!seen) continue
        const px = mx * CELL - camPxX
        const py = my * CELL - camPxY
        let bg = '', fg = '', g = ''
        if (tile === '#') { bg = visible ? '#3f3424' : '#1a1610'; fg = visible ? '#78716c' : '#3f3424'; g = '#' }
        else if (tile === '.') { bg = visible ? '#181410' : '#0d0b08'; fg = visible ? '#57534e' : '#292524'; g = '·' }
        else if (tile === '+') { bg = visible ? '#1f1815' : '#0d0b08'; fg = visible ? '#a16207' : '#451a03'; g = '+' }
        else if (tile === '>') { bg = visible ? '#2a1f0a' : '#14100a'; fg = visible ? '#fbbf24' : '#b45309'; g = '>' }
        else if (tile === 'S') { bg = visible ? '#1a1520' : '#0d0b10'; fg = visible ? '#c084fc' : '#6b21a8'; g = '$' }
        else if (tile === 'L') { bg = visible ? '#1a1008' : '#0d0b08'; fg = visible ? '#fde047' : '#92400e'; g = '⊠' }
        ctx.fillStyle = bg
        ctx.fillRect(px, py, CELL, CELL)
        ctx.fillStyle = fg
        ctx.fillText(g, px + CELL / 2, py + CELL / 2 + 1)
      }
    }

    // Items
    for (const it of fd.items) {
      if (!fd.visible[idx(it.x, it.y)]) continue
      const px = it.x * CELL - camPxX
      const py = it.y * CELL - camPxY
      ctx.fillStyle = it.item.color
      ctx.fillText(it.item.glyph, px + CELL / 2, py + CELL / 2 + 1)
    }

    // Enemies (pixel figures)
    for (const e of fd.enemies) {
      if (!e.alive) continue
      const etx = Math.floor(e.x / CELL), ety = Math.floor(e.y / CELL)
      if (!fd.visible[idx(etx, ety)]) continue
      const epx = e.x - camPxX, epy = e.y - camPxY
      drawEnemyFigure(ctx, epx, epy, e)
      if (e.swingTimer > 0) {
        const ang = Math.atan2(p.y - e.y, p.x - e.x)
        const progress = 1 - e.swingTimer / 0.2
        ctx.beginPath()
        ctx.moveTo(epx, epy)
        ctx.arc(epx, epy, e.attackRange + e.size, ang - 0.8, ang - 0.8 + 1.6 * progress)
        ctx.closePath()
        ctx.fillStyle = `rgba(220, 38, 38, ${0.5 * (1 - progress)})`
        ctx.fill()
      }
      if (e.hp < e.maxHp) {
        ctx.fillStyle = 'rgba(0,0,0,0.6)'
        ctx.fillRect(epx - e.size, epy - e.size - 5, e.size * 2, 3)
        ctx.fillStyle = '#dc2626'
        ctx.fillRect(epx - e.size, epy - e.size - 5, e.size * 2 * Math.max(0, e.hp / e.maxHp), 3)
      }
    }

    // Arrows
    for (const a of arrowsRef.current) {
      const ang = Math.atan2(a.vy, a.vx)
      const px = a.x - camPxX, py = a.y - camPxY
      ctx.save()
      ctx.translate(px, py)
      ctx.rotate(ang)
      ctx.strokeStyle = '#fde68a'
      ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(-8, 0); ctx.lineTo(6, 0); ctx.stroke()
      ctx.fillStyle = '#facc15'
      ctx.beginPath()
      ctx.moveTo(6, 0); ctx.lineTo(2, -3); ctx.lineTo(2, 3); ctx.closePath(); ctx.fill()
      ctx.restore()
    }

    // Player figure (little adventurer)
    const ppx = p.x - camPxX, ppy = p.y - camPxY
    drawHero(ctx, ppx, ppy, p)

    // Swing visual
    if (p.swing) {
      const sw = p.swing
      const progress = Math.min(1, sw.t / sw.duration)
      const startA = sw.baseAngle - sw.arcSize
      const endA = sw.baseAngle - sw.arcSize + 2 * sw.arcSize * progress
      ctx.beginPath()
      ctx.moveTo(ppx, ppy)
      ctx.arc(ppx, ppy, sw.reach, startA, endA)
      ctx.closePath()
      ctx.fillStyle = `rgba(254, 240, 138, ${0.5 * (1 - progress)})`
      ctx.fill()
      ctx.strokeStyle = '#fde047'
      ctx.lineWidth = 2
      ctx.stroke()
    }

    // Particles
    for (const pa of particlesRef.current) {
      ctx.globalAlpha = Math.max(0, Math.min(1, pa.life / pa.maxLife))
      ctx.fillStyle = pa.color
      ctx.fillRect(pa.x - camPxX - pa.size / 2, pa.y - camPxY - pa.size / 2, pa.size, pa.size)
    }
    ctx.globalAlpha = 1

    // Damage text
    for (const d of damageTextsRef.current) {
      ctx.fillStyle = d.color
      ctx.globalAlpha = Math.min(1, d.life * 2)
      ctx.font = 'bold 11px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.fillText(d.text, d.x - camPxX, d.y - camPxY)
      ctx.globalAlpha = 1
      ctx.font = `bold ${CELL - 4}px ui-monospace, Consolas, monospace`   // restore
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const p = playerRef.current
  const totalAtk = p.atk + (p.weapon?.atk ?? 0)
  const totalDef = p.def + (p.armor?.def ?? 0)
  const weaponClassLabel = p.weapon ? (p.weapon.weaponClass === 'ranged' ? 'ranged' : 'melee') : 'unarmed'

  return (
    <div className={styles.body}>
      <div className={styles.header}>
        <span className={p.hp < p.maxHp / 3 ? styles.statRed : ''}>HP <strong>{Math.max(0, Math.ceil(p.hp))} / {p.maxHp}</strong></span>
        <span>Atk <strong>{totalAtk}</strong></span>
        <span>Def <strong>{totalDef}</strong></span>
        <span className={styles.goldTag}>Gold <strong>{p.gold}</strong></span>
        <span>Floor <strong>{p.floor} / {TOTAL_FLOORS}</strong></span>
        <span>Kills <strong>{p.kills}</strong></span>
        <span>Souls <strong>{meta.souls}</strong></span>
        {phase === 'playing' && <button className={styles.resetBtn} onClick={() => { phaseRef.current = 'title'; setPhase('title') }}>Give Up</button>}
        <span style={{ display: 'none' }}>{hudTick}</span>
      </div>
      <div className={styles.layout}>
        <div className={styles.leftPanel}>
          <div className={styles.section}>Legend</div>
          <div className={styles.legend}>
            <div className={styles.legendGroup}>
              <span className={styles.legendTitle}>Tiles</span>
              <div><span style={{ color: '#64748b' }}>#</span> Wall</div>
              <div><span style={{ color: '#475569' }}>·</span> Floor</div>
              <div><span style={{ color: '#fbbf24' }}>+</span> Door</div>
              <div><span style={{ color: '#22d3ee' }}>&gt;</span> Stairs</div>
              <div><span style={{ color: '#c084fc' }}>$</span> Shop</div>
              <div><span style={{ color: '#fde047' }}>⊠</span> Vault</div>
            </div>
            <div className={styles.legendGroup}>
              <span className={styles.legendTitle}>Pickups</span>
              <div><span style={{ color: '#dc2626' }}>!</span> Potion</div>
              <div><span style={{ color: '#67e8f9' }}>?</span> Scroll</div>
              <div><span style={{ color: '#cbd5e1' }}>)</span> Melee</div>
              <div><span style={{ color: '#a16207' }}>{'}'}</span> Ranged</div>
              <div><span style={{ color: '#94a3b8' }}>[</span> Armor</div>
              <div><span style={{ color: '#fbbf24' }}>$</span> Gold</div>
            </div>
          </div>
        </div>
        <div className={styles.centerCol}>
          <canvas
            ref={canvasRef}
            width={CANVAS_W}
            height={CANVAS_H}
            className={styles.canvas}
            tabIndex={0}
            onMouseDown={() => canvasRef.current?.focus()}
          />
          <div className={styles.logBar} key={logTick}>
            {logRef.current.slice(0, 8).map((l, i) => (
              <p key={i} className={l.cls ? (styles[l.cls as keyof typeof styles] ?? '') : ''}>{l.text}</p>
            ))}
          </div>
        </div>
        <div className={styles.rightPanel}>
          <div className={styles.section}>Equipped ({weaponClassLabel})</div>
          <ul className={styles.invList}>
            <li className={p.weapon ? styles.equipped : ''}>weapon: {p.weapon ? `${p.weapon.name} (+${p.weapon.atk})` : '—'}</li>
            <li className={p.armor ? styles.equipped : ''}>armor: {p.armor ? `${p.armor.name} (+${p.armor.def})` : '—'}</li>
          </ul>
          <div className={styles.section}>Inventory (1-9)</div>
          <ul className={styles.invList}>
            {p.inventory.length === 0 && <li style={{ opacity: 0.4 }}>empty</li>}
            {p.inventory.slice(0, 9).map((it, i) => (
              <li key={it.uid}>{i + 1}. {it.glyph} {it.name}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className={styles.hint}>
        WASD move · arrow keys swing/fire · 1-9 use item · step on &gt; to descend · walk on $ to shop
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
          <button className={styles.resetBtn} style={{ marginTop: 8 }} onClick={resetMeta}>Reset Forge</button>
        </div>
      )}

      {phase === 'shop' && activeShopRef.current && (
        <div className={styles.overlay}>
          <div className={styles.title}>SHOP</div>
          <div className={styles.subtitle}>Press 1-{activeShopRef.current.items.length} to buy · Enter/Esc to leave</div>
          <div style={{ background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.4)', borderRadius: 6, padding: '6px 16px', fontSize: 16, fontWeight: 800, color: '#fde047' }}>
            {playerRef.current.gold} gold
          </div>
          <div className={styles.shopGrid}>
            {activeShopRef.current.items.map((entry, i) => (
              <div key={i} className={`${styles.shopItem} ${entry.sold ? styles.sold : ''}`}>
                <span className={styles.shopIdx}>{i + 1}.</span>
                <span className={styles.shopGlyph} style={{ color: entry.item.color }}>{entry.item.glyph}</span>
                <div>
                  <span className={styles.shopName}>{entry.item.name}</span>
                  {entry.item.atk ? <span className={styles.shopStat}> +{entry.item.atk} atk</span> : null}
                  {entry.item.def ? <span className={styles.shopStat}> +{entry.item.def} def</span> : null}
                  {entry.item.effect === 'heal' ? <span className={styles.shopStat}> +{entry.item.power} hp</span> : null}
                </div>
                <span className={styles.shopPrice}>{entry.sold ? 'SOLD' : `${entry.price}g`}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {phase === 'dead' && (
        <div className={styles.overlay}>
          <div className={styles.title}>YOU DIED</div>
          <div className={styles.subtitle}>
            Floor {p.floor} · {p.kills} kills · {p.gold} gold<br />
            Souls collected added to your forge.
          </div>
          <button className={styles.btn} onClick={() => { phaseRef.current = 'title'; setPhase('title') }}>To the Forge</button>
        </div>
      )}

      {phase === 'won' && (
        <div className={styles.overlay}>
          <div className={styles.title}>THE DEMON LORD FALLS</div>
          <div className={styles.subtitle}>
            You emerge victorious. Floor {p.floor} · {p.kills} kills · {p.gold} gold<br />
            +500 bonus souls for clearing the dungeon.
          </div>
          <button className={styles.btn} onClick={() => { phaseRef.current = 'title'; setPhase('title') }}>To the Forge</button>
        </div>
      )}
    </div>
  )
}
