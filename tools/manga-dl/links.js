/**
 * The title of a chapter link, as a reader would read it.
 *
 * Plain textContent glues neighbouring elements together, so a link like
 * <span>Chapter 21.1</span><span class="chapter-date">3 years ago</span> reads
 * "Chapter 21.13 years ago": a wrong file name and a wrong sort number. So:
 * elements are joined with a space, date elements and trailing "N units ago"
 * text are dropped, and "First Chapter" / "New Chapter" button labels are
 * removed when a real title follows them.
 */
const DATE_CLASS_RE = /(?:^|[-_\s])(?:date|time|ago|release)(?:$|[-_\s])/i
const RELATIVE_DATE_RE = /\s+(?:\d+|an?)\s+(?:second|minute|hour|day|week|month|year)s?\s+ago$/i
const BUTTON_LABEL_RE = /^(?:first|new|newest|latest|last|next|prev(?:ious)?)\s+chapter\s+(?=\S)/i

function collect(node, parts) {
  if (node.nodeType === 3) { parts.push(node.text); return }
  if (node.nodeType !== 1) return
  if (DATE_CLASS_RE.test(node.getAttribute?.('class') || '')) return
  parts.push(' ')
  for (const child of node.childNodes) collect(child, parts)
  parts.push(' ')
}

/**
 * The chapter number in a link's path, or null: /manga/dandadan-chapter-249/ → "249",
 * /x-chapter-21-1/ → "21.1". (Not /chapters/<id>: "chapters" is a folder, not a number.)
 */
export function urlChapterNumber(url) {
  let pathname
  try { pathname = new URL(url).pathname } catch { return null }
  const m = pathname.match(/chapter[_-]?(\d+)(?:[-_.](\d+))?(?=[/_.-]|$)/i)
  if (!m) return null
  return m[2] ? `${m[1]}.${m[2]}` : m[1]
}

/**
 * A title whose chapter number disagrees with its link's, renumbered from the link:
 * "Dandadan Manga Chapter 24" for /dandadan-chapter-249/ → "Dandadan Manga Chapter 249".
 * Unchanged when they agree (whole numbers: "Chapter 21.1" for chapter-21-1 agrees) or either
 * has no number.
 */
export function fixChapterNumber(title, url) {
  const fromUrl = urlChapterNumber(url)
  const m = title.match(/(chapter[\s_-]*)(\d+)(\.\d+)?/i)
  if (!fromUrl || !m || parseInt(m[2], 10) === parseInt(fromUrl, 10)) return title
  return title.slice(0, m.index) + m[1] + fromUrl + title.slice(m.index + m[0].length)
}

export function chapterLinkTitle(a) {
  const parts = []
  for (const child of a.childNodes) collect(child, parts)
  return parts.join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(RELATIVE_DATE_RE, '')
    .replace(BUTTON_LABEL_RE, '')
}
