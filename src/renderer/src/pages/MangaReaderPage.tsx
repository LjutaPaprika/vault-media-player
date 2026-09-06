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

/**
 * Reading column width in CSS px, for a normal portrait page.
 *
 * The reader used to cap every page at a flat 900px, which suited nothing in
 * this library: 800px web chapters were stretched to fill it while 3300px
 * volume scans were thrown away at 3.7x. At the 150% display scaling these
 * monitors use, 1200 CSS px is 1800 device px - which matches the mid-range
 * sources exactly and leaves the largest downscaled by under 2x.
 */
const PORTRAIT_COLUMN_PX = 1200

/**
 * Landscape pages are double-page spreads: two pages of art in one image. Given
 * the portrait column they would render each half at half the resolution of the
 * pages around them, which is why the softness seemed to come and go at random
 * rather than being uniform. Twice the column gives each half parity.
 */
const SPREAD_COLUMN_PX = PORTRAIT_COLUMN_PX * 2

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
  // Separate from `armed` on purpose. A slot must keep its reserved height
  // until its image has actually decoded: dropping the placeholder at arm time
  // collapsed the slot to zero while the fetch was still in flight, and with
  // several slots arming at once the document abruptly shortened, the browser
  // clamped scrollTop, and the view lurched upward past the header.
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set())
  // Per-page display cap in CSS px, derived from each image's own resolution
  // once it decodes. Kept in state rather than written straight to the DOM so a
  // re-render cannot drop it.
  const [maxWidths, setMaxWidths] = useState<Record<number, number>>({})
  const slotRefs = useRef<(HTMLDivElement | null)[]>([])
  const observerRef = useRef<IntersectionObserver | null>(null)

  useEffect(() => {
    setLoading(true)
    setPages([])
    setArmed(new Set())
    setLoaded(new Set())
    setMaxWidths({})
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

  const markLoaded = useCallback((i: number) => {
    setLoaded((prev) => (prev.has(i) ? prev : new Set(prev).add(i)))
  }, [])

  /**
   * Record how wide this page may be drawn: never past its own pixels, and
   * never past the column its shape calls for.
   */
  const measure = useCallback((el: HTMLImageElement, i: number) => {
    const w = el.naturalWidth
    const h = el.naturalHeight
    if (!w || !h) return
    const column = w > h ? SPREAD_COLUMN_PX : PORTRAIT_COLUMN_PX
    const cap = Math.min(w, column)
    setMaxWidths((prev) => (prev[i] === cap ? prev : { ...prev, [i]: cap }))
  }, [])

  /**
   * Catch images that finished before React attached onLoad.
   *
   * Now that pages are served cacheable, a revisited page can be complete the
   * moment the element mounts, so its load event has already fired and will
   * never fire again. Without this the slot would keep its placeholder ratio
   * forever and sit taller than the image inside it.
   */
  const attachImg = useCallback(
    (el: HTMLImageElement | null, i: number) => {
      if (el && el.complete && el.naturalHeight > 0) { measure(el, i); markLoaded(i) }
    },
    [markLoaded, measure]
  )

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
            style={{
              ...(loaded.has(i) ? null : { aspectRatio: `1 / ${ASSUMED_PAGE_RATIO}` }),
              ...(maxWidths[i] ? ({ '--page-max': `${maxWidths[i]}px` } as React.CSSProperties) : null)
            }}
          >
            {armed.has(i) && (
              <img
                src={src}
                alt={`Page ${i + 1}`}
                className={styles.page}
                decoding="async"
                ref={(el) => attachImg(el, i)}
                onLoad={(e) => { measure(e.currentTarget, i); markLoaded(i) }}
                // A page that fails still releases its placeholder, so one bad
                // entry cannot leave a permanent gap in the scroll height.
                onError={() => markLoaded(i)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
