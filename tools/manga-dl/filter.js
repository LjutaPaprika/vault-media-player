/**
 * Is this image URL clearly not a manga page?
 *
 * True for an /ad/ or /ads/ folder, a folder named after one of the words below ("/icons/"), or a
 * file name with one of them as a whole part ("site-logo-2x.png", "loading-spinner.gif").
 *
 * Only whole name parts of the path count, never substrings or the domain, because image hosts
 * name pages with random IDs: imgur's "ntlogO4.png" contains "logO", and Blogger's
 * ".../AVvXsEj...mKT-AD8s_oE.../006.jpg" contains "AD". An earlier substring match dropped real
 * pages that way.
 */
const SKIP_WORD_RE = /^(?:logo|icon|banner|avatar|button|spinner|placeholder|blank|spacer|pixel)s?\d*$/i

export function isNonPageImage(url) {
  let path
  try {
    path = new URL(url).pathname
  } catch {
    return false
  }
  if (/\/ads?\//i.test(path)) return true
  const segments = path.split('/').filter(Boolean)
  const file = (segments.pop() || '').replace(/\.[a-z0-9]+$/i, '')
  // The file name may carry the word as one part ("site-logo-2x"); a folder only counts when it
  // IS the word ("/icons/"), so a series slug like "blank-check-chapter-2" doesn't drop every page.
  return file.split(/[-_.\s]+/).some(part => SKIP_WORD_RE.test(part)) ||
    segments.some(segment => SKIP_WORD_RE.test(segment))
}
