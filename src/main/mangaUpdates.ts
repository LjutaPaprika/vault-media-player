/**
 * Release info for a manga series from MangaUpdates' public API
 * (https://api.mangaupdates.com): whether it is still running, and the latest
 * chapter it has logged. Only metadata; nothing is downloaded.
 *
 * Its latest_chapter comes from logged releases, so for a series that moved to
 * official releases it can lag well behind (Bleach shows 250 of 686). Callers
 * should treat "latest below what's on the drive" as "unknown", not "up to date".
 */

const API = 'https://api.mangaupdates.com/v1'

export type FetchJson = (url: string, init?: { method?: string; body?: string }) => Promise<unknown>

export interface SeriesMeta {
  muId: string
  /** The series' title on MangaUpdates, shown so a wrong match is easy to spot. */
  muTitle: string
  /** e.g. "18 Volumes (Ongoing)". */
  status: string
  /** Still running or on hiatus; null when the status doesn't say. */
  ongoing: boolean | null
  /** Latest logged chapter, or null when none is logged. */
  latest: number | null
  fetchedAt: number
}

interface SearchHit { hit_title?: string; record?: { series_id?: number | string; title?: string; type?: string } }

export function normTitle(s: string): string {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

const NOT_THE_SERIES = /\b(dj|doujin|doujinshi|anthology|novel|official doujin|fan ?book|one ?shot)\b/i
const SKIP_TYPES = /doujinshi|novel|artbook/i

/**
 * The search result that is the series named `name`: an exact (normalised)
 * title or alias match first, then one where either contains the other.
 * Doujinshi, novels and anthologies never count. null when nothing convinces.
 */
export function pickMatch(name: string, results: SearchHit[]): { id: string; title: string } | null {
  const want = normTitle(name)
  if (!want) return null
  let best: { id: string; title: string; score: number } | null = null
  for (const r of results) {
    const rec = r.record
    if (!rec?.series_id || !rec.title) continue
    if (SKIP_TYPES.test(rec.type ?? '') || NOT_THE_SERIES.test(rec.title)) continue
    let score = 0
    for (const t of [r.hit_title ?? '', rec.title]) {
      const n = normTitle(t)
      if (!n) continue
      if (n === want) score = Math.max(score, 3)
      else if (n.startsWith(want) || want.startsWith(n)) score = Math.max(score, 2)
      else if (n.includes(want) || want.includes(n)) score = Math.max(score, 1)
    }
    if (score > 0 && (!best || score > best.score)) best = { id: String(rec.series_id), title: rec.title, score }
  }
  return best ? { id: best.id, title: best.title } : null
}

/**
 * Running or on hiatus, from the status of the original edition: the text up to
 * its first closing bracket. Later parts often list re-releases still coming
 * out ("27 Volumes (Complete) 18 Kanzenban Volumes (Ongoing)").
 */
export function isOngoing(status: string): boolean | null {
  const first = status.split(')')[0]
  if (/ongoing|hiatus/i.test(first)) return true
  if (/complete|cancel|discontinu|axed|finished/i.test(first)) return false
  return null
}

/** Looks the series up by name (or by its known MangaUpdates id). null when not found. */
export async function lookupSeries(name: string, knownId: string | null, fetchJson: FetchJson): Promise<SeriesMeta | null> {
  let id = knownId
  if (!id) {
    const s = await fetchJson(`${API}/series/search`, {
      method: 'POST', body: JSON.stringify({ search: name, perpage: 10 })
    }) as { results?: SearchHit[] }
    id = pickMatch(name, s.results ?? [])?.id ?? null
    if (!id) return null
  }
  const d = await fetchJson(`${API}/series/${id}`) as { title?: string; status?: string; latest_chapter?: number }
  const latest = typeof d.latest_chapter === 'number' && d.latest_chapter > 0 ? d.latest_chapter : null
  const status = (d.status ?? '').replace(/\s+/g, ' ').trim()
  return {
    muId: id, muTitle: d.title ?? name, status, ongoing: isOngoing(status), latest,
    fetchedAt: Math.floor(Date.now() / 1000)
  }
}
