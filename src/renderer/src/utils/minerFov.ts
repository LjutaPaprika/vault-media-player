// Recursive shadowcasting for field of view calculation (standard roguelike FoV)

export function computeFov(
  grid: any[][],
  ox: number,
  oy: number,
  radius: number,
  isOpaque: (x: number, y: number) => boolean
): Set<string> {
  const visible = new Set<string>()
  const MAP_W = grid[0]?.length ?? 32
  const MAP_H = grid.length ?? 18

  // Origin is always visible
  visible.add(`${ox},${oy}`)

  // Cast light into each of 8 octants
  for (let octant = 0; octant < 8; octant++) {
    castLight(ox, oy, 1, 1.0, 0.0, octant, radius, visible, isOpaque, MAP_W, MAP_H)
  }

  return visible
}

function castLight(
  ox: number,
  oy: number,
  row: number,
  startSlope: number,
  endSlope: number,
  octant: number,
  radius: number,
  visible: Set<string>,
  isOpaque: (x: number, y: number) => boolean,
  MAP_W: number,
  MAP_H: number
): void {
  if (startSlope < endSlope) return

  for (let distance = row; distance <= radius; distance++) {
    let blocked = false
    let newStartSlope = startSlope

    for (let y = 0; y <= distance; y++) {
      const x = distance - y
      const lSlope = (x - 0.5) / (y + 0.5)
      const rSlope = (x + 0.5) / (y - 0.5)

      if (startSlope < rSlope) continue
      if (endSlope > lSlope) break

      // Transform octant to world coordinates
      const { px, py } = octantToWorld(ox, oy, x, y, octant)

      if (px < 0 || px >= MAP_W || py < 0 || py >= MAP_H) continue

      // Calculate chebyshev distance to verify within radius
      const dist = Math.max(Math.abs(px - ox), Math.abs(py - oy))
      if (dist > radius) continue

      visible.add(`${px},${py}`)

      if (blocked) {
        if (isOpaque(px, py)) {
          newStartSlope = rSlope
          continue
        } else {
          blocked = false
          startSlope = newStartSlope
        }
      }

      if (isOpaque(px, py) && distance < radius) {
        blocked = true
        castLight(ox, oy, distance + 1, startSlope, lSlope, octant, radius, visible, isOpaque, MAP_W, MAP_H)
        newStartSlope = rSlope
      }
    }

    if (blocked) break
  }
}

function octantToWorld(ox: number, oy: number, x: number, y: number, octant: number): { px: number; py: number } {
  switch (octant) {
    case 0: return { px: ox + x, py: oy - y } // NE (right-up)
    case 1: return { px: ox + y, py: oy - x } // N (up-right)
    case 2: return { px: ox - y, py: oy - x } // NW (up-left)
    case 3: return { px: ox - x, py: oy - y } // W (left-up)
    case 4: return { px: ox - x, py: oy + y } // SW (left-down)
    case 5: return { px: ox - y, py: oy + x } // S (down-left)
    case 6: return { px: ox + y, py: oy + x } // SE (down-right)
    case 7: return { px: ox + x, py: oy + y } // E (right-down)
    default: return { px: ox, py: oy }
  }
}
