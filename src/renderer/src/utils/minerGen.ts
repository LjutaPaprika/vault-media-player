export const MAP_W = 32
export const MAP_H = 18

export type TileKind =
  | 'wall' | 'dirt' | 'stone' | 'gemDirt' | 'goldDirt'
  | 'floor' | 'stairs' | 'vaultDoor' | 'vaultFloor'

export type EnemyType = 'crawler' | 'guard' | 'brute' | 'shooter'

export interface GenEnemy {
  x: number
  y: number
  type: EnemyType
}

export interface Level {
  grid: TileKind[][]
  playerStart: { x: number; y: number }
  enemies: GenEnemy[]
}

function rngFactory(seed: number): () => number {
  let s = (seed * 1664525 + 1013904223) >>> 0
  return (): number => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 0x100000000
  }
}

interface Rect { x1: number; y1: number; x2: number; y2: number }
const rcx = (r: Rect): number => Math.floor((r.x1 + r.x2) / 2)
const rcy = (r: Rect): number => Math.floor((r.y1 + r.y2) / 2)

export function generateLevel(floor: number): Level {
  const rng = rngFactory(floor * 7919 + 1_234_567)
  const ri = (n: number): number => Math.floor(rng() * n)

  const grid: TileKind[][] = Array.from({ length: MAP_H }, () =>
    Array<TileKind>(MAP_W).fill('dirt')
  )

  // Border walls
  for (let x = 0; x < MAP_W; x++) { grid[0][x] = 'wall'; grid[MAP_H - 1][x] = 'wall' }
  for (let y = 0; y < MAP_H; y++) { grid[y][0] = 'wall'; grid[y][MAP_W - 1] = 'wall' }

  // Rooms
  const NUM_ROOMS = 4 + ri(3)
  const rooms: Rect[] = []
  for (let a = 0; a < 80 && rooms.length < NUM_ROOMS; a++) {
    const w = 3 + ri(4), h = 3 + ri(3)
    const x1 = 2 + ri(MAP_W - w - 4), y1 = 2 + ri(MAP_H - h - 4)
    const x2 = x1 + w, y2 = y1 + h
    if (rooms.some(r => x1 <= r.x2 + 1 && x2 >= r.x1 - 1 && y1 <= r.y2 + 1 && y2 >= r.y1 - 1)) continue
    for (let ry = y1; ry < y2; ry++)
      for (let rx = x1; rx < x2; rx++)
        grid[ry][rx] = 'floor'
    rooms.push({ x1, y1, x2, y2 })
  }
  // Fallback
  if (rooms.length === 0) {
    for (let y = 4; y < MAP_H - 4; y++) for (let x = 4; x < MAP_W - 4; x++) grid[y][x] = 'floor'
    rooms.push({ x1: 4, y1: 4, x2: MAP_W - 4, y2: MAP_H - 4 })
  }

  // Connect rooms with L-shaped corridors
  for (let i = 1; i < rooms.length; i++) {
    const a = rooms[i - 1], b = rooms[i]
    let px = rcx(a), py = rcy(a)
    const tx = rcx(b), ty = rcy(b)
    while (px !== tx) { grid[py][px] = 'floor'; px += px < tx ? 1 : -1 }
    while (py !== ty) { grid[py][px] = 'floor'; py += py < ty ? 1 : -1 }
    grid[py][px] = 'floor'
  }

  // Scatter gems, gold, stone in remaining dirt
  for (let y = 1; y < MAP_H - 1; y++) {
    for (let x = 1; x < MAP_W - 1; x++) {
      if (grid[y][x] !== 'dirt') continue
      const r = rng()
      if      (r < 0.09) grid[y][x] = 'gemDirt'
      else if (r < 0.16) grid[y][x] = 'goldDirt'
      else if (r < 0.27) grid[y][x] = 'stone'
    }
  }

  // Player start in first room
  const playerStart = { x: rcx(rooms[0]), y: rcy(rooms[0]) }

  // Stairs in last room
  const last = rooms[rooms.length - 1]
  grid[rcy(last)][rcx(last)] = 'stairs'

  // Enemies (skip first room)
  const enemies: GenEnemy[] = []
  for (let i = 1; i < rooms.length; i++) {
    const r = rooms[i]
    const count = 1 + ri(Math.min(1 + Math.floor(floor / 3), 3))
    for (let e = 0; e < count; e++) {
      const ex = r.x1 + 1 + ri(Math.max(r.x2 - r.x1 - 2, 1))
      const ey = r.y1 + 1 + ri(Math.max(r.y2 - r.y1 - 2, 1))
      let type: EnemyType = 'crawler'
      if (floor >= 4) {
        const v = rng()
        if (floor >= 12 && v < 0.12) type = 'shooter'
        else if (floor >= 9 && v < 0.18) type = 'brute'
        else if (v < 0.45) type = 'guard'
      }
      enemies.push({ x: ex, y: ey, type })
    }
  }

  // Vault room (20% chance, floor 2+, needs 3+ rooms)
  if (floor >= 2 && rooms.length >= 3 && rng() < 0.20) {
    const vw = 3 + ri(3), vh = 2 + ri(3)
    for (let a = 0; a < 60; a++) {
      const vx = 2 + ri(MAP_W - vw - 4)
      const vy = 2 + ri(MAP_H - vh - 4)

      // Area must be all dirt/stone/gem/gold
      let ok = true
      for (let ry = vy; ry < vy + vh && ok; ry++)
        for (let rx = vx; rx < vx + vw && ok; rx++) {
          const t = grid[ry][rx]
          if (t !== 'dirt' && t !== 'stone' && t !== 'gemDirt' && t !== 'goldDirt') ok = false
        }
      if (!ok) continue

      // Find border cells adjacent to a floor tile (door candidates)
      const doors: { x: number; y: number }[] = []
      for (let rx = vx; rx < vx + vw; rx++) {
        if (vy > 1 && grid[vy - 1][rx] === 'floor')       doors.push({ x: rx, y: vy })
        if (vy + vh < MAP_H - 1 && grid[vy + vh][rx] === 'floor') doors.push({ x: rx, y: vy + vh - 1 })
      }
      for (let ry = vy; ry < vy + vh; ry++) {
        if (vx > 1 && grid[ry][vx - 1] === 'floor')       doors.push({ x: vx, y: ry })
        if (vx + vw < MAP_W - 1 && grid[ry][vx + vw] === 'floor') doors.push({ x: vx + vw - 1, y: ry })
      }
      if (doors.length === 0) continue

      for (let ry = vy; ry < vy + vh; ry++)
        for (let rx = vx; rx < vx + vw; rx++)
          grid[ry][rx] = 'vaultFloor'

      const door = doors[ri(doors.length)]
      grid[door.y][door.x] = 'vaultDoor'
      break
    }
  }

  return { grid, playerStart, enemies }
}
