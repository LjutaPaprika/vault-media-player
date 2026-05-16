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
  cls: string // class name for color: 'me' | 'visited' | 'save' | 'boss' | 'hint' | 'connect' | 'empty'
}

export interface MapGrid {
  area: AreaId
  areaName: string
  cells: MapCell[][] // [row][col]
}

export function renderAreaMap(
  area: AreaId,
  rooms: Record<RoomId, Room>,
  visited: Set<RoomId>,
  current: RoomId,
  bossClearedRooms: Set<RoomId> = new Set()
): MapGrid {
  const areaRooms = Object.values(rooms).filter(r => r.area === area)
  if (!areaRooms.length) return { area, areaName: AREAS[area]?.name ?? area, cells: [] }

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const r of areaRooms) {
    if (r.pos.x < minX) minX = r.pos.x
    if (r.pos.x > maxX) maxX = r.pos.x
    if (r.pos.y < minY) minY = r.pos.y
    if (r.pos.y > maxY) maxY = r.pos.y
  }
  const w = (maxX - minX) * 2 + 1
  const h = (maxY - minY) * 2 + 1

  const grid: MapCell[][] = Array.from({ length: h }, () =>
    Array.from({ length: w }, () => ({ ch: ' ', cls: 'empty' }))
  )

  // Place rooms at even coordinates, exit connectors between them
  const byPos = new Map<string, Room>()
  for (const r of areaRooms) byPos.set(`${r.pos.x},${r.pos.y}`, r)

  for (const r of areaRooms) {
    const col = (r.pos.x - minX) * 2
    const row = (r.pos.y - minY) * 2
    const isCurrent = r.id === current
    const isVisited = visited.has(r.id)
    const isHint = !isVisited && hasVisitedNeighbor(r, areaRooms, visited)

    let ch = '·'
    let cls = 'empty'
    if (isCurrent) { ch = '@'; cls = 'me' }
    else if (isVisited && r.saveType !== 'none') { ch = 'S'; cls = 'save' }
    else if (isVisited && areaRooms.find(x => x.id === r.id)?.enemies.some(e => e.startsWith('boss_')) && bossClearedRooms.has(r.id)) { ch = 'b'; cls = 'boss' }
    else if (isVisited && areaRooms.find(x => x.id === r.id)?.enemies.some(e => e.startsWith('boss_'))) { ch = 'B'; cls = 'boss' }
    else if (isVisited) { ch = '■'; cls = 'visited' }
    else if (isHint) { ch = '?'; cls = 'hint' }

    grid[row][col] = { ch, cls }
  }

  // Draw connectors between revealed rooms
  for (const r of areaRooms) {
    if (!visited.has(r.id)) continue
    const col = (r.pos.x - minX) * 2
    const row = (r.pos.y - minY) * 2
    for (const [dir, target] of Object.entries(r.exits)) {
      const targetId = typeof target === 'string' ? target : target.to
      const neighbor = rooms[targetId]
      if (!neighbor || neighbor.area !== area) continue
      const off = dirOffsets[dir as Direction]
      if (!off || (off.dx === 0 && off.dy === 0)) continue
      const cRow = row + off.dy
      const cCol = col + off.dx
      if (cRow < 0 || cRow >= h || cCol < 0 || cCol >= w) continue
      // Only draw if the target's cell is also revealed (visited or hint)
      const isTargetRevealed = visited.has(targetId) || hasVisitedNeighbor(neighbor, areaRooms, visited)
      if (!isTargetRevealed) continue
      const ch = (off.dx !== 0) ? '─' : '│'
      if (grid[cRow][cCol].ch === ' ' || grid[cRow][cCol].ch === '·') {
        grid[cRow][cCol] = { ch, cls: 'connect' }
      }
    }
  }

  return { area, areaName: AREAS[area]?.name ?? area, cells: grid }
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
