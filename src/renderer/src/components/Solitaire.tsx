import { useEffect, useRef, useState } from 'react'
import styles from './Solitaire.module.css'

// Klondike Solitaire — drag-to-move, auto-finish, supports single-card or three-card draw.

type Suit = 'S' | 'H' | 'D' | 'C'
const SUITS: Suit[] = ['S', 'H', 'D', 'C']
const SUIT_GLYPH: Record<Suit, string> = { S: '♠', H: '♥', D: '♦', C: '♣' }
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

interface Card {
  suit: Suit
  rank: number
  faceUp: boolean
}

type PileKind = 'tableau' | 'foundation' | 'stock' | 'waste'
interface Location { kind: PileKind; pile: number; index: number }
interface Drag { cards: Card[]; src: Location; x: number; y: number; ox: number; oy: number }

const CW = 64, CH = 92
const MX = 14
const MY = 14
const COL_GAP = CW + 6
const STACK_OFFSET = 22
const CANVAS_W = MX * 2 + COL_GAP * 7 - 6
const CANVAS_H = 540

const SAVE_KEY = 'solitaireWins'
const DRAW_MODE_KEY = 'solitaireDrawMode'
const WASTE_FAN_OFFSET = 16     // visual offset between fanned waste cards (Draw 3 mode)

function isRed(s: Suit): boolean { return s === 'H' || s === 'D' }

function makeDeck(): Card[] {
  const d: Card[] = []
  for (const suit of SUITS) for (let r = 1; r <= 13; r++) d.push({ suit, rank: r, faceUp: false })
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[d[i], d[j]] = [d[j], d[i]]
  }
  return d
}

interface State {
  tableau: Card[][]
  foundations: Card[][]
  stock: Card[]
  waste: Card[]
}

function deal(): State {
  const deck = makeDeck()
  const tableau: Card[][] = Array.from({ length: 7 }, () => [])
  for (let col = 0; col < 7; col++) {
    for (let r = 0; r <= col; r++) {
      const c = deck.pop()!
      if (r === col) c.faceUp = true
      tableau[col].push(c)
    }
  }
  return { tableau, foundations: [[], [], [], []], stock: deck, waste: [] }
}

export default function Solitaire(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const stateRef = useRef<State>(deal())
  const dragRef = useRef<Drag | null>(null)
  const mouseRef = useRef({ x: 0, y: 0 })
  const autoFinishRef = useRef(false)
  const autoTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const rafRef = useRef<number | null>(null)

  const [movesUI, setMovesUI] = useState(0)
  const [phase, setPhase] = useState<'playing' | 'won'>('playing')
  const [wins, setWins] = useState(0)
  const [drawMode, setDrawMode] = useState<1 | 3>(1)
  const drawModeRef = useRef<1 | 3>(1)
  const movesRef = useRef(0)

  useEffect(() => {
    window.api.settings.get(SAVE_KEY, '0').then(v => setWins(parseInt(v, 10) || 0))
    window.api.settings.get(DRAW_MODE_KEY, '1').then(v => {
      const n = parseInt(v, 10) === 3 ? 3 : 1
      drawModeRef.current = n as 1 | 3
      setDrawMode(n as 1 | 3)
    })
    startRaf()
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (autoTimerRef.current) clearInterval(autoTimerRef.current)
    }
  }, [])

  function changeDrawMode(n: 1 | 3): void {
    drawModeRef.current = n
    setDrawMode(n)
    window.api.settings.set(DRAW_MODE_KEY, String(n)).catch(() => {})
    // Reset to a clean game so the draw rule applies from the start
    reset()
  }

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    function onDown(e: MouseEvent): void {
      const rect = c!.getBoundingClientRect()
      const x = e.clientX - rect.left, y = e.clientY - rect.top
      mouseRef.current = { x, y }
      handleDown(x, y)
    }
    function onMove(e: MouseEvent): void {
      const rect = c!.getBoundingClientRect()
      const x = e.clientX - rect.left, y = e.clientY - rect.top
      mouseRef.current = { x, y }
      if (dragRef.current) { dragRef.current.x = x; dragRef.current.y = y }
    }
    function onUp(e: MouseEvent): void {
      const rect = c!.getBoundingClientRect()
      const x = e.clientX - rect.left, y = e.clientY - rect.top
      handleUp(x, y)
    }
    function onDbl(e: MouseEvent): void {
      const rect = c!.getBoundingClientRect()
      const x = e.clientX - rect.left, y = e.clientY - rect.top
      handleDouble(x, y)
    }
    c.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    c.addEventListener('dblclick', onDbl)
    return () => {
      c.removeEventListener('mousedown', onDown)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      c.removeEventListener('dblclick', onDbl)
    }
  }, [])

  function pileXY(kind: PileKind, pile: number): { x: number; y: number } {
    if (kind === 'stock')      return { x: MX, y: MY }
    if (kind === 'waste')      return { x: MX + COL_GAP + wasteTopOffsetX(), y: MY }
    if (kind === 'foundation') return { x: MX + COL_GAP * (3 + pile), y: MY }
    return { x: MX + COL_GAP * pile, y: MY + CH + 28 }
  }

  // In Draw-3 mode, the top of the waste sits to the right of the slot's left edge
  // by up to 2 × WASTE_FAN_OFFSET so the most recently drawn cards fan out beneath it.
  function wasteTopOffsetX(): number {
    if (drawModeRef.current !== 3) return 0
    const w = stateRef.current.waste
    return Math.min(2, Math.max(0, w.length - 1)) * WASTE_FAN_OFFSET
  }

  function within(px: number, py: number, x: number, y: number, w: number, h: number): boolean {
    return px >= x && px <= x + w && py >= y && py <= y + h
  }

  function hitTest(x: number, y: number): Location | null {
    if (within(x, y, ...Object.values(pileXY('stock', 0)), CW, CH)) return { kind: 'stock', pile: 0, index: 0 }
    if (within(x, y, ...Object.values(pileXY('waste', 0)), CW, CH)) {
      const w = stateRef.current.waste
      return w.length ? { kind: 'waste', pile: 0, index: w.length - 1 } : null
    }
    for (let i = 0; i < 4; i++) {
      const p = pileXY('foundation', i)
      if (within(x, y, p.x, p.y, CW, CH)) {
        const f = stateRef.current.foundations[i]
        return { kind: 'foundation', pile: i, index: f.length - 1 }
      }
    }
    for (let col = 0; col < 7; col++) {
      const p = pileXY('tableau', col)
      const stack = stateRef.current.tableau[col]
      const stackHeight = stack.length === 0 ? CH : (stack.length - 1) * STACK_OFFSET + CH
      if (x >= p.x && x <= p.x + CW && y >= p.y && y <= p.y + stackHeight) {
        if (stack.length === 0) return { kind: 'tableau', pile: col, index: -1 }
        const relY = y - p.y
        let idx = Math.min(stack.length - 1, Math.floor(relY / STACK_OFFSET))
        if (relY > (stack.length - 1) * STACK_OFFSET) idx = stack.length - 1
        while (idx >= 0 && idx < stack.length && !stack[idx].faceUp) idx++
        if (idx < 0 || idx >= stack.length) idx = stack.length - 1
        return { kind: 'tableau', pile: col, index: idx }
      }
    }
    return null
  }

  function handleDown(x: number, y: number): void {
    if (phase !== 'playing' || autoFinishRef.current) return
    const hit = hitTest(x, y)
    if (!hit) return

    if (hit.kind === 'stock') {
      const s = stateRef.current
      if (s.stock.length > 0) {
        const drawN = drawModeRef.current
        const n = Math.min(drawN, s.stock.length)
        for (let i = 0; i < n; i++) {
          const c = s.stock.pop()!
          c.faceUp = true
          s.waste.push(c)
        }
      } else if (s.waste.length > 0) {
        while (s.waste.length) {
          const c = s.waste.pop()!
          c.faceUp = false
          s.stock.push(c)
        }
      }
      bumpMove()
      maybeAutoFinish()
      return
    }

    // Build drag payload
    if (hit.kind === 'foundation') {
      const f = stateRef.current.foundations[hit.pile]
      if (!f.length) return
      const c = f[f.length - 1]
      const p = pileXY('foundation', hit.pile)
      dragRef.current = { cards: [c], src: hit, x, y, ox: x - p.x, oy: y - p.y }
    } else if (hit.kind === 'waste') {
      const w = stateRef.current.waste
      if (!w.length) return
      const c = w[w.length - 1]
      const p = pileXY('waste', 0)
      dragRef.current = { cards: [c], src: hit, x, y, ox: x - p.x, oy: y - p.y }
    } else if (hit.kind === 'tableau') {
      const stack = stateRef.current.tableau[hit.pile]
      if (hit.index < 0 || !stack[hit.index]?.faceUp) return
      const cards = stack.slice(hit.index)
      const p = pileXY('tableau', hit.pile)
      const oy = y - (p.y + hit.index * STACK_OFFSET)
      const ox = x - p.x
      dragRef.current = { cards, src: hit, x, y, ox, oy }
    }
  }

  function handleUp(x: number, y: number): void {
    const drag = dragRef.current
    if (!drag) return
    dragRef.current = null
    const dst = hitTest(x, y)
    if (!dst) return
    if (tryMove(drag, dst)) {
      bumpMove()
      flipExposed()
      checkWin()
      maybeAutoFinish()
    }
  }

  function handleDouble(x: number, y: number): void {
    if (phase !== 'playing' || autoFinishRef.current) return
    const hit = hitTest(x, y)
    if (!hit || hit.kind === 'stock' || hit.kind === 'foundation') return
    // Try foundation
    let card: Card | null = null
    if (hit.kind === 'waste') card = stateRef.current.waste.at(-1) ?? null
    else if (hit.kind === 'tableau') {
      const stack = stateRef.current.tableau[hit.pile]
      const top = stack.at(-1)
      if (top && top.faceUp && hit.index === stack.length - 1) card = top
    }
    if (!card) return
    const fIdx = SUITS.indexOf(card.suit)
    const f = stateRef.current.foundations[fIdx]
    const ok = (card.rank === 1 && f.length === 0) || (f.length > 0 && f[f.length - 1].rank === card.rank - 1)
    if (!ok) return
    // Build a synthetic drag to reuse tryMove
    const drag: Drag = { cards: [card], src: hit, x: 0, y: 0, ox: 0, oy: 0 }
    if (tryMove(drag, { kind: 'foundation', pile: fIdx, index: f.length - 1 })) {
      bumpMove(); flipExposed(); checkWin(); maybeAutoFinish()
    }
  }

  function bumpMove(): void { movesRef.current++; setMovesUI(movesRef.current) }

  function flipExposed(): void {
    for (const col of stateRef.current.tableau) {
      const top = col[col.length - 1]
      if (top && !top.faceUp) top.faceUp = true
    }
  }

  function tryMove(drag: Drag, dst: Location): boolean {
    const cards = drag.cards
    const src = drag.src

    if (dst.kind === 'foundation') {
      if (cards.length !== 1) return false
      const c = cards[0]
      const fIdx = dst.pile
      const f = stateRef.current.foundations[fIdx]
      if (SUITS.indexOf(c.suit) !== fIdx) return false
      const ok = (c.rank === 1 && f.length === 0) || (f.length > 0 && f[f.length - 1].rank === c.rank - 1)
      if (!ok) return false
      removePicked(src, cards.length)
      f.push(c)
      return true
    }

    if (dst.kind === 'tableau') {
      const dCol = stateRef.current.tableau[dst.pile]
      const top = cards[0]
      if (dCol.length === 0) {
        if (top.rank !== 13) return false
      } else {
        const dTop = dCol[dCol.length - 1]
        if (!dTop.faceUp) return false
        if (isRed(dTop.suit) === isRed(top.suit)) return false
        if (dTop.rank !== top.rank + 1) return false
      }
      removePicked(src, cards.length)
      dCol.push(...cards)
      return true
    }

    return false
  }

  function removePicked(src: Location, count: number): void {
    if (src.kind === 'tableau') stateRef.current.tableau[src.pile].splice(src.index, count)
    else if (src.kind === 'waste') stateRef.current.waste.pop()
    else if (src.kind === 'foundation') stateRef.current.foundations[src.pile].pop()
  }

  function checkWin(): void {
    const f = stateRef.current.foundations
    if (f.every(p => p.length === 13)) {
      setPhase('won')
      const next = wins + 1
      setWins(next)
      window.api.settings.set(SAVE_KEY, String(next)).catch(() => {})
    }
  }

  // Auto-finish: when stock + waste are empty AND every tableau card is face up,
  // the game is solvable by foundation moves only. Animate the rest.
  function isAutoFinishable(): boolean {
    const s = stateRef.current
    if (s.stock.length > 0 || s.waste.length > 0) return false
    for (const col of s.tableau) for (const c of col) if (!c.faceUp) return false
    return true
  }

  function maybeAutoFinish(): void {
    if (autoFinishRef.current) return
    if (!isAutoFinishable()) return
    const s = stateRef.current
    if (s.foundations.every(p => p.length === 13)) return
    autoFinishRef.current = true
    autoTimerRef.current = setInterval(() => {
      const s2 = stateRef.current
      // Find the lowest-rank tableau-top card that can go to a foundation
      let best: { col: number } | null = null
      let bestRank = 14
      for (let c = 0; c < 7; c++) {
        const stack = s2.tableau[c]
        const top = stack[stack.length - 1]
        if (!top) continue
        const fIdx = SUITS.indexOf(top.suit)
        const f = s2.foundations[fIdx]
        const ok = (top.rank === 1 && f.length === 0) || (f.length > 0 && f[f.length - 1].rank === top.rank - 1)
        if (ok && top.rank < bestRank) { bestRank = top.rank; best = { col: c } }
      }
      if (!best) {
        if (autoTimerRef.current) { clearInterval(autoTimerRef.current); autoTimerRef.current = null }
        autoFinishRef.current = false
        return
      }
      const stack = s2.tableau[best.col]
      const card = stack.pop()!
      s2.foundations[SUITS.indexOf(card.suit)].push(card)
      bumpMove()
      if (s2.foundations.every(p => p.length === 13)) {
        if (autoTimerRef.current) { clearInterval(autoTimerRef.current); autoTimerRef.current = null }
        autoFinishRef.current = false
        checkWin()
      }
    }, 90)
  }

  function reset(): void {
    if (autoTimerRef.current) { clearInterval(autoTimerRef.current); autoTimerRef.current = null }
    autoFinishRef.current = false
    stateRef.current = deal()
    dragRef.current = null
    movesRef.current = 0
    setMovesUI(0)
    setPhase('playing')
  }

  function startRaf(): void {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const loop = (): void => {
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
  }

  function draw(): void {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#0a3d22'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    drawStockSlot(ctx)
    drawPileSlot(ctx, MX + COL_GAP, MY)
    const w = stateRef.current.waste
    if (w.length) {
      if (drawModeRef.current === 3) {
        // Show up to the last 3 cards fanning right; the rightmost is the playable top.
        const visible = Math.min(3, w.length)
        for (let i = 0; i < visible; i++) {
          const card = w[w.length - visible + i]
          // The drag layer renders the top card separately while a drag is active; skip
          // drawing it here so it doesn't show in two places.
          const drag = dragRef.current
          const isTop = i === visible - 1
          if (isTop && drag && drag.src.kind === 'waste') continue
          drawCard(ctx, MX + COL_GAP + i * WASTE_FAN_OFFSET, MY, card, false)
        }
      } else {
        const drag = dragRef.current
        if (!(drag && drag.src.kind === 'waste')) {
          drawCard(ctx, MX + COL_GAP, MY, w[w.length - 1], false)
        }
      }
    }

    for (let i = 0; i < 4; i++) {
      const p = pileXY('foundation', i)
      drawFoundationSlot(ctx, p.x, p.y, SUIT_GLYPH[SUITS[i]], isRed(SUITS[i]))
      const f = stateRef.current.foundations[i]
      if (f.length) drawCard(ctx, p.x, p.y, f[f.length - 1], false)
    }

    // Tableau (skip cards currently being dragged so they don't double-render)
    const drag = dragRef.current
    for (let col = 0; col < 7; col++) {
      const p = pileXY('tableau', col)
      const stack = stateRef.current.tableau[col]
      if (!stack.length) drawPileSlot(ctx, p.x, p.y)
      for (let i = 0; i < stack.length; i++) {
        if (drag && drag.src.kind === 'tableau' && drag.src.pile === col && i >= drag.src.index) continue
        drawCard(ctx, p.x, p.y + i * STACK_OFFSET, stack[i], false)
      }
    }

    // Drag visual (drawn on top, follows cursor)
    if (drag) {
      const x = drag.x - drag.ox, y = drag.y - drag.oy
      for (let i = 0; i < drag.cards.length; i++) {
        drawCard(ctx, x, y + i * STACK_OFFSET, drag.cards[i], true)
      }
    }
  }

  function drawCard(ctx: CanvasRenderingContext2D, x: number, y: number, card: Card, lifted: boolean): void {
    if (lifted) {
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,0.55)'
      ctx.shadowBlur = 10
      ctx.shadowOffsetY = 4
    }
    if (!card.faceUp) {
      ctx.fillStyle = '#1e3a8a'
      roundRect(ctx, x, y, CW, CH, 6, true, false)
      ctx.strokeStyle = '#3b5fc4'
      ctx.lineWidth = 1
      roundRect(ctx, x + 4, y + 4, CW - 8, CH - 8, 4, false, true)
      if (lifted) ctx.restore()
      return
    }
    ctx.fillStyle = '#fafafa'
    roundRect(ctx, x, y, CW, CH, 6, true, false)
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 1
    roundRect(ctx, x, y, CW, CH, 6, false, true)
    if (lifted) ctx.restore()

    ctx.fillStyle = isRed(card.suit) ? '#dc2626' : '#1f2937'
    ctx.font = 'bold 16px ui-monospace, Consolas, monospace'
    ctx.textBaseline = 'top'
    ctx.textAlign = 'left'
    ctx.fillText(RANKS[card.rank - 1], x + 6, y + 6)
    ctx.font = '18px ui-monospace, Consolas, monospace'
    ctx.fillText(SUIT_GLYPH[card.suit], x + 6, y + 22)
    ctx.font = 'bold 22px ui-monospace, Consolas, monospace'
    ctx.textAlign = 'center'
    ctx.fillText(SUIT_GLYPH[card.suit], x + CW / 2, y + CH / 2 - 12)
  }

  function drawPileSlot(ctx: CanvasRenderingContext2D, x: number, y: number): void {
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'
    ctx.lineWidth = 1
    roundRect(ctx, x, y, CW, CH, 6, false, true)
  }

  function drawStockSlot(ctx: CanvasRenderingContext2D): void {
    const s = stateRef.current.stock
    if (s.length > 0) {
      ctx.fillStyle = '#1e3a8a'
      roundRect(ctx, MX, MY, CW, CH, 6, true, false)
      ctx.fillStyle = '#fff'
      ctx.font = 'bold 14px ui-monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(String(s.length), MX + CW / 2, MY + CH / 2)
    } else {
      drawPileSlot(ctx, MX, MY)
      ctx.fillStyle = 'rgba(255,255,255,0.4)'
      ctx.font = '12px ui-monospace'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText('↻', MX + CW / 2, MY + CH / 2)
    }
  }

  function drawFoundationSlot(ctx: CanvasRenderingContext2D, x: number, y: number, glyph: string, red: boolean): void {
    drawPileSlot(ctx, x, y)
    ctx.fillStyle = red ? 'rgba(220,38,38,0.25)' : 'rgba(255,255,255,0.20)'
    ctx.font = 'bold 32px ui-monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(glyph, x + CW / 2, y + CH / 2)
  }

  function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, fill: boolean, stroke: boolean): void {
    ctx.beginPath()
    ctx.moveTo(x + r, y)
    ctx.arcTo(x + w, y, x + w, y + h, r)
    ctx.arcTo(x + w, y + h, x, y + h, r)
    ctx.arcTo(x, y + h, x, y, r)
    ctx.arcTo(x, y, x + w, y, r)
    if (fill) ctx.fill()
    if (stroke) ctx.stroke()
  }

  return (
    <div className={styles.body}>
      <div className={styles.header}>
        <span>Moves <strong>{movesUI}</strong></span>
        <span>Wins <strong>{wins}</strong></span>
        <div className={styles.modeRow}>
          {([1, 3] as const).map(n => (
            <button
              key={n}
              className={`${styles.modeBtn} ${drawMode === n ? styles.modeBtnActive : ''}`}
              onClick={() => changeDrawMode(n)}
              title={n === 1 ? 'Klondike — Draw 1' : 'Klondike — Draw 3 (harder)'}
            >
              Draw {n}
            </button>
          ))}
        </div>
        <button className={styles.resetBtn} onClick={reset}>↻ New Game</button>
      </div>
      <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className={styles.canvas} />
      <div className={styles.hint}>Click stock to deal · drag cards to move · double-click to send to foundation</div>
      {phase === 'won' && (
        <div className={styles.overlay}>
          <div className={styles.title}>YOU WIN</div>
          <div className={styles.subtitle}>{movesUI} moves</div>
          <button className={styles.btn} onClick={reset}>New Game</button>
        </div>
      )}
    </div>
  )
}
