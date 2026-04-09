import { useEffect, useRef, useState } from 'react'
import styles from './BookReaderPage.module.css'

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
}

export default function BookReaderPage({ filePath, onBack, title: titleProp, isManga }: Props): JSX.Element {
  const contentRef                      = useRef<HTMLDivElement>(null)
  const [title,        setTitle]        = useState('')
  const [author,       setAuthor]       = useState('')
  const [chapters,     setChapters]     = useState<Chapter[]>([])
  const [chapterIdx,   setChapterIdx]   = useState(0)
  const [html,         setHtml]         = useState('')
  const [loading,      setLoading]      = useState(true)

  // Load TOC once
  useEffect(() => {
    setLoading(true)
    window.api.library.getEpubInfo(filePath).then((info) => {
      setTitle(info.title)
      setAuthor(info.author)
      setChapters(info.chapters)
      setChapterIdx(0)
    })
  }, [filePath])

  // Load chapter HTML whenever chapter changes
  useEffect(() => {
    if (chapters.length === 0) { setLoading(false); return }
    setLoading(true)
    setHtml('')
    window.api.library.readEpubChapter(filePath, chapters[chapterIdx].href).then((content) => {
      setHtml(content)
      setLoading(false)
    })
  }, [filePath, chapters, chapterIdx])

  function goTo(idx: number): void {
    setChapterIdx(Math.max(0, Math.min(chapters.length - 1, idx)))
    if (contentRef.current) contentRef.current.scrollTop = 0
  }

  function scrollPage(dir: 1 | -1): void {
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
        <div className={`${styles.content} ${isManga ? styles.contentManga : ''}`} ref={contentRef}>
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
