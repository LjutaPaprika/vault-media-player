import { useEffect, useRef, useState, type ReactNode } from 'react'
import PosterImage from './PosterImage'
import WatchedBar from './WatchedBar'
import type { CardMenuItem } from './MediaGrid'
import styles from './PosterRow.module.css'

export interface RowCard {
  key: string
  posterPath: string | null
  title: string
  subtitle?: string
  /** Small label over the top of the poster, e.g. the shelf it's from. */
  badge?: string
  /** Bar along the bottom of the poster, 0–1. */
  progress?: number | null
  /** A second, quieter line under the subtitle. */
  note?: string
  /** Hover text; the title when unset. */
  tooltip?: string
  /** A small button under the card, separate from the card's own click. */
  action?: { label: string; onClick: () => void; title?: string }
  /** Right-click entries for the card. */
  menu?: CardMenuItem[]
  onClick: () => void
}

/** A titled, sideways-scrolling row of poster cards. */
export default function PosterRow({ title, cards, action }: {
  title: string
  cards: RowCard[]
  /** Something on the right of the heading, e.g. "See all". */
  action?: ReactNode
}): JSX.Element | null {
  const scroller = useRef<HTMLDivElement | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; items: CardMenuItem[] } | null>(null)
  // Any click or key elsewhere closes the menu, as in the grid.
  useEffect(() => {
    if (!menu) return
    const close = (): void => setMenu(null)
    window.addEventListener('click', close)
    window.addEventListener('keydown', close)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('keydown', close)
    }
  }, [menu])
  if (cards.length === 0) return null
  const page = (dir: 1 | -1): void => {
    const el = scroller.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }
  return (
    <section className={styles.row}>
      <div className={styles.head}>
        <h2 className={styles.title}>{title}</h2>
        {action}
        <div className={styles.arrows}>
          <button className={styles.arrow} onClick={() => page(-1)} aria-label="Scroll left">‹</button>
          <button className={styles.arrow} onClick={() => page(1)} aria-label="Scroll right">›</button>
        </div>
      </div>
      <div className={styles.scroller} ref={scroller}>
        {cards.map((c) => {
          const card = (
            <button
              key={c.key}
              className={styles.card}
              onClick={c.onClick}
              title={c.tooltip ?? c.title}
              onContextMenu={c.menu?.length ? (e) => { e.preventDefault(); setMenu({ x: e.clientX, y: e.clientY, items: c.menu! }) } : undefined}
            >
              <div className={styles.poster}>
                {c.posterPath
                  ? <PosterImage filePath={c.posterPath} title={c.title} />
                  : <div className={styles.placeholder}>{c.title.charAt(0)}</div>}
                {c.badge && <span className={styles.badge}>{c.badge}</span>}
                {c.progress != null && <WatchedBar fraction={c.progress} className={styles.bar} />}
              </div>
              <span className={styles.cardTitle}>{c.title}</span>
              {c.subtitle && <span className={styles.cardSub}>{c.subtitle}</span>}
              {c.note && <span className={styles.cardNote}>{c.note}</span>}
            </button>
          )
          if (!c.action) return card
          // The action sits beside the card, not inside it: a button can't hold a button.
          return (
            <div key={c.key} className={styles.cardWrap}>
              {card}
              <button className={styles.cardAction} onClick={c.action.onClick} title={c.action.title}>
                {c.action.label}
              </button>
            </div>
          )
        })}
      </div>
      {menu && (
        <div className={styles.menu} style={{ left: menu.x, top: menu.y }} onClick={(e) => e.stopPropagation()}>
          {menu.items.map((m) => (
            <button key={m.label} className={styles.menuItem} onClick={() => { setMenu(null); m.onClick() }}>
              {m.label}
            </button>
          ))}
        </div>
      )}
    </section>
  )
}
