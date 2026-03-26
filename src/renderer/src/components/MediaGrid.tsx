import { useRef, useEffect, useState, useCallback } from 'react'
import PosterImage from './PosterImage'
import { useAppStore } from '../store/appStore'
import { useController, type ControllerButton } from '../hooks/useController'
import styles from './MediaGrid.module.css'

export interface MediaCard {
  id: number
  title: string
  year?: number | null
  posterPath?: string | null
  subtitle?: string
  filePath?: string | null
}

interface Props {
  items: MediaCard[]
  onSelect: (item: MediaCard) => void
  emptyMessage?: string
}

export default function MediaGrid({ items, onSelect, emptyMessage = 'No items found.' }: Props): JSX.Element {
  const { focusZone, setFocusZone } = useAppStore()
  const [focusedIdx, setFocusedIdx] = useState(0)
  const cardRefs = useRef<(HTMLButtonElement | null)[]>([])
  const gridRef = useRef<HTMLDivElement | null>(null)
  const isFocused = focusZone === 'content'

  // When focus enters content, highlight the first card
  useEffect(() => {
    if (isFocused && items.length) {
      cardRefs.current[focusedIdx]?.focus()
    }
  }, [isFocused])

  function getCols(): number {
    return Math.floor((gridRef.current?.clientWidth ?? 800) / 160)
  }

  function move(dir: 'up' | 'down' | 'left' | 'right'): void {
    if (!items.length) return
    const cols = getCols()
    setFocusedIdx((prev) => {
      let next = prev
      if (dir === 'right') next = Math.min(prev + 1, items.length - 1)
      if (dir === 'left')  next = Math.max(prev - 1, 0)
      if (dir === 'down')  next = Math.min(prev + cols, items.length - 1)
      if (dir === 'up')    next = Math.max(prev - cols, 0)
      if (next !== prev) cardRefs.current[next]?.focus()
      return next
    })
  }

  // Keyboard: only active when content owns focus
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (!isFocused) return
      if (e.key === 'ArrowRight')              move('right')
      if (e.key === 'ArrowLeft')               move('left')
      if (e.key === 'ArrowDown')               move('down')
      if (e.key === 'ArrowUp')                 move('up')
      if (e.key === 'Enter' || e.key === ' ')  onSelect(items[focusedIdx])
      if (e.key === 'Escape')                  setFocusZone('sidebar')
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [items, onSelect, focusedIdx, isFocused])

  // Controller: only active when content owns focus
  const handleButton = useCallback((btn: ControllerButton) => {
    if (!isFocused) return
    if (btn === 'right')   move('right')
    if (btn === 'left')    move('left')
    if (btn === 'down')    move('down')
    if (btn === 'up')      move('up')
    if (btn === 'confirm') onSelect(items[focusedIdx])
    if (btn === 'back')    setFocusZone('sidebar')
  }, [items, onSelect, focusedIdx, isFocused])

  useController({ onButton: handleButton })

  if (!items.length) {
    return <p className={styles.empty}>{emptyMessage}</p>
  }

  return (
    <div
      className={styles.grid}
      ref={gridRef}
      onClick={() => setFocusZone('content')}
    >
      {items.map((item, i) => (
        <button
          key={item.id}
          ref={(el) => (cardRefs.current[i] = el)}
          className={styles.card}
          onClick={() => onSelect(item)}
          tabIndex={isFocused && i === focusedIdx ? 0 : -1}
        >
          <div className={styles.poster}>
            {item.posterPath
              ? <PosterImage filePath={item.posterPath} title={item.title} />
              : <div className={styles.placeholder}>{item.title.charAt(0)}</div>
            }
          </div>
          <div className={styles.info}>
            <span className={styles.cardTitle}>{item.title}</span>
            {(item.year || item.subtitle) && (
              <span className={styles.cardMeta}>{item.subtitle ?? item.year}</span>
            )}
          </div>
        </button>
      ))}
    </div>
  )
}
