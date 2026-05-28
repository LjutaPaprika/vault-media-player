import { useEffect, useRef, useState } from 'react'
import styles from './Quoridor.module.css'

// ─── Types & Constants ───────────────────────────────────────────────────────

type Pos = { r: number; c: number }
type Orient = 'H' | 'V'
type Wall = { r: number; c: number; o: Orient }
type Player = 1 | 2
type Phase = 'idle' | 'playerTurn' | 'aiTurn' | 'gameOver'
type Mode = 'move' | 'wall'

const SAVE_KEY = 'quoridorRecord'
const SIZE = 9

function posEq(a: Pos, b: Pos) { return a.r === b.r && a.c === b.c }

// ─── Game Logic ──────────────────────────────────────────────────────────────

function wallBlocks(walls: Wall[], from: Pos, to: Pos): boolean {
  const dr = to.r - from.r, dc = to.c - from.c
  for (const w of walls) {
    if (dr === -1 && dc === 0) {
      if (w.o === 'H' && w.r === from.r - 1 && (w.c === from.c || w.c === from.c - 1)) return true
    } else if (dr === 1 && dc === 0) {
      if (w.o === 'H' && w.r === from.r && (w.c === from.c || w.c === from.c - 1)) return true
    } else if (dc === -1 && dr === 0) {
      if (w.o === 'V' && w.c === from.c - 1 && (w.r === from.r || w.r === from.r - 1)) return true
    } else if (dc === 1 && dr === 0) {
      if (w.o === 'V' && w.c === from.c && (w.r === from.r || w.r === from.r - 1)) return true
    }
  }
  return false
}

function getLegalMoves(pos: Pos, opp: Pos, walls: Wall[]): Pos[] {
  const moves: Pos[] = []
  const dirs: Pos[] = [{ r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 }]
  for (const d of dirs) {
    const next = { r: pos.r + d.r, c: pos.c + d.c }
    if (next.r < 0 || next.r >= SIZE || next.c < 0 || next.c >= SIZE) continue
    if (wallBlocks(walls, pos, next)) continue
    if (posEq(next, opp)) {
      const jump = { r: next.r + d.r, c: next.c + d.c }
      if (jump.r >= 0 && jump.r < SIZE && jump.c >= 0 && jump.c < SIZE && !wallBlocks(walls, next, jump)) {
        moves.push(jump)
      } else {
        const sides: Pos[] = [{ r: d.c, c: d.r }, { r: -d.c, c: -d.r }]
        for (const s of sides) {
          const diag = { r: next.r + s.r, c: next.c + s.c }
          if (diag.r >= 0 && diag.r < SIZE && diag.c >= 0 && diag.c < SIZE && !wallBlocks(walls, next, diag)) {
            moves.push(diag)
          }
        }
      }
    } else {
      moves.push(next)
    }
  }
  return moves
}

function wallsOverlap(a: Wall, b: Wall): boolean {
  if (a.o === b.o) {
    if (a.o === 'H') return a.r === b.r && Math.abs(a.c - b.c) <= 1
    return a.c === b.c && Math.abs(a.r - b.r) <= 1
  }
  return a.r === b.r && a.c === b.c
}

function isWallInBounds(w: Wall): boolean {
  return w.r >= 0 && w.r < SIZE - 1 && w.c >= 0 && w.c < SIZE - 1
}

function hasPath(start: Pos, goalRow: number, opp: Pos, walls: Wall[]): boolean {
  const visited = new Set<number>()
  const q: Pos[] = [start]
  visited.add(start.r * SIZE + start.c)
  let qi = 0
  while (qi < q.length) {
    const cur = q[qi++]
    if (cur.r === goalRow) return true
    const dirs: Pos[] = [{ r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 }]
    for (const d of dirs) {
      const next = { r: cur.r + d.r, c: cur.c + d.c }
      if (next.r < 0 || next.r >= SIZE || next.c < 0 || next.c >= SIZE) continue
      if (wallBlocks(walls, cur, next)) continue
      const key = next.r * SIZE + next.c
      if (visited.has(key)) continue
      visited.add(key)
      q.push(next)
    }
  }
  return false
}

function shortestPath(start: Pos, goalRow: number, walls: Wall[]): number {
  const visited = new Set<number>()
  const q: { pos: Pos; dist: number }[] = [{ pos: start, dist: 0 }]
  visited.add(start.r * SIZE + start.c)
  let qi = 0
  while (qi < q.length) {
    const { pos: cur, dist } = q[qi++]
    if (cur.r === goalRow) return dist
    const dirs: Pos[] = [{ r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 }]
    for (const d of dirs) {
      const next = { r: cur.r + d.r, c: cur.c + d.c }
      if (next.r < 0 || next.r >= SIZE || next.c < 0 || next.c >= SIZE) continue
      if (wallBlocks(walls, cur, next)) continue
      const key = next.r * SIZE + next.c
      if (visited.has(key)) continue
      visited.add(key)
      q.push({ pos: next, dist: dist + 1 })
    }
  }
  return 999
}

function canPlaceWall(w: Wall, walls: Wall[], p1: Pos, p2: Pos): boolean {
  if (!isWallInBounds(w)) return false
  for (const ew of walls) { if (wallsOverlap(w, ew)) return false }
  const newWalls = [...walls, w]
  return hasPath(p1, 0, p2, newWalls) && hasPath(p2, 8, p1, newWalls)
}

// ─── AI ──────────────────────────────────────────────────────────────────────

function getShortestPathCells(start: Pos, goalRow: number, walls: Wall[]): Pos[] {
  const visited = new Map<number, number>()
  const q: { pos: Pos; dist: number }[] = [{ pos: start, dist: 0 }]
  visited.set(start.r * SIZE + start.c, -1)
  let qi = 0, goalKey = -1
  while (qi < q.length) {
    const { pos: cur, dist } = q[qi++]
    const curKey = cur.r * SIZE + cur.c
    if (cur.r === goalRow) { goalKey = curKey; break }
    const dirs: Pos[] = [{ r: -1, c: 0 }, { r: 1, c: 0 }, { r: 0, c: -1 }, { r: 0, c: 1 }]
    for (const d of dirs) {
      const next = { r: cur.r + d.r, c: cur.c + d.c }
      if (next.r < 0 || next.r >= SIZE || next.c < 0 || next.c >= SIZE) continue
      if (wallBlocks(walls, cur, next)) continue
      const key = next.r * SIZE + next.c
      if (visited.has(key)) continue
      visited.set(key, curKey)
      q.push({ pos: next, dist: dist + 1 })
    }
  }
  if (goalKey < 0) return []
  const path: Pos[] = []
  let k = goalKey
  while (k >= 0) { path.push({ r: Math.floor(k / SIZE), c: k % SIZE }); k = visited.get(k) ?? -1 }
  return path.reverse()
}

// ─── MCTS AI ─────────────────────────────────────────────────────────────────

type MCTSAction = { type: 'move'; pos: Pos } | { type: 'wall'; wall: Wall }
interface MCTSNode { action: MCTSAction | null; parent: MCTSNode | null; children: MCTSNode[]; wins: number; visits: number; player: Player; untried: MCTSAction[] }

function getProbableWalls(walls: Wall[], p1: Pos, p2: Pos, forPlayer: Player): Wall[] {
  const result: Wall[] = []
  const checked = new Set<string>()
  const nearCells: Pos[] = []
  const pawn = forPlayer === 1 ? p1 : p2
  const opp = forPlayer === 1 ? p2 : p1
  const oppPath = getShortestPathCells(opp, forPlayer === 1 ? 8 : 0, walls)
  for (const cell of oppPath) {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      nearCells.push({ r: cell.r + dr, c: cell.c + dc })
    }
  }
  for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
    nearCells.push({ r: pawn.r + dr, c: pawn.c + dc })
  }
  for (const w of walls) {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      nearCells.push({ r: w.r + dr, c: w.c + dc })
    }
  }
  for (const cell of nearCells) {
    for (const o of ['H', 'V'] as Orient[]) {
      const w: Wall = { r: cell.r, c: cell.c, o }
      const key = `${w.r},${w.c},${w.o}`
      if (checked.has(key)) continue
      checked.add(key)
      if (canPlaceWall(w, walls, p1, p2)) result.push(w)
    }
  }
  return result
}

function getActions(p1: Pos, p2: Pos, walls: Wall[], p1W: number, p2W: number, player: Player): MCTSAction[] {
  const pawn = player === 1 ? p1 : p2, opp = player === 1 ? p2 : p1
  const moves: MCTSAction[] = getLegalMoves(pawn, opp, walls).map(pos => ({ type: 'move', pos }))
  const wCount = player === 1 ? p1W : p2W
  if (wCount > 0) {
    const probWalls = getProbableWalls(walls, p1, p2, player)
    for (const w of probWalls) moves.push({ type: 'wall', wall: w })
  }
  return moves
}

function mctsRollout(p1: Pos, p2: Pos, walls: Wall[], p1W: number, p2W: number, startPlayer: Player): Player {
  let cur = startPlayer
  for (let i = 0; i < 80; i++) {
    if (p1.r === 0) return 1
    if (p2.r === 8) return 2
    const pawn = cur === 1 ? p1 : p2, opp = cur === 1 ? p2 : p1
    const goalRow = cur === 1 ? 0 : 8
    const wCount = cur === 1 ? p1W : p2W
    if (Math.random() < 0.75 || wCount === 0) {
      const path = getShortestPathCells(pawn, goalRow, walls)
      if (path.length >= 2) {
        const next = path[1]
        const legal = getLegalMoves(pawn, opp, walls)
        const onPath = legal.find(m => posEq(m, next))
        if (onPath) {
          if (cur === 1) p1 = onPath; else p2 = onPath
        } else if (legal.length > 0) {
          const m = legal[Math.floor(Math.random() * legal.length)]
          if (cur === 1) p1 = m; else p2 = m
        }
      } else {
        const legal = getLegalMoves(pawn, opp, walls)
        if (legal.length > 0) { const m = legal[Math.floor(Math.random() * legal.length)]; if (cur === 1) p1 = m; else p2 = m }
      }
    } else {
      const oppPath = getShortestPathCells(opp, cur === 1 ? 8 : 0, walls)
      const mid = oppPath[Math.min(2, oppPath.length - 1)]
      if (mid) {
        let placed = false
        for (const o of (Math.random() < 0.5 ? ['H', 'V'] : ['V', 'H']) as Orient[]) {
          for (let dr = 0; dr >= -1; dr--) for (let dc = 0; dc >= -1; dc--) {
            const w: Wall = { r: mid.r + dr, c: mid.c + dc, o }
            if (canPlaceWall(w, walls, p1, p2)) {
              walls = [...walls, w]
              if (cur === 1) p1W--; else p2W--
              placed = true; break
            }
          }
          if (placed) break
        }
        if (!placed) {
          const legal = getLegalMoves(pawn, opp, walls)
          if (legal.length > 0) { const m = legal[Math.floor(Math.random() * legal.length)]; if (cur === 1) p1 = m; else p2 = m }
        }
      }
    }
    cur = cur === 1 ? 2 : 1
  }
  const d1 = shortestPath(p1, 0, walls), d2 = shortestPath(p2, 8, walls)
  return d1 <= d2 ? 1 : 2
}

function pickAIMove(p1: Pos, p2: Pos, walls: Wall[], p2Walls: number, p1Walls?: number): { type: 'move'; pos: Pos } | { type: 'wall'; wall: Wall } {
  const SIMS = 3000
  const actions = getActions(p1, p2, walls, p1Walls ?? 10, p2Walls, 2)
  if (actions.length === 0) return { type: 'move', pos: p2 }
  if (actions.length === 1) return actions[0]

  const root: MCTSNode = { action: null, parent: null, children: [], wins: 0, visits: 0, player: 1, untried: [...actions] }

  for (let i = 0; i < SIMS; i++) {
    let node = root
    let s1 = { ...p1 }, s2 = { ...p2 }, sw = [...walls], sw1 = p1Walls ?? 10, sw2 = p2Walls
    let curP: Player = 2

    // Select
    while (node.untried.length === 0 && node.children.length > 0) {
      let best: MCTSNode | null = null, bestUCB = -Infinity
      const lnP = Math.log(node.visits)
      for (const c of node.children) {
        const ucb = (c.wins / c.visits) + 1.4 * Math.sqrt(lnP / c.visits)
        if (ucb > bestUCB) { bestUCB = ucb; best = c }
      }
      node = best!
      const a = node.action!
      if (a.type === 'move') { if (curP === 1) s1 = a.pos; else s2 = a.pos }
      else { sw = [...sw, a.wall]; if (curP === 1) sw1--; else sw2-- }
      curP = curP === 1 ? 2 : 1
    }

    // Expand
    if (node.untried.length > 0) {
      const idx = Math.floor(Math.random() * node.untried.length)
      const a = node.untried.splice(idx, 1)[0]
      if (a.type === 'move') { if (curP === 1) s1 = a.pos; else s2 = a.pos }
      else { sw = [...sw, a.wall]; if (curP === 1) sw1--; else sw2-- }
      const nextP: Player = curP === 1 ? 2 : 1
      const childActions = (s1.r === 0 || s2.r === 8) ? [] : getActions(s1, s2, sw, sw1, sw2, nextP)
      const child: MCTSNode = { action: a, parent: node, children: [], wins: 0, visits: 0, player: curP, untried: childActions }
      node.children.push(child)
      node = child
      curP = nextP
    }

    // Rollout
    let winner: Player
    if (s1.r === 0) winner = 1
    else if (s2.r === 8) winner = 2
    else winner = mctsRollout(s1, s2, sw, sw1, sw2, curP)

    // Backprop
    let n: MCTSNode | null = node
    while (n) { n.visits++; if (n.player === winner) n.wins++; n = n.parent }
  }

  let bestChild: MCTSNode | null = null, bestVisits = -1
  for (const c of root.children) { if (c.visits > bestVisits) { bestVisits = c.visits; bestChild = c } }
  return bestChild?.action ?? actions[0]
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function Quoridor(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle')
  const [p1, setP1] = useState<Pos>({ r: 8, c: 4 })
  const [p2, setP2] = useState<Pos>({ r: 0, c: 4 })
  const [walls, setWalls] = useState<Wall[]>([])
  const [p1Walls, setP1Walls] = useState(10)
  const [p2Walls, setP2Walls] = useState(10)
  const [mode, setMode] = useState<Mode>('move')
  const [wallOrient, setWallOrient] = useState<Orient>('H')
  const [hoverWall, setHoverWall] = useState<Wall | null>(null)
  const hoverCellRef = useRef<{ gr: number; gc: number } | null>(null)
  const [record, setRecord] = useState({ wins: 0, losses: 0 })
  const [result, setResult] = useState<string | null>(null)

  const phaseRef = useRef(phase)
  const p1Ref = useRef(p1), p2Ref = useRef(p2), wallsRef = useRef(walls)
  const p1WallsRef = useRef(p1Walls), p2WallsRef = useRef(p2Walls)
  useEffect(() => { phaseRef.current = phase }, [phase])
  useEffect(() => { p1Ref.current = p1 }, [p1])
  useEffect(() => { p2Ref.current = p2 }, [p2])
  useEffect(() => { wallsRef.current = walls }, [walls])
  useEffect(() => { p1WallsRef.current = p1Walls }, [p1Walls])
  useEffect(() => { p2WallsRef.current = p2Walls }, [p2Walls])

  useEffect(() => {
    window.api.settings.get(SAVE_KEY, '{}').then(v => {
      try { const d = JSON.parse(v); setRecord({ wins: d.wins ?? 0, losses: d.losses ?? 0 }) } catch {}
    })
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const k = e.key.toLowerCase()
      if (k === 'r') {
        e.preventDefault(); e.stopPropagation()
        setWallOrient(o => {
          const next = o === 'H' ? 'V' : 'H'
          const hc = hoverCellRef.current
          if (hc) {
            // wallOrient hasn't updated yet in gridToWall, so compute inline
            const gr = hc.gr, gc = hc.gc
            if (next === 'H') {
              const wr = gr % 2 === 1 ? (gr - 1) / 2 : (gr > 0 ? gr / 2 - 1 : -1)
              const wc = Math.floor(gc / 2)
              const tryC = [wc, wc - 1].filter(cc => cc >= 0 && cc < SIZE - 1)
              for (const cc of tryC) { if (isWallInBounds({ r: wr, c: cc, o: 'H' })) { setHoverWall({ r: wr, c: cc, o: 'H' }); break } }
            } else {
              const wc = gc % 2 === 1 ? (gc - 1) / 2 : (gc > 0 ? gc / 2 - 1 : -1)
              const wr = Math.floor(gr / 2)
              const tryR = [wr, wr - 1].filter(rr => rr >= 0 && rr < SIZE - 1)
              for (const rr of tryR) { if (isWallInBounds({ r: rr, c: wc, o: 'V' })) { setHoverWall({ r: rr, c: wc, o: 'V' }); break } }
            }
          }
          return next
        })
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  function saveRecord(r: { wins: number; losses: number }) {
    setRecord(r)
    window.api.settings.set(SAVE_KEY, JSON.stringify(r)).catch(() => {})
  }

  function startGame() {
    setP1({ r: 8, c: 4 }); setP2({ r: 0, c: 4 })
    setWalls([]); setP1Walls(10); setP2Walls(10)
    setMode('move'); setResult(null)
    setPhase('playerTurn')
  }

  function endGame(winner: Player) {
    setPhase('gameOver')
    if (winner === 1) {
      setResult('YOU WIN!')
      saveRecord({ wins: record.wins + 1, losses: record.losses })
    } else {
      setResult('CPU WINS')
      saveRecord({ wins: record.wins, losses: record.losses + 1 })
    }
  }

  function handleCellClick(r: number, c: number) {
    if (phase !== 'playerTurn' || mode !== 'move') return
    const legal = getLegalMoves(p1, p2, walls)
    const target = { r, c }
    if (!legal.some(m => posEq(m, target))) return
    setP1(target)
    if (r === 0) { endGame(1); return }
    setPhase('aiTurn')
    setTimeout(runAI, 300)
  }

  function handleWallPlace(r: number, c: number, o: Orient) {
    if (phase !== 'playerTurn' || mode !== 'wall' || p1Walls <= 0) return
    const w: Wall = { r, c, o }
    if (!canPlaceWall(w, walls, p1, p2)) return
    setWalls([...walls, w])
    setP1Walls(p1Walls - 1)
    setPhase('aiTurn')
    setTimeout(runAI, 300)
  }

  function runAI() {
    if (phaseRef.current !== 'aiTurn') return
    const move = pickAIMove(p1Ref.current, p2Ref.current, wallsRef.current, p2WallsRef.current, p1WallsRef.current)
    if (move.type === 'move') {
      setP2(move.pos)
      if (move.pos.r === 8) { endGame(2); return }
    } else {
      setWalls(w => [...w, move.wall])
      setP2Walls(n => n - 1)
    }
    setPhase('playerTurn')
  }

  // ─── Rendering helpers ─────────────────────────────────────────────────────

  const legalMoves = phase === 'playerTurn' && mode === 'move' ? getLegalMoves(p1, p2, walls) : []

  function isWallSegmentFilled(gr: number, gc: number): boolean {
    const isH = gr % 2 === 1 && gc % 2 === 0
    const isV = gr % 2 === 0 && gc % 2 === 1
    if (!isH && !isV) return false
    for (const w of walls) {
      if (w.o === 'H') {
        const wr = w.r * 2 + 1
        if (isH && gr === wr && (gc === w.c * 2 || gc === w.c * 2 + 2)) return true
        if (!isH && gr === wr && gc === w.c * 2 + 1) return true
      } else {
        const wc = w.c * 2 + 1
        if (isV && gc === wc && (gr === w.r * 2 || gr === w.r * 2 + 2)) return true
        if (!isV && gc === wc && gr === w.r * 2 + 1) return true
      }
    }
    return false
  }

  function isIntersectionFilled(gr: number, gc: number): boolean {
    for (const w of walls) {
      if (w.o === 'H' && gr === w.r * 2 + 1 && gc === w.c * 2 + 1) return true
      if (w.o === 'V' && gr === w.r * 2 + 1 && gc === w.c * 2 + 1) return true
    }
    return false
  }

  function gridToWall(gr: number, gc: number): Wall | null {
    if (wallOrient === 'H') {
      const wr = gr % 2 === 1 ? (gr - 1) / 2 : (gr % 2 === 0 && gr > 0) ? (gr / 2 - 1) : -1
      if (wr < 0 || wr >= SIZE - 1) return null
      const wc = Math.floor(gc / 2)
      const tryC = [wc, wc - 1].filter(cc => cc >= 0 && cc < SIZE - 1)
      for (const cc of tryC) { if (isWallInBounds({ r: wr, c: cc, o: 'H' })) return { r: wr, c: cc, o: 'H' } }
    } else {
      const wc = gc % 2 === 1 ? (gc - 1) / 2 : (gc % 2 === 0 && gc > 0) ? (gc / 2 - 1) : -1
      if (wc < 0 || wc >= SIZE - 1) return null
      const wr = Math.floor(gr / 2)
      const tryR = [wr, wr - 1].filter(rr => rr >= 0 && rr < SIZE - 1)
      for (const rr of tryR) { if (isWallInBounds({ r: rr, c: wc, o: 'V' })) return { r: rr, c: wc, o: 'V' } }
    }
    return null
  }

  function getWallGridCells(w: Wall): Set<string> {
    const cells = new Set<string>()
    if (w.o === 'H') {
      const gr = w.r * 2 + 1
      cells.add(`${gr},${w.c * 2}`)
      cells.add(`${gr},${w.c * 2 + 1}`)
      cells.add(`${gr},${w.c * 2 + 2}`)
    } else {
      const gc = w.c * 2 + 1
      cells.add(`${w.r * 2},${gc}`)
      cells.add(`${w.r * 2 + 1},${gc}`)
      cells.add(`${w.r * 2 + 2},${gc}`)
    }
    return cells
  }

  function wallSlotHover(gr: number, gc: number) {
    hoverCellRef.current = { gr, gc }
    if (phase !== 'playerTurn' || mode !== 'wall' || p1Walls <= 0) { setHoverWall(null); return }
    const w = gridToWall(gr, gc)
    setHoverWall(w)
  }

  function wallSlotClick(gr: number, gc: number) {
    if (phase !== 'playerTurn' || mode !== 'wall' || p1Walls <= 0) return
    const w = gridToWall(gr, gc)
    if (w && canPlaceWall(w, walls, p1, p2)) handleWallPlace(w.r, w.c, w.o)
  }

  function renderGrid() {
    const elements: JSX.Element[] = []
    const previewCells = hoverWall ? getWallGridCells(hoverWall) : new Set<string>()
    const previewValid = hoverWall ? canPlaceWall(hoverWall, walls, p1, p2) : false
    for (let gr = 0; gr < 17; gr++) {
      for (let gc = 0; gc < 17; gc++) {
        const isCell = gr % 2 === 0 && gc % 2 === 0
        const isHSlot = gr % 2 === 1 && gc % 2 === 0
        const isVSlot = gr % 2 === 0 && gc % 2 === 1
        const isInter = gr % 2 === 1 && gc % 2 === 1

        if (isCell) {
          const r = gr / 2, c = gc / 2
          const isP1 = p1.r === r && p1.c === c
          const isP2 = p2.r === r && p2.c === c
          const isLegal = legalMoves.some(m => m.r === r && m.c === c)
          const goalClass = r === 0 ? styles.cellGoal1 : r === 8 ? styles.cellGoal2 : ''
          const legalClass = isLegal ? styles.cellLegal : ''
          elements.push(
            <div key={`${gr}-${gc}`} className={`${styles.cell} ${goalClass} ${legalClass}`}
              style={{ gridRow: gr + 1, gridColumn: gc + 1 }}
              onClick={() => isLegal && handleCellClick(r, c)}>
              {isP1 && <div className={`${styles.pawn} ${styles.pawn1}`} />}
              {isP2 && <div className={`${styles.pawn} ${styles.pawn2}`} />}
            </div>
          )
        } else if (isHSlot || isVSlot || isInter) {
          const filled = isInter ? isIntersectionFilled(gr, gc) : isWallSegmentFilled(gr, gc)
          const isPreviewed = previewCells.has(`${gr},${gc}`)
          const canInteract = phase === 'playerTurn' && mode === 'wall' && p1Walls > 0 && !filled
          const slotClass = isHSlot ? styles.wallSlotH : isVSlot ? styles.wallSlotV : styles.intersection
          let bg: string | undefined
          if (filled) bg = '#a855f7'
          else if (isPreviewed) bg = previewValid ? 'rgba(74, 222, 128, 0.6)' : 'rgba(220, 38, 38, 0.5)'
          elements.push(
            <div key={`${gr}-${gc}`}
              className={`${slotClass} ${filled ? styles.wallPlaced : ''} ${canInteract && !isInter ? styles.wallHover : ''}`}
              style={{ gridRow: gr + 1, gridColumn: gc + 1, background: bg }}
              onClick={() => canInteract && wallSlotClick(gr, gc)}
              onMouseEnter={() => canInteract && wallSlotHover(gr, gc)}
              onMouseLeave={() => { setHoverWall(null); hoverCellRef.current = null }} />
          )
        }
      }
    }
    return elements
  }

  return (
    <div className={styles.body}>
      <div className={styles.hud}>
        <span>You <strong>{p1Walls}</strong> walls</span>
        <span>CPU <strong>{p2Walls}</strong> walls</span>
        {record.wins + record.losses > 0 && <span>{record.wins}W · {record.losses}L</span>}
        {phase === 'playerTurn' && <span className={styles.turnLabel}>YOUR TURN</span>}
        {phase === 'aiTurn' && <span className={styles.thinking}>CPU thinking…</span>}
      </div>

      <div className={styles.boardWrap}>
        <div className={styles.board}>
          {renderGrid()}
        </div>

        {(phase === 'idle' || phase === 'gameOver') && (
          <div className={styles.overlay}>
            {result && <div className={styles.title}>{result}</div>}
            {!result && <div className={styles.title}>QUORIDOR</div>}
            <div className={styles.subtitle}>Block your opponent · reach the far side</div>
            <button className={styles.btn} onClick={startGame}>{result ? 'Play Again' : 'Start Game'}</button>
          </div>
        )}
      </div>

      {phase === 'playerTurn' && (
        <div className={styles.controls}>
          <button className={`${styles.btnSecondary} ${mode === 'move' ? styles.btnActive : ''}`} onClick={() => setMode('move')}>Move</button>
          <button className={`${styles.btnSecondary} ${mode === 'wall' ? styles.btnActive : ''}`} onClick={() => { if (p1Walls > 0) setMode('wall') }} style={p1Walls <= 0 ? { opacity: 0.4, cursor: 'not-allowed' } : {}}>
            Wall ({wallOrient})
          </button>
          {mode === 'wall' && <button className={styles.btnSecondary} onClick={() => setWallOrient(o => o === 'H' ? 'V' : 'H')}>Rotate (R)</button>}
        </div>
      )}

      <div className={styles.hint}>
        {phase === 'playerTurn' && mode === 'move' && 'Click a highlighted cell to move'}
        {phase === 'playerTurn' && mode === 'wall' && 'Click between cells to place a wall · R to rotate'}
      </div>
    </div>
  )
}
