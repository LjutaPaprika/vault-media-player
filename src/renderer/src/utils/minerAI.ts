// A* pathfinding for enemy AI

export interface PathNode {
  x: number
  y: number
  g: number // cost from start
  h: number // heuristic to goal
  f: number // g + h
  parent: PathNode | null
}

export function findPath(
  grid: any[][],
  start: { x: number; y: number },
  goal: { x: number; y: number },
  isWalkable: (x: number, y: number) => boolean,
  maxNodes: number = 200
): Array<[number, number]> | null {
  const MAP_W = grid[0]?.length ?? 32
  const MAP_H = grid.length ?? 18

  if (!isWalkable(goal.x, goal.y)) return null
  if (start.x === goal.x && start.y === goal.y) return []

  const open: PathNode[] = []
  const closed = new Set<string>()
  const inOpen = new Map<string, PathNode>()

  const manhattan = (x: number, y: number): number =>
    Math.abs(x - goal.x) + Math.abs(y - goal.y)

  const startNode: PathNode = {
    x: start.x,
    y: start.y,
    g: 0,
    h: manhattan(start.x, start.y),
    f: manhattan(start.x, start.y),
    parent: null
  }

  open.push(startNode)
  inOpen.set(`${start.x},${start.y}`, startNode)

  while (open.length > 0) {
    if (open.length + closed.size > maxNodes) return null

    let best = 0
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[best].f) best = i
    }

    const current = open[best]
    open.splice(best, 1)

    const key = `${current.x},${current.y}`
    inOpen.delete(key)
    closed.add(key)

    if (current.x === goal.x && current.y === goal.y) {
      const path: Array<[number, number]> = []
      let node: PathNode | null = current
      while (node) {
        path.unshift([node.x, node.y])
        node = node.parent
      }
      return path
    }

    const neighbors = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0]
    ]

    for (const [dx, dy] of neighbors) {
      const nx = current.x + dx
      const ny = current.y + dy

      if (nx < 0 || nx >= MAP_W || ny < 0 || ny >= MAP_H) continue
      if (!isWalkable(nx, ny)) continue

      const nkey = `${nx},${ny}`
      if (closed.has(nkey)) continue

      const ng = current.g + 1
      const nh = manhattan(nx, ny)
      const nf = ng + nh

      const existing = inOpen.get(nkey)
      if (existing && ng >= existing.g) continue

      const neighbor: PathNode = {
        x: nx,
        y: ny,
        g: ng,
        h: nh,
        f: nf,
        parent: current
      }

      if (existing) {
        const idx = open.indexOf(existing)
        if (idx >= 0) open.splice(idx, 1)
      }

      open.push(neighbor)
      inOpen.set(nkey, neighbor)
    }
  }

  return null
}
