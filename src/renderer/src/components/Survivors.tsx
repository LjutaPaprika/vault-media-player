import { useEffect, useRef, useState } from 'react'
import styles from './Survivors.module.css'

const W = 720, H = 480, SAVE_KEY = 'survivorsBest'

// ─── Map Definitions ─────────────────────────────────────────────────────────

type MapId = 'void' | 'ruins' | 'frost' | 'inferno' | 'maze'
interface Obstacle { x: number; y: number; w: number; h: number; kind: string }
interface MazeGrid { cols: number; rows: number; cell: number; ox: number; oy: number; wH: boolean[][]; wV: boolean[][] }
interface MapDef {
  id: MapId; name: string; desc: string
  worldW: number; worldH: number; enemyCap: number
  bgColor: string; gridColor: string
  obstacles: Obstacle[]
  spawnX?: number; spawnY?: number
  mazeGrid?: MazeGrid
  enemyFilter?: (kind: EnemyKind, t: number) => boolean
  hazards?: { x: number; y: number; radius: number; dps: number; kind: string }[]
}

function generateObstacles(mapId: MapId): Obstacle[] {
  const obs: Obstacle[] = []
  if (mapId === 'ruins') {
    const rng = (min: number, max: number) => min + Math.random() * (max - min)
    for (let i = 0; i < 35; i++) {
      const w = rng(30, 80), h = rng(30, 80)
      obs.push({ x: rng(200, 3800 - w), y: rng(200, 3800 - h), w, h, kind: 'stone' })
    }
    for (let i = 0; i < 12; i++) {
      const w = rng(120, 250), h = 20
      obs.push({ x: rng(300, 3500), y: rng(300, 3500), w, h, kind: 'wall' })
    }
  } else if (mapId === 'frost') {
    const rng = (min: number, max: number) => min + Math.random() * (max - min)
    for (let i = 0; i < 20; i++) {
      const w = rng(40, 100), h = rng(40, 100)
      obs.push({ x: rng(200, 3800 - w), y: rng(200, 3800 - h), w, h, kind: 'ice' })
    }
  } else if (mapId === 'inferno') {
    const rng = (min: number, max: number) => min + Math.random() * (max - min)
    for (let i = 0; i < 25; i++) {
      const w = rng(30, 70), h = rng(30, 70)
      obs.push({ x: rng(200, 3800 - w), y: rng(200, 3800 - h), w, h, kind: 'rock' })
    }
  }
  return obs
}

function generateMaze(): { obs: Obstacle[]; grid: MazeGrid } {
  const CELL = 260, POST = 20, CORR = CELL - POST
  const cols = 14, rows = 14
  const ox = (4000 - cols * CELL) / 2, oy = (4000 - rows * CELL) / 2
  const visited: boolean[][] = Array.from({ length: rows }, () => Array(cols).fill(false))
  const wH = Array.from({ length: rows + 1 }, () => Array(cols).fill(true))
  const wV = Array.from({ length: rows }, () => Array(cols + 1).fill(true))
  const stack: [number, number][] = []
  const sr = Math.floor(rows / 2), sc = Math.floor(cols / 2)
  visited[sr][sc] = true; stack.push([sr, sc])
  while (stack.length > 0) {
    const [r, c] = stack[stack.length - 1]
    const nb: [number, number, boolean, number, number][] = []
    if (r > 0 && !visited[r - 1][c]) nb.push([r - 1, c, true, r, c])
    if (r < rows - 1 && !visited[r + 1][c]) nb.push([r + 1, c, true, r + 1, c])
    if (c > 0 && !visited[r][c - 1]) nb.push([r, c - 1, false, r, c])
    if (c < cols - 1 && !visited[r][c + 1]) nb.push([r, c + 1, false, r, c + 1])
    if (nb.length === 0) { stack.pop(); continue }
    const [nr, nc, isH, wr, wc] = nb[Math.floor(Math.random() * nb.length)]
    if (isH) wH[wr][wc] = false; else wV[wr][wc] = false
    visited[nr][nc] = true; stack.push([nr, nc])
  }
  for (let i = 0; i < Math.floor(cols * rows * 0.15); i++) {
    const r = Math.floor(Math.random() * rows), c = Math.floor(Math.random() * cols)
    if (Math.random() < 0.5 && r > 0) wH[r][c] = false
    else if (c > 0) wV[r][c] = false
  }
  const obs: Obstacle[] = []
  for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
    obs.push({ x: ox + c * CELL - POST / 2, y: oy + r * CELL - POST / 2, w: POST, h: POST, kind: 'mazeWall' })
  }
  for (let r = 0; r <= rows; r++) for (let c = 0; c < cols; c++) {
    if (wH[r][c]) obs.push({ x: ox + c * CELL + POST / 2, y: oy + r * CELL - POST / 2, w: CORR, h: POST, kind: 'mazeWall' })
  }
  for (let r = 0; r < rows; r++) for (let c = 0; c <= cols; c++) {
    if (wV[r][c]) obs.push({ x: ox + c * CELL - POST / 2, y: oy + r * CELL + POST / 2, w: POST, h: CORR, kind: 'mazeWall' })
  }
  return { obs, grid: { cols, rows, cell: CELL, ox, oy, wH, wV } }
}

function generateHazards(mapId: MapId): MapDef['hazards'] {
  if (mapId === 'inferno') {
    const hazards: NonNullable<MapDef['hazards']> = []
    for (let i = 0; i < 15; i++) {
      hazards.push({ x: 300 + Math.random() * 3400, y: 300 + Math.random() * 3400, radius: 40 + Math.random() * 30, dps: 8, kind: 'lava' })
    }
    return hazards
  }
  if (mapId === 'frost') {
    const hazards: NonNullable<MapDef['hazards']> = []
    for (let i = 0; i < 10; i++) {
      hazards.push({ x: 300 + Math.random() * 3400, y: 300 + Math.random() * 3400, radius: 50 + Math.random() * 40, dps: 0, kind: 'icePool' })
    }
    return hazards
  }
  return []
}

const MAP_DEFS: Record<MapId, { name: string; desc: string; worldW: number; worldH: number; enemyCap: number; bgColor: string; gridColor: string }> = {
  void: { name: 'The Void', desc: 'Open arena. No obstacles, no mercy.', worldW: 4000, worldH: 4000, enemyCap: 260, bgColor: '#02040a', gridColor: 'rgba(56, 189, 248, 0.06)' },
  ruins: { name: 'Ancient Ruins', desc: 'Stone walls and pillars. Funnel enemies through chokepoints.', worldW: 4000, worldH: 4000, enemyCap: 220, bgColor: '#0a0806', gridColor: 'rgba(180, 140, 80, 0.06)' },
  frost: { name: 'Frozen Wastes', desc: 'Ice patches make you slide. Cold-resistant enemies.', worldW: 4000, worldH: 4000, enemyCap: 240, bgColor: '#040810', gridColor: 'rgba(103, 232, 249, 0.06)' },
  inferno: { name: 'Inferno Pit', desc: 'Lava pools deal damage. Fire enemies are immune to burn.', worldW: 4000, worldH: 4000, enemyCap: 280, bgColor: '#0c0402', gridColor: 'rgba(251, 146, 60, 0.06)' },
  maze: { name: 'The Maze', desc: 'Winding corridors. Nowhere to hide. Superhard.', worldW: 4000, worldH: 4000, enemyCap: 260, bgColor: '#080808', gridColor: 'rgba(160, 160, 160, 0.04)' },
}

function lineHitsObs(x1: number, y1: number, x2: number, y2: number, obstacles: Obstacle[]): boolean {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy)
  if (len < 1) return false
  const steps = Math.ceil(len / 20)
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, px = x1 + dx * t, py = y1 + dy * t
    for (const ob of obstacles) {
      if (px >= ob.x && px <= ob.x + ob.w && py >= ob.y && py <= ob.y + ob.h) return true
    }
  }
  return false
}

function buildMap(id: MapId): MapDef {
  const def = MAP_DEFS[id]
  const m: MapDef = { id, ...def, obstacles: generateObstacles(id), hazards: generateHazards(id) }
  if (id === 'maze') {
    const maze = generateMaze()
    m.obstacles = maze.obs
    m.mazeGrid = maze.grid
    const g = maze.grid
    m.spawnX = g.ox + Math.floor(g.cols / 2) * g.cell + g.cell / 2
    m.spawnY = g.oy + Math.floor(g.rows / 2) * g.cell + g.cell / 2
  }
  return m
}

// ─── Tree & Combo Definitions ─────────────────────────────────────────────────

type TreeCat = 'weaponMod' | 'element' | 'passive' | 'special'
type WeaponId = 'bolt' | 'shotgun' | 'railgun' | 'bomb' | 'whip' | 'boomerang' | 'orb' | 'drone'

interface TreeDef { id: string; name: string; cat: TreeCat; t: [string, string, string] }
interface ComboDef { name: string; needs: [string, number][]; desc: string; cat: string }

const TREES: TreeDef[] = [
  { id: 'rapidFire', name: 'Rapid Fire', cat: 'weaponMod', t: ['Fire 10% faster.', 'Fire 15% faster. Every 5th shot fires a double.', 'Fire 20% faster on top.'] },
  { id: 'powerShot', name: 'Power Shot', cat: 'weaponMod', t: ['Attack damage +15%.', 'Attack size/reach +20%. Damage +10% more.', 'Attacks explode on hit (30px blast, 40% dmg).'] },
  { id: 'piercing', name: 'Piercing', cat: 'weaponMod', t: ['Attacks pass through 1 extra enemy.', 'Hit enemies take +30% from your next attack.', 'Infinite pierce. Each enemy hit adds +5% dmg.'] },
  { id: 'splitShot', name: 'Split Shot', cat: 'weaponMod', t: ['Hits spawn 2 projectiles that fly outward.', 'Split projectiles pierce 1 enemy.', 'Split projectiles also split on hit (50% dmg).'] },
  { id: 'spreadMod', name: 'Spread', cat: 'weaponMod', t: ['+2 extra projectiles (wider arc for melee).', 'Also attack behind you (rear guard).', 'Extras orbit you briefly. Whip spawns spinning blades.'] },
  { id: 'ricochet', name: 'Ricochet', cat: 'weaponMod', t: ['Hits bounce a projectile to 1 nearby enemy (50%).', 'Bounce to 2 enemies. Bounce damage up to 80%.', 'All bounced projectiles home toward the nearest enemy.'] },
  { id: 'pyromancy', name: 'Pyromancy', cat: 'element', t: ['Hits ignite: 4 damage/sec for 3 seconds.', 'Burning enemies explode on death (50px fire burst).', 'Burn spreads to enemies within 60px of a burning target.'] },
  { id: 'cryomancy', name: 'Cryomancy', cat: 'element', t: ['Hits slow enemies 40% for 1.2 seconds.', 'Enemies slowed 3s+ freeze solid. Frozen take +50% dmg.', 'Frozen enemies shatter on death (80px ice burst).'] },
  { id: 'thunder', name: 'Thunder', cat: 'element', t: ['Hits have 30% chance to arc to a 2nd enemy.', 'Chain arcs stun for 0.3s. Arc chance +20%.', 'Every 10th chain triggers a 120px lightning storm.'] },
  { id: 'gale', name: 'Gale', cat: 'element', t: ['Hits spawn a small tornado that drifts outward, pushing enemies aside.', 'Tornados last longer and are larger.', 'Wind vortex spawns every 6s at the densest enemy cluster.'] },
  { id: 'venom', name: 'Venom', cat: 'element', t: ['Hits apply venom: 2 dps, stacks up to 5x, 4s each.', 'Venomed enemies deal 20% less. Venom spreads on death.', 'At 5 stacks: corroded. Takes +25% dmg from all sources.'] },
  { id: 'vitality', name: 'Vitality', cat: 'passive', t: ['+20 max HP. Heal 20 HP now.', 'Regenerate 0.8 HP per second.', 'Life steal: gain 5% of damage dealt as healing.'] },
  { id: 'armor', name: 'Armor', cat: 'passive', t: ['All damage taken reduced by 2.', 'Reflect 25% of blocked damage back to attacker.', 'Rage: +30% damage for 2s whenever you take a hit.'] },
  { id: 'speed', name: 'Speed', cat: 'passive', t: ['Move 15% faster.', 'Move 10% faster. +20% dmg for 1s after direction change.', 'Dash: double-tap to dash 80px. 3s cooldown. Invulnerable.'] },
  { id: 'magnetism', name: 'Magnetism', cat: 'passive', t: ['XP pickup range +40px (120 to 160).', 'Pickup range +50px more (to 210).', 'Pickup range +70px more (to 280). All XP gains +10%.'] },
  { id: 'haste', name: 'Haste', cat: 'passive', t: ['Ability cooldowns (aura, nova, vortex) tick 15% faster.', 'Ability cooldowns tick 10% faster. 15% chance to fire twice.', 'After 1s idle, next shot fires a 3-round burst.'] },
  { id: 'shrapnel', name: 'Shrapnel', cat: 'special', t: ['Enemies burst into 4 damage shards on death.', '+4 more shards (8 total). Shards pierce 1 enemy.', 'Shards apply your elemental effects on hit.'] },
  { id: 'hexAura', name: 'Hex Aura', cat: 'special', t: ['Pulse damages nearby enemies (90px) every 0.6s.', 'Aura range +40% (126px). Pulse damage +50%.', 'Enemies inside the aura are slowed 25%.'] },
  { id: 'pulseNova', name: 'Pulse Nova', cat: 'special', t: ['Shockwave every 8s damages all within 220px.', 'Shockwave pushes enemies back. Interval reduced to 5s.', 'Shockwave leaves a damage zone that persists 3 seconds.'] },
]
const TREE_MAP = new Map(TREES.map(t => [t.id, t]))

const COMBOS: ComboDef[] = [
  { name: 'Frostfire', needs: [['pyromancy', 1], ['cryomancy', 1]], desc: 'Burning+slowed = 2× burn', cat: 'Elem' },
  { name: 'Superconductor', needs: [['thunder', 1], ['cryomancy', 1]], desc: 'Chain +50% to slowed', cat: 'Elem' },
  { name: 'Firestorm', needs: [['pyromancy', 2], ['thunder', 2]], desc: 'Death blasts trigger lightning', cat: 'Elem' },
  { name: 'Tempest', needs: [['gale', 1], ['thunder', 1]], desc: '40% lightning on tornado hit', cat: 'Elem' },
  { name: 'Blizzard', needs: [['gale', 1], ['cryomancy', 1]], desc: 'Tornados slow enemies', cat: 'Elem' },
  { name: 'Wildfire', needs: [['gale', 1], ['pyromancy', 1]], desc: 'Hit burning = fire trail', cat: 'Elem' },
  { name: 'Toxic Fumes', needs: [['venom', 1], ['pyromancy', 1]], desc: 'Burn+venom = cloud on death', cat: 'Elem' },
  { name: 'Numb', needs: [['venom', 1], ['cryomancy', 1]], desc: '2× venom dmg while frozen', cat: 'Elem' },
  { name: 'Spore Cloud', needs: [['venom', 1], ['gale', 1]], desc: 'Tornado on venomed = spore line', cat: 'Elem' },
  { name: 'Permafrost', needs: [['cryomancy', 1], ['haste', 1]], desc: 'Slow duration doubled', cat: 'Mix' },
  { name: 'Overcharge', needs: [['thunder', 1], ['powerShot', 1]], desc: 'Chain = 100% dmg', cat: 'Mix' },
  { name: 'Shatter Shots', needs: [['cryomancy', 2], ['piercing', 1]], desc: 'Pierce frozen = shatter', cat: 'Mix' },
  { name: 'Burning Trail', needs: [['pyromancy', 1], ['speed', 1]], desc: 'Fire trail while moving', cat: 'Mix' },
  { name: 'Gust Volley', needs: [['gale', 1], ['spreadMod', 1]], desc: 'Rear shots spawn tornados', cat: 'Mix' },
  { name: 'Virulence', needs: [['venom', 1], ['haste', 1]], desc: 'Venom duration doubled', cat: 'Mix' },
  { name: 'Toxic Barrage', needs: [['venom', 2], ['rapidFire', 2]], desc: 'Double-fire = 2 stacks', cat: 'Mix' },
  { name: 'Burning Shrapnel', needs: [['pyromancy', 1], ['shrapnel', 1]], desc: 'Shards ignite', cat: 'Special' },
  { name: 'Storm Burst', needs: [['thunder', 1], ['shrapnel', 1]], desc: 'Shards arc to extra', cat: 'Special' },
  { name: 'Glacial Nova', needs: [['cryomancy', 1], ['pulseNova', 1]], desc: 'Nova freezes 1s', cat: 'Special' },
  { name: 'Inferno', needs: [['pyromancy', 1], ['hexAura', 1]], desc: 'Aura burns 8 dps', cat: 'Special' },
  { name: 'Static Field', needs: [['thunder', 2], ['hexAura', 1]], desc: 'Aura 20% chain/tick', cat: 'Special' },
  { name: 'Plague Shards', needs: [['venom', 1], ['shrapnel', 1]], desc: 'Shards apply 2 venom', cat: 'Special' },
  { name: 'Miasma', needs: [['venom', 1], ['hexAura', 1]], desc: 'Aura applies venom', cat: 'Special' },
  { name: 'Cyclone', needs: [['gale', 1], ['pulseNova', 1]], desc: 'Nova push 3×', cat: 'Special' },
  { name: 'Gale Aura', needs: [['gale', 1], ['hexAura', 1]], desc: 'Aura repels enemies', cat: 'Special' },
  { name: 'Glass Cannon', needs: [['powerShot', 2], ['rapidFire', 1]], desc: '+30% dmg, -20% HP', cat: 'Mod' },
  { name: 'Bullet Storm', needs: [['spreadMod', 1], ['piercing', 1]], desc: 'All proj +1 pierce', cat: 'Mod' },
  { name: 'Shrapnel Rain', needs: [['splitShot', 1], ['ricochet', 1]], desc: 'Splits also bounce', cat: 'Mod' },
  { name: 'Sniper', needs: [['powerShot', 1], ['piercing', 2]], desc: 'First pierced = 2× dmg', cat: 'Mod' },
  { name: 'Juggernaut', needs: [['armor', 2], ['vitality', 2]], desc: 'Reflect heals 50%', cat: 'Passive' },
  { name: 'Overclock', needs: [['haste', 2], ['magnetism', 3]], desc: 'Double-fire → 25%', cat: 'Passive' },
  { name: 'Momentum', needs: [['speed', 2], ['armor', 1]], desc: 'Dodge dmg → +40%', cat: 'Passive' },
  { name: 'Sustain', needs: [['vitality', 3], ['speed', 1]], desc: 'Life steal 2× moving', cat: 'Passive' },
  { name: 'Chain Reaction', needs: [['pyromancy', 2], ['shrapnel', 2], ['thunder', 1]], desc: 'Death blasts chain lightning', cat: 'Advanced' },
  { name: 'Absolute Zero', needs: [['cryomancy', 3], ['pulseNova', 1], ['haste', 1]], desc: 'Shatter re-freezes nearby', cat: 'Advanced' },
  { name: 'Gun Mastery', needs: [['powerShot', 1], ['rapidFire', 1], ['piercing', 1]], desc: '+15% dmg/rate, +1 pierce', cat: 'Advanced' },
  { name: 'Plague Engine', needs: [['venom', 3], ['shrapnel', 3], ['hexAura', 1]], desc: 'Corroded death = 3 stacks', cat: 'Advanced' },
  { name: 'Eye of the Storm', needs: [['gale', 3], ['thunder', 3], ['pulseNova', 1]], desc: 'Vortex + persistent storm', cat: 'Advanced' },
]

const WEAPON_INFO: Record<WeaponId, { name: string; desc: string }> = {
  bolt: { name: 'Magic Bolt', desc: 'Fast single projectile. Low cooldown, good all-rounder.' },
  shotgun: { name: 'Shotgun', desc: 'Burst of 5 pellets in a tight cone. High burst, short range.' },
  railgun: { name: 'Railgun', desc: 'Instant beam that hits all enemies in a line. Slow fire rate.' },
  bomb: { name: 'Bomb', desc: 'Lobbed grenade that explodes in a large radius.' },
  whip: { name: 'Whips', desc: 'Melee arc — hits all enemies in front. Very fast, no projectile.' },
  boomerang: { name: 'Boomerang', desc: 'Curved throw that returns to you. Hits enemies both ways.' },
  orb: { name: 'Orb', desc: 'Slow-moving sphere that lingers and damages enemies it passes through.' },
  drone: { name: 'Drone', desc: 'Auto-targets nearest enemy. Fires on its own — no aiming needed.' },
}

// ─── Weapon scaling ───────────────────────────────────────────────────────────

function wCD(id: WeaponId, lv: number): number {
  if (id === 'bolt')      return Math.max(0.12, 0.30 - (lv - 1) * 0.04)
  if (id === 'shotgun')   return Math.max(0.30, 0.55 - (lv - 1) * 0.05)
  if (id === 'railgun')   return Math.max(0.60, 1.20 - (lv - 1) * 0.12)
  if (id === 'bomb')      return Math.max(0.70, 1.30 - (lv - 1) * 0.12)
  if (id === 'whip')      return Math.max(0.15, 0.30 - (lv - 1) * 0.03)
  if (id === 'boomerang') return Math.max(0.40, 0.70 - (lv - 1) * 0.06)
  if (id === 'orb')       return Math.max(0.80, 1.40 - (lv - 1) * 0.12)
  if (id === 'drone')     return Math.max(0.30, 0.60 - (lv - 1) * 0.06)
  return 0.5
}
function wDmg(id: WeaponId, lv: number): number {
  if (id === 'bolt')      return 12 + (lv - 1) * 6
  if (id === 'shotgun')   return 6 + (lv - 1) * 3
  if (id === 'railgun')   return 35 + (lv - 1) * 18
  if (id === 'bomb')      return 30 + (lv - 1) * 14
  if (id === 'whip')      return 14 + (lv - 1) * 7
  if (id === 'boomerang') return 10 + (lv - 1) * 5
  if (id === 'orb')       return 8 + (lv - 1) * 4
  if (id === 'drone')     return 10 + (lv - 1) * 4
  return 10
}
function shotgunN(lv: number) { return 5 + Math.floor((lv - 1) / 2) }
function bombRad(lv: number) { return 80 + (lv - 1) * 10 }
function whipReach(lv: number) { return 80 + lv * 10 }
function orbLife(lv: number) { return 2.5 + lv * 0.3 }
function xpToNext(lv: number) { return 8 + lv * 7 + Math.floor(lv * lv * 1.4) }

// ─── Interfaces ───────────────────────────────────────────────────────────────

type EnemyKind = 'zombie' | 'bat' | 'skeleton' | 'wraith' | 'shooter' | 'swarmer' | 'tank' | 'shielded' | 'boss'

interface Player {
  x: number; y: number; hp: number; maxHp: number; speed: number
  facing: number; aimX: number; aimY: number; isAiming: boolean
  xp: number; level: number; invul: number; weaponIdx: number
  trees: Record<string, number>
  // Computed stats
  damageMult: number; cooldownMult: number; armorVal: number; regenRate: number
  pickupRange: number; xpMult: number; bulletSize: number
  // Timers
  auraT: number; novaT: number; galeVortexT: number
  rageBuff: number; dodgeBuff: number; dashCD: number
  shotCount: number; idleTimer: number; chainCount: number
  lastDirX: number; lastDirY: number
}

interface Enemy {
  x: number; y: number; hp: number; maxHp: number
  speed: number; dmg: number; radius: number; kind: EnemyKind
  hitTimer: number
  burn: number; burnDps: number
  slow: number; frozen: number; stunned: number
  venomStacks: number; venomTimer: number; corroded: boolean
  shootCD: number; shieldAng: number
}

interface Projectile {
  x: number; y: number; vx: number; vy: number; life: number
  dmg: number; radius: number; kind: string
  pierce: number; hitIds: Set<number>
  trail: { x: number; y: number; life: number }[]
  gen: number; bounces: number; isRear: boolean; isHoming: boolean
  pierceCount: number
  orbitT: number; orbitCX: number; orbitCY: number
  returning: boolean; originX: number; originY: number
  orbDmgTimer: number
}

interface Bomb { x: number; y: number; vx: number; vy: number; life: number; fuse: number; dmg: number; radius: number }
interface Explosion { x: number; y: number; radius: number; life: number; maxLife: number; dmg: number; hitIds: Set<number> }
interface EnemyBullet { x: number; y: number; vx: number; vy: number; life: number; dmg: number }
interface Gem { x: number; y: number; value: number }
interface DmgText { x: number; y: number; vy: number; life: number; text: string; color: string }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; color: string; size: number }
interface Zone { x: number; y: number; life: number; radius: number; dps: number; kind: string }
interface Tornado { x: number; y: number; vx: number; vy: number; life: number; maxLife: number; radius: number; dmg: number; spin: number }
interface WhipSlash { x: number; y: number; ang: number; arc: number; reach: number; life: number; maxLife: number }

type Weapon = { id: WeaponId; level: number; cooldown: number }
type Phase = 'menu' | 'select' | 'playing' | 'paused' | 'dead' | 'won' | 'bossreward'
type UpgradeOption = { kind: 'weaponLevel'; weaponId: WeaponId; nextLevel: number }
  | { kind: 'tree'; treeId: string; nextTier: number }

// ─── Enemy stats ──────────────────────────────────────────────────────────────

const E_STATS: Record<EnemyKind, { hp: number; spd: number; dmg: number; r: number }> = {
  zombie:   { hp: 20, spd: 50, dmg: 6, r: 14 },
  bat:      { hp: 9,  spd: 108, dmg: 4, r: 9 },
  skeleton: { hp: 24, spd: 64, dmg: 8, r: 13 },
  wraith:   { hp: 18, spd: 92, dmg: 9, r: 11 },
  shooter:  { hp: 16, spd: 55, dmg: 5, r: 12 },
  swarmer:  { hp: 6,  spd: 130, dmg: 3, r: 7 },
  tank:     { hp: 60, spd: 32, dmg: 12, r: 18 },
  shielded: { hp: 30, spd: 56, dmg: 7, r: 14 },
  boss:     { hp: 420, spd: 58, dmg: 14, r: 26 },
}

let enemyUid = 1
function nextId() { return enemyUid++ }

function makeEnemy(t: number, x: number, y: number): Enemy {
  // HP curve: gentle early, steep mid, exponential late
  const hpMul = 1 + t / 80 + (t > 300 ? (t - 300) / 50 : 0) + (t > 600 ? (t - 600) / 20 : 0) + (t > 900 ? ((t - 900) / 10) ** 1.5 : 0)
  const dmgMul = 1 + t / 200 + (t > 600 ? (t - 600) / 120 : 0)
  const spdMul = 1 + Math.min(0.5, t / 800)
  const r = Math.random()
  let kind: EnemyKind
  if (t > 300 && r < 0.10) kind = 'tank'
  else if (t > 240 && r < 0.20) kind = 'shielded'
  else if (t > 180 && r < 0.30) kind = 'shooter'
  else if (t > 120 && r < 0.42) kind = 'wraith'
  else if (t > 60 && r < 0.52) kind = 'skeleton'
  else if (r < 0.35) kind = 'swarmer'
  else if (r < 0.65) kind = 'bat'
  else kind = 'zombie'
  const s = E_STATS[kind]
  // Elite/champion variants after 10+ minutes
  const isElite = t > 600 && Math.random() < Math.min(0.35, (t - 600) / 600)
  const isChampion = t > 900 && Math.random() < Math.min(0.2, (t - 900) / 800)
  const tierMul = isChampion ? 2.5 : isElite ? 1.6 : 1
  const hp = s.hp * hpMul * tierMul
  return { x, y, hp, maxHp: hp, speed: s.spd * spdMul * (isChampion ? 1.2 : isElite ? 1.1 : 1), dmg: Math.ceil(s.dmg * dmgMul * (isChampion ? 1.5 : isElite ? 1.2 : 1)), radius: s.r * (isChampion ? 1.3 : isElite ? 1.1 : 1), kind, hitTimer: 0, burn: 0, burnDps: 0, slow: 0, frozen: 0, stunned: 0, venomStacks: 0, venomTimer: 0, corroded: false, shootCD: 2 + Math.random(), shieldAng: 0 }
}

function makeBoss(t: number, x: number, y: number): Enemy {
  const hpMul = 1 + Math.floor(t / 90)
  const s = E_STATS.boss
  return { x, y, hp: s.hp * hpMul, maxHp: s.hp * hpMul, speed: s.spd, dmg: Math.ceil(s.dmg * (1 + t / 300)), radius: s.r, kind: 'boss', hitTimer: 0, burn: 0, burnDps: 0, slow: 0, frozen: 0, stunned: 0, venomStacks: 0, venomTimer: 0, corroded: false, shootCD: 0, shieldAng: 0 }
}

function makeStars() {
  const out: { x: number; y: number; speed: number; size: number }[] = []
  for (let i = 0; i < 70; i++) out.push({ x: Math.random() * W, y: Math.random() * H, speed: 0.2 + Math.random() * 0.6, size: Math.random() < 0.7 ? 1 : 2 })
  return out
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function Survivors(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const mapRef = useRef<MapDef>(buildMap('void'))
  const playerRef = useRef<Player>(null as unknown as Player)
  const weaponsRef = useRef<Weapon[]>([])
  const enemiesRef = useRef<Enemy[]>([])
  const enemyIdsRef = useRef<WeakMap<Enemy, number>>(new WeakMap())
  const projsRef = useRef<Projectile[]>([])
  const bombsRef = useRef<Bomb[]>([])
  const explosionsRef = useRef<Explosion[]>([])
  const eBulletsRef = useRef<EnemyBullet[]>([])
  const gemsRef = useRef<Gem[]>([])
  const dmgTextsRef = useRef<DmgText[]>([])
  const particlesRef = useRef<Particle[]>([])
  const zonesRef = useRef<Zone[]>([])
  const tornadosRef = useRef<Tornado[]>([])
  const whipSlashesRef = useRef<WhipSlash[]>([])
  const starsRef = useRef(makeStars())
  const flowFieldRef = useRef<{ dx: number; dy: number }[][] | null>(null)
  const flowTimerRef = useRef(0)
  const [darkMode, setDarkMode] = useState(false)
  const darkModeRef = useRef(false)
  const shakeRef = useRef(0)
  const timeRef = useRef(0)
  const lastBossRef = useRef(0)
  const spawnTimerRef = useRef(0)
  const killsRef = useRef(0)
  const lastFrameRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const phaseRef = useRef<Phase>('menu')
  const showCombosRef = useRef(false)
  const inputRef = useRef({ up: false, down: false, left: false, right: false, aimUp: false, aimDown: false, aimLeft: false, aimRight: false })
  const mouseRef = useRef({ x: W / 2, y: H / 2, down: false, inCanvas: false })
  const [hudTick, setHudTick] = useState(0)
  const [best, setBest] = useState({ time: 0, kills: 0 })
  const [phase, setPhase] = useState<Phase>('menu')
  const [upgradeChoices, setUpgradeChoices] = useState<UpgradeOption[] | null>(null)
  const upgradeChoicesRef = useRef<UpgradeOption[] | null>(null)
  const [chosenWeapon, setChosenWeapon] = useState<WeaponId | null>(null)
  const [showCombos, setShowCombos] = useState(false)

  function initPlayer(): Player {
    const m = mapRef.current
    const sx = m.spawnX ?? m.worldW / 2, sy = m.spawnY ?? m.worldH / 2
    return { x: sx, y: sy, hp: 60, maxHp: 60, speed: 160, facing: 0, aimX: 1, aimY: 0, isAiming: false, xp: 0, level: 1, invul: 0, weaponIdx: 0, trees: {}, damageMult: 1, cooldownMult: 1, armorVal: 0, regenRate: 0, pickupRange: 90, xpMult: 1, bulletSize: 1, auraT: 0, novaT: 0, galeVortexT: 0, rageBuff: 0, dodgeBuff: 0, dashCD: 0, shotCount: 0, idleTimer: 0, chainCount: 0, lastDirX: 0, lastDirY: 0 }
  }
  if (!playerRef.current) playerRef.current = initPlayer()

  useEffect(() => { window.api.settings.get(SAVE_KEY, '{}').then(v => { try { const d = JSON.parse(v); setBest({ time: d.time ?? 0, kills: d.kills ?? 0 }) } catch {} }) }, [])

  function setChoices(c: UpgradeOption[] | null) { upgradeChoicesRef.current = c; setUpgradeChoices(c) }
  function tr(id: string): number { return playerRef.current.trees[id] ?? 0 }
  function hasC(name: string): boolean { const c = COMBOS.find(x => x.name === name); return c ? c.needs.every(([id, t]) => tr(id) >= t) : false }

  function getId(e: Enemy) { let id = enemyIdsRef.current.get(e); if (id === undefined) { id = nextId(); enemyIdsRef.current.set(e, id) } return id }

  function reset() {
    playerRef.current = initPlayer(); weaponsRef.current = []; enemiesRef.current = []; projsRef.current = []; bombsRef.current = []; explosionsRef.current = []; eBulletsRef.current = []; gemsRef.current = []; dmgTextsRef.current = []; particlesRef.current = []; zonesRef.current = []; tornadosRef.current = []; whipSlashesRef.current = []
    timeRef.current = 0; lastBossRef.current = 0; spawnTimerRef.current = 0; killsRef.current = 0; shakeRef.current = 0
    phaseRef.current = 'menu'; setChoices(null); setChosenWeapon(null); setPhase('menu'); setHudTick(t => t + 1)
  }

  function selectMap(id: MapId) {
    mapRef.current = buildMap(id)
    playerRef.current = initPlayer()
    phaseRef.current = 'select'; setPhase('select'); setHudTick(t => t + 1)
  }

  function startRun(weapon: WeaponId) {
    playerRef.current = initPlayer(); weaponsRef.current = [{ id: weapon, level: 1, cooldown: 0 }]
    enemiesRef.current = []; projsRef.current = []; bombsRef.current = []; explosionsRef.current = []; eBulletsRef.current = []; gemsRef.current = []; dmgTextsRef.current = []; particlesRef.current = []; zonesRef.current = []; tornadosRef.current = []; whipSlashesRef.current = []
    timeRef.current = 0; lastBossRef.current = 0; spawnTimerRef.current = 0; killsRef.current = 0; shakeRef.current = 0
    setChosenWeapon(weapon); setChoices(null); phaseRef.current = 'playing'; setPhase('playing'); setHudTick(t => t + 1)
    canvasRef.current?.focus()
  }

  // ─── Input ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    function onDown(e: KeyboardEvent) {
      const ae = document.activeElement
      if (!ae || (!ae.closest(`.${styles.body}`) && ae !== canvasRef.current)) return
      const k = e.key.toLowerCase()
      const ph = phaseRef.current
      const isNav = k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright' || k === 'w' || k === 'a' || k === 's' || k === 'd'
      if (isNav || k === ' ' || k === 'enter') { e.preventDefault(); e.stopPropagation() }
      // Upgrade selection: 1/2/3 keys
      if ((ph === 'paused' || ph === 'bossreward') && upgradeChoicesRef.current) {
        if (/^[1-3]$/.test(k)) { const idx = parseInt(k, 10) - 1; const opt = upgradeChoicesRef.current[idx]; if (opt) applyUpgrade(opt) }
        return
      }
      // Combos dismiss
      if (showCombosRef.current && (k === ' ' || k === 'enter' || k === 'escape')) {
        showCombosRef.current = false; setShowCombos(false); setTimeout(() => canvasRef.current?.focus(), 10); return
      }
      // Dead/won: space/enter to retry
      if ((ph === 'dead' || ph === 'won') && (k === ' ' || k === 'enter')) { reset(); return }
      // Playing: update input state
      if (ph === 'playing') {
        if (k === 'w') inputRef.current.up = true
        else if (k === 's') inputRef.current.down = true
        else if (k === 'a') inputRef.current.left = true
        else if (k === 'd') inputRef.current.right = true
        else if (k === 'arrowup') inputRef.current.aimUp = true
        else if (k === 'arrowdown') inputRef.current.aimDown = true
        else if (k === 'arrowleft') inputRef.current.aimLeft = true
        else if (k === 'arrowright') inputRef.current.aimRight = true
      }
    }
    function onUp(e: KeyboardEvent) {
      const ae = document.activeElement
      if (!ae || (!ae.closest(`.${styles.body}`) && ae !== canvasRef.current)) return
      const k = e.key.toLowerCase()
      if (k === 'arrowup' || k === 'arrowdown' || k === 'arrowleft' || k === 'arrowright' || k === 'w' || k === 'a' || k === 's' || k === 'd') { e.preventDefault(); e.stopPropagation() }
      if (k === 'w') inputRef.current.up = false
      else if (k === 's') inputRef.current.down = false
      else if (k === 'a') inputRef.current.left = false
      else if (k === 'd') inputRef.current.right = false
      else if (k === 'arrowup') inputRef.current.aimUp = false
      else if (k === 'arrowdown') inputRef.current.aimDown = false
      else if (k === 'arrowleft') inputRef.current.aimLeft = false
      else if (k === 'arrowright') inputRef.current.aimRight = false
    }
    window.addEventListener('keydown', onDown, true)
    window.addEventListener('keyup', onUp, true)
    return () => { window.removeEventListener('keydown', onDown, true); window.removeEventListener('keyup', onUp, true) }
  }, [])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    function onMouseMove(e: MouseEvent) {
      const rect = canvasRef.current?.getBoundingClientRect()
      if (!rect) return
      mouseRef.current.x = e.clientX - rect.left
      mouseRef.current.y = e.clientY - rect.top
    }
    function onMouseDown(e: MouseEvent) { if (e.button === 0) { mouseRef.current.down = true; e.preventDefault() } }
    function onMouseUp(e: MouseEvent) { if (e.button === 0) mouseRef.current.down = false }
    function onEnter() { mouseRef.current.inCanvas = true }
    function onLeave() { mouseRef.current.inCanvas = false; mouseRef.current.down = false }
    c.addEventListener('mousemove', onMouseMove)
    c.addEventListener('mousedown', onMouseDown)
    c.addEventListener('mouseup', onMouseUp)
    c.addEventListener('mouseenter', onEnter)
    c.addEventListener('mouseleave', onLeave)
    return () => { c.removeEventListener('mousemove', onMouseMove); c.removeEventListener('mousedown', onMouseDown); c.removeEventListener('mouseup', onMouseUp); c.removeEventListener('mouseenter', onEnter); c.removeEventListener('mouseleave', onLeave) }
  }, [])

  const crashLogRef = useRef<string | null>(null)
  const [crashLog, setCrashLog] = useState<string | null>(null)
  const perfLogRef = useRef({ frames: 0, slowFrames: 0, lastLog: 0 })

  useEffect(() => {
    lastFrameRef.current = performance.now()
    const loop = (t: number) => {
      const dt = Math.min(0.04, (t - lastFrameRef.current) / 1000)
      const frameDur = t - lastFrameRef.current
      lastFrameRef.current = t
      const perf = perfLogRef.current
      perf.frames++
      if (frameDur > 50) perf.slowFrames++
      try {
        step(dt)
        draw()
      } catch (err: any) {
        const p = playerRef.current
        const info = [
          `ERROR: ${err?.message ?? err}`,
          `Stack: ${err?.stack?.split('\n').slice(0, 3).join(' | ') ?? 'none'}`,
          `Time: ${timeRef.current.toFixed(1)}s | Phase: ${phaseRef.current}`,
          `Player: (${p.x.toFixed(0)},${p.y.toFixed(0)}) HP:${p.hp.toFixed(0)}/${p.maxHp}`,
          `Enemies: ${enemiesRef.current.length} | Projs: ${projsRef.current.length} | Bombs: ${bombsRef.current.length}`,
          `Map: ${mapRef.current.id} | Obstacles: ${mapRef.current.obstacles.length}`,
          `Weapons: ${weaponsRef.current.map(w => w.id).join(',')}`,
          `Trees: ${Object.entries(p.trees).map(([k, v]) => `${k}:${v}`).join(',')}`,
          `Frames: ${perf.frames} | SlowFrames(>50ms): ${perf.slowFrames}`,
          `Dark: ${darkModeRef.current} | FlowField: ${flowFieldRef.current ? 'yes' : 'no'}`,
        ].join('\n')
        console.error('Survivors crash:', info)
        crashLogRef.current = info; setCrashLog(info)
        return
      }
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
  }, [])

  // ─── Recompute stats from trees ─────────────────────────────────────────────

  function recomputeStats() {
    const p = playerRef.current
    let maxHp = 60
    let dmgMul = 1, cdMul = 1, spd = 160, arm = 0, regen = 0, pickR = 120, xpM = 1, bSize = 1
    if (tr('powerShot') >= 1) dmgMul += 0.15
    if (tr('powerShot') >= 2) { dmgMul += 0.10; bSize += 0.20 }
    if (tr('rapidFire') >= 1) cdMul *= 0.90
    if (tr('rapidFire') >= 2) cdMul *= 0.85
    if (tr('rapidFire') >= 3) cdMul *= 0.80
    // Haste affects ability timers (aura/nova/vortex), not weapon cooldowns
    if (tr('vitality') >= 1) maxHp += 20
    if (tr('vitality') >= 2) regen = 0.8
    if (tr('armor') >= 1) arm = 2
    if (tr('speed') >= 1) spd *= 1.15
    if (tr('speed') >= 2) spd *= 1.10
    if (tr('magnetism') >= 1) pickR += 40
    if (tr('magnetism') >= 2) pickR += 50
    if (tr('magnetism') >= 3) { pickR += 70; xpM = 1.10 }
    if (hasC('Glass Cannon')) { dmgMul += 0.30; maxHp = Math.floor(maxHp * 0.8) }
    if (hasC('Gun Mastery')) { dmgMul += 0.15; cdMul *= 0.85 }
    p.maxHp = maxHp; p.hp = Math.min(p.hp, p.maxHp)
    p.damageMult = dmgMul; p.cooldownMult = cdMul; p.speed = spd; p.armorVal = arm; p.regenRate = regen; p.pickupRange = pickR; p.xpMult = xpM; p.bulletSize = bSize
  }

  function hasLOS(x1: number, y1: number, x2: number, y2: number): boolean {
    if (mapRef.current.obstacles.length === 0) return true
    return !lineHitsObs(x1, y1, x2, y2, mapRef.current.obstacles)
  }

  function computeFlowField() {
    const mg = mapRef.current.mazeGrid
    if (!mg) { flowFieldRef.current = null; return }
    const { cols, rows, cell, ox, oy, wH, wV } = mg
    const p = playerRef.current
    const pc = Math.floor((p.x - ox) / cell), pr = Math.floor((p.y - oy) / cell)
    const pCol = Math.max(0, Math.min(cols - 1, pc)), pRow = Math.max(0, Math.min(rows - 1, pr))
    const dist: number[][] = Array.from({ length: rows }, () => Array(cols).fill(-1))
    const field: { dx: number; dy: number }[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ({ dx: 0, dy: 0 })))
    dist[pRow][pCol] = 0
    const q: [number, number][] = [[pRow, pCol]]
    let qi = 0
    while (qi < q.length) {
      const [r, c] = q[qi++]
      const dirs: [number, number][] = [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
      for (const [nr, nc] of dirs) {
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
        if (dist[nr][nc] >= 0) continue
        if (nr === r - 1 && wH[r][c]) continue
        if (nr === r + 1 && wH[r + 1][c]) continue
        if (nc === c - 1 && wV[r][c]) continue
        if (nc === c + 1 && wV[r][c + 1]) continue
        dist[nr][nc] = dist[r][c] + 1
        q.push([nr, nc])
      }
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (dist[r][c] < 0) continue
      let bestD = dist[r][c], bx = 0, by = 0
      const nb: [number, number, number, number][] = [[-1, 0, r, c], [1, 0, r + 1, c], [0, -1, r, c], [0, 1, r, c + 1]]
      for (const [dr, dc, wr, wc] of nb) {
        const nr = r + dr, nc = c + dc
        if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) continue
        if (dr !== 0 && wH[wr][wc]) continue
        if (dc !== 0 && wV[wr][wc]) continue
        if (dist[nr][nc] >= 0 && dist[nr][nc] < bestD) { bestD = dist[nr][nc]; bx = dc; by = dr }
      }
      field[r][c] = { dx: bx, dy: by }
    }
    flowFieldRef.current = field
  }

  // ─── Step ───────────────────────────────────────────────────────────────────

  function step(dt: number) {
    if (shakeRef.current > 0) shakeRef.current = Math.max(0, shakeRef.current - dt * 10)
    if (phaseRef.current !== 'playing') return
    if (showCombosRef.current) return
    timeRef.current += dt
    // Recompute flow field for maze pathfinding
    if (mapRef.current.mazeGrid) {
      flowTimerRef.current -= dt
      if (flowTimerRef.current <= 0) { flowTimerRef.current = 0.3; computeFlowField() }
    }
    // No time limit — survive as long as you can
    const p = playerRef.current

    // Movement
    let dx = 0, dy = 0
    if (inputRef.current.up) dy -= 1; if (inputRef.current.down) dy += 1
    if (inputRef.current.left) dx -= 1; if (inputRef.current.right) dx += 1
    if (dx !== 0 || dy !== 0) {
      const m = Math.hypot(dx, dy); dx /= m; dy /= m
      p.x += dx * p.speed * dt; p.y += dy * p.speed * dt
      if (!(inputRef.current.aimUp || inputRef.current.aimDown || inputRef.current.aimLeft || inputRef.current.aimRight)) p.facing = Math.atan2(dy, dx)
      // Speed T2: direction change damage boost
      if (tr('speed') >= 2 && (Math.sign(dx) !== Math.sign(p.lastDirX) || Math.sign(dy) !== Math.sign(p.lastDirY)) && (p.lastDirX !== 0 || p.lastDirY !== 0)) {
        p.dodgeBuff = hasC('Momentum') ? 1.0 : 0.5
      }
      p.lastDirX = dx; p.lastDirY = dy
      // Burning Trail combo
      if (hasC('Burning Trail') && Math.random() < dt * 8) {
        zonesRef.current.push({ x: p.x, y: p.y, life: 2, radius: 14, dps: 4 * p.damageMult, kind: 'fire' })
      }
    }
    const mW = mapRef.current.worldW, mH = mapRef.current.worldH
    p.x = Math.max(20, Math.min(mW - 20, p.x)); p.y = Math.max(20, Math.min(mH - 20, p.y))
    // Obstacle collision
    for (const ob of mapRef.current.obstacles) {
      const cx = Math.max(ob.x, Math.min(ob.x + ob.w, p.x))
      const cy = Math.max(ob.y, Math.min(ob.y + ob.h, p.y))
      const dx = p.x - cx, dy = p.y - cy, dist = Math.hypot(dx, dy)
      if (dist < 14 && dist > 0) { p.x += (dx / dist) * (14 - dist); p.y += (dy / dist) * (14 - dist) }
    }
    // Map hazards
    if (mapRef.current.hazards) {
      for (const hz of mapRef.current.hazards) {
        const d = Math.hypot(p.x - hz.x, p.y - hz.y)
        if (d < hz.radius && hz.dps > 0 && p.invul <= 0) {
          p.hp -= hz.dps * dt
          if (p.hp <= 0) { finishRun(false); return }
        }
        if (d < hz.radius && hz.kind === 'icePool') {
          p.x += p.lastDirX * 40 * dt; p.y += p.lastDirY * 40 * dt
        }
      }
    }

    // Aim — mouse takes priority over keyboard
    let ax = 0, ay = 0
    const ms = mouseRef.current
    if (ms.down && ms.inCanvas) {
      const camX = p.x - W / 2, camY = p.y - H / 2
      const worldMX = ms.x + camX, worldMY = ms.y + camY
      ax = worldMX - p.x; ay = worldMY - p.y
    } else {
      if (inputRef.current.aimUp) ay -= 1; if (inputRef.current.aimDown) ay += 1
      if (inputRef.current.aimLeft) ax -= 1; if (inputRef.current.aimRight) ax += 1
    }
    const aiming = ax !== 0 || ay !== 0; p.isAiming = aiming
    if (aiming) { const m = Math.hypot(ax, ay); p.aimX = ax / m; p.aimY = ay / m; p.facing = Math.atan2(ay, ax); p.idleTimer = 0 }
    else p.idleTimer += dt

    if (p.invul > 0) p.invul -= dt
    if (p.rageBuff > 0) p.rageBuff -= dt
    if (p.dodgeBuff > 0) p.dodgeBuff -= dt
    if (p.dashCD > 0) p.dashCD -= dt
    if (p.regenRate > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + p.regenRate * dt)

    // Stars
    for (const s of starsRef.current) { s.x -= s.speed * 60 * dt; if (s.x < 0) { s.x = W; s.y = Math.random() * H } }

    // Spawn enemies
    spawnTimerRef.current -= dt
    if (spawnTimerRef.current <= 0) {
      const t = timeRef.current
      spawnTimerRef.current = Math.max(0.14, 1.2 - t / 180)
      const cap = mapRef.current.enemyCap + (t > 600 ? Math.floor((t - 600) / 60) * 20 : 0)
      if (enemiesRef.current.length < cap) {
        const burst = 2 + Math.floor(t / 50) + (t > 600 ? Math.floor((t - 600) / 120) : 0)
        const mg = mapRef.current.mazeGrid, ff = flowFieldRef.current
        for (let i = 0; i < burst && enemiesRef.current.length < cap; i++) {
          let sx = 0, sy = 0, ok = false
          if (mg && ff) {
            const pc = Math.floor((p.x - mg.ox) / mg.cell), pr2 = Math.floor((p.y - mg.oy) / mg.cell)
            const minCells = t < 30 ? 3 : 3
            const maxCells = t < 30 ? 6 : 999
            for (let attempt = 0; attempt < 15; attempt++) {
              const rc = Math.floor(Math.random() * mg.cols), rr = Math.floor(Math.random() * mg.rows)
              if (rr < 0 || rr >= mg.rows || rc < 0 || rc >= mg.cols) continue
              const f = ff[rr]?.[rc]
              if (!f || (f.dx === 0 && f.dy === 0 && (rr !== pr2 || rc !== pc))) continue
              const cellDist = Math.abs(rr - pr2) + Math.abs(rc - pc)
              if (cellDist < minCells || cellDist > maxCells) continue
              sx = mg.ox + rc * mg.cell + mg.cell * 0.3 + Math.random() * mg.cell * 0.4
              sy = mg.oy + rr * mg.cell + mg.cell * 0.3 + Math.random() * mg.cell * 0.4
              ok = true; break
            }
          }
          if (!ok) {
            for (let attempt = 0; attempt < 8; attempt++) {
              const a = Math.random() * Math.PI * 2, d = 400 + Math.random() * 120
              sx = p.x + Math.cos(a) * d; sy = p.y + Math.sin(a) * d; ok = true
              for (const ob of mapRef.current.obstacles) { if (sx >= ob.x - 14 && sx <= ob.x + ob.w + 14 && sy >= ob.y - 14 && sy <= ob.y + ob.h + 14) { ok = false; break } }
              if (ok) break
            }
          }
          if (ok) enemiesRef.current.push(makeEnemy(t, sx, sy))
        }
      }
      const bossInterval = t > 600 ? 45 : 90
      if (t - lastBossRef.current >= bossInterval && t > 30) {
        lastBossRef.current = t
        const mg = mapRef.current.mazeGrid, ff = flowFieldRef.current
        let bx = 0, by = 0, bok = false
        if (mg && ff) {
          const pc = Math.floor((p.x - mg.ox) / mg.cell), pr2 = Math.floor((p.y - mg.oy) / mg.cell)
          for (let attempt = 0; attempt < 20; attempt++) {
            const rc = Math.floor(Math.random() * mg.cols), rr = Math.floor(Math.random() * mg.rows)
            const f = ff[rr]?.[rc]
            if (!f || (f.dx === 0 && f.dy === 0 && (rr !== pr2 || rc !== pc))) continue
            if (Math.abs(rr - pr2) + Math.abs(rc - pc) < 4) continue
            bx = mg.ox + rc * mg.cell + mg.cell / 2; by = mg.oy + rr * mg.cell + mg.cell / 2; bok = true; break
          }
        }
        if (!bok) {
          const a = Math.random() * Math.PI * 2; bx = p.x + Math.cos(a) * 520; by = p.y + Math.sin(a) * 520; bok = true
        }
        enemiesRef.current.push(makeBoss(t, bx, by))
      }
    }

    // Enemy movement & attacks
    for (const e of enemiesRef.current) {
      if (e.hitTimer > 0) e.hitTimer -= dt
      if (e.frozen > 0) { e.frozen -= dt; continue }
      if (e.stunned > 0) { e.stunned -= dt; continue }
      const ex = p.x - e.x, ey = p.y - e.y, dist = Math.hypot(ex, ey) || 1
      const slowMul = e.slow > 0 ? Math.max(0.35, 0.6) : 1
      if (e.slow > 0) e.slow -= dt
      // Venom damage
      if (e.venomStacks > 0 && e.venomTimer > 0) {
        const vDps = 2 * e.venomStacks * (e.frozen > 0 && hasC('Numb') ? 2 : 1) * (hasC('Frostfire') && e.slow > 0 && e.burn > 0 ? 2 : 1)
        e.hp -= vDps * dt; e.venomTimer -= dt
        if (e.venomTimer <= 0) { e.venomStacks = 0; e.corroded = false }
      }
      // Burn damage
      if (e.burn > 0) {
        const bMul = (hasC('Frostfire') && e.slow > 0) ? 2 : 1
        e.hp -= e.burnDps * bMul * dt; e.burn -= dt
        if (Math.random() < dt * 6) particlesRef.current.push({ x: e.x + (Math.random() - 0.5) * e.radius, y: e.y - e.radius, vx: (Math.random() - 0.5) * 20, vy: -40 - Math.random() * 30, life: 0.3, maxLife: 0.3, color: '#fb923c', size: 2 })
      }
      // Movement — use flow field in maze, direct chase otherwise
      if (dist > e.radius + 12) {
        let mx = ex / dist, my = ey / dist
        const ff = flowFieldRef.current, mg = mapRef.current.mazeGrid
        if (ff && mg) {
          const ec = Math.floor((e.x - mg.ox) / mg.cell), er = Math.floor((e.y - mg.oy) / mg.cell)
          if (er >= 0 && er < mg.rows && ec >= 0 && ec < mg.cols) {
            const f = ff[er][ec]
            if (f.dx !== 0 || f.dy !== 0) {
              const cellCX = mg.ox + ec * mg.cell + mg.cell / 2, cellCY = mg.oy + er * mg.cell + mg.cell / 2
              const tgtX = cellCX + f.dx * mg.cell, tgtY = cellCY + f.dy * mg.cell
              const fdx = tgtX - e.x, fdy = tgtY - e.y, fd = Math.hypot(fdx, fdy) || 1
              mx = fdx / fd; my = fdy / fd
            }
          }
        }
        e.x += mx * e.speed * slowMul * dt; e.y += my * e.speed * slowMul * dt
      }
      // Enemy obstacle collision (always wins — runs last after all pushes)
      for (const ob of mapRef.current.obstacles) {
        const cx = Math.max(ob.x, Math.min(ob.x + ob.w, e.x))
        const cy = Math.max(ob.y, Math.min(ob.y + ob.h, e.y))
        const ddx = e.x - cx, ddy = e.y - cy, dd = Math.hypot(ddx, ddy)
        if (dd < e.radius) {
          if (dd > 0.1) { e.x += (ddx / dd) * (e.radius - dd); e.y += (ddy / dd) * (e.radius - dd) }
          else { e.x += e.radius; }
        }
      }
      // Shielded: track player angle
      if (e.kind === 'shielded') e.shieldAng = Math.atan2(ey, ex)
      // Shooter: fire at player
      if (e.kind === 'shooter') {
        e.shootCD -= dt
        if (e.shootCD <= 0 && dist < 400 && hasLOS(e.x, e.y, p.x, p.y)) {
          e.shootCD = 2.0
          const v = 180
          eBulletsRef.current.push({ x: e.x, y: e.y, vx: (ex / dist) * v, vy: (ey / dist) * v, life: 2.5, dmg: e.dmg })
        }
      }
      // Melee contact damage
      if (dist < e.radius + 12 && p.invul <= 0 && e.kind !== 'shooter') {
        let dmg = Math.max(1, e.dmg * (e.venomStacks > 0 && tr('venom') >= 2 ? 0.8 : 1) - p.armorVal)
        if (tr('armor') >= 2) {
          const reflected = dmg * 0.25
          e.hp -= reflected
          if (hasC('Juggernaut')) p.hp = Math.min(p.maxHp, p.hp + reflected * 0.5)
        }
        if (tr('armor') >= 3) p.rageBuff = 2.0
        p.hp -= dmg; p.invul = 0.55; shakeRef.current = Math.min(10, shakeRef.current + 4)
        spawnParticles(p.x, p.y, '#dc2626', 6)
        if (p.hp <= 0) { finishRun(false); return }
      }
    }

    // Enemy bullets
    for (const b of eBulletsRef.current) {
      b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt
      // Bullet-wall collision
      for (const ob of mapRef.current.obstacles) {
        if (b.x >= ob.x && b.x <= ob.x + ob.w && b.y >= ob.y && b.y <= ob.y + ob.h) { b.life = 0; break }
      }
      if (b.life <= 0) continue
      if (Math.hypot(b.x - p.x, b.y - p.y) < 14 && p.invul <= 0) {
        let dmg = Math.max(1, b.dmg - p.armorVal)
        p.hp -= dmg; p.invul = 0.55; b.life = 0; shakeRef.current = Math.min(10, shakeRef.current + 3)
        if (tr('armor') >= 3) p.rageBuff = 2.0
        if (p.hp <= 0) { finishRun(false); return }
      }
    }
    eBulletsRef.current = eBulletsRef.current.filter(b => b.life > 0)

    // Soft separation then wall re-clamp
    const arr = enemiesRef.current
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) {
        const sx = arr[j].x - arr[i].x, sy = arr[j].y - arr[i].y, d = Math.hypot(sx, sy)
        const minD = arr[i].radius + arr[j].radius
        if (d > 0 && d < minD) { const push = (minD - d) * 0.5; const nx = sx / d, ny = sy / d; arr[i].x -= nx * push; arr[i].y -= ny * push; arr[j].x += nx * push; arr[j].y += ny * push }
      }
    }
    // Final wall clamp after all enemy pushes — walls always win
    if (mapRef.current.obstacles.length > 0) {
      for (const e of arr) {
        for (const ob of mapRef.current.obstacles) {
          const cx = Math.max(ob.x, Math.min(ob.x + ob.w, e.x))
          const cy = Math.max(ob.y, Math.min(ob.y + ob.h, e.y))
          const ddx = e.x - cx, ddy = e.y - cy, dd = Math.hypot(ddx, ddy)
          if (dd < e.radius) {
            if (dd > 0.1) { e.x += (ddx / dd) * (e.radius - dd); e.y += (ddy / dd) * (e.radius - dd) }
            else { e.x += e.radius; }
          }
        }
      }
    }

    // Fire weapon
    const w = weaponsRef.current[p.weaponIdx]
    if (w) {
      w.cooldown -= dt
      const shouldFire = w.id === 'drone' ? true : aiming
      if (shouldFire && w.cooldown <= 0) fireWeapon(w)
      for (let i = 0; i < weaponsRef.current.length; i++) { if (i !== p.weaponIdx) weaponsRef.current[i].cooldown -= dt }
    }

    // Projectiles
    for (const pr of projsRef.current) {
      // Orbit phase (Spread T3)
      if (pr.orbitT > 0) {
        pr.orbitT -= dt
        const a = Math.atan2(pr.y - pr.orbitCY, pr.x - pr.orbitCX)
        const r = Math.hypot(pr.x - pr.orbitCX, pr.y - pr.orbitCY) || 40
        const newA = a + 14 * dt
        pr.x = pr.orbitCX + Math.cos(newA) * r; pr.y = pr.orbitCY + Math.sin(newA) * r
        if (pr.orbitT <= 0) { const outA = Math.atan2(pr.y - pr.orbitCY, pr.x - pr.orbitCX); const spd = 420; pr.vx = Math.cos(outA) * spd; pr.vy = Math.sin(outA) * spd }
        pr.life -= dt; continue
      }
      // Homing
      if (pr.isHoming && pr.life > 0) {
        let best: Enemy | null = null, bestD = 400 * 400
        for (const e of enemiesRef.current) { if (e.hp <= 0) continue; const d2 = (e.x - pr.x) ** 2 + (e.y - pr.y) ** 2; if (d2 < bestD) { bestD = d2; best = e } }
        if (best) { const a = Math.atan2(best.y - pr.y, best.x - pr.x); const spd = Math.hypot(pr.vx, pr.vy); pr.vx += Math.cos(a) * spd * 3 * dt; pr.vy += Math.sin(a) * spd * 3 * dt; const m = Math.hypot(pr.vx, pr.vy); pr.vx = (pr.vx / m) * spd; pr.vy = (pr.vy / m) * spd }
      }
      // Boomerang return
      if (pr.kind === 'boomerang' && !pr.returning && pr.life < 1.0) {
        pr.returning = true; pr.hitIds = new Set()
      }
      if (pr.returning) {
        const tx = p.x - pr.x, ty = p.y - pr.y, td = Math.hypot(tx, ty)
        if (td < 20) { pr.life = 0; continue }
        const spd = 500; pr.vx = (tx / td) * spd; pr.vy = (ty / td) * spd
      }
      // Orb continuous damage (reset hitIds periodically)
      if (pr.kind === 'orb') {
        pr.orbDmgTimer -= dt
        if (pr.orbDmgTimer <= 0) { pr.orbDmgTimer = 0.25; pr.hitIds = new Set() }
      }
      pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt
      if (pr.trail) { pr.trail.push({ x: pr.x, y: pr.y, life: 0.18 }); while (pr.trail.length > 8) pr.trail.shift(); for (const t of pr.trail) t.life -= dt }
      // Projectile-wall collision
      if (mapRef.current.obstacles.length > 0 && !pr.returning) {
        for (const ob of mapRef.current.obstacles) {
          if (pr.x >= ob.x && pr.x <= ob.x + ob.w && pr.y >= ob.y && pr.y <= ob.y + ob.h) { pr.life = 0; break }
        }
      }
    }
    projsRef.current = projsRef.current.filter(pr => pr.life > 0)

    // Bombs
    for (const b of bombsRef.current) { b.x += b.vx * dt; b.y += b.vy * dt; b.fuse -= dt; b.life -= dt; b.vx *= 0.96; b.vy *= 0.96 }
    for (const b of bombsRef.current.filter(b => b.fuse <= 0)) {
      explosionsRef.current.push({ x: b.x, y: b.y, radius: b.radius, life: 0.4, maxLife: 0.4, dmg: b.dmg, hitIds: new Set() })
      shakeRef.current = Math.min(10, shakeRef.current + 3); spawnParticles(b.x, b.y, '#fbbf24', 18)
    }
    bombsRef.current = bombsRef.current.filter(b => b.fuse > 0)

    // Explosions
    for (const ex of explosionsRef.current) {
      ex.life -= dt
      for (const e of enemiesRef.current) {
        if (!ex.hitIds.has(getId(e)) && Math.hypot(e.x - ex.x, e.y - ex.y) <= ex.radius + e.radius) {
          applyHit(e, ex.dmg * p.damageMult, null); ex.hitIds.add(getId(e))
        }
      }
    }
    explosionsRef.current = explosionsRef.current.filter(ex => ex.life > 0)

    // Projectile-enemy collisions
    for (const pr of projsRef.current) {
      for (const e of enemiesRef.current) {
        if (e.hp <= 0) continue
        const id = getId(e)
        if (pr.hitIds.has(id)) continue
        if (Math.hypot(pr.x - e.x, pr.y - e.y) < pr.radius + e.radius) {
          let dmgMul = 1
          // Piercing T3: +5% per enemy pierced
          if (tr('piercing') >= 3) dmgMul += pr.pierceCount * 0.05
          // Sniper: first pierced = 2× (only on first target with piercing T2)
          if (hasC('Sniper') && pr.pierceCount === 0 && pr.pierce > 0) dmgMul *= 2
          // Dodge buff
          if (p.dodgeBuff > 0) dmgMul *= (hasC('Momentum') ? 1.4 : 1.2)
          // Rage
          if (p.rageBuff > 0) dmgMul *= 1.3
          // Shielded: reduce damage if hit from front
          if (e.kind === 'shielded') {
            const hitAng = Math.atan2(pr.vy, pr.vx)
            if (Math.abs(hitAng - e.shieldAng) < 0.8) dmgMul *= 0.3
          }
          // Corroded enemies take more
          if (e.corroded) dmgMul *= 1.25

          const dmg = pr.dmg * dmgMul
          applyHit(e, dmg, pr)
          pr.hitIds.add(id)
          pr.pierceCount++

          // Split Shot
          if (tr('splitShot') >= 1 && pr.gen < (tr('splitShot') >= 3 ? 2 : 1)) {
            for (let si = 0; si < 2; si++) {
              const a = Math.atan2(pr.vy, pr.vx) + (si === 0 ? 0.5 : -0.5)
              const spd = Math.hypot(pr.vx, pr.vy) * 0.8
              const child: Projectile = { x: e.x, y: e.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.5, dmg: pr.dmg * (pr.gen === 0 ? 0.7 : 0.5), radius: pr.radius * 0.8, kind: pr.kind, pierce: tr('splitShot') >= 2 ? 1 : 0, hitIds: new Set([id]), trail: [], gen: pr.gen + 1, bounces: hasC('Shrapnel Rain') ? 1 : 0, isRear: false, isHoming: false, pierceCount: 0, orbitT: 0, orbitCX: 0, orbitCY: 0, returning: false, originX: e.x, originY: e.y, orbDmgTimer: 0 }
              projsRef.current.push(child)
            }
          }

          // Ricochet
          if (pr.bounces > 0) {
            let bTarget: Enemy | null = null, bDist = 160 * 160
            for (const e2 of enemiesRef.current) { if (e2 === e || e2.hp <= 0 || pr.hitIds.has(getId(e2))) continue; const d2 = (e2.x - e.x) ** 2 + (e2.y - e.y) ** 2; if (d2 < bDist) { bDist = d2; bTarget = e2 } }
            if (bTarget) {
              const a = Math.atan2(bTarget.y - e.y, bTarget.x - e.x)
              const spd = Math.hypot(pr.vx, pr.vy)
              const bDmgMul = tr('ricochet') >= 2 ? 0.8 : 0.5
              const bounce: Projectile = { x: e.x, y: e.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd, life: 0.8, dmg: pr.dmg * bDmgMul, radius: pr.radius, kind: pr.kind, pierce: 0, hitIds: new Set([id]), trail: [], gen: pr.gen, bounces: pr.bounces - 1, isRear: false, isHoming: tr('ricochet') >= 3, pierceCount: 0, orbitT: 0, orbitCX: 0, orbitCY: 0, returning: false, originX: e.x, originY: e.y, orbDmgTimer: 0 }
              projsRef.current.push(bounce)
            }
          }

          // Power Shot T3: explosion on hit
          if (tr('powerShot') >= 3) {
            explosionsRef.current.push({ x: e.x, y: e.y, radius: 30, life: 0.3, maxLife: 0.3, dmg: pr.dmg * 0.4, hitIds: new Set([id]) })
            spawnParticles(e.x, e.y, '#fbbf24', 6)
          }

          // Pierce or consume
          if (pr.pierce > 0) { pr.pierce--; if (pr.pierce <= 0 && tr('piercing') < 3) pr.life = 0 }
          else if (tr('piercing') < 3) pr.life = 0

          break
        }
      }
    }

    // Haste speeds up ability timers
    const hasteMul = (tr('haste') >= 1 ? 1.15 : 1) * (tr('haste') >= 2 ? 1.10 : 1)
    const adt = dt * hasteMul

    // Hex Aura
    if (tr('hexAura') >= 1) {
      p.auraT -= adt
      if (p.auraT <= 0) {
        p.auraT = 0.6
        const radius = (tr('hexAura') >= 2 ? 126 : 90)
        const dmg = (6 + (tr('hexAura') >= 2 ? 9 : 4)) * p.damageMult
        for (const e of enemiesRef.current) {
          if (Math.hypot(e.x - p.x, e.y - p.y) <= radius + e.radius && hasLOS(p.x, p.y, e.x, e.y)) {
            dealDamage(e, dmg, true)
            if (hasC('Inferno')) { e.burn = Math.max(e.burn, 3); e.burnDps = Math.max(e.burnDps, 8) }
            if (hasC('Static Field') && Math.random() < 0.2) maybeChain(e, dmg * 0.5)
            if (hasC('Miasma')) { e.venomStacks = Math.min(5, e.venomStacks + 1); e.venomTimer = Math.max(e.venomTimer, hasC('Virulence') ? 8 : 4); if (e.venomStacks >= 5 && tr('venom') >= 3) e.corroded = true }
            if (tr('hexAura') >= 3) e.slow = Math.max(e.slow, 0.6)
          }
        }
        if (hasC('Gale Aura')) {
          for (const e of enemiesRef.current) {
            const d = Math.hypot(e.x - p.x, e.y - p.y)
            if (d <= radius + e.radius && d > 0) { e.x += ((e.x - p.x) / d) * 8; e.y += ((e.y - p.y) / d) * 8 }
          }
        }
        for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; particlesRef.current.push({ x: p.x + Math.cos(a) * radius, y: p.y + Math.sin(a) * radius, vx: Math.cos(a) * 50, vy: Math.sin(a) * 50, life: 0.35, maxLife: 0.35, color: i % 4 === 0 ? '#fff' : (hasC('Inferno') ? '#fb923c' : '#c4b5fd'), size: 4 + Math.random() * 2 }) }
        shakeRef.current = Math.min(3, shakeRef.current + 1)
      }
    }

    // Pulse Nova
    if (tr('pulseNova') >= 1) {
      p.novaT -= adt
      if (p.novaT <= 0) {
        const interval = tr('pulseNova') >= 2 ? 5 : 8
        p.novaT = interval
        const radius = 220, dmg = (40 + tr('pulseNova') * 20) * p.damageMult
        const pushMul = hasC('Cyclone') ? 3 : (tr('pulseNova') >= 2 ? 1 : 0)
        for (const e of enemiesRef.current) {
          const d = Math.hypot(e.x - p.x, e.y - p.y)
          if (d <= radius + e.radius && hasLOS(p.x, p.y, e.x, e.y)) {
            dealDamage(e, dmg, true)
            if (hasC('Glacial Nova')) e.frozen = Math.max(e.frozen, 1)
            if (pushMul > 0 && d > 0) { const push = 60 * pushMul; e.x += ((e.x - p.x) / d) * push; e.y += ((e.y - p.y) / d) * push }
          }
        }
        if (tr('pulseNova') >= 3) zonesRef.current.push({ x: p.x, y: p.y, life: 3, radius: 220, dps: dmg * 0.5 / 3, kind: 'nova' })
        shakeRef.current = Math.min(10, shakeRef.current + 4)
        for (let i = 0; i < 40; i++) { const a = (i / 40) * Math.PI * 2; particlesRef.current.push({ x: p.x + Math.cos(a) * 20, y: p.y + Math.sin(a) * 20, vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, life: 0.6, maxLife: 0.6, color: hasC('Glacial Nova') ? '#67e8f9' : (i % 4 === 0 ? '#fff' : '#fde047'), size: 4 + Math.random() * 2 }) }
      }
    }

    // Gale T3 vortex
    if (tr('gale') >= 3) {
      p.galeVortexT -= adt
      if (p.galeVortexT <= 0) {
        p.galeVortexT = 6
        let bestX = p.x, bestY = p.y, bestCount = 0
        for (const e of enemiesRef.current) {
          let count = 0
          for (const e2 of enemiesRef.current) { if (Math.hypot(e2.x - e.x, e2.y - e.y) < 100) count++ }
          if (count > bestCount) { bestCount = count; bestX = e.x; bestY = e.y }
        }
        for (const e of enemiesRef.current) {
          const d = Math.hypot(e.x - bestX, e.y - bestY)
          if (d < 100 && d > 0) { e.x -= ((e.x - bestX) / d) * 40; e.y -= ((e.y - bestY) / d) * 40 }
        }
        setTimeout(() => {
          for (const e of enemiesRef.current) {
            const d = Math.hypot(e.x - bestX, e.y - bestY)
            if (d < 120 && d > 0) {
              const push = 80; e.x += ((e.x - bestX) / d) * push; e.y += ((e.y - bestY) / d) * push
              dealDamage(e, 20 * playerRef.current.damageMult, true)
            }
          }
        }, 500)
        for (let i = 0; i < 24; i++) { const a = (i / 24) * Math.PI * 2; particlesRef.current.push({ x: bestX + Math.cos(a) * 50, y: bestY + Math.sin(a) * 50, vx: -Math.cos(a) * 80, vy: -Math.sin(a) * 80, life: 0.7, maxLife: 0.7, color: i % 3 === 0 ? '#d9f99d' : '#a3e635', size: 4 + Math.random() * 2 }) }
        if (hasC('Eye of the Storm')) zonesRef.current.push({ x: bestX, y: bestY, life: 4, radius: 120, dps: 30 * playerRef.current.damageMult, kind: 'storm' })
      }
    }

    // Tornados — drift outward and push enemies aside
    for (const tn of tornadosRef.current) {
      tn.x += tn.vx * dt; tn.y += tn.vy * dt; tn.life -= dt; tn.spin += dt * 12
      tn.vx *= (1 - 0.5 * dt); tn.vy *= (1 - 0.5 * dt)
      for (const e of enemiesRef.current) {
        if (e.hp <= 0) continue
        const d = Math.hypot(e.x - tn.x, e.y - tn.y)
        if (d < tn.radius + e.radius && d > 0) {
          const pushStr = 35 * dt
          const pp = playerRef.current
          const awayX = e.x - pp.x, awayY = e.y - pp.y
          const awayD = Math.hypot(awayX, awayY) || 1
          e.x += (awayX / awayD) * pushStr; e.y += (awayY / awayD) * pushStr
          e.x = Math.max(0, Math.min(mapRef.current.worldW, e.x)); e.y = Math.max(0, Math.min(mapRef.current.worldH, e.y))
          if (hasC('Blizzard')) e.slow = Math.max(e.slow, 0.6)
        }
      }
      if (Math.random() < dt * 12) particlesRef.current.push({ x: tn.x + (Math.random() - 0.5) * tn.radius, y: tn.y + (Math.random() - 0.5) * tn.radius, vx: (Math.random() - 0.5) * 50, vy: -40 - Math.random() * 30, life: 0.4, maxLife: 0.4, color: Math.random() < 0.3 ? '#d9f99d' : '#a3e635', size: 3 + Math.random() * 2 })
    }
    tornadosRef.current = tornadosRef.current.filter(tn => tn.life > 0)

    // Zones damage tick
    for (const z of zonesRef.current) {
      z.life -= dt
      for (const e of enemiesRef.current) {
        if (Math.hypot(e.x - z.x, e.y - z.y) <= z.radius + e.radius) {
          e.hp -= z.dps * dt
          if (z.kind === 'fire' && e.hp > 0) { e.burn = Math.max(e.burn, 1); e.burnDps = Math.max(e.burnDps, 4) }
        }
      }
    }
    zonesRef.current = zonesRef.current.filter(z => z.life > 0)

    // Cleanup dead enemies (cascade cap: max 10 death-triggered effects per frame)
    const alive: Enemy[] = []
    let bossDied = false, cascadeCount = 0
    const CASCADE_CAP = 10
    for (const e of enemiesRef.current) {
      if (e.hp > 0) { alive.push(e); continue }
      killsRef.current++
      gemsRef.current.push({ x: e.x, y: e.y, value: e.kind === 'boss' ? 20 : e.kind === 'tank' ? 4 : e.kind === 'swarmer' ? 1 : 2 })
      spawnParticles(e.x, e.y, '#dc2626', 8)
      if (cascadeCount >= CASCADE_CAP) { if (e.kind === 'boss') bossDied = true; continue }
      // Shrapnel
      if (tr('shrapnel') >= 1) {
        cascadeCount++
        const count = tr('shrapnel') >= 2 ? 8 : 4
        const sDmg = (8 + tr('shrapnel') * 4) * p.damageMult
        for (let i = 0; i < count; i++) {
          const a = (i / count) * Math.PI * 2 + Math.random() * 0.3
          const v = 360 + Math.random() * 60
          const shard: Projectile = { x: e.x, y: e.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.45, dmg: sDmg, radius: 4, kind: 'shard', pierce: tr('shrapnel') >= 2 ? 1 : 0, hitIds: new Set(), trail: [], gen: 2, bounces: hasC('Storm Burst') ? 1 : 0, isRear: false, isHoming: false, pierceCount: 0 }
          projsRef.current.push(shard)
        }
      }
      // Pyro T2: death explosion
      if (tr('pyromancy') >= 2 && e.burn > 0 && cascadeCount < CASCADE_CAP) {
        cascadeCount++
        explosionsRef.current.push({ x: e.x, y: e.y, radius: 50, life: 0.3, maxLife: 0.3, dmg: 15 * p.damageMult, hitIds: new Set() })
        if (hasC('Firestorm')) maybeChain(e, 20 * p.damageMult)
        if (hasC('Chain Reaction')) maybeChain(e, 15 * p.damageMult)
      }
      // Pyro T3: burn spread
      if (tr('pyromancy') >= 3 && e.burn > 0 && cascadeCount < CASCADE_CAP) {
        cascadeCount++
        for (const e2 of enemiesRef.current) { if (e2.hp > 0 && Math.hypot(e2.x - e.x, e2.y - e.y) < 60) { e2.burn = Math.max(e2.burn, 3); e2.burnDps = Math.max(e2.burnDps, 4) } }
      }
      // Cryo T3: shatter
      if (tr('cryomancy') >= 3 && e.frozen > 0 && cascadeCount < CASCADE_CAP) {
        cascadeCount++
        for (const e2 of enemiesRef.current) { if (e2.hp > 0 && Math.hypot(e2.x - e.x, e2.y - e.y) < 80) { dealDamage(e2, 20 * p.damageMult, true); if (hasC('Absolute Zero')) e2.frozen = Math.max(e2.frozen, 0.8) } }
        spawnParticles(e.x, e.y, '#67e8f9', 12)
      }
      // Venom T2: spread on death
      if (tr('venom') >= 2 && e.venomStacks > 0 && cascadeCount < CASCADE_CAP) {
        cascadeCount++
        for (const e2 of enemiesRef.current) { if (e2.hp > 0 && Math.hypot(e2.x - e.x, e2.y - e.y) < 60) { e2.venomStacks = Math.min(5, e2.venomStacks + Math.min(e.venomStacks, 2)); e2.venomTimer = Math.max(e2.venomTimer, 4); if (e2.venomStacks >= 5 && tr('venom') >= 3) e2.corroded = true } }
      }
      // Toxic Fumes: poison cloud on death
      if (hasC('Toxic Fumes') && e.burn > 0 && e.venomStacks > 0 && cascadeCount < CASCADE_CAP) {
        cascadeCount++
        zonesRef.current.push({ x: e.x, y: e.y, life: 3, radius: 60, dps: 6, kind: 'poison' })
      }
      // Plague Engine
      if (hasC('Plague Engine') && e.corroded && tr('hexAura') >= 1 && cascadeCount < CASCADE_CAP) {
        cascadeCount++
        for (const e2 of enemiesRef.current) { if (e2.hp > 0 && Math.hypot(e2.x - e.x, e2.y - e.y) < 126) { e2.venomStacks = Math.min(5, e2.venomStacks + 3); e2.venomTimer = Math.max(e2.venomTimer, 4); if (e2.venomStacks >= 5 && tr('venom') >= 3) e2.corroded = true } }
      }
      if (e.kind === 'boss') bossDied = true
    }
    if (alive.length !== enemiesRef.current.length) enemiesRef.current = alive
    if (bossDied) triggerBossReward()

    // Gems
    const pickupSq = p.pickupRange * p.pickupRange
    const collected: Gem[] = []
    for (const g of gemsRef.current) {
      const dxg = p.x - g.x, dyg = p.y - g.y, dsq = dxg * dxg + dyg * dyg
      if (dsq < pickupSq) {
        const d = Math.sqrt(dsq) || 1; g.x += (dxg / d) * 260 * dt; g.y += (dyg / d) * 260 * dt
        if (d < 18) collected.push(g)
      }
    }
    if (collected.length) {
      let gain = 0; for (const g of collected) gain += g.value
      gain = Math.floor(gain * p.xpMult)
      gemsRef.current = gemsRef.current.filter(g => !collected.includes(g))
      p.xp += gain
      while (p.xp >= xpToNext(p.level)) { p.xp -= xpToNext(p.level); p.level++; triggerLevelUp() }
    }

    // Texts, particles, shake
    for (const d of dmgTextsRef.current) { d.y += d.vy * dt; d.life -= dt }
    dmgTextsRef.current = dmgTextsRef.current.filter(d => d.life > 0)
    for (const pa of particlesRef.current) { pa.x += pa.vx * dt; pa.y += pa.vy * dt; pa.vx *= 0.93; pa.vy *= 0.93; pa.life -= dt }
    particlesRef.current = particlesRef.current.filter(pa => pa.life > 0)
    for (const ws of whipSlashesRef.current) ws.life -= dt
    whipSlashesRef.current = whipSlashesRef.current.filter(ws => ws.life > 0)
    setHudTick(t => t + 1)
  }

  // ─── Combat helpers ─────────────────────────────────────────────────────────

  function bossPassiveResist(): number {
    const t = timeRef.current
    if (t < 300) return 0
    if (t < 600) return 0.25
    if (t < 900) return 0.50
    return 0.75
  }

  function dealDamage(e: Enemy, dmg: number, passive?: boolean) {
    if (passive && e.kind === 'boss') dmg *= (1 - bossPassiveResist())
    e.hp -= dmg; e.hitTimer = 0.10
    dmgTextsRef.current.push({ x: e.x, y: e.y - e.radius - 4, vy: -40, life: 0.55, text: String(Math.floor(dmg)), color: dmg >= 40 ? '#fde047' : '#fff' })
    if (tr('vitality') >= 3) {
      const steal = dmg * 0.05 * (hasC('Sustain') && (inputRef.current.up || inputRef.current.down || inputRef.current.left || inputRef.current.right) ? 2 : 1)
      playerRef.current.hp = Math.min(playerRef.current.maxHp, playerRef.current.hp + steal)
    }
  }

  function applyHit(e: Enemy, dmg: number, pr: Projectile | null) {
    dealDamage(e, dmg)
    const p = playerRef.current
    // Pyromancy
    if (tr('pyromancy') >= 1) { e.burn = Math.max(e.burn, 3 + tr('pyromancy')); e.burnDps = Math.max(e.burnDps, 4 + tr('pyromancy') * 2) }
    // Cryomancy
    if (tr('cryomancy') >= 1) {
      const dur = (hasC('Permafrost') ? 2.4 : 1.2) + (tr('cryomancy') - 1) * 0.4
      e.slow = Math.max(e.slow, dur)
      if (tr('cryomancy') >= 2 && e.slow > 3) e.frozen = Math.max(e.frozen, 2)
      // Shatter Shots
      if (hasC('Shatter Shots') && e.frozen > 0 && pr && pr.pierce > 0) { e.hp -= 30 * p.damageMult; spawnParticles(e.x, e.y, '#67e8f9', 8) }
    }
    // Thunder
    if (tr('thunder') >= 1) {
      const chance = Math.min(0.95, 0.3 + (tr('thunder') >= 2 ? 0.2 : 0) + (tr('thunder') - 1) * 0.1)
      if (Math.random() < chance) {
        maybeChain(e, dmg * (hasC('Overcharge') ? 1.0 : 0.7))
        p.chainCount++
        if (tr('thunder') >= 3 && p.chainCount % 10 === 0) {
          for (const e2 of enemiesRef.current) { if (e2.hp > 0 && Math.hypot(e2.x - e.x, e2.y - e.y) < 120) dealDamage(e2, 25 * p.damageMult, true) }
          spawnParticles(e.x, e.y, '#fde047', 24)
          for (let li = 0; li < 8; li++) { const la = Math.random() * Math.PI * 2, ld = 20 + Math.random() * 100; particlesRef.current.push({ x: e.x + Math.cos(la) * ld, y: e.y + Math.sin(la) * ld, vx: 0, vy: 0, life: 0.3, maxLife: 0.3, color: '#fff', size: 5 }) }
        }
      }
    }
    // Gale — spawn tornado on hit
    if (tr('gale') >= 1 && e.hp > 0) {
      const dir = pr ? Math.atan2(pr.vy, pr.vx) : Math.atan2(e.y - p.y, e.x - p.x)
      const spread = (Math.random() - 0.5) * 1.2
      const spd = 100 + Math.random() * 60
      const t2 = tr('gale') >= 2
      tornadosRef.current.push({ x: e.x, y: e.y, vx: Math.cos(dir + spread) * spd, vy: Math.sin(dir + spread) * spd, life: t2 ? 1.6 : 0.8, maxLife: t2 ? 1.6 : 0.8, radius: t2 ? 28 : 20, dmg: 0, spin: 0 })
      if (hasC('Tempest') && Math.random() < 0.4) dealDamage(e, 15 * p.damageMult, true)
      if (hasC('Blizzard')) e.slow = Math.max(e.slow, 1.2)
      if (hasC('Wildfire') && e.burn > 0) zonesRef.current.push({ x: e.x, y: e.y, life: 2, radius: 14, dps: 4, kind: 'fire' })
      if (hasC('Spore Cloud') && e.venomStacks > 0) { for (const e2 of enemiesRef.current) { if (e2 !== e && e2.hp > 0 && Math.hypot(e2.x - e.x, e2.y - e.y) < 40) { e2.venomStacks = Math.min(5, e2.venomStacks + 1); e2.venomTimer = Math.max(e2.venomTimer, 4) } } }
    }
    // Venom
    if (tr('venom') >= 1) {
      const stacks = (pr && hasC('Toxic Barrage') && pr.gen === 0) ? 2 : 1
      e.venomStacks = Math.min(5, e.venomStacks + stacks)
      e.venomTimer = Math.max(e.venomTimer, hasC('Virulence') ? 8 : 4)
      if (e.venomStacks >= 5 && tr('venom') >= 3) e.corroded = true
    }
    // Shrapnel T3: shards apply elements (handled by shard projectiles hitting through applyHit)
    // Piercing T2: mark for next hit
    if (tr('piercing') >= 2 && pr && pr.pierce > 0) e.hitTimer = 0.15
  }

  function maybeChain(source: Enemy, dmg: number) {
    let best: Enemy | null = null, bestD = 140 * 140
    for (const e of enemiesRef.current) { if (e === source || e.hp <= 0) continue; const d2 = (e.x - source.x) ** 2 + (e.y - source.y) ** 2; if (d2 < bestD) { bestD = d2; best = e } }
    if (best) {
      let finalDmg = dmg
      if (hasC('Superconductor') && (best.slow > 0 || best.frozen > 0)) finalDmg *= 1.5
      dealDamage(best, finalDmg, true)
      if (tr('thunder') >= 2) best.stunned = Math.max(best.stunned, 0.3)
      for (let i = 0; i <= 12; i++) { const t = i / 12; particlesRef.current.push({ x: source.x + (best.x - source.x) * t + (Math.random() - 0.5) * 14, y: source.y + (best.y - source.y) * t + (Math.random() - 0.5) * 14, vx: (Math.random() - 0.5) * 40, vy: (Math.random() - 0.5) * 40, life: 0.35, maxLife: 0.35, color: i % 3 === 0 ? '#fff' : '#fde047', size: 4 + Math.random() * 2 }) }
    }
  }

  function spawnParticles(x: number, y: number, color: string, count: number) {
    for (let i = 0; i < count; i++) { const a = Math.random() * Math.PI * 2, v = 80 + Math.random() * 100; particlesRef.current.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.4 + Math.random() * 0.3, maxLife: 0.6, color, size: 2 + Math.random() * 2 }) }
  }

  function applyDirectHitEffects(e: Enemy, dmg: number, hitIdx: number) {
    const p = playerRef.current
    let finalDmg = dmg
    if (tr('piercing') >= 3) finalDmg *= 1 + hitIdx * 0.05
    if (p.rageBuff > 0) finalDmg *= 1.3
    if (p.dodgeBuff > 0) finalDmg *= (hasC('Momentum') ? 1.4 : 1.2)
    if (e.corroded) finalDmg *= 1.25
    if (e.kind === 'shielded') {
      const hitAng = Math.atan2(e.y - p.y, e.x - p.x)
      if (Math.abs(hitAng - e.shieldAng) < 0.8) finalDmg *= 0.3
    }
    if (hasC('Sniper') && hitIdx === 0 && tr('piercing') >= 2) finalDmg *= 2
    applyHit(e, finalDmg, null)
    if (tr('powerShot') >= 3) {
      explosionsRef.current.push({ x: e.x, y: e.y, radius: 30, life: 0.3, maxLife: 0.3, dmg: finalDmg * 0.4, hitIds: new Set([getId(e)]) })
      spawnParticles(e.x, e.y, '#fbbf24', 6)
    }
    if (tr('splitShot') >= 1) {
      for (let si = 0; si < 2; si++) {
        const a = Math.atan2(e.y - p.y, e.x - p.x) + (si === 0 ? 0.5 : -0.5)
        const spd = 300
        pushProj(e.x, e.y, Math.cos(a) * spd, Math.sin(a) * spd, 0.5, finalDmg * 0.5, 4 * p.bulletSize, 'bolt', tr('splitShot') >= 2 ? 1 : 0, 0, false, false, { gen: 1 })
      }
    }
    if (tr('ricochet') >= 1) {
      const bCount = tr('ricochet') >= 2 ? 2 : 1
      let bTarget: Enemy | null = null, bDist = 160 * 160
      for (const e2 of enemiesRef.current) { if (e2 === e || e2.hp <= 0) continue; const d2 = (e2.x - e.x) ** 2 + (e2.y - e.y) ** 2; if (d2 < bDist) { bDist = d2; bTarget = e2 } }
      if (bTarget) {
        const a = Math.atan2(bTarget.y - e.y, bTarget.x - e.x)
        const bDmgMul = tr('ricochet') >= 2 ? 0.8 : 0.5
        pushProj(e.x, e.y, Math.cos(a) * 400, Math.sin(a) * 400, 0.8, finalDmg * bDmgMul, 5, 'bolt', 0, bCount - 1, false, tr('ricochet') >= 3, { gen: 1 })
      }
    }
  }

  // ─── Fire weapon ────────────────────────────────────────────────────────────

  function fireWeapon(w: Weapon) {
    const p = playerRef.current
    p.shotCount++
    const isDouble = tr('haste') >= 2 && Math.random() < (hasC('Overclock') ? 0.25 : 0.15)
    const isBurst = tr('haste') >= 3 && p.idleTimer >= 1
    const shots = isBurst ? 3 : (isDouble ? 2 : 1)
    if (isBurst) p.idleTimer = 0
    const isRF5Double = tr('rapidFire') >= 2 && p.shotCount % 5 === 0
    const extraSpread = tr('spreadMod') >= 1 ? 2 : 0
    const rearFire = tr('spreadMod') >= 2
    const orbit = tr('spreadMod') >= 3
    const basePierce = tr('piercing') >= 3 ? 999 : (tr('piercing') >= 1 ? 1 : 0) + (hasC('Bullet Storm') ? 1 : 0) + (hasC('Gun Mastery') ? 1 : 0)
    const bounceN = tr('ricochet') >= 2 ? 2 : tr('ricochet') >= 1 ? 1 : 0
    const dmg = wDmg(w.id, 1) * p.damageMult

    for (let shot = 0; shot < shots; shot++) {
      const fireOne = (aimX: number, aimY: number, rear: boolean) => {
        const fireSpread = (baseAimX: number, baseAimY: number, v: number, life: number, projDmg: number, r: number, kind: string, pc: number, bn: number, isRear: boolean) => {
          if (extraSpread > 0) {
            const base = Math.atan2(baseAimY, baseAimX)
            for (let i = 0; i < extraSpread; i++) {
              const a = base + (i === 0 ? 0.25 : -0.25)
              if (orbit) {
                const orbitR = 40, oa = base + (i === 0 ? 1 : -1) * Math.PI / 2
                pushProj(p.x + Math.cos(oa) * orbitR, p.y + Math.sin(oa) * orbitR, 0, 0, life, projDmg * 0.8, r * 0.85, kind, pc, bn, isRear, false, { orbitT: 0.25, orbitCX: p.x, orbitCY: p.y })
              } else {
                pushProj(p.x, p.y, Math.cos(a) * v, Math.sin(a) * v, life * 0.85, projDmg * 0.8, r * 0.85, kind, pc, bn, isRear, false)
              }
            }
          }
        }

        if (w.id === 'bolt') {
          const v = 520
          pushProj(p.x, p.y, aimX * v, aimY * v, 1.4, dmg, 6 * p.bulletSize, 'bolt', basePierce, bounceN, rear, false)
          fireSpread(aimX, aimY, v, 1.4, dmg, 6 * p.bulletSize, 'bolt', basePierce, bounceN, rear)
        } else if (w.id === 'shotgun') {
          const v = 420, count = shotgunN(1) + extraSpread
          const base = Math.atan2(aimY, aimX), coneWidth = 0.35
          for (let i = 0; i < count; i++) {
            const a = base + (Math.random() - 0.5) * coneWidth
            const spd = v * (0.85 + Math.random() * 0.3)
            pushProj(p.x, p.y, Math.cos(a) * spd, Math.sin(a) * spd, 0.50, dmg, 4 * p.bulletSize, 'shotgun', basePierce, bounceN, rear, false)
          }
        } else if (w.id === 'railgun') {
          const ang = Math.atan2(aimY, aimX)
          const beamW = 6 * p.bulletSize
          const railDmg = dmg * (isRF5Double && !rear ? 2 : 1)
          let hitIdx = 0
          for (const e of enemiesRef.current) {
            if (e.hp <= 0) continue
            const ex = e.x - p.x, ey = e.y - p.y
            const proj = ex * Math.cos(ang) + ey * Math.sin(ang)
            if (proj < 0 || proj > 800) continue
            const perp = Math.abs(-ex * Math.sin(ang) + ey * Math.cos(ang))
            if (perp < e.radius + beamW && hasLOS(p.x, p.y, e.x, e.y)) { applyDirectHitEffects(e, railDmg, hitIdx); hitIdx++ }
          }
          const beamColor = isRF5Double && !rear ? '#fff' : '#fde047'
          for (let i = 0; i < 20; i++) {
            const d = i * 40
            particlesRef.current.push({ x: p.x + Math.cos(ang) * d, y: p.y + Math.sin(ang) * d, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, life: 0.2, maxLife: 0.2, color: beamColor, size: 2 + beamW * 0.3 })
          }
        } else if (w.id === 'bomb') {
          const v = 320
          bombsRef.current.push({ x: p.x, y: p.y, vx: aimX * v, vy: aimY * v, life: 1.0, fuse: 0.6, dmg, radius: bombRad(1) })
        } else if (w.id === 'whip') {
          const reach = whipReach(1) * p.bulletSize
          const arc = 1.2 + (extraSpread > 0 ? 0.4 : 0)
          const baseAng = Math.atan2(aimY, aimX)
          const whipDmg = dmg * (isRF5Double && !rear ? 2 : 1)
          if (orbit) {
            const bladeR = reach * 0.7
            for (let i = 0; i < 2; i++) {
              const oa = baseAng + (i === 0 ? Math.PI / 2 : -Math.PI / 2)
              pushProj(p.x + Math.cos(oa) * bladeR, p.y + Math.sin(oa) * bladeR, 0, 0, 0.7, dmg * 0.3, 8 * p.bulletSize, 'whipblade', 2, 0, false, false, { orbitT: 0.35, orbitCX: p.x, orbitCY: p.y })
            }
          }
          let hitIdx = 0
          for (const e of enemiesRef.current) {
            if (e.hp <= 0) continue
            const dist = Math.hypot(e.x - p.x, e.y - p.y)
            if (dist > reach + e.radius) continue
            const a = Math.atan2(e.y - p.y, e.x - p.x)
            let diff = a - baseAng; while (diff > Math.PI) diff -= Math.PI * 2; while (diff < -Math.PI) diff += Math.PI * 2
            if (Math.abs(diff) > arc) continue
            if (!hasLOS(p.x, p.y, e.x, e.y)) continue
            applyDirectHitEffects(e, whipDmg, hitIdx); hitIdx++
          }
          whipSlashesRef.current.push({ x: p.x, y: p.y, ang: baseAng, arc, reach, life: isRF5Double && !rear ? 0.25 : 0.18, maxLife: isRF5Double && !rear ? 0.25 : 0.18 })
        } else if (w.id === 'boomerang') {
          const v = 350
          pushProj(p.x, p.y, aimX * v, aimY * v, 2.0, dmg, 8 * p.bulletSize, 'boomerang', 999, 0, rear, false, { originX: p.x, originY: p.y })
          if (extraSpread > 0) {
            const base = Math.atan2(aimY, aimX)
            for (let i = 0; i < extraSpread; i++) {
              const a = base + (i === 0 ? 0.3 : -0.3)
              if (orbit) {
                const orbitR = 50, oa = base + (i === 0 ? 1 : -1) * Math.PI / 2
                pushProj(p.x + Math.cos(oa) * orbitR, p.y + Math.sin(oa) * orbitR, 0, 0, 2.0, dmg * 0.7, 7 * p.bulletSize, 'boomerang', 999, 0, rear, false, { orbitT: 0.4, orbitCX: p.x, orbitCY: p.y, originX: p.x, originY: p.y })
              } else {
                pushProj(p.x, p.y, Math.cos(a) * v, Math.sin(a) * v, 2.0, dmg * 0.7, 7 * p.bulletSize, 'boomerang', 999, 0, rear, false, { originX: p.x, originY: p.y })
              }
            }
          }
        } else if (w.id === 'orb') {
          const v = 80
          pushProj(p.x, p.y, aimX * v, aimY * v, orbLife(1), dmg, 14 * p.bulletSize, 'orb', 999, 0, rear, false, { orbDmgTimer: 0 })
          if (orbit && extraSpread > 0) {
            const base = Math.atan2(aimY, aimX)
            for (let i = 0; i < extraSpread; i++) {
              const orbitR = 55, oa = base + (i === 0 ? 1 : -1) * Math.PI / 2
              pushProj(p.x + Math.cos(oa) * orbitR, p.y + Math.sin(oa) * orbitR, 0, 0, orbLife(1), dmg * 0.7, 12 * p.bulletSize, 'orb', 999, 0, rear, false, { orbitT: 0.5, orbitCX: p.x, orbitCY: p.y, orbDmgTimer: 0 })
            }
          }
        }
        // Drone fires automatically — handled in step, not here
      }

      if (w.id === 'drone') {
        const da = timeRef.current * 3, dr = 22
        const droneX = p.x + Math.cos(da) * dr, droneY = p.y + Math.sin(da) * dr
        let nearest: Enemy | null = null, nearD = 400 * 400
        for (const e of enemiesRef.current) {
          if (e.hp <= 0) continue
          const d2 = (e.x - droneX) ** 2 + (e.y - droneY) ** 2
          if (d2 < nearD && hasLOS(droneX, droneY, e.x, e.y)) { nearD = d2; nearest = e }
        }
        const fireDrone = (ox: number, oy: number, tx: number, ty: number) => {
          const fd = Math.hypot(tx - ox, ty - oy) || 1
          const fax = (tx - ox) / fd, fay = (ty - oy) / fd, v = 440
          pushProj(ox, oy, fax * v, fay * v, 1.2, dmg, 5 * p.bulletSize, 'drone', basePierce, bounceN, false, true)
          if (extraSpread > 0) {
            const base = Math.atan2(fay, fax)
            for (let si = 0; si < extraSpread; si++) {
              const a = base + (si === 0 ? 0.25 : -0.25)
              if (orbit) {
                const orbitR = 40, oa = base + (si === 0 ? 1 : -1) * Math.PI / 2
                pushProj(ox + Math.cos(oa) * orbitR, oy + Math.sin(oa) * orbitR, 0, 0, 1.2, dmg * 0.8, 4 * p.bulletSize, 'drone', basePierce, bounceN, false, true, { orbitT: 0.25, orbitCX: ox, orbitCY: oy })
              } else {
                pushProj(ox, oy, Math.cos(a) * v, Math.sin(a) * v, 1.0, dmg * 0.8, 4 * p.bulletSize, 'drone', basePierce, bounceN, false, true)
              }
            }
          }
        }
        if (nearest) {
          fireDrone(droneX, droneY, nearest.x, nearest.y)
          if (rearFire) fireDrone(droneX, droneY, 2 * droneX - nearest.x, 2 * droneY - nearest.y)
          if (isRF5Double) fireDrone(droneX, droneY, nearest.x, nearest.y)
        }
      } else {
        fireOne(p.aimX, p.aimY, false)
        if (rearFire) fireOne(-p.aimX, -p.aimY, true)
        if (isRF5Double && w.id !== 'whip' && w.id !== 'railgun') fireOne(p.aimX, p.aimY, false)
      }
    }

    w.cooldown = wCD(w.id, 1) * p.cooldownMult
  }

  function pushProj(x: number, y: number, vx: number, vy: number, life: number, dmg: number, radius: number, kind: string, pierce: number, bounces: number, isRear: boolean, isHoming: boolean, extra?: Partial<Projectile>) {
    projsRef.current.push({ x, y, vx, vy, life, dmg, radius, kind, pierce, hitIds: new Set(), trail: [], gen: 0, bounces, isRear, isHoming, pierceCount: 0, orbitT: 0, orbitCX: 0, orbitCY: 0, returning: false, originX: x, originY: y, orbDmgTimer: 0, ...extra })
  }

  // ─── Upgrades ───────────────────────────────────────────────────────────────

  function rollUpgrades(): UpgradeOption[] {
    const opts: UpgradeOption[] = []
    const passiveCount = TREES.filter(t => t.cat === 'passive' && tr(t.id) > 0).length
    for (const tree of TREES) {
      if (tree.cat === 'special') continue
      const cur = tr(tree.id)
      if (cur >= 3) continue
      if (tree.cat === 'passive' && cur === 0 && passiveCount >= 5) continue
      opts.push({ kind: 'tree', treeId: tree.id, nextTier: cur + 1 })
    }
    for (let i = opts.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [opts[i], opts[j]] = [opts[j], opts[i]] }
    return opts.slice(0, 3)
  }

  function triggerLevelUp() {
    const choices = rollUpgrades()
    if (choices.length === 0) return
    setChoices(choices)
    inputRef.current = { up: false, down: false, left: false, right: false, aimUp: false, aimDown: false, aimLeft: false, aimRight: false }
    phaseRef.current = 'paused'; setPhase('paused')
  }

  function triggerBossReward() {
    const p = playerRef.current
    p.hp = Math.min(p.maxHp, p.hp + 25)
    const specials = TREES.filter(t => t.cat === 'special' && tr(t.id) < 3)
    if (specials.length === 0) return
    const choices: UpgradeOption[] = specials.slice(0, 3).map(t => ({ kind: 'tree', treeId: t.id, nextTier: tr(t.id) + 1 }))
    setChoices(choices)
    inputRef.current = { up: false, down: false, left: false, right: false, aimUp: false, aimDown: false, aimLeft: false, aimRight: false }
    phaseRef.current = 'bossreward'; setPhase('bossreward')
  }

  function applyUpgrade(opt: UpgradeOption) {
    const p = playerRef.current
    if (opt.kind === 'weaponLevel') { const w = weaponsRef.current.find(x => x.id === opt.weaponId); if (w) w.level++ }
    else if (opt.kind === 'tree') {
      p.trees[opt.treeId] = opt.nextTier
      if (opt.treeId === 'hexAura' && p.auraT === 0) p.auraT = 0.6
      if (opt.treeId === 'pulseNova' && p.novaT === 0) p.novaT = tr('pulseNova') >= 2 ? 5 : 8
      if (opt.treeId === 'gale' && opt.nextTier === 3 && p.galeVortexT === 0) p.galeVortexT = 6
      if (opt.treeId === 'vitality' && opt.nextTier === 1) p.hp = Math.min(80, p.hp + 20)
    }
    recomputeStats()
    setChoices(null)
    // Push-back on resume, then clamp to obstacles
    for (const e of enemiesRef.current) {
      if (e.hp <= 0) continue; const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy)
      if (d < 120 && d > 0) { const push = (120 - d) + 60; e.x += (dx / d) * push; e.y += (dy / d) * push }
      for (const ob of mapRef.current.obstacles) {
        const cx = Math.max(ob.x, Math.min(ob.x + ob.w, e.x)), cy = Math.max(ob.y, Math.min(ob.y + ob.h, e.y))
        const ddx = e.x - cx, ddy = e.y - cy, dd = Math.hypot(ddx, ddy)
        if (dd < e.radius && dd > 0) { e.x += (ddx / dd) * (e.radius - dd); e.y += (ddy / dd) * (e.radius - dd) }
      }
    }
    p.invul = Math.max(p.invul, 0.8)
    phaseRef.current = 'playing'; setPhase('playing')
    setTimeout(() => canvasRef.current?.focus(), 10)
  }

  function finishRun(won: boolean) {
    if (phaseRef.current === 'dead' || phaseRef.current === 'won') return
    phaseRef.current = won ? 'won' : 'dead'; setPhase(won ? 'won' : 'dead')
    const t = Math.floor(timeRef.current), k = killsRef.current
    const newBest = { time: Math.max(best.time, t), kills: Math.max(best.kills, k) }
    if (newBest.time !== best.time || newBest.kills !== best.kills) { setBest(newBest); window.api.settings.set(SAVE_KEY, JSON.stringify(newBest)).catch(() => {}) }
  }

  // ─── Draw ───────────────────────────────────────────────────────────────────

  function draw() {
    const c = canvasRef.current; if (!c) return
    const ctx = c.getContext('2d')!
    const p = playerRef.current
    const shake = shakeRef.current
    const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0, sy = shake > 0 ? (Math.random() - 0.5) * shake : 0
    const camX = p.x - W / 2 + sx, camY = p.y - H / 2 + sy

    const mp = mapRef.current
    const g = ctx.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W)
    g.addColorStop(0, mp.id === 'void' ? '#0b0e14' : mp.bgColor); g.addColorStop(1, mp.bgColor)
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H)

    ctx.strokeStyle = mp.gridColor; ctx.lineWidth = 1
    const grid = 64, startX = Math.floor(camX / grid) * grid, startY = Math.floor(camY / grid) * grid
    for (let gx = startX; gx < camX + W + grid; gx += grid) { ctx.beginPath(); ctx.moveTo(gx - camX, 0); ctx.lineTo(gx - camX, H); ctx.stroke() }
    for (let gy = startY; gy < camY + H + grid; gy += grid) { ctx.beginPath(); ctx.moveTo(0, gy - camY); ctx.lineTo(W, gy - camY); ctx.stroke() }

    for (const s of starsRef.current) { ctx.fillStyle = s.size === 1 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.9)'; ctx.fillRect(s.x, s.y, s.size, s.size) }

    // Obstacles
    for (const ob of mp.obstacles) {
      const ox = ob.x - camX, oy = ob.y - camY
      if (ox + ob.w < -10 || ox > W + 10 || oy + ob.h < -10 || oy > H + 10) continue
      if (ob.kind === 'stone') { ctx.fillStyle = 'rgba(120, 100, 70, 0.6)'; ctx.fillRect(ox, oy, ob.w, ob.h); ctx.strokeStyle = 'rgba(180, 140, 80, 0.4)'; ctx.lineWidth = 1; ctx.strokeRect(ox, oy, ob.w, ob.h) }
      else if (ob.kind === 'wall') { ctx.fillStyle = 'rgba(90, 75, 55, 0.7)'; ctx.fillRect(ox, oy, ob.w, ob.h); ctx.strokeStyle = 'rgba(160, 120, 60, 0.5)'; ctx.lineWidth = 2; ctx.strokeRect(ox, oy, ob.w, ob.h) }
      else if (ob.kind === 'ice') { ctx.fillStyle = 'rgba(103, 232, 249, 0.15)'; ctx.fillRect(ox, oy, ob.w, ob.h); ctx.strokeStyle = 'rgba(103, 232, 249, 0.3)'; ctx.lineWidth = 1; ctx.strokeRect(ox, oy, ob.w, ob.h) }
      else if (ob.kind === 'rock') { ctx.fillStyle = 'rgba(80, 40, 20, 0.7)'; ctx.fillRect(ox, oy, ob.w, ob.h); ctx.strokeStyle = 'rgba(251, 146, 60, 0.3)'; ctx.lineWidth = 1; ctx.strokeRect(ox, oy, ob.w, ob.h) }
      else if (ob.kind === 'mazeWall') { ctx.fillStyle = 'rgba(140, 140, 150, 0.7)'; ctx.fillRect(ox, oy, ob.w, ob.h); ctx.strokeStyle = 'rgba(200, 200, 210, 0.25)'; ctx.lineWidth = 1; ctx.strokeRect(ox, oy, ob.w, ob.h) }
    }

    // Hazards
    if (mp.hazards) {
      for (const hz of mp.hazards) {
        const hx = hz.x - camX, hy = hz.y - camY
        if (hx + hz.radius < -10 || hx - hz.radius > W + 10 || hy + hz.radius < -10 || hy - hz.radius > H + 10) continue
        ctx.globalAlpha = 0.35
        if (hz.kind === 'lava') { ctx.fillStyle = '#dc2626'; ctx.beginPath(); ctx.arc(hx, hy, hz.radius, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fb923c'; ctx.lineWidth = 2; ctx.stroke() }
        else if (hz.kind === 'icePool') { ctx.fillStyle = '#67e8f9'; ctx.beginPath(); ctx.arc(hx, hy, hz.radius, 0, Math.PI * 2); ctx.fill() }
        ctx.globalAlpha = 1
      }
    }

    // Zones
    for (const z of zonesRef.current) {
      const cx = z.x - camX, cy = z.y - camY
      ctx.globalAlpha = Math.min(0.3, z.life * 0.2)
      ctx.fillStyle = z.kind === 'fire' ? '#dc2626' : z.kind === 'poison' ? '#65a30d' : z.kind === 'storm' ? '#fde047' : '#a78bfa'
      ctx.beginPath(); ctx.arc(cx, cy, z.radius, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = 1
    }

    // Tornados
    for (const tn of tornadosRef.current) {
      const tx = tn.x - camX, ty = tn.y - camY
      const alpha = Math.min(0.85, tn.life / tn.maxLife * 0.7 + 0.3)
      // Glow
      ctx.globalAlpha = alpha * 0.3
      ctx.fillStyle = '#a3e635'
      ctx.beginPath(); ctx.arc(tx, ty, tn.radius * 1.2, 0, Math.PI * 2); ctx.fill()
      // Spinning arcs
      ctx.globalAlpha = alpha
      ctx.save(); ctx.translate(tx, ty); ctx.rotate(tn.spin)
      ctx.strokeStyle = '#d9f99d'; ctx.lineWidth = 3
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2, r = tn.radius * 0.7
        ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.25, Math.sin(a) * r * 0.25, r * 0.55, a, a + 1.6); ctx.stroke()
      }
      ctx.strokeStyle = '#a3e635'; ctx.lineWidth = 1.5
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + 0.4, r = tn.radius * 0.45
        ctx.beginPath(); ctx.arc(Math.cos(a) * r * 0.2, Math.sin(a) * r * 0.2, r * 0.6, a, a + 1.2); ctx.stroke()
      }
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill()
      ctx.restore(); ctx.globalAlpha = 1
    }

    // Particles
    for (const pa of particlesRef.current) { ctx.globalAlpha = Math.max(0, pa.life / pa.maxLife); ctx.fillStyle = pa.color; ctx.fillRect(pa.x - camX - pa.size / 2, pa.y - camY - pa.size / 2, pa.size, pa.size) }
    ctx.globalAlpha = 1

    // Gems
    for (const gem of gemsRef.current) { const cx = gem.x - camX, cy = gem.y - camY; if (cx < -20 || cx > W + 20 || cy < -20 || cy > H + 20) continue; ctx.fillStyle = gem.value >= 3 ? '#06b6d4' : '#67e8f9'; ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx + 5, cy); ctx.lineTo(cx, cy + 6); ctx.lineTo(cx - 5, cy); ctx.closePath(); ctx.fill() }

    // Enemies
    for (const e of enemiesRef.current) {
      const cx = e.x - camX, cy = e.y - camY
      if (cx < -40 || cx > W + 40 || cy < -40 || cy > H + 40) continue
      drawEnemy(ctx, cx, cy, e)
    }

    // Enemy bullets
    for (const b of eBulletsRef.current) { const cx = b.x - camX, cy = b.y - camY; ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.fill() }

    // Bombs
    for (const b of bombsRef.current) { const cx = b.x - camX, cy = b.y - camY; ctx.fillStyle = '#3f3f46'; ctx.beginPath(); ctx.arc(cx, cy, 7, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = b.fuse < 0.2 ? '#fef08a' : '#fbbf24'; ctx.lineWidth = 2; ctx.stroke() }

    // Explosions
    for (const ex of explosionsRef.current) { const cx = ex.x - camX, cy = ex.y - camY, t = 1 - ex.life / ex.maxLife, r = ex.radius * (0.4 + 0.6 * t); ctx.globalAlpha = (1 - t) * 0.7; ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1 }

    // Projectiles
    for (const pr of projsRef.current) {
      const cx = pr.x - camX, cy = pr.y - camY
      if (pr.trail) { for (const t of pr.trail) { ctx.globalAlpha = Math.max(0, t.life / 0.18) * 0.4; ctx.fillStyle = pr.kind === 'beam' ? '#fde047' : pr.kind === 'shard' ? '#dc2626' : '#60a5fa'; ctx.beginPath(); ctx.arc(t.x - camX, t.y - camY, pr.radius * 0.6, 0, Math.PI * 2); ctx.fill() } ctx.globalAlpha = 1 }
      if (pr.kind === 'whipblade') {
        ctx.save(); ctx.translate(cx, cy); ctx.rotate(Math.atan2(pr.vy || (pr.y - pr.orbitCY), pr.vx || (pr.x - pr.orbitCX)))
        ctx.fillStyle = '#c4b5fd'; ctx.beginPath(); ctx.ellipse(0, 0, pr.radius * 1.8, pr.radius * 0.5, 0, 0, Math.PI * 2); ctx.fill()
        ctx.strokeStyle = '#e9d5ff'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.restore()
        continue
      }
      const pColor = pr.kind === 'shard' ? '#fca5a5' : pr.kind === 'shotgun' ? '#f97316' : pr.kind === 'boomerang' ? '#34d399' : pr.kind === 'orb' ? '#a78bfa' : pr.kind === 'drone' ? '#22d3ee' : '#60a5fa'
      ctx.fillStyle = pColor; ctx.beginPath(); ctx.arc(cx, cy, pr.radius, 0, Math.PI * 2); ctx.fill()
      if (pr.kind === 'bolt' || pr.kind === 'drone') { ctx.fillStyle = '#dbeafe'; ctx.beginPath(); ctx.arc(cx, cy, pr.radius * 0.5, 0, Math.PI * 2); ctx.fill() }
      if (pr.kind === 'orb') { ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.arc(cx, cy, pr.radius * 1.5, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1 }
      if (pr.kind === 'boomerang') { ctx.strokeStyle = '#059669'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, pr.radius + 2, 0, Math.PI); ctx.stroke() }
    }

    // Whip slashes
    for (const ws of whipSlashesRef.current) {
      const t = 1 - ws.life / ws.maxLife
      const cx = ws.x - camX, cy = ws.y - camY
      const sweepProgress = Math.min(1, t * 3)
      const drawArc = ws.arc * sweepProgress
      ctx.globalAlpha = ws.life / ws.maxLife * 0.85
      const innerR = ws.reach * 0.3, outerR = ws.reach
      const gradient = ctx.createRadialGradient(cx, cy, innerR, cx, cy, outerR)
      gradient.addColorStop(0, 'rgba(167, 139, 252, 0)')
      gradient.addColorStop(0.5, 'rgba(167, 139, 252, 0.5)')
      gradient.addColorStop(1, 'rgba(196, 181, 253, 0.8)')
      ctx.fillStyle = gradient
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(ws.ang - drawArc) * innerR, cy + Math.sin(ws.ang - drawArc) * innerR)
      ctx.arc(cx, cy, outerR, ws.ang - drawArc, ws.ang + drawArc)
      ctx.arc(cx, cy, innerR, ws.ang + drawArc, ws.ang - drawArc, true)
      ctx.closePath(); ctx.fill()
      ctx.strokeStyle = '#c4b5fd'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(cx, cy, outerR, ws.ang - drawArc, ws.ang + drawArc); ctx.stroke()
      ctx.globalAlpha = 1
    }

    // Hex Aura ring
    if (tr('hexAura') >= 1) {
      const px = p.x - camX, py = p.y - camY
      const aR = tr('hexAura') >= 2 ? 126 : 90
      const isInferno = hasC('Inferno')
      const pulse = 0.5 + 0.5 * Math.sin(timeRef.current * 6)
      // Outer glow
      ctx.globalAlpha = 0.08 + pulse * 0.06
      const glow = ctx.createRadialGradient(px, py, aR * 0.5, px, py, aR * 1.1)
      glow.addColorStop(0, 'rgba(0,0,0,0)')
      glow.addColorStop(0.6, isInferno ? 'rgba(251,146,60,0.3)' : 'rgba(167,139,252,0.3)')
      glow.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = glow
      ctx.beginPath(); ctx.arc(px, py, aR * 1.1, 0, Math.PI * 2); ctx.fill()
      // Ring
      ctx.globalAlpha = 0.25 + pulse * 0.15
      ctx.strokeStyle = isInferno ? '#fb923c' : '#a78bfa'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.arc(px, py, aR, 0, Math.PI * 2); ctx.stroke()
      // Spinning runes
      ctx.globalAlpha = 0.4 + pulse * 0.2
      const runeCount = tr('hexAura') >= 2 ? 8 : 6
      const spinRate = tr('hexAura') >= 3 ? 1.5 : 1.0
      for (let i = 0; i < runeCount; i++) {
        const a = (i / runeCount) * Math.PI * 2 + timeRef.current * spinRate
        const rx = px + Math.cos(a) * aR, ry = py + Math.sin(a) * aR
        ctx.fillStyle = isInferno ? '#fde68a' : '#e9d5ff'
        ctx.fillRect(rx - 2, ry - 2, 4, 4)
      }
      if (tr('hexAura') >= 3) {
        ctx.globalAlpha = 0.12 + pulse * 0.06
        ctx.strokeStyle = isInferno ? '#fde68a' : '#c4b5fd'; ctx.lineWidth = 1
        ctx.setLineDash([4, 8])
        ctx.beginPath(); ctx.arc(px, py, aR * 0.7, 0, Math.PI * 2); ctx.stroke()
        ctx.setLineDash([])
      }
      ctx.globalAlpha = 1
    }

    // Player
    drawPlayer(ctx, p.x - camX, p.y - camY, p)
    // Drone companion visual
    if (weaponsRef.current.length > 0 && weaponsRef.current[0].id === 'drone') {
      const da = timeRef.current * 3, dr = 22
      const dx = p.x - camX + Math.cos(da) * dr, dy = p.y - camY + Math.sin(da) * dr
      ctx.fillStyle = '#0e7490'; ctx.beginPath(); ctx.arc(dx, dy, 5, 0, Math.PI * 2); ctx.fill()
      ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 1.5; ctx.stroke()
      ctx.fillStyle = '#67e8f9'; ctx.fillRect(dx - 1.5, dy - 1.5, 3, 3)
    }

    // Damage text
    for (const d of dmgTextsRef.current) { ctx.fillStyle = d.color; ctx.globalAlpha = Math.min(1, d.life * 2); ctx.font = 'bold 11px ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillText(d.text, d.x - camX, d.y - camY); ctx.globalAlpha = 1 }

    // Crosshair cursor
    const ms = mouseRef.current
    if (ms.inCanvas && phaseRef.current === 'playing') {
      const mx = ms.x, my = ms.y
      ctx.strokeStyle = ms.down ? 'rgba(251, 191, 36, 0.9)' : 'rgba(255, 255, 255, 0.6)'
      ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(mx - 10, my); ctx.lineTo(mx - 4, my); ctx.moveTo(mx + 4, my); ctx.lineTo(mx + 10, my)
      ctx.moveTo(mx, my - 10); ctx.lineTo(mx, my - 4); ctx.moveTo(mx, my + 4); ctx.lineTo(mx, my + 10); ctx.stroke()
      ctx.beginPath(); ctx.arc(mx, my, 2, 0, Math.PI * 2); ctx.stroke()
    }

    // Darkness overlay — raycasted visibility (grid-accelerated)
    if (darkModeRef.current && (phaseRef.current === 'playing' || phaseRef.current === 'paused' || phaseRef.current === 'bossreward')) {
      const pcx = p.x - camX, pcy = p.y - camY
      const MAX_R = 500, RAYS = 180, STEP = 12
      const obs = mapRef.current.obstacles
      // Build spatial grid for fast lookups (64px cells)
      const GS = 64, GW = Math.ceil(mapRef.current.worldW / GS), GH = Math.ceil(mapRef.current.worldH / GS)
      let grid = (canvasRef.current as any).__darkGrid as Map<number, Obstacle[]> | undefined
      let gridKey = (canvasRef.current as any).__darkGridKey as number | undefined
      const obsLen = obs.length
      if (!grid || gridKey !== obsLen) {
        grid = new Map(); (canvasRef.current as any).__darkGrid = grid; (canvasRef.current as any).__darkGridKey = obsLen
        for (const ob of obs) {
          const c0 = Math.floor(ob.x / GS), c1 = Math.floor((ob.x + ob.w) / GS)
          const r0 = Math.floor(ob.y / GS), r1 = Math.floor((ob.y + ob.h) / GS)
          for (let gr = r0; gr <= r1; gr++) for (let gc = c0; gc <= c1; gc++) {
            const k = gr * GW + gc; let arr = grid.get(k); if (!arr) { arr = []; grid.set(k, arr) }; arr.push(ob)
          }
        }
      }
      const dists = new Float32Array(RAYS)
      for (let i = 0; i < RAYS; i++) {
        const ang = (i / RAYS) * Math.PI * 2
        const dx = Math.cos(ang), dy = Math.sin(ang)
        let hitDist = MAX_R
        for (let step = STEP; step <= MAX_R; step += STEP) {
          const wx = p.x + dx * step, wy = p.y + dy * step
          const gc = Math.floor(wx / GS), gr = Math.floor(wy / GS)
          const cell = grid.get(gr * GW + gc)
          if (cell) { for (const ob of cell) { if (wx >= ob.x && wx <= ob.x + ob.w && wy >= ob.y && wy <= ob.y + ob.h) { hitDist = step; break } }; if (hitDist < MAX_R) break }
        }
        dists[i] = hitDist
      }
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < RAYS; i++) {
          const prev = dists[(i - 1 + RAYS) % RAYS], next = dists[(i + 1) % RAYS]
          const c = Math.min(prev, next) + STEP * 3
          if (dists[i] > c) dists[i] = c
        }
      }
      const pts = new Float32Array(RAYS * 2)
      for (let i = 0; i < RAYS; i++) {
        const ang = (i / RAYS) * Math.PI * 2
        pts[i * 2] = pcx + Math.cos(ang) * dists[i]; pts[i * 2 + 1] = pcy + Math.sin(ang) * dists[i]
      }
      try {
        let offC = (canvasRef.current as any).__darkBuf as OffscreenCanvas | undefined
        if (!offC || offC.width !== W) { offC = new OffscreenCanvas(W, H); (canvasRef.current as any).__darkBuf = offC }
        const oc = offC.getContext('2d')!
        oc.clearRect(0, 0, W, H)
        oc.fillStyle = '#000'; oc.fillRect(0, 0, W, H)
        oc.globalCompositeOperation = 'destination-out'
        const grad = oc.createRadialGradient(pcx, pcy, 0, pcx, pcy, MAX_R)
        grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(0.7, 'rgba(255,255,255,0.8)'); grad.addColorStop(1, 'rgba(255,255,255,0)')
        oc.fillStyle = grad
        oc.beginPath(); oc.moveTo(pts[0], pts[1])
        for (let i = 1; i < RAYS; i++) oc.lineTo(pts[i * 2], pts[i * 2 + 1])
        oc.closePath(); oc.fill()
        oc.globalCompositeOperation = 'source-over'
        ctx.save(); ctx.filter = 'blur(6px)'; ctx.drawImage(offC, 0, 0); ctx.filter = 'none'; ctx.restore()
      } catch {
        ctx.fillStyle = '#000'; ctx.beginPath(); ctx.rect(0, 0, W, H)
        ctx.moveTo(pts[0], pts[1])
        for (let i = 1; i < RAYS; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1])
        ctx.closePath(); ctx.fill('evenodd')
      }
    }

    // HUD
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(10, 10, 200, 16)
    ctx.fillStyle = '#dc2626'; ctx.fillRect(12, 12, 196 * (Math.max(0, p.hp) / p.maxHp), 12)
    ctx.fillStyle = '#fff'; ctx.font = 'bold 10px ui-monospace, monospace'; ctx.textAlign = 'left'
    ctx.fillText(`${Math.ceil(Math.max(0, p.hp))} / ${p.maxHp}`, 14, 22)
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(10, 30, 200, 8)
    ctx.fillStyle = '#22d3ee'; ctx.fillRect(11, 31, 198 * (p.xp / xpToNext(p.level)), 6)
    // Weapon slots
    const slotY = H - 36
    for (let i = 0; i < weaponsRef.current.length; i++) {
      const w = weaponsRef.current[i], sxw = 10 + i * 56
      ctx.fillStyle = i === p.weaponIdx ? 'rgba(168, 85, 247, 0.35)' : 'rgba(0, 0, 0, 0.55)'
      ctx.fillRect(sxw, slotY, 48, 28)
      ctx.strokeStyle = i === p.weaponIdx ? '#c084fc' : 'rgba(255, 255, 255, 0.18)'; ctx.lineWidth = 1.5; ctx.strokeRect(sxw + 0.5, slotY + 0.5, 47, 27)
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px ui-monospace, monospace'; ctx.textAlign = 'center'
      ctx.fillText(`${i + 1}`, sxw + 8, slotY + 12)
      ctx.font = '9px ui-monospace, monospace'; ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fillText(w.id, sxw + 28, slotY + 12)
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillText(`L${w.level}`, sxw + 28, slotY + 22)
    }
    ctx.fillStyle = '#fff'; ctx.font = 'bold 12px ui-monospace, monospace'; ctx.textAlign = 'right'
    const mins = Math.floor(timeRef.current / 60), secs = Math.floor(timeRef.current % 60).toString().padStart(2, '0')
    ctx.fillText(`${mins}:${secs}`, W - 12, 22)
    ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.font = '10px ui-monospace, monospace'
    ctx.fillText(`${killsRef.current} kills`, W - 12, 36)

    // Active upgrades mini-display
    let uy = 50
    ctx.textAlign = 'right'; ctx.font = '9px ui-monospace, monospace'
    for (const tree of TREES) {
      const tier = tr(tree.id)
      if (tier > 0) {
        ctx.fillStyle = tree.cat === 'element' ? '#fb923c' : tree.cat === 'weaponMod' ? '#60a5fa' : tree.cat === 'passive' ? '#4ade80' : '#c084fc'
        ctx.fillText(`${tree.name} T${tier}`, W - 12, uy)
        uy += 11
        if (uy > H - 50) break
      }
    }
  }

  function drawPlayer(ctx: CanvasRenderingContext2D, x: number, y: number, p: Player) {
    const flicker = p.invul > 0 && Math.floor(p.invul * 14) % 2 === 0
    ctx.save(); ctx.translate(x, y)
    ctx.fillStyle = flicker ? '#fde68a' : '#1e293b'; ctx.fillRect(-12, -12, 24, 24)
    ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 1.5; ctx.strokeRect(-12, -12, 24, 24)
    ctx.fillStyle = '#0f172a'; ctx.fillRect(-12, -12, 4, 24); ctx.fillRect(8, -12, 4, 24)
    ctx.fillStyle = '#475569'; for (let i = 0; i < 5; i++) { ctx.fillRect(-12, -10 + i * 5, 4, 2); ctx.fillRect(8, -10 + i * 5, 4, 2) }
    ctx.rotate(p.facing); ctx.fillStyle = '#0f172a'; ctx.fillRect(-4, -3, 14, 6); ctx.fillStyle = '#38bdf8'; ctx.fillRect(8, -2, 6, 4)
    ctx.rotate(-p.facing); ctx.fillStyle = flicker ? '#fef08a' : '#22d3ee'; ctx.fillRect(-2, -2, 4, 4)
    ctx.restore()
    if (p.isAiming) { ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)'; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.beginPath(); ctx.moveTo(x + p.aimX * 14, y + p.aimY * 14); ctx.lineTo(x + p.aimX * 34, y + p.aimY * 34); ctx.stroke(); ctx.setLineDash([]) }
  }

  function drawEnemy(ctx: CanvasRenderingContext2D, x: number, y: number, e: Enemy) {
    const flash = e.hitTimer > 0, r = e.radius
    const frozen = e.frozen > 0
    if (e.kind === 'zombie') { ctx.fillStyle = flash ? '#fff' : frozen ? '#67e8f9' : '#1f2937'; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.strokeStyle = '#dc2626'; ctx.lineWidth = 1; ctx.strokeRect(x - r + 0.5, y - r + 0.5, r * 2 - 1, r * 2 - 1); ctx.fillStyle = '#7f1d1d'; ctx.fillRect(x - r + 2, y - 2, r * 2 - 4, 4) }
    else if (e.kind === 'bat') { ctx.fillStyle = flash ? '#fff' : frozen ? '#67e8f9' : '#312e81'; ctx.beginPath(); ctx.moveTo(x, y - r); ctx.lineTo(x + r, y); ctx.lineTo(x, y + r); ctx.lineTo(x - r, y); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#818cf8'; ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = '#67e8f9'; ctx.fillRect(x - 2, y - 2, 4, 4) }
    else if (e.kind === 'skeleton') { ctx.fillStyle = flash ? '#fff' : frozen ? '#67e8f9' : '#374151'; ctx.fillRect(x - r + 2, y - r, r * 2 - 4, r * 2); ctx.fillStyle = '#fb923c'; ctx.fillRect(x - 4, y - 4, 2, 2); ctx.fillRect(x + 2, y - 4, 2, 2) }
    else if (e.kind === 'wraith') { ctx.fillStyle = flash ? '#fff' : frozen ? '#67e8f9' : 'rgba(15, 23, 42, 0.85)'; ctx.beginPath(); ctx.moveTo(x - r, y - r * 0.6); ctx.lineTo(x, y - r); ctx.lineTo(x + r, y - r * 0.6); ctx.lineTo(x + r * 0.5, y + r); ctx.lineTo(x - r * 0.5, y + r); ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#06b6d4'; ctx.lineWidth = 1.5; ctx.stroke() }
    else if (e.kind === 'shooter') { ctx.fillStyle = flash ? '#fff' : frozen ? '#67e8f9' : '#7f1d1d'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 1.5; ctx.stroke(); ctx.fillStyle = '#fca5a5'; ctx.fillRect(x - 2, y - 2, 4, 4); const a = Math.atan2(playerRef.current.y - e.y, playerRef.current.x - e.x); ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * (r + 4), y + Math.sin(a) * (r + 4)); ctx.stroke() }
    else if (e.kind === 'swarmer') { ctx.fillStyle = flash ? '#fff' : frozen ? '#67e8f9' : '#4c1d95'; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = '#c4b5fd'; ctx.fillRect(x - 1, y - 1, 2, 2) }
    else if (e.kind === 'tank') { ctx.fillStyle = flash ? '#fff' : frozen ? '#67e8f9' : '#1c1917'; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.strokeStyle = '#a16207'; ctx.lineWidth = 3; ctx.strokeRect(x - r, y - r, r * 2, r * 2); ctx.fillStyle = '#fbbf24'; ctx.fillRect(x - 4, y - 4, 8, 8) }
    else if (e.kind === 'shielded') { ctx.fillStyle = flash ? '#fff' : frozen ? '#67e8f9' : '#1e3a5f'; ctx.fillRect(x - r, y - r, r * 2, r * 2); ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1; ctx.strokeRect(x - r, y - r, r * 2, r * 2); const sa = e.shieldAng; ctx.strokeStyle = '#93c5fd'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(x, y, r + 3, sa - 0.8, sa + 0.8); ctx.stroke() }
    else if (e.kind === 'boss') { ctx.fillStyle = flash ? '#fff' : '#7f1d1d'; ctx.beginPath(); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 - Math.PI / 2, px = x + Math.cos(a) * r, py = y + Math.sin(a) * r; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py) } ctx.closePath(); ctx.fill(); ctx.strokeStyle = '#fbbf24'; ctx.lineWidth = 2; ctx.stroke(); ctx.fillStyle = '#fef08a'; ctx.fillRect(x - 4, y - 4, 8, 8); ctx.fillStyle = '#1f2937'; ctx.fillRect(x - 22, y - r - 9, 44, 5); ctx.fillStyle = '#fbbf24'; ctx.fillRect(x - 22, y - r - 9, 44 * Math.max(0, e.hp / e.maxHp), 5) }
    // HP bar (non-boss)
    if (e.kind !== 'boss' && e.hp < e.maxHp) { ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(x - 12, y - r - 5, 24, 2); ctx.fillStyle = '#ef4444'; ctx.fillRect(x - 12, y - r - 5, 24 * Math.max(0, e.hp / e.maxHp), 2) }
    // Venom stacks indicator
    if (e.venomStacks > 0) { ctx.fillStyle = '#65a30d'; for (let i = 0; i < e.venomStacks; i++) ctx.fillRect(x - 10 + i * 5, y + r + 2, 3, 3) }
    // Corroded glow
    if (e.corroded) { ctx.strokeStyle = '#a3e635'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(x, y, r + 2, 0, Math.PI * 2); ctx.stroke() }
  }

  function fmtTime(s: number) { const m = Math.floor(s / 60), ss = Math.floor(s % 60).toString().padStart(2, '0'); return `${m}:${ss}` }

  // ─── JSX ────────────────────────────────────────────────────────────────────

  const p = playerRef.current

  function descOpt(opt: UpgradeOption): { name: string; desc: string; level: string } {
    if (opt.kind === 'tree') {
      const tree = TREE_MAP.get(opt.treeId)!
      return { name: tree.name, desc: tree.t[opt.nextTier - 1], level: `Tier ${opt.nextTier}/3` }
    }
    return { name: '', desc: '', level: '' }
  }

  function comboHints(opt: UpgradeOption): string[] {
    if (opt.kind !== 'tree') return []
    const hints: string[] = []
    for (const c of COMBOS) {
      const alreadyActive = c.needs.every(([id, t]) => tr(id) >= t)
      if (alreadyActive) continue
      const wouldComplete = c.needs.every(([id, t]) => id === opt.treeId ? opt.nextTier >= t : tr(id) >= t)
      if (wouldComplete) hints.push(`⚡ ${c.name}: ${c.desc}`)
    }
    return hints
  }

  return (
    <div className={styles.body}>
      <div className={styles.header}>
        <span>HP <strong>{Math.max(0, Math.ceil(p.hp))} / {p.maxHp}</strong></span>
        <span>Lv <strong>{p.level}</strong></span>
        <span>Time <strong>{fmtTime(timeRef.current)}</strong></span>
        <span>Kills <strong>{killsRef.current}</strong></span>
        {best.time > 0 && <span>Best <strong>{fmtTime(best.time)} · {best.kills}k</strong></span>}
        <button className={styles.resetBtn} onClick={() => { const next = !showCombosRef.current; showCombosRef.current = next; setShowCombos(next); if (next) inputRef.current = { up: false, down: false, left: false, right: false, aimUp: false, aimDown: false, aimLeft: false, aimRight: false } }} style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24', borderColor: 'rgba(251,191,36,0.4)' }}>⚡ Combos</button>
        <button className={styles.resetBtn} onClick={reset}>↻ New Run</button>
        <span style={{ display: 'none' }}>{hudTick}</span>
      </div>
      <canvas ref={canvasRef} width={W} height={H} className={styles.canvas} tabIndex={0} onMouseDown={() => canvasRef.current?.focus()} />
      <div className={styles.hint}>WASD move · arrow keys aim & fire</div>

      {phase === 'menu' && (
        <div className={styles.overlay}>
          <div className={styles.title}>SURVIVORS</div>
          <div className={styles.subtitle}>Choose your arena</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'center', maxWidth: 580, marginTop: 8 }}>
            {(['void', 'ruins', 'frost', 'inferno', 'maze'] as MapId[]).map(id => {
              const def = MAP_DEFS[id]
              const accent = id === 'void' ? '#38bdf8' : id === 'ruins' ? '#d4a050' : id === 'frost' ? '#67e8f9' : id === 'inferno' ? '#fb923c' : '#a1a1aa'
              return (
                <button key={id} className={styles.upgradeCard} style={{ width: 240, padding: '12px 14px', borderColor: accent + '55' }} onClick={() => selectMap(id)}>
                  <div className={styles.upgradeName} style={{ color: accent, fontSize: 14 }}>{def.name}</div>
                  <div className={styles.upgradeDesc} style={{ fontSize: 10, marginTop: 4 }}>{def.desc}</div>
                </button>
              )
            })}
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, cursor: 'pointer', fontSize: 11, color: darkMode ? '#fbbf24' : 'rgba(255,255,255,0.5)' }}>
            <input type="checkbox" checked={darkMode} onChange={e => { setDarkMode(e.target.checked); darkModeRef.current = e.target.checked }} style={{ accentColor: '#fbbf24' }} />
            Darkness Mode — limited visibility
          </label>
          {best.time > 0 && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginTop: 10 }}>Best: {fmtTime(best.time)} · {best.kills} kills</div>}
        </div>
      )}

      {phase === 'select' && (
        <div className={styles.overlay}>
          <div className={styles.title}>CHOOSE YOUR ARMAMENT</div>
          <div className={styles.subtitle}>{mapRef.current.name} — pick your weapon</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center', maxWidth: 640 }}>
            {(['bolt', 'shotgun', 'railgun', 'bomb', 'whip', 'boomerang', 'orb', 'drone'] as WeaponId[]).map(id => (
              <button key={id} className={styles.upgradeCard} style={{ width: 145, padding: '10px 10px' }} onClick={() => startRun(id)}>
                <div className={styles.upgradeName} style={{ fontSize: 12 }}>{WEAPON_INFO[id].name}</div>
                <div className={styles.upgradeDesc} style={{ fontSize: 10 }}>{WEAPON_INFO[id].desc}</div>
              </button>
            ))}
          </div>
          <button style={{ marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,0.45)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }} onClick={() => { phaseRef.current = 'menu'; setPhase('menu') }}>← Back to map select</button>
          {chosenWeapon && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>Last: {WEAPON_INFO[chosenWeapon].name}</div>}
        </div>
      )}

      {(phase === 'paused' || phase === 'bossreward') && upgradeChoices && (
        <div className={styles.overlay}>
          <div className={styles.title}>{phase === 'bossreward' ? 'BOSS CORE' : `LEVEL ${p.level}`}</div>
          <div className={styles.subtitle}>{phase === 'bossreward' ? 'Choose a special upgrade · +25 HP' : 'Choose an upgrade'}</div>
          <div className={styles.upgradeRow}>
            {upgradeChoices.map((opt, i) => {
              const d = descOpt(opt)
              const tree = opt.kind === 'tree' ? TREE_MAP.get(opt.treeId) : null
              const catColor = tree ? (tree.cat === 'element' ? '#fb923c' : tree.cat === 'weaponMod' ? '#60a5fa' : tree.cat === 'passive' ? '#4ade80' : '#c084fc') : '#c084fc'
              const hints = comboHints(opt)
              return (
                <button key={i} className={styles.upgradeCard} onClick={() => applyUpgrade(opt)} style={{ borderColor: catColor + '66' }}>
                  <div className={styles.upgradeName} style={{ color: catColor }}>{d.name}</div>
                  <div className={styles.upgradeDesc}>{d.desc}</div>
                  <div className={styles.upgradeLevel}>{d.level}</div>
                  {hints.length > 0 && <div style={{ marginTop: 4, borderTop: '1px solid rgba(251,191,36,0.2)', paddingTop: 4 }}>
                    {hints.map((h, j) => <div key={j} style={{ fontSize: 9, color: '#fbbf24', lineHeight: 1.3 }}>{h}</div>)}
                  </div>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      {showCombos && (
        <div className={styles.overlay} onClick={() => { showCombosRef.current = false; setShowCombos(false); setTimeout(() => canvasRef.current?.focus(), 10) }}>
          <div className={styles.title}>COMBOS</div>
          <div className={styles.subtitle}>Auto-active when you own all prerequisites — click to dismiss</div>
          <div style={{ maxWidth: 600, maxHeight: '70vh', overflowY: 'auto', margin: '8px auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {COMBOS.map(c => {
              const active = c.needs.every(([id, t]) => tr(id) >= t)
              return (
                <div key={c.name} style={{ background: active ? 'rgba(168,85,247,0.2)' : 'rgba(0,0,0,0.55)', border: `1px solid ${active ? 'rgba(168,85,247,0.6)' : 'rgba(168,85,247,0.2)'}`, padding: '6px 10px', borderRadius: 6, textAlign: 'left', opacity: active ? 1 : 0.6 }}>
                  <span style={{ color: active ? '#c084fc' : '#9ca3af', fontWeight: 800, fontSize: 11 }}>{c.name}</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 9, marginLeft: 8 }}>{c.needs.map(([id, t]) => `${TREE_MAP.get(id)?.name ?? id} T${t}`).join(' + ')}</span>
                  <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: 10, marginLeft: 8 }}>{c.desc}</span>
                  {active && <span style={{ color: '#4ade80', fontSize: 9, marginLeft: 8 }}>ACTIVE</span>}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {phase === 'dead' && (
        <div className={styles.overlay}>
          <div className={styles.title}>YOU DIED</div>
          <div className={styles.subtitle}>{fmtTime(timeRef.current)} survived · {killsRef.current} kills</div>
          <button className={styles.btn} onClick={reset}>Try Again</button>
        </div>
      )}
      {phase === 'won' && (
        <div className={styles.overlay}>
          <div className={styles.title}>SURVIVED</div>
          <div className={styles.subtitle}>{fmtTime(timeRef.current)} survived · {killsRef.current} kills</div>
          <button className={styles.btn} onClick={reset}>New Run</button>
        </div>
      )}
      {crashLog && (
        <div className={styles.overlay} style={{ cursor: 'text', userSelect: 'text' }}>
          <div className={styles.title} style={{ color: '#dc2626' }}>CRASH</div>
          <pre style={{ fontSize: 10, color: '#fca5a5', background: 'rgba(0,0,0,0.8)', padding: 12, borderRadius: 6, maxWidth: 600, whiteSpace: 'pre-wrap', textAlign: 'left', lineHeight: 1.5 }}>{crashLog}</pre>
          <button className={styles.btn} onClick={() => { setCrashLog(null); crashLogRef.current = null; reset() }}>Restart</button>
        </div>
      )}
    </div>
  )
}
