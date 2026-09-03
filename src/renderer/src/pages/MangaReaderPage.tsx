import { useCallback, useEffect, useRef, useState } from 'react'
import { useEscapeKey } from '../hooks/useEscapeKey'
import styles from './MangaReaderPage.module.css'

interface Props {
  filePath: string
  title: string
  onBack: () => void
}

/**
 * How far outside the viewport a page starts loading, in CSS pixels.
 *
 * This is read-ahead, not lazy loading: at roughly 1200px of rendered height
 * per page it pulls in about three screens ahead and behind, so pages are
 * decoded before they are scrolled to and nothing visibly pops in. The reason
 * it cannot simply render every page is scale — one Berserk volume is 192 pages
 * and 889 MB decompressed, which no amount of eagerness makes loadable.
 */
const PRELOAD_MARGIN_PX = 4000

/**
 * Reserved height for a page that has not loaded yet, as a fraction of width.
 * Manga scans are typically around 1.45. Being roughly right keeps the
 * scrollbar honest; each page corrects to its true height once decoded.
 */
const ASSUMED_PAGE_RATIO = 1.45

export default function MangaReaderPage({ filePath, title, onBack }: Props): JSX.Element {
  useEscapeKey(onBack)
  const [pages, setPages] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Indices that have entered the preload margin. Pages are never removed once
  // loaded: the protocol now serves them cacheable and the main process keeps a
  // bounded page cache, so re-entering a page is cheap, whereas unloading mid
  // scroll would visibly blank pages the reader had already seen.
  const [armed, setArmed] = useState<Set<number>>(() => new Set())
  const slotRefs = useRef<(HTMLDivElement | null)[]>([])
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    setLoading(true)
    setPages([])
    setArmed(new Set())
    setError(null)
    window.api.manga
      .openCbz(filePath)
      .then(setPages)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
    return () => {
      window.api.manga.closeCbz()
    }
  }, [filePath])

  // One observer for the whole reader, re-created when the page count changes.
  useEffect(() => {
    if (!pages.length) return
    const io = new IntersectionObserver(
      (entries) => {
        const hits: number[] = []
        for (const e of entries) {
          if (!e.isIntersecting) continue
          const i = Number((e.target as HTMLElement).dataset.index)
          if (!Number.isNaN(i)) hits.push(i)
        }
        if (!hits.length) return
        setArmed((prev) => {
          const next = new Set(prev)
          let changed = false
          for (const i of hits) if (!next.has(i)) { next.add(i); changed = true }
          return changed ? next : prev
        })
      },
      { rootMargin: `${PRELOAD_MARGIN_PX}px 0px`, threshold: 0 }
    )
    observerRef.current = io
    for (const el of slotRefs.current) if (el) io.observe(el)
    return () => {
      io.disconnect()
      observerRef.current = null
    }
  }, [pages.length])

  // Slots mount after the observer exists, so register each as it appears.
  const attachSlot = useCallback((el: HTMLDivElement | null, i: number) => {
    slotRefs.current[i] = el
    if (el && observerRef.current) observerRef.current.observe(el)
  }, [])

  return (
    <div className={styles.reader}>
      <div className={styles.header}>
        <button className={styles.back} onClick={onBack}>‹ Back</button>
        <span className={styles.title}>{title}</span>
        {!loading && pages.length > 0 && (
          <span className={styles.pageCount}>{pages.length} pages</span>
        )}
      </div>
      <div className={styles.pages}>
        {loading && <p className={styles.status}>Loading...</p>}
        {error && (
          <p className={styles.status} style={{ color: 'var(--danger)' }}>
            Failed to open file: {error}
          </p>
        )}
        {!loading && !error && pages.length === 0 && (
          <p className={styles.status}>This file contains no pages.</p>
        )}
        {pages.map((src, i) => (
          <div
            key={i}
            data-index={i}
            ref={(el) => attachSlot(el, i)}
            className={styles.pageSlot}
            style={armed.has(i) ? undefined : { aspectRatio: `1 / ${ASSUMED_PAGE_RATIO}` }}
          >
            {armed.has(i) && (
              <img src={src} alt={`Page ${i + 1}`} className={styles.page} decoding="async" />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
