// The original one-chapter-at-a-time scrolling EPUB reader, kept for manga
// volumes that come as EPUB: full-page images read best scrolled, not paginated.
// Prose books use BookReaderPage.
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useEscapeKey } from '../hooks/useEscapeKey'
import styles from './EpubScrollReader.module.css'
import { sanitiseChapterHtml } from '../utils/bookFrame'

/** How long scrolling must pause before the position is saved. */
const SAVE_DELAY_MS = 500
const SCROLL_KEYS = new Set(['ArrowDown', 'ArrowUp', 'PageDown', 'PageUp', ' ', 'Home', 'End'])

interface Chapter {
  id: string
  title: string
  href: string
}

interface Props {
  filePath: string
  onBack: () => void
  title?: string
  isManga?: boolean
  /**
   * Where to reopen: chapter index plus the fraction scrolled through it
   * (2.4 = 40% into the third chapter), as last saved.
   */
  startAt?: number
}

export default function EpubScrollReader({ filePath, onBack, title: titleProp, isManga, startAt = 0 }: Props): JSX.Element {
  useEscapeKey(onBack)
  const contentRef                      = useRef<HTMLDivElement>(null)
  const [title,        setTitle]        = useState('')
  const [author,       setAuthor]       = useState('')
  const [chapters,     setChapters]     = useState<Chapter[]>([])
  const [chapterIdx,   setChapterIdx]   = useState(0)
  const [html,         setHtml]         = useState('')
  const [loading,      setLoading]      = useState(true)
  // Scroll fraction to restore once the resumed chapter has rendered.
  const pendingFraction = useRef<number | null>(null)
  // Saved only after the reader has moved, so opening a finished book and
  // backing straight out does not reset it to the first chapter.
  const userMoved = useRef(false)
  const position = useRef({ at: 0, finished: false })
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load TOC once, opening at the saved chapter.
  useEffect(() => {
    setLoading(true)
    window.api.library.getEpubInfo(filePath).then((info) => {
      setTitle(info.title)
      setAuthor(info.author)
      setChapters(info.chapters)
      const start = Math.max(0, Math.min(info.chapters.length - 1, Math.floor(startAt)))
      pendingFraction.current = start === Math.floor(startAt) ? startAt - start : null
      position.current = { at: startAt, finished: false }
      setChapterIdx(start)
    })
  // startAt is read once per book, on open.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath])

  const save = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    if (!userMoved.current || chapters.length === 0) return
    window.api.playback.saveReadingProgress(filePath, position.current.at, chapters.length, position.current.finished)
  }, [filePath, chapters.length])

  // Save on the way out; the pending timer may not have fired yet.
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => () => saveRef.current(), [])

  /** Where the reader is: chapter plus fraction, and whether that is the end. */
  const track = useCallback(() => {
    const el = contentRef.current
    if (!el || chapters.length === 0) return
    const range = el.scrollHeight - el.clientHeight
    const fraction = range > 0 ? Math.min(0.999, el.scrollTop / range) : 0
    const atEnd = chapterIdx === chapters.length - 1 && (range <= 0 || el.scrollTop >= range - 10)
    position.current = { at: chapterIdx + fraction, finished: position.current.finished || atEnd }
    if (!userMoved.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(save, SAVE_DELAY_MS)
  }, [chapterIdx, chapters.length, save])

  const userInput = useCallback(() => { userMoved.current = true }, [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (SCROLL_KEYS.has(e.key)) userInput() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [userInput])

  // Load chapter HTML whenever chapter changes
  useEffect(() => {
    if (chapters.length === 0) { setLoading(false); return }
    setLoading(true)
    setHtml('')
    window.api.library.readEpubChapter(filePath, chapters[chapterIdx].href).then((content) => {
      // Defused first: this reader still renders into the app's own page.
      setHtml(sanitiseChapterHtml(content))
      setLoading(false)
    })
  }, [filePath, chapters, chapterIdx])

  // Restore the saved scroll within the resumed chapter once its text is in,
  // then take a reading: a last chapter short enough to fit the view never
  // scrolls, and would otherwise never count as finished.
  useLayoutEffect(() => {
    const el = contentRef.current
    if (loading || !html || !el) return
    if (pendingFraction.current !== null) {
      el.scrollTop = pendingFraction.current * (el.scrollHeight - el.clientHeight)
      pendingFraction.current = null
    }
    track()
  }, [loading, html, track])

  function goTo(idx: number): void {
    userInput()
    const next = Math.max(0, Math.min(chapters.length - 1, idx))
    setChapterIdx(next)
    pendingFraction.current = null
    if (contentRef.current) contentRef.current.scrollTop = 0
    position.current = { at: next, finished: position.current.finished }
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(save, SAVE_DELAY_MS)
  }

  function scrollPage(dir: 1 | -1): void {
    userInput()
    const el = contentRef.current
    if (!el) return
    if (dir === 1) {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 10
      if (atBottom) { if (chapterIdx < chapters.length - 1) goTo(chapterIdx + 1); return }
    } else {
      const atTop = el.scrollTop < 10
      if (atTop) { if (chapterIdx > 0) goTo(chapterIdx - 1); return }
    }
    el.scrollBy({ top: dir * el.clientHeight * 0.85, behavior: 'smooth' })
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <button className={styles.back} onClick={onBack}>‹ Back</button>
        <div className={styles.headerMeta}>
          <span className={styles.headerTitle}>{(title && title !== 'Unknown Title') ? title : (titleProp || title || '')}</span>
          {author && <span className={styles.headerAuthor}>{author}</span>}
        </div>
      </div>

      <div className={styles.body}>
        {/* Content */}
        <div
          className={`${styles.content} ${isManga ? styles.contentManga : ''}`}
          ref={contentRef}
          onScroll={track}
          onWheel={userInput}
          onPointerDown={userInput}
          onTouchStart={userInput}
        >
          {loading
            ? <p className={styles.loadingMsg}>Loading…</p>
            : <div
                className={`${styles.chapterHtml} ${isManga ? styles.chapterHtmlManga : ''}`}
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: html }}
              />
          }
        </div>

        {/* Right sidebar */}
        <div className={styles.sidebar}>
          {/* Table of contents */}
          <div className={styles.sidebarSection}>
            <p className={styles.sidebarHeading}>Contents</p>
            <div className={styles.tocList}>
              {chapters.map((ch, i) => (
                <button
                  key={ch.id}
                  className={`${styles.tocItem} ${i === chapterIdx ? styles.tocItemActive : ''}`}
                  onClick={() => goTo(i)}
                >
                  {ch.title}
                </button>
              ))}
            </div>
          </div>

          {/* Chapter navigation */}
          {chapters.length > 1 && (
            <div className={styles.sidebarSection}>
              <p className={styles.sidebarHeading}>Chapter</p>
              <div className={styles.navGroup}>
                <button className={styles.navBtn} onClick={() => goTo(chapterIdx - 1)} disabled={chapterIdx === 0}>
                  ‹ Previous
                </button>
                <span className={styles.navPos}>{chapterIdx + 1} / {chapters.length}</span>
                <button className={styles.navBtn} onClick={() => goTo(chapterIdx + 1)} disabled={chapterIdx === chapters.length - 1}>
                  Next ›
                </button>
              </div>
            </div>
          )}

          {/* Page navigation */}
          <div className={styles.sidebarSection}>
            <p className={styles.sidebarHeading}>Page</p>
            <div className={styles.navGroup}>
              <button className={styles.navBtn} onClick={() => scrollPage(-1)}>‹ Prev</button>
              <button className={styles.navBtn} onClick={() => scrollPage(1)}>Next ›</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
