import { useEffect, useRef, useState } from 'react'
import styles from './MemoryMatch.module.css'

const SAVE_KEY = 'memoryBest'
// 32 single-codepoint emojis — no variation selectors, no ZWJ sequences.
// Safe across Windows / macOS / Linux Electron builds.
const SYMBOLS = [
  '🎬', '📺', '🎵', '📚', '🎮', '💿', '📀', '🎭',
  '🃏', '🌟', '🏆', '⚡', '🔮', '💎', '🎲', '🎯',
  '🧩', '🔬', '🎪', '🎨', '🎸', '🎹', '🎺', '🍎',
  '🍌', '🍇', '🍓', '🍕', '🐶', '🐱', '🐻', '🦁'
]
const SIZES = { '4': 8, '6': 18, '8': 32 }

type GridSize = '4' | '6' | '8'
type Phase = 'idle' | 'playing' | 'won'

interface Card {
  id: number
  symbol: string
  flipped: boolean
  matched: boolean
}

interface BestFlips {
  '4'?: number
  '6'?: number
  '8'?: number
}

interface MemoryMatchProps {
  onNewBest?: (size: GridSize, flips: number) => void
}

export default function MemoryMatch({ onNewBest }: MemoryMatchProps): JSX.Element {
  const [size, setSize] = useState<GridSize>('4')
  const [phase, setPhase] = useState<Phase>('idle')
  const [displayFlips, setDisplayFlips] = useState(0)
  const [best, setBest] = useState<BestFlips>({})
  const [, setVersion] = useState(0)
  const bump = (): void => setVersion(v => v + 1)

  const cardsRef = useRef<Card[]>([])
  const flipsLeftRef = useRef<number[]>([])
  const flipCountRef = useRef(0)
  const lockBoardRef = useRef(false)
  const phaseRef = useRef<Phase>('idle')

  useEffect(() => {
    window.api.settings.get(SAVE_KEY, '{}').then(v => {
      try { setBest(JSON.parse(v) as BestFlips) } catch { /* use defaults */ }
    })
    initializeGame()
  }, [])

  function initializeGame(s: GridSize = size): void {
    const pairCount = SIZES[s]
    const symbols = SYMBOLS.slice(0, pairCount).sort(() => Math.random() - 0.5)
    const cards: Card[] = []
    let id = 0

    for (let i = 0; i < 2; i++) {
      for (const symbol of symbols) {
        cards.push({ id: id++, symbol, flipped: false, matched: false })
      }
    }

    cards.sort(() => Math.random() - 0.5)
    cardsRef.current = cards
    flipsLeftRef.current = []
    flipCountRef.current = 0
    lockBoardRef.current = false
    setDisplayFlips(0)
    phaseRef.current = 'idle'
    setPhase('idle')
  }

  function flipCard(idx: number): void {
    if (phaseRef.current !== 'playing') {
      if (phaseRef.current === 'idle') {
        phaseRef.current = 'playing'
        setPhase('playing')
      } else return
    }

    if (lockBoardRef.current) return
    const card = cardsRef.current[idx]
    if (card.flipped || card.matched) return

    card.flipped = true
    flipsLeftRef.current.push(idx)
    bump()

    if (flipsLeftRef.current.length === 2) {
      const [idx1, idx2] = flipsLeftRef.current
      const card1 = cardsRef.current[idx1]
      const card2 = cardsRef.current[idx2]
      flipCountRef.current++
      setDisplayFlips(flipCountRef.current)

      if (card1.symbol === card2.symbol) {
        card1.matched = true
        card2.matched = true
        flipsLeftRef.current = []

        const allMatched = cardsRef.current.every(c => c.matched)
        if (allMatched) {
          phaseRef.current = 'won'
          setPhase('won')
          const flips = flipCountRef.current
          const bestFlips = best[size]
          if (!bestFlips || flips < bestFlips) {
            const newBest = { ...best, [size]: flips }
            setBest(newBest)
            window.api.settings.set(SAVE_KEY, JSON.stringify(newBest)).catch(() => {})
            onNewBest?.(size, flips)
          }
        }
      } else {
        lockBoardRef.current = true
        setTimeout(() => {
          card1.flipped = false
          card2.flipped = false
          flipsLeftRef.current = []
          lockBoardRef.current = false
          bump()
        }, 800)
      }
    }
  }

  function resetGame(): void {
    initializeGame()
  }

  const gridSize = parseInt(size)
  const cellSize = size === '4' ? 80 : size === '6' ? 60 : 48
  const bestFlips = best[size]

  return (
    <div className={styles.body}>
      <div className={styles.header}>
        <div className={styles.modeSelect}>
          {(['4', '6', '8'] as GridSize[]).map(s => (
            <button
              key={s}
              className={`${styles.modeBtn} ${size === s ? styles.modeBtnActive : ''}`}
              onClick={() => { setSize(s); initializeGame(s) }}
            >
              {s}×{s}
            </button>
          ))}
        </div>
        <div className={styles.stats}>
          <span>Flips: {displayFlips}</span>
          {bestFlips && <span>Best: {bestFlips}</span>}
        </div>
      </div>

      <div className={styles.gameArea}>
        <div className={styles.gridWrapper}>
          <div
            className={styles.grid}
            style={{
              gridTemplateColumns: `repeat(${gridSize}, ${cellSize}px)`,
              gridAutoRows: `${cellSize}px`
            }}
          >
            {cardsRef.current.map((card, idx) => (
              <button
                key={idx}
                className={`${styles.card} ${card.flipped || card.matched ? styles.cardFlipped : ''}`}
                onClick={() => flipCard(idx)}
              >
                <div className={styles.cardInner}>
                  <div className={styles.cardFront}>🔐</div>
                  <div className={styles.cardBack} style={{ fontSize: `${cellSize * 0.5}px` }}>{card.symbol}</div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {phase === 'won' && (
          <div className={styles.overlay}>
            <span className={styles.message}>✨ You Win!</span>
            <span className={styles.flips}>{displayFlips} flips</span>
            <button className={styles.btn} onClick={resetGame}>Play Again</button>
          </div>
        )}
      </div>
    </div>
  )
}
