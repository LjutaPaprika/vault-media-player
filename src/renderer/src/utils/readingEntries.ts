/**
 * Ordering and bonus detection for manga and comic entries, shared by the
 * series list and the series page.
 */

/** Chapter number, else volume number, else the first number in the title. */
export function sortKey(title: string): number {
  const ch = title.match(/ch(?:apter)?\.?\s*(\d+(?:\.\d+)?)/i)
  if (ch) return parseFloat(ch[1])
  const vol = title.match(/vol(?:ume)?\.?\s*(\d+(?:\.\d+)?)/i)
  if (vol) return parseFloat(vol[1])
  const num = title.match(/(\d+(?:\.\d+)?)/)
  if (num) return parseFloat(num[1])
  return Infinity
}

/** A bonus chapter numbered between two others, e.g. Ch. 10.5. */
export function isExtra(title: string): boolean {
  const key = sortKey(title)
  return isFinite(key) && key !== Math.floor(key)
}
