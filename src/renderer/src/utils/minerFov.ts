// Recursive shadowcasting field of view (standard algorithm with octant matrices)

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

  visible.add(`${ox},${oy}`)

  // 8 octant transformation matrices: [xx, xy, yx, yy]
  const octants: ReadonlyArray<readonly [number, number, number, number]> = [
    [ 1,  0,  0,  1],  // E to NE
    [ 0,  1,  1,  0],  // NE to N
    [ 0, -1,  1,  0],  // N to NW
    [-1,  0,  0,  1],  // NW to W
    [-1,  0,  0, -1],  // W to SW
    [ 0, -1, -1,  0],  // SW to S
    [ 0,  1, -1,  0],  // S to SE
    [ 1,  0,  0, -1],  // SE to E
  ]

  for (const [xx, xy, yx, yy] of octants) {
    castLight(ox, oy, 1, 1.0, 0.0, radius, xx, xy, yx, yy, visible, isOpaque, MAP_W, MAP_H)
  }

  return visible
}

function castLight(
  cx: number, cy: number,
  row: number,
  startSlope: number,
  endSlope: number,
  radius: number,
  xx: number, xy: number, yx: number, yy: number,
  visible: Set<string>,
  isOpaque: (x: number, y: number) => boolean,
  MAP_W: number, MAP_H: number
): void {
  if (startSlope < endSlope) return
  let newStart = startSlope

  for (let distance = row; distance <= radius; distance++) {
    let blocked = false
    const deltaY = -distance

    for (let deltaX = -distance; deltaX <= 0; deltaX++) {
      const currentX = cx + deltaX * xx + deltaY * xy
      const currentY = cy + deltaX * yx + deltaY * yy
      const leftSlope  = (deltaX - 0.5) / (deltaY + 0.5)
      const rightSlope = (deltaX + 0.5) / (deltaY - 0.5)

      if (currentX < 0 || currentX >= MAP_W || currentY < 0 || currentY >= MAP_H) continue
      if (startSlope < rightSlope) continue
      if (endSlope > leftSlope) break

      // Within radius (Euclidean for circular FoV)
      const dx = currentX - cx, dy = currentY - cy
      if (dx * dx + dy * dy <= radius * radius) {
        visible.add(`${currentX},${currentY}`)
      }

      if (blocked) {
        if (isOpaque(currentX, currentY)) {
          newStart = rightSlope
          continue
        } else {
          blocked = false
          startSlope = newStart
        }
      } else if (isOpaque(currentX, currentY) && distance < radius) {
        blocked = true
        castLight(cx, cy, distance + 1, startSlope, leftSlope, radius, xx, xy, yx, yy, visible, isOpaque, MAP_W, MAP_H)
        newStart = rightSlope
      }
    }

    if (blocked) break
  }
}
