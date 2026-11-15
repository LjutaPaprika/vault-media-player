/**
 * Sites that load their chapter list and pages after the page itself (htmx), e.g. weebcentral.com.
 *
 * The series page only carries a preview (first and newest few chapters); the rest comes from
 * the "Show All Chapters" button's hx-get URL. A chapter page carries no page images; they come
 * from a /chapters/<id>/images?… request made by the reader's script. Chapter links read "# 12".
 */

// The "Show All Chapters" button: hx-get="https://…/series/<id>/full-chapter-list"
export function fullChapterListUrl(html, baseUrl) {
  const m = html.match(/hx-get="([^"]*\/full-chapter-list[^"]*)"/i)
  if (!m) return null
  try { return new URL(m[1].replace(/&amp;/g, '&'), baseUrl).href } catch { return null }
}

// The reader's image request: "https://…/chapters/<id>/images?is_prev=False" (page and reading
// style are added by the script; long_strip returns every page at once)
export function lazyImagesUrl(html, chapterUrl) {
  const m = html.match(/["'](https?:\/\/[^"']*\/chapters\/[^"'/?]+\/images\?[^"']*)["']/i)
  if (!m) return null
  let url
  try { url = new URL(m[1].replace(/&amp;/g, '&'), chapterUrl) } catch { return null }
  if (!url.searchParams.has('current_page')) url.searchParams.set('current_page', '1')
  if (!url.searchParams.has('reading_style')) url.searchParams.set('reading_style', 'long_strip')
  return url.href
}

// "# 12 Last Read 2024-09-07T17:04:15Z" → "Chapter 012"; "# 12.5" → "Chapter 012.5".
// Any other title is returned unchanged.
export function hashTitle(title) {
  const m = title.match(/^#\s*(\d+)(\.\d+)?(?!\d)/)
  if (!m) return title
  return `Chapter ${m[1].padStart(3, '0')}${m[2] || ''}`
}

// /series/<id>/To-You-The-Immortal → "To You The Immortal"
export function seriesNameFromUrl(seriesUrl) {
  let pathname
  try { pathname = new URL(seriesUrl).pathname } catch { return null }
  const m = pathname.match(/\/series\/[^/]+\/([^/]+)\/?$/i)
  if (!m) return null
  return decodeURIComponent(m[1]).replace(/[-_]+/g, ' ').trim() || null
}
