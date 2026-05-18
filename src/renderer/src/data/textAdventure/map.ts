import type { Room, RoomId, AreaId, Direction } from './types'
import { AREAS } from './areas'

const dirOffsets: Record<Direction, { dx: number; dy: number }> = {
  north: { dx: 0, dy: -1 },
  south: { dx: 0, dy: 1 },
  east:  { dx: 1, dy: 0 },
  west:  { dx: -1, dy: 0 },
  up:    { dx: 0, dy: 0 },
  down:  { dx: 0, dy: 0 }
}

export interface MapCell {
  ch: string
  cls: string
  /** When a cell marks a cross-zone passage, this names the destination area. Used for hover/legend. */
  passageTo?: AreaId
}

export interface MapGrid {
  area: AreaId
  areaName: string
  cells: MapCell[][]
  /** Destination areas reachable via a discovered cross-zone passage from this map. */
  passageDestinations: { area: AreaId; areaName: string; dir: Direction }[]
}

/** Areas the player has visited at least one room in. Returns area IDs in first-visit order. */
export function visitedAreas(rooms: Record<RoomId, Room>, visited: Set<RoomId>): AreaId[] {
  const seen: AreaId[] = []
  const seenSet = new Set<AreaId>()
  for (const id of visited) {
    const a = rooms[id]?.area
    if (a && !seenSet.has(a)) {
      seenSet.add(a)
      seen.push(a)
    }
  }
  return seen
}

// Each room cell occupies (1×1) on the grid, with SPACING-1 corridor cells between.
// Bumping SPACING from 2 to 3 makes the map breathe and lets L-bends fit cleanly.
const SPACING = 3

export function renderAreaMap(
  area: AreaId,
  rooms: Record<RoomId, Room>,
  visited: Set<RoomId>,
  current: RoomId,
  bossClearedRooms: Set<RoomId> = new Set()
): MapGrid {
  const areaRooms = Object.values(rooms).filter(r => r.area === area)
  if (!areaRooms.length) return { area, areaName: AREAS[area]?.name ?? area, cells: [], passageDestinations: [] }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const r of areaRooms) {
    if (r.pos.x < minX) minX = r.pos.x
    if (r.pos.x > maxX) maxX = r.pos.x
    if (r.pos.y < minY) minY = r.pos.y
    if (r.pos.y > maxY) maxY = r.pos.y
  }
  // Pad bounds by 1 unit so cross-zone passage arrows have a cell to live in.
  const w = (maxX - minX) * SPACING + 1 + 2
  const h = (maxY - minY) * SPACING + 1 + 2
  const padX = 1
  const padY = 1

  const grid: MapCell[][] = Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ ch: ' ', cls: 'empty' }))
  )

  const roomCol = (r: Room): number => (r.pos.x - minX) * SPACING + padX
  const roomRow = (r: Room): number => (r.pos.y - minY) * SPACING + padY

  for (const r of areaRooms) {
    const col = roomCol(r)
    const row = roomRow(r)
    const isCurrent = r.id === current
    const isVisited = visited.has(r.id)
    const isHint = !isVisited && hasVisitedNeighbor(r, areaRooms, visited)

    let ch = '·'
    let cls = 'empty'
    if (isCurrent) { ch = '@'; cls = 'me' }
    else if (isVisited && r.saveType !== 'none') { ch = 'S'; cls = 'save' }
    else if (isVisited && r.enemies.some(e => e.startsWith('boss_')) && bossClearedRooms.has(r.id)) { ch = 'b'; cls = 'boss' }
    else if (isVisited && r.enemies.some(e => e.startsWith('boss_'))) { ch = 'B'; cls = 'boss' }
    else if (isVisited) { ch = '■'; cls = 'visited' }
    else if (isHint) { ch = '?'; cls = 'hint' }

    grid[row][col] = { ch, cls }
  }

  const passageDestinations: { area: AreaId; areaName: string; dir: Direction }[] = []
  const seenPassageAreas = new Set<AreaId>()

  // Draw corridors between revealed rooms. Supports rooms that are >1 unit apart in
  // a single axis (straight corridor) or offset on both axes (L-bend corridor).
  // The bend prefers a horizontal-first path for the exit direction's axis.
  for (const r of areaRooms) {
    if (!visited.has(r.id)) continue
    const col = roomCol(r)
    const row = roomRow(r)
    for (const [dirRaw, target] of Object.entries(r.exits)) {
      const dir = dirRaw as Direction
      const targetId = typeof target === 'string' ? target : target.to
      const neighbor = rooms[targetId]
      if (!neighbor) continue
      const off = dirOffsets[dir]
      if (!off || (off.dx === 0 && off.dy === 0)) continue

      // Cross-zone passage: drop an arrow marker just outside the source room.
      if (neighbor.area !== area) {
        const aCh = dir === 'north' ? '↑' : dir === 'south' ? '↓' : dir === 'east' ? '→' : '←'
        const aRow = row + off.dy
        const aCol = col + off.dx
        if (aRow >= 0 && aRow < h && aCol >= 0 && aCol < w) {
          const targetName = AREAS[neighbor.area]?.name ?? neighbor.area
          grid[aRow][aCol] = { ch: aCh, cls: 'passage', passageTo: neighbor.area }
          if (!seenPassageAreas.has(neighbor.area)) {
            seenPassageAreas.add(neighbor.area)
            passageDestinations.push({ area: neighbor.area, areaName: targetName, dir })
          }
        }
        continue
      }

      const isTargetRevealed = visited.has(targetId) || hasVisitedNeighbor(neighbor, areaRooms, visited)
      if (!isTargetRevealed) continue

      const tCol = roomCol(neighbor)
      const tRow = roomRow(neighbor)
      drawCorridor(grid, row, col, tRow, tCol, dir, w, h)
    }
  }

  return { area, areaName: AREAS[area]?.name ?? area, cells: grid, passageDestinations }
}

function drawCorridor(
  grid: MapCell[][],
  fromRow: number, fromCol: number,
  toRow: number, toCol: number,
  exitDir: Direction,
  w: number, h: number
): void {
  // Straight corridor (aligned on one axis)
  if (fromRow === toRow) {
    const step = toCol > fromCol ? 1 : -1
    for (let c = fromCol + step; c !== toCol; c += step) {
      if (c < 0 || c >= w) break
      paint(grid, fromRow, c, '─')
    }
    return
  }
  if (fromCol === toCol) {
    const step = toRow > fromRow ? 1 : -1
    for (let r = fromRow + step; r !== toRow; r += step) {
      if (r < 0 || r >= h) break
      paint(grid, r, fromCol, '│')
    }
    return
  }

  // L-bend corridor. Decide which axis to traverse first based on the declared
  // exit direction — N/S exits leave vertically, then turn; E/W leave horizontally.
  const verticalFirst = exitDir === 'north' || exitDir === 'south'
  const hStep = toCol > fromCol ? 1 : -1
  const vStep = toRow > fromRow ? 1 : -1
  const cornerRow = verticalFirst ? toRow : fromRow
  const cornerCol = verticalFirst ? fromCol : toCol

  if (verticalFirst) {
    for (let r = fromRow + vStep; r !== cornerRow; r += vStep) paint(grid, r, fromCol, '│')
    paint(grid, cornerRow, cornerCol, bendChar(vStep, hStep, true))
    for (let c = cornerCol + hStep; c !== toCol; c += hStep) paint(grid, cornerRow, c, '─')
  } else {
    for (let c = fromCol + hStep; c !== cornerCol; c += hStep) paint(grid, fromRow, c, '─')
    paint(grid, cornerRow, cornerCol, bendChar(vStep, hStep, false))
    for (let r = cornerRow + vStep; r !== toRow; r += vStep) paint(grid, r, toCol, '│')
  }
}

function bendChar(vStep: number, hStep: number, verticalFirst: boolean): string {
  // Bend glyph depends on which way we entered the corner and which way we leave.
  if (verticalFirst) {
    // Came in vertically, turn to horizontal
    if (vStep > 0 && hStep > 0) return '└'
    if (vStep > 0 && hStep < 0) return '┘'
    if (vStep < 0 && hStep > 0) return '┌'
    return '┐'
  } else {
    if (hStep > 0 && vStep > 0) return '┐'
    if (hStep > 0 && vStep < 0) return '┘'
    if (hStep < 0 && vStep > 0) return '┌'
    return '└'
  }
}

function paint(grid: MapCell[][], row: number, col: number, ch: string): void {
  if (row < 0 || row >= grid.length) return
  if (col < 0 || col >= grid[0].length) return
  const cur = grid[row][col]
  if (cur.ch === ' ' || cur.ch === '·') {
    grid[row][col] = { ch, cls: 'connect' }
  }
}

function hasVisitedNeighbor(room: Room, areaRooms: Room[], visited: Set<RoomId>): boolean {
  for (const target of Object.values(room.exits)) {
    const tid = typeof target === 'string' ? target : target.to
    if (visited.has(tid) && areaRooms.some(r => r.id === tid)) return true
  }
  return false
}

export function gridToText(g: MapGrid): string[] {
  return g.cells.map(row => row.map(c => c.ch).join(''))
}
