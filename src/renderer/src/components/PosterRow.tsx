import { useRef, type ReactNode } from 'react'
import PosterImage from './PosterImage'
import WatchedBar from './WatchedBar'
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
        {cards.map((c) => (
          <button key={c.key} className={styles.card} onClick={c.onClick} title={c.title}>
            <div className={styles.poster}>
              {c.posterPath
                ? <PosterImage filePath={c.posterPath} title={c.title} />
                : <div className={styles.placeholder}>{c.title.charAt(0)}</div>}
              {c.badge && <span className={styles.badge}>{c.badge}</span>}
              {c.progress != null && <WatchedBar fraction={c.progress} className={styles.bar} />}
            </div>
            <span className={styles.cardTitle}>{c.title}</span>
            {c.subtitle && <span className={styles.cardSub}>{c.subtitle}</span>}
          </button>
        ))}
      </div>
    </section>
  )
}
