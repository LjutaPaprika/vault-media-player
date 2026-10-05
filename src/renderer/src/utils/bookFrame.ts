// Turns an EPUB chapter into a self-contained document for the reader's
// sandboxed iframe, laid out as pages.
//
// Safety: a chapter is the book's own HTML, and used to be put straight into
// the app's page, where an <img onerror> could run with the app's privileges
// (window.api launches processes). Now it is parsed inert (DOMParser runs
// nothing), stripped of scripts, embeds and event handlers, and rendered in an
// iframe sandboxed WITHOUT allow-scripts and under a CSP that loads nothing
// but inline styles and data: images. allow-same-origin stays so the reader
// can measure and move the pages; with scripts off that grants the book nothing.
//
// Pagination: the chapter flows into CSS columns exactly one page wide inside
// a box one page tall, so overflow becomes further pages to the right. Moving
// between pages is a translateX of that box, which is also what animates.

import { FONT_STACKS, THEMES, type ReaderSettings } from './readerSettings'

export interface PreparedChapter {
  bodyHtml: string
  /** The book's own body classes and id, carried onto the wrapper. */
  bodyClass: string
  bodyId: string
  /** The book's stylesheets, rescoped so html/body rules hit the wrapper. */
  bookCss: string
  words: number
}

export interface PageLayout {
  /** Width of one page (column) in CSS px. */
  colWidth: number
  /** Height of the page area in CSS px. */
  height: number
  /** Space between the two pages of a spread. */
  gap: number
  /** Pages shown side by side: 1, or 2 on a wide window. */
  columns: number
}

const DROP = 'script, noscript, iframe, frame, frameset, object, embed, applet, form, input, button, select, textarea, base, meta, link, audio, video, source, track, portal'

/** Remove everything in a parsed chapter that could run code or load things. */
function defuse(doc: Document): void {
  doc.querySelectorAll(DROP).forEach((el) => el.remove())
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of [...el.attributes]) {
      const name = attr.name.toLowerCase()
      const value = attr.value.trim().toLowerCase()
      if (name.startsWith('on')) el.removeAttribute(attr.name)
      else if ((name === 'href' || name === 'src' || name.endsWith(':href') || name === 'action' || name === 'formaction')
        && (value.startsWith('javascript:') || value.startsWith('vbscript:'))) el.removeAttribute(attr.name)
    }
  })
}

/**
 * For EpubScrollReader, which still renders chapters into the app's own page
 * (manga volumes as EPUB): the same defusing, returning HTML to inject. The
 * book's styles stay, but nested inside .book-body (native CSS nesting) so a
 * rule like \`p { ... }\` reaches the book and not the rest of the app; its
 * html/body rules become the wrapper itself.
 */
export function sanitiseChapterHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const css: string[] = []
  doc.querySelectorAll('style').forEach((s) => { css.push(s.textContent ?? ''); s.remove() })
  defuse(doc)
  const nested = css.join('\n')
    .replace(/@import[^;]+;/gi, '')
    .replace(/(^|[\s,>+~}])(html|body)(?=[\s,.#:[>+~{]|$)/gim, '$1&')
  return `<style>.book-body { ${nested} }</style><div class="book-body">${doc.body.innerHTML}</div>`
}

export function prepareChapter(html: string): PreparedChapter {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  // Styles first: inline <style> in head and body, which the main process has
  // already filled in for linked stylesheets.
  const css: string[] = []
  doc.querySelectorAll('style').forEach((s) => { css.push(s.textContent ?? ''); s.remove() })
  defuse(doc)

  const body = doc.body
  return {
    bodyHtml: body.innerHTML,
    bodyClass: body.className,
    bodyId: body.id,
    bookCss: scopeCss(css.join('\n')),
    words: (body.textContent ?? '').split(/\s+/).filter(Boolean).length,
  }
}

/**
 * The book's html/body rules would otherwise style the reader's own document
 * and fight the page layout; point them at the wrapper instead. @import and
 * remote url()s are dropped (the CSP would block them anyway).
 */
function scopeCss(css: string): string {
  return css
    .replace(/@import[^;]+;/gi, '')
    .replace(/(^|[\s,>+~}])(html|body)(?=[\s,.#:[>+~{]|$)/gim, '$1.book-body')
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')
}

export function buildSrcdoc(ch: PreparedChapter, s: ReaderSettings, layout: PageLayout): string {
  const t = THEMES[s.theme]
  const viewWidth = layout.columns * layout.colWidth + (layout.columns - 1) * layout.gap
  const font = FONT_STACKS[s.font]
  const scheme = s.theme === 'light' || s.theme === 'sepia' ? 'light' : 'dark'
  // With publisher styling off, the book's fonts, sizes and spacing give way
  // to the reader's; structure (headings, italics, indents) remains.
  const override = s.publisherStyles ? '' : `
    #flow * { font-family: inherit !important; line-height: inherit !important; }
    #flow p { margin: 0 0 0.9em; text-indent: 0; }`
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:">
${s.publisherStyles ? `<style>${ch.bookCss}</style>` : ''}
<style>
  :root { color-scheme: ${scheme}; }
  html, body { margin: 0 !important; padding: 0 !important; height: 100% !important; overflow: hidden !important; background: transparent !important; }
  #flow {
    box-sizing: border-box !important;
    width: ${viewWidth}px !important; height: ${layout.height}px !important;
    margin: 0 !important; padding: 0 !important;
    column-count: ${layout.columns} !important; column-gap: ${layout.gap}px !important; column-fill: auto !important;
    font-size: ${s.fontSize}px; line-height: ${s.lineHeight}; font-family: ${font};
    color: ${t.fg};
    overflow-wrap: break-word; hyphens: auto;
    transform: translateX(0); will-change: transform;
  }
  .book-body { margin: 0 !important; padding: 0 !important; }
  /* Themes win over the book's own colours, as on any e-reader. */
  #flow, #flow *:not(img):not(svg) { color: inherit !important; background-color: transparent !important; }
  #flow a { color: ${t.link} !important; text-decoration: none; }
  #flow img, #flow svg { max-width: 100% !important; max-height: ${layout.height - 8}px !important; height: auto; object-fit: contain; break-inside: avoid; }
  #flow p { orphans: 2; widows: 2; }
  #flow h1, #flow h2, #flow h3, #flow h4 { break-after: avoid; line-height: 1.25; }
  #flow figure, #flow table, #flow pre, #flow blockquote { break-inside: avoid; }
  #flow pre { white-space: pre-wrap; }
  ::selection { background: ${t.selection}; }
  ${override}
</style></head><body><div id="flow"><div class="book-body ${escapeAttr(ch.bodyClass)}"${ch.bodyId ? ` id="${escapeAttr(ch.bodyId)}"` : ''}>${ch.bodyHtml}</div></div></body></html>`
}

/** Pages a laid-out chapter occupies. */
export function countPages(doc: Document, layout: PageLayout): number {
  const flow = doc.getElementById('flow')
  if (!flow) return 1
  return Math.max(1, Math.round((flow.scrollWidth + layout.gap) / (layout.colWidth + layout.gap)))
}

/** Translate the flow so page `page` (0-based) starts the view. */
export function showPage(doc: Document, layout: PageLayout, page: number, animate: boolean): void {
  const flow = doc.getElementById('flow')
  if (!flow) return
  flow.style.transition = animate ? 'transform 150ms ease-out' : 'none'
  flow.style.transform = `translateX(${-page * (layout.colWidth + layout.gap)}px)`
}

/** The page holding an element, for links to an anchor within a chapter. */
export function pageOfElement(doc: Document, layout: PageLayout, el: Element): number {
  const flow = doc.getElementById('flow')
  if (!flow) return 0
  const offset = el.getBoundingClientRect().left - flow.getBoundingClientRect().left
  return Math.max(0, Math.floor((offset + 1) / (layout.colWidth + layout.gap)))
}

/** Which page (column) a character sits on, from its laid-out position. */
function columnOf(r: Range, flowLeft: number, layout: PageLayout): number {
  const rect = r.getClientRects()[0] ?? r.getBoundingClientRect()
  return Math.floor((rect.left - flowLeft + 1) / (layout.colWidth + layout.gap))
}

/**
 * How many characters into the chapter page `page` starts. Survives a
 * relayout where a fraction does not: text is not spread evenly over pages,
 * so after a font change the same fraction can land a page away from what
 * was on screen. Worked out from the text's layout, not by hit-testing a
 * point, so it holds even while the window is minimised.
 */
export function charOffsetOfPage(doc: Document, layout: PageLayout, page: number): number | null {
  const flow = doc.getElementById('flow')
  if (!flow) return null
  const flowLeft = flow.getBoundingClientRect().left
  const walker = doc.createTreeWalker(flow, NodeFilter.SHOW_TEXT)
  const r = doc.createRange()
  let seen = 0
  let node: Node | null
  while ((node = walker.nextNode())) {
    const text = node.textContent ?? ''
    const len = text.length
    if (len === 0 || !text.trim()) { seen += len; continue }
    r.setStart(node, len - 1); r.setEnd(node, len)
    if (columnOf(r, flowLeft, layout) < page) { seen += len; continue }
    // The page starts in this node: text runs column by column, so the
    // column of each character only grows; find the first on `page`.
    let lo = 0, hi = len - 1
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      r.setStart(node, mid); r.setEnd(node, mid + 1)
      if (columnOf(r, flowLeft, layout) >= page) hi = mid
      else lo = mid + 1
    }
    return seen + lo
  }
  return null
}

/** The page holding the character `offset` characters into the chapter. */
export function pageOfCharOffset(doc: Document, layout: PageLayout, offset: number): number {
  const flow = doc.getElementById('flow')
  if (!flow) return 0
  const walker = doc.createTreeWalker(flow, NodeFilter.SHOW_TEXT)
  let seen = 0
  let node: Node | null
  while ((node = walker.nextNode())) {
    const len = node.textContent?.length ?? 0
    if (seen + len > offset) {
      const r = doc.createRange()
      r.setStart(node, Math.max(0, offset - seen))
      r.setEnd(node, Math.min(len, offset - seen + 1))
      return Math.max(0, columnOf(r, flow.getBoundingClientRect().left, layout))
    }
    seen += len
  }
  return 0
}

/** The first words of a page, for a bookmark: from the start of a word. */
export function snippetOfPage(doc: Document, layout: PageLayout, page: number, max = 110): string {
  const flow = doc.getElementById('flow')
  const offset = charOffsetOfPage(doc, layout, page)
  if (!flow || offset === null) return ''
  const all = flow.textContent ?? ''
  let from = offset
  while (from > 0 && !/s/.test(all[from - 1])) from--
  const clean = all.slice(from, from + max * 2).replace(/s+/g, ' ').trim()
  return clean.length > max ? clean.slice(0, max).replace(/s+S*$/, '') + '…' : clean
}
