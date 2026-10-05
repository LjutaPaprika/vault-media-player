import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import styles from './BookReaderPage.module.css'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { useController, type ControllerButton } from '../hooks/useController'
import { BookmarkList, ContentsList, Drawer, HelpSheet, SettingsForm } from '../components/ReaderPanels'
import {
  buildSrcdoc, charOffsetOfPage, countPages, pageOfCharOffset, pageOfElement, prepareChapter, showPage, snippetOfPage,
  type PageLayout, type PreparedChapter,
} from '../utils/bookFrame'
import {
  DEFAULT_WPM, MARGIN_PX, MEASURE_EM, THEMES,
  helpSeen, loadSettings, loadWpm, markHelpSeen, saveBookSettings, saveGlobalSettings, saveWpm,
  type LoadedSettings, type ReaderSettings,
} from '../utils/readerSettings'

// Paginated EPUB reader: pages laid out like a book, one or two at a time,
// in a sandboxed frame (see bookFrame.ts), with reading settings, bookmarks,
// page numbers for the current settings, and time left at the reader's pace.
//
// Position is saved as it always was - chapter index plus the fraction through
// it - so it survives settings changes that move every page boundary, and so
// the Books page's Continue keeps working.

interface Props {
  filePath: string
  onBack: () => void
  title?: string
  /** Chapter index plus fraction through it, as last saved. */
  startAt?: number
}

interface Chapter { id: string; title: string; href: string }
type Panel = null | 'contents' | 'bookmarks' | 'settings' | 'help'

/** How long the position must settle before it is saved. */
const SAVE_DELAY_MS = 500
/** Room under the pages for their numbers. */
const FOOTER_H = 30
/** The bar hides again after this long without the mouse moving. */
const CHROME_IDLE_MS = 2500

function computeLayout(stage: { w: number; h: number }, s: ReaderSettings): PageLayout & { left: number; top: number } {
  const [mx, my] = MARGIN_PX[s.margin]
  const availW = Math.max(200, stage.w - 2 * mx)
  const height = Math.max(160, Math.floor(stage.h - 2 * my - FOOTER_H))
  const ideal = MEASURE_EM[s.width] * s.fontSize
  const gap = Math.max(48, Math.round(mx * 1.2))
  // Two pages once both fit at three-quarters of the chosen line length.
  const columns = s.pagesPerView === 'auto' && availW >= 2 * ideal * 0.75 + gap ? 2 : 1
  const colWidth = Math.floor(Math.min(ideal, (availW - (columns - 1) * gap) / columns))
  const viewW = columns * colWidth + (columns - 1) * gap
  return { colWidth, height, gap, columns, left: Math.round((stage.w - viewW) / 2), top: my }
}

function formatMinutes(min: number): string {
  if (!isFinite(min) || min < 1) return 'less than a minute'
  const total = Math.round(min)
  if (total < 60) return `${total} min`
  const h = Math.floor(total / 60)
  const m = total % 60
  return m ? `${h} h ${m} min` : `${h} h`
}

export default function BookReaderPage({ filePath, onBack, title: titleProp, startAt = 0 }: Props): JSX.Element {
  // ── Book ──
  const [title, setTitle] = useState('')
  const [author, setAuthor] = useState('')
  const [chapters, setChapters] = useState<Chapter[]>([])
  const prepared = useRef(new Map<number, Promise<PreparedChapter>>())
  const loadChapter = useCallback((i: number): Promise<PreparedChapter> => {
    let p = prepared.current.get(i)
    if (!p) {
      p = window.api.library.readEpubChapter(filePath, chapters[i].href).then(prepareChapter)
      prepared.current.set(i, p)
    }
    return p
  }, [filePath, chapters])

  // ── Settings ──
  const [loaded, setLoaded] = useState<LoadedSettings | null>(null)
  const settings = loaded ? (loaded.book ?? loaded.global) : null
  const wpm = useRef(DEFAULT_WPM)

  // ── Stage size and page layout ──
  const stageRef = useRef<HTMLDivElement>(null)
  const [stage, setStage] = useState<{ w: number; h: number } | null>(null)
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const take = (w: number, h: number): void => {
      w = Math.round(w); h = Math.round(h)
      if (w > 0 && h > 0) setStage((prev) => (prev && prev.w === w && prev.h === h ? prev : { w, h }))
    }
    // Measured once straight away as well: ResizeObserver only reports on a
    // rendered frame, and a minimised window renders none.
    take(el.clientWidth, el.clientHeight)
    const ro = new ResizeObserver(([e]) => take(e.contentRect.width, e.contentRect.height))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const layout = useMemo(() => (stage && settings ? computeLayout(stage, settings) : null), [stage, settings])
  // What changes page boundaries. The theme does not, so switching it keeps
  // the whole-book page count.
  const layoutKey = layout && settings
    ? JSON.stringify([layout.colWidth, layout.height, layout.gap, layout.columns,
      settings.fontSize, settings.font, settings.lineHeight, settings.publisherStyles])
    : ''

  // ── Position ──
  const [chapter, setChapter] = useState(-1)
  const [page, setPage] = useState(0)              // first page of the spread on screen
  const [chapterPages, setChapterPages] = useState(0)
  const [frameReady, setFrameReady] = useState(false)
  const pendingFraction = useRef<number | null>(null)
  const pendingAnchor = useRef<string | null>(null)
  /** Characters into the chapter to keep on screen across a relayout. */
  const pendingChar = useRef<number | null>(null)
  // The words being read, as characters into the chapter: taken when the
  // first relayout happens and kept until the reader turns the page, so
  // several settings changes in a row cannot creep backwards a page at a time.
  const anchorChar = useRef<number | null>(null)
  const landAtEnd = useRef(false)
  const userMoved = useRef(false)
  const finished = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pageShownAt = useRef(Date.now())

  // ── Whole book ──
  const [bookPages, setBookPages] = useState<(number | null)[]>([])
  const [bookWords, setBookWords] = useState<(number | null)[]>([])

  // ── UI ──
  const [chromeShown, setChromeShown] = useState(false)
  const [panel, setPanel] = useState<Panel>(null)
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([])
  const [toast, setToast] = useState<string | null>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const measureRef = useRef<HTMLIFrameElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const chromeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ─── Open ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false
    prepared.current = new Map()
    Promise.all([
      window.api.library.getEpubInfo(filePath),
      loadSettings(filePath),
      loadWpm(),
      window.api.books.getBookmarks(filePath).catch(() => []),
      helpSeen(),
    ]).then(([info, s, w, bms, seen]) => {
      if (cancelled) return
      setTitle(info.title)
      setAuthor(info.author)
      setChapters(info.chapters)
      setLoaded(s)
      wpm.current = w
      setBookmarks(bms)
      setBookPages(info.chapters.map(() => null))
      setBookWords(info.chapters.map(() => null))
      const start = Math.max(0, Math.min(info.chapters.length - 1, Math.floor(startAt)))
      pendingFraction.current = start === Math.floor(startAt) ? startAt - start : 0
      setChapter(start)
      if (!seen) setPanel('help')
    })
    return () => { cancelled = true }
  // startAt is read once per book, on open.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filePath])

  // ─── The visible frame ─────────────────────────────────────────────────────

  // Build the chapter into the frame whenever the chapter, layout or settings
  // change. A rebuild for new settings keeps the same words on screen.
  const lastBuilt = useRef({ chapter: -1, key: '', theme: '' })
  // The layout the frame currently holds, to read positions from it before a rebuild.
  const lastLayout = useRef<PageLayout | null>(null)
  useEffect(() => {
    if (chapter < 0 || !layout || !settings || chapters.length === 0) return
    let cancelled = false
    const built = lastBuilt.current
    if (built.chapter === chapter && (built.key !== layoutKey || built.theme !== settings.theme) && chapterPages > 0
      && pendingFraction.current === null && pendingAnchor.current === null) {
      const doc = frameRef.current?.contentDocument
      if (anchorChar.current === null && doc && lastLayout.current) anchorChar.current = charOffsetOfPage(doc, lastLayout.current, page)
      pendingChar.current = anchorChar.current
      if (pendingChar.current === null) pendingFraction.current = page / chapterPages
    }
    lastBuilt.current = { chapter, key: layoutKey, theme: settings.theme }
    lastLayout.current = layout
    setFrameReady(false)
    loadChapter(chapter).then((ch) => {
      if (cancelled || !frameRef.current) return
      setBookWords((w) => (w[chapter] === ch.words ? w : Object.assign([...w], { [chapter]: ch.words })))
      frameRef.current.srcdoc = buildSrcdoc(ch, settings, layout)
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter, layoutKey, settings?.theme, chapters.length, loadChapter])

  const onFrameLoad = useCallback(async () => {
    const frame = frameRef.current
    const doc = frame?.contentDocument
    if (!doc || !layout || !doc.getElementById('flow')) return
    await doc.fonts?.ready
    const pages = countPages(doc, layout)
    let target = 0
    if (pendingAnchor.current) {
      const el = doc.getElementById(pendingAnchor.current)
      if (el) target = pageOfElement(doc, layout, el)
    } else if (pendingChar.current !== null) {
      target = pageOfCharOffset(doc, layout, pendingChar.current)
    } else if (pendingFraction.current !== null) {
      target = Math.floor(pendingFraction.current * pages + 1e-6)
    } else if (landAtEnd.current) {
      target = pages - 1
    }
    pendingAnchor.current = null
    pendingChar.current = null
    pendingFraction.current = null
    landAtEnd.current = false
    target = Math.max(0, Math.min(pages - 1, target))
    target -= target % layout.columns
    showPage(doc, layout, target, false)
    setChapterPages(pages)
    setPage(target)
    setBookPages((b) => (b[chapter] === pages ? b : Object.assign([...b], { [chapter]: pages })))
    attachFrameInput(doc)
    pageShownAt.current = Date.now()
    setFrameReady(true)
  // attachFrameInput reads everything through act; layout and chapter are
  // current because the frame is rebuilt whenever they change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layout, chapter])

  // ─── Whole-book page count ─────────────────────────────────────────────────
  // Every chapter laid out once, offscreen, at the current settings: that is
  // what turns a position into "page 112 of 340". Restarts when anything that
  // moves page boundaries changes.

  useEffect(() => {
    if (!layoutKey || !layout || !settings || chapters.length === 0) return
    let cancelled = false
    setBookPages(chapters.map(() => null))
    const run = async (): Promise<void> => {
      for (let i = 0; i < chapters.length && !cancelled; i++) {
        const frame = measureRef.current
        if (!frame) return
        const ch = await loadChapter(i).catch(() => null)
        if (cancelled) return
        if (!ch) { setBookPages((b) => Object.assign([...b], { [i]: 1 })); continue }
        const loadedDoc = await new Promise<Document | null>((resolve) => {
          frame.onload = () => resolve(frame.contentDocument)
          frame.srcdoc = buildSrcdoc(ch, settings, layout)
        })
        if (cancelled || !loadedDoc) return
        await loadedDoc.fonts?.ready
        const pages = countPages(loadedDoc, layout)
        setBookPages((b) => Object.assign([...b], { [i]: pages }))
        setBookWords((w) => (w[i] === ch.words ? w : Object.assign([...w], { [i]: ch.words })))
        // Yield between chapters so page turns stay instant while it runs.
        await new Promise((r) => setTimeout(r, 16))
      }
    }
    void run()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layoutKey, chapters.length, loadChapter])

  // ─── Derived: page numbers, progress, time left ───────────────────────────

  const columns = layout?.columns ?? 1
  const counted = useMemo(() => {
    // Chapters not measured yet are estimated from words per page so far.
    let words = 0, pages = 0
    bookPages.forEach((p, i) => { if (p != null && bookWords[i] != null) { pages += p; words += bookWords[i]! } })
    const wordsPerPage = pages > 0 ? words / pages : 250
    const perChapter = bookPages.map((p, i) => p ?? Math.max(1, Math.ceil((bookWords[i] ?? wordsPerPage) / wordsPerPage)))
    const starts: number[] = []
    let acc = 1
    for (const p of perChapter) { starts.push(acc); acc += p }
    return { perChapter, starts, total: acc - 1, exact: bookPages.every((p) => p != null) }
  }, [bookPages, bookWords])

  const currentPage = chapter >= 0 && counted.starts[chapter] != null ? counted.starts[chapter] + page : 1
  const lastOnScreen = Math.min(counted.total, currentPage + columns - 1)
  const bookFraction = counted.total ? Math.min(1, lastOnScreen / counted.total) : 0
  const chapterFraction = chapterPages ? Math.min(1, (page + columns) / chapterPages) : 0

  const minutesLeft = useMemo(() => {
    const words = bookWords[chapter]
    if (chapter < 0 || words == null || !chapterPages) return null
    const chapterLeft = words * Math.max(0, 1 - (page + columns) / chapterPages)
    let bookLeft = chapterLeft
    for (let i = chapter + 1; i < bookWords.length; i++) bookLeft += bookWords[i] ?? 0
    return { chapter: chapterLeft / wpm.current, book: bookLeft / wpm.current }
  }, [bookWords, chapter, page, chapterPages, columns])

  const pageOf = useCallback((position: number): number | null => {
    const ch = Math.floor(position)
    const pages = counted.perChapter[ch]
    if (pages == null || counted.starts[ch] == null) return null
    return counted.starts[ch] + Math.floor((position - ch) * pages + 1e-6)
  }, [counted])

  const bookmarkHere = chapterPages > 0
    ? bookmarks.find((b) => {
        if (Math.floor(b.position) !== chapter) return false
        const p = Math.floor((b.position - chapter) * chapterPages + 1e-6)
        return p >= page && p < page + columns
      }) ?? null
    : null

  // ─── Saving ────────────────────────────────────────────────────────────────

  const save = useCallback(() => {
    if (saveTimer.current) { clearTimeout(saveTimer.current); saveTimer.current = null }
    if (!userMoved.current || chapters.length === 0 || chapter < 0 || !chapterPages) return
    const at = chapter + page / chapterPages
    void window.api.playback.saveReadingProgress(filePath, at, chapters.length, finished.current)
  }, [filePath, chapters.length, chapter, page, chapterPages])
  const saveRef = useRef(save)
  saveRef.current = save
  useEffect(() => {
    if (!userMoved.current) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(() => saveRef.current(), SAVE_DELAY_MS)
  }, [chapter, page, chapterPages])
  useEffect(() => () => {
    saveRef.current()
    void saveWpm(wpm.current)
  }, [])

  // ─── Navigation ────────────────────────────────────────────────────────────

  function flash(msg: string): void {
    setToast(msg)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 1400)
  }

  /** Learn the reader's pace from how long a page stayed up before turning on. */
  function learnPace(): void {
    const dwell = Date.now() - pageShownAt.current
    const words = bookWords[chapter]
    if (words == null || !chapterPages || dwell < 3000 || dwell > 5 * 60_000) return
    const onSpread = (words / chapterPages) * columns
    const rate = onSpread / (dwell / 60_000)
    if (rate < 60 || rate > 900) return
    wpm.current = wpm.current * 0.9 + rate * 0.1
  }

  function goChapter(i: number, at: 'start' | 'end' | number, anchor?: string): void {
    if (i < 0 || i >= chapters.length) return
    userMoved.current = true
    anchorChar.current = null
    if (i === chapter && chapterPages && layout && frameRef.current?.contentDocument) {
      const doc = frameRef.current.contentDocument
      let target = at === 'start' ? 0 : at === 'end' ? chapterPages - 1 : Math.floor(at * chapterPages + 1e-6)
      if (anchor) { const el = doc.getElementById(anchor); if (el) target = pageOfElement(doc, layout, el) }
      target = Math.max(0, Math.min(chapterPages - 1, target))
      target -= target % columns
      showPage(doc, layout, target, true)
      setPage(target)
      pageShownAt.current = Date.now()
      return
    }
    pendingAnchor.current = anchor ?? null
    pendingFraction.current = typeof at === 'number' ? at : null
    landAtEnd.current = at === 'end'
    setChapterPages(0)
    setChapter(i)
  }

  function turn(dir: 1 | -1): void {
    if (!layout || !chapterPages || !frameReady) return
    const doc = frameRef.current?.contentDocument
    if (!doc) return
    userMoved.current = true
    anchorChar.current = null
    if (dir === 1) {
      learnPace()
      const next = page + columns
      if (next < chapterPages) { showPage(doc, layout, next, true); setPage(next); pageShownAt.current = Date.now() }
      else if (chapter < chapters.length - 1) goChapter(chapter + 1, 'start')
      else if (!finished.current) { finished.current = true; saveRef.current(); flash('The end') }
      if (chapter === chapters.length - 1 && next + columns >= chapterPages) finished.current = true
    } else {
      const prev = page - columns
      if (prev >= 0) { showPage(doc, layout, prev, true); setPage(prev); pageShownAt.current = Date.now() }
      else if (chapter > 0) goChapter(chapter - 1, 'end')
    }
  }

  function jumpToGlobalPage(p: number): void {
    const { starts, perChapter } = counted
    let ch = starts.length - 1
    while (ch > 0 && starts[ch] > p) ch--
    goChapter(ch, Math.max(0, (p - starts[ch]) / perChapter[ch]))
  }

  async function toggleBookmark(): Promise<void> {
    if (chapter < 0 || !chapterPages) return
    if (bookmarkHere) {
      await window.api.books.removeBookmark(bookmarkHere.id)
      flash('Bookmark removed')
    } else {
      const doc = frameRef.current?.contentDocument
      await window.api.books.addBookmark(filePath, {
        position: chapter + page / chapterPages,
        chapter: chapters[chapter]?.title ?? `Chapter ${chapter + 1}`,
        snippet: doc && layout ? snippetOfPage(doc, layout, page) : '',
      })
      flash('Bookmarked')
    }
    setBookmarks(await window.api.books.getBookmarks(filePath))
  }

  // ─── Settings ──────────────────────────────────────────────────────────────

  function changeSettings(next: ReaderSettings): void {
    if (!loaded) return
    if (loaded.book) { setLoaded({ ...loaded, book: next }); void saveBookSettings(filePath, next) }
    else { setLoaded({ ...loaded, global: next }); void saveGlobalSettings(next) }
  }

  function setBookOnly(on: boolean): void {
    if (!loaded) return
    if (on && !loaded.book) { setLoaded({ ...loaded, book: loaded.global }); void saveBookSettings(filePath, loaded.global) }
    if (!on && loaded.book) { setLoaded({ ...loaded, book: null }); void saveBookSettings(filePath, null) }
  }

  // ─── Chrome, panels, input ─────────────────────────────────────────────────

  function showChrome(): void {
    setChromeShown(true)
    if (chromeTimer.current) clearTimeout(chromeTimer.current)
    chromeTimer.current = setTimeout(() => setChromeShown(false), CHROME_IDLE_MS)
  }
  function toggleChrome(): void {
    if (chromeTimer.current) clearTimeout(chromeTimer.current)
    setChromeShown((v) => !v)
  }

  function openPanel(p: Exclude<Panel, null>): void { setPanel((cur) => (cur === p ? null : p)) }
  function closePanel(): void {
    if (panel === 'help') void markHelpSeen()
    setPanel(null)
  }

  // Focus the panel's first control (or the marked one) when it opens, so a
  // controller or keyboard can work it straight away.
  useEffect(() => {
    if (!panel) { frameRef.current?.blur(); return }
    const root = panelRef.current
    const target = root?.querySelector<HTMLElement>('[data-autofocus]') ?? root?.querySelector<HTMLElement>('[data-nav]')
    target?.focus()
    target?.scrollIntoView({ block: 'nearest' })
  }, [panel])

  function moveFocus(dir: 1 | -1): void {
    const items = [...(panelRef.current?.querySelectorAll<HTMLElement>('[data-nav]:not(:disabled)') ?? [])]
    if (items.length === 0) return
    const i = items.indexOf(document.activeElement as HTMLElement)
    const next = items[i < 0 ? 0 : (i + dir + items.length) % items.length]
    next.focus()
    next.scrollIntoView({ block: 'nearest' })
  }

  /** Keyboard, from the page itself or from the frame. Returns true if used. */
  function handleKey(e: KeyboardEvent): boolean {
    if (e.ctrlKey || e.metaKey || e.altKey) return false
    const k = e.key
    if (panel) {
      if (k === 'Escape') { closePanel(); return true }
      if (k === 'ArrowDown' || k === 'ArrowRight') { moveFocus(1); return true }
      if (k === 'ArrowUp' || k === 'ArrowLeft') { moveFocus(-1); return true }
      if ((k === 'c' || k === 'C') && panel === 'contents') { closePanel(); return true }
      if ((k === 's' || k === 'S') && panel === 'settings') { closePanel(); return true }
      if ((k === '?' || k === 'h' || k === 'H') && panel === 'help') { closePanel(); return true }
      return false
    }
    if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) { turn(1); return true }
    if (k === 'ArrowLeft' || k === 'PageUp' || (k === ' ' && e.shiftKey)) { turn(-1); return true }
    if (k === ']') { goChapter(chapter + 1, 'start'); return true }
    if (k === '[') { goChapter(chapter - 1, 'start'); return true }
    if (k === 'Enter') { toggleChrome(); return true }
    if (k === 'c' || k === 'C') { openPanel('contents'); return true }
    if (k === 'b' || k === 'B') { void toggleBookmark(); return true }
    if (k === 's' || k === 'S') { openPanel('settings'); return true }
    if (k === '?' || k === 'h' || k === 'H') { openPanel('help'); return true }
    if (k === 'Escape') { onBack(); return true }
    return false
  }

  function handleButton(btn: ControllerButton): void {
    if (panel) {
      if (btn === 'back') closePanel()
      else if (btn === 'down' || btn === 'right') moveFocus(1)
      else if (btn === 'up' || btn === 'left') moveFocus(-1)
      else if (btn === 'confirm') (document.activeElement as HTMLElement | null)?.click()
      else if (btn === 'x') openPanel('contents')
      else if (btn === 'menu') openPanel('settings')
      else if (btn === 'view') openPanel('help')
      return
    }
    if (btn === 'right' || btn === 'rb') turn(1)
    else if (btn === 'left' || btn === 'lb') turn(-1)
    else if (btn === 'rt') goChapter(chapter + 1, 'start')
    else if (btn === 'lt') goChapter(chapter - 1, 'start')
    else if (btn === 'confirm') toggleChrome()
    else if (btn === 'x') openPanel('contents')
    else if (btn === 'y') void toggleBookmark()
    else if (btn === 'menu') openPanel('settings')
    else if (btn === 'view') openPanel('help')
    else if (btn === 'back') onBack()
  }

  // Handlers attached inside the frame outlive renders; they reach the
  // current state through this ref.
  const act = useRef({ handleKey, turn, toggleChrome, showChrome, goChapter, chapters, chapter })
  act.current = { handleKey, turn, toggleChrome, showChrome, goChapter, chapters, chapter }

  useController({ onButton: handleButton, extended: true })

  // Escape belongs to the reader (panel first, then back), ahead of App's.
  useEscapeKey(() => { act.current.handleKey(new KeyboardEvent('keydown', { key: 'Escape' })) })

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') return // useEscapeKey has it
      const t = e.target as HTMLElement | null
      // The scrubber's own arrow keys move it.
      if (t?.tagName === 'INPUT' && (e.key.startsWith('Arrow') || e.key.startsWith('Page'))) return
      if (act.current.handleKey(e)) e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  /** Input that lands inside the frame: keys, taps, the wheel, links. */
  function attachFrameInput(doc: Document): void {
    doc.addEventListener('keydown', (e) => {
      if (act.current.handleKey(e)) e.preventDefault()
    })
    doc.addEventListener('mousemove', () => act.current.showChrome())
    let wheelAt = 0
    doc.addEventListener('wheel', (e) => {
      e.preventDefault()
      const now = Date.now()
      if (now - wheelAt < 250 || Math.abs(e.deltaY) < 4) return
      wheelAt = now
      act.current.turn(e.deltaY > 0 ? 1 : -1)
    }, { passive: false })
    doc.addEventListener('click', (e) => {
      const link = (e.target as Element | null)?.closest?.('a')
      if (link) {
        e.preventDefault()
        followLink(link.getAttribute('href') ?? '')
        return
      }
      if (doc.getSelection()?.toString()) return
      const w = doc.documentElement.clientWidth
      if (e.clientX < w * 0.3) act.current.turn(-1)
      else if (e.clientX > w * 0.7) act.current.turn(1)
      else act.current.toggleChrome()
    })
  }

  /** A link inside the book: to an anchor in this chapter or another one. */
  function followLink(href: string): void {
    if (!href || /^[a-z]+:/i.test(href)) return // external links stay put
    const [path, anchor] = href.split('#')
    const { chapters: chs, chapter: cur } = act.current
    const name = decodeURIComponent(path).split('/').pop() ?? ''
    const target = path ? chs.findIndex((c) => c.href.split('#')[0].split('/').pop() === name) : cur
    if (target >= 0) act.current.goChapter(target, 'start', anchor || undefined)
  }

  // Taps in the margins around the pages behave like taps on them.
  function onStageClick(e: React.MouseEvent<HTMLDivElement>): void {
    if (e.target !== e.currentTarget) return
    const r = e.currentTarget.getBoundingClientRect()
    const x = (e.clientX - r.left) / r.width
    if (x < 0.3) turn(-1)
    else if (x > 0.7) turn(1)
    else toggleChrome()
  }

  // ─── Render ────────────────────────────────────────────────────────────────

  const theme = THEMES[settings?.theme ?? 'dark']
  const shownTitle = title && title !== 'Unknown Title' ? title : (titleProp || title || '')
  const chapterTitle = chapters[chapter]?.title ?? ''
  const barVisible = chromeShown || panel !== null
  const pageLabel = chapterPages
    ? `Page ${currentPage}${lastOnScreen > currentPage ? `–${lastOnScreen}` : ''} of ${counted.exact ? '' : '~'}${counted.total}`
    : ''

  return (
    <div
      className={styles.reader}
      style={{ '--r-bg': theme.bg, '--r-fg': theme.fg, '--r-muted': theme.muted, '--r-accent': theme.accent } as React.CSSProperties}
      onMouseMove={() => { if (!panel) showChrome() }}
    >
      <div ref={stageRef} className={styles.stage} onClick={onStageClick}>
        {layout && (
          <>
            <iframe
              ref={frameRef}
              className={`${styles.frame} ${frameReady ? styles.frameReady : ''}`}
              title={chapterTitle || 'Book page'}
              // No allow-scripts: the book's HTML can never run code.
              sandbox="allow-same-origin"
              onLoad={() => { void onFrameLoad() }}
              style={{
                left: layout.left, top: layout.top,
                width: layout.columns * layout.colWidth + (layout.columns - 1) * layout.gap,
                height: layout.height,
              }}
            />
            {frameReady && (
              <div className={styles.folios} style={{ left: layout.left, top: layout.top + layout.height + 8 }}>
                {Array.from({ length: layout.columns }, (_, i) => (
                  <span key={i} style={{ width: layout.colWidth, marginRight: i < layout.columns - 1 ? layout.gap : 0 }}>
                    {page + i < chapterPages ? currentPage + i : ''}
                  </span>
                ))}
              </div>
            )}
            {bookmarkHere && (
              <div
                className={styles.ribbon}
                style={{ left: layout.left + layout.columns * layout.colWidth + (layout.columns - 1) * layout.gap - 18, top: 0 }}
                aria-label="Bookmarked page"
              />
            )}
          </>
        )}
        {!frameReady && <p className={styles.loading}>Loading…</p>}
      </div>

      {/* Hidden: lays out every chapter to count pages for the whole book. */}
      {layout && (
        <iframe
          ref={measureRef}
          className={styles.measure}
          sandbox="allow-same-origin"
          aria-hidden
          tabIndex={-1}
          style={{ width: layout.columns * layout.colWidth + (layout.columns - 1) * layout.gap, height: layout.height }}
        />
      )}

      <div className={styles.progressLine}><span style={{ width: `${bookFraction * 100}%` }} /></div>

      <header className={`${styles.topBar} ${barVisible ? styles.shown : ''}`} onMouseMove={(e) => { e.stopPropagation(); if (chromeTimer.current) clearTimeout(chromeTimer.current) }}>
        <button className={styles.barBtn} onClick={onBack}>‹ Library</button>
        <div className={styles.barTitle}>
          <span className={styles.barBook}>{shownTitle}{author ? <span className={styles.barAuthor}> · {author}</span> : null}</span>
          <span className={styles.barChapter}>{chapterTitle}</span>
        </div>
        <div className={styles.barActions}>
          <button className={styles.barBtn} onClick={() => openPanel('contents')} title="Contents (C / X)">Contents</button>
          <button className={styles.barBtn} onClick={() => openPanel('bookmarks')} title="Bookmarks">Bookmarks</button>
          <button className={`${styles.barBtn} ${bookmarkHere ? styles.barBtnOn : ''}`} onClick={() => { void toggleBookmark() }} title="Bookmark this page (B / Y)">
            {bookmarkHere ? '★' : '☆'}
          </button>
          <button className={styles.barBtn} onClick={() => openPanel('settings')} title="Settings (S / Start)">Aa</button>
          <button className={styles.barBtn} onClick={() => openPanel('help')} title="Controls (? / View)">?</button>
        </div>
      </header>

      <footer className={`${styles.bottomBar} ${barVisible ? styles.shown : ''}`} onMouseMove={(e) => { e.stopPropagation(); if (chromeTimer.current) clearTimeout(chromeTimer.current) }}>
        <input
          className={styles.scrubber}
          type="range"
          min={1}
          max={Math.max(1, counted.total)}
          value={Math.min(currentPage, Math.max(1, counted.total))}
          onChange={(e) => jumpToGlobalPage(Number(e.target.value))}
          aria-label="Position in book"
        />
        <div className={styles.stats}>
          <span>{pageLabel}</span>
          <span>{Math.round(bookFraction * 100)}% of book · {Math.round(chapterFraction * 100)}% of chapter</span>
          {minutesLeft && (
            <span>{formatMinutes(minutesLeft.chapter)} left in chapter · {formatMinutes(minutesLeft.book)} in book</span>
          )}
        </div>
      </footer>

      {toast && <div className={styles.toast}>{toast}</div>}

      <div ref={panelRef}>
        {panel === 'contents' && (
          <Drawer title="Contents" onClose={closePanel}>
            <ContentsList
              chapters={chapters}
              current={chapter}
              startPages={counted.starts.map((s, i) => (bookPages[i] != null || counted.exact ? s : null))}
              onJump={(i) => { closePanel(); goChapter(i, 'start') }}
            />
          </Drawer>
        )}
        {panel === 'bookmarks' && (
          <Drawer title="Bookmarks" onClose={closePanel}>
            <BookmarkList
              bookmarks={bookmarks}
              pageOf={pageOf}
              onJump={(b) => { closePanel(); goChapter(Math.floor(b.position), b.position - Math.floor(b.position)) }}
              onRemove={async (b) => { await window.api.books.removeBookmark(b.id); setBookmarks(await window.api.books.getBookmarks(filePath)) }}
            />
          </Drawer>
        )}
        {panel === 'settings' && settings && (
          <Drawer title="Reading settings" onClose={closePanel} wide>
            <SettingsForm settings={settings} bookOnly={!!loaded?.book} onChange={changeSettings} onBookOnly={setBookOnly} />
          </Drawer>
        )}
        {panel === 'help' && <HelpSheet onClose={closePanel} />}
      </div>
    </div>
  )
}
