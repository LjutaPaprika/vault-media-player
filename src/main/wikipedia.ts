const WP_API = 'https://en.wikipedia.org/w/api.php'
const UA     = 'Vault/1.0 (personal media player; non-commercial)'

export interface MovieMetadata {
  title: string
  year: number | null
  description: string | null
  genre: string | null
}

const GENRES = [
  'science fiction', 'martial arts',          // multi-word first
  'action', 'adventure', 'animated', 'animation', 'biographical', 'biography',
  'comedy', 'crime', 'documentary', 'drama', 'fantasy', 'horror',
  'musical', 'mystery', 'noir', 'psychological', 'romance',
  'sport', 'superhero', 'thriller', 'war', 'western'
]

function firstNSentences(text: string, n: number): string {
  const sentences = text.match(/[^.!?]+[.!?][\s"')»]*/g) ?? []
  return sentences.slice(0, n).join('').trim() || text.slice(0, 500).trim()
}

function parseYear(text: string): number | null {
  // First sentence typically: "Alien is a 1979 American science fiction horror film..."
  const m = text.match(/\b((?:19|20)\d{2})\b/)
  if (m) {
    const y = parseInt(m[1], 10)
    if (y >= 1880 && y <= 2100) return y
  }
  return null
}

function parseGenres(text: string): string | null {
  const lower = text.toLowerCase()
  const found: string[] = []
  const usedRanges: [number, number][] = []

  for (const g of GENRES) {  // longest-first ordering already in array
    const idx = lower.indexOf(g)
    if (idx === -1) continue
    const overlaps = usedRanges.some(([s, e]) => idx < e && idx + g.length > s)
    if (overlaps) continue
    // Only count genres that appear near the word "film" or "movie"
    const window = lower.slice(Math.max(0, idx - 10), idx + g.length + 100)
    if (!/\b(film|movie)\b/.test(window)) continue
    usedRanges.push([idx, idx + g.length])
    found.push(g.charAt(0).toUpperCase() + g.slice(1))
  }
  return found.length ? found.join(', ') : null
}

async function wpFetch(url: string, attempt = 0): Promise<unknown> {
  const resp = await fetch(url, { headers: { 'User-Agent': UA } })
  if (resp.ok) return resp.json()

  if ((resp.status === 429 || resp.status === 503) && attempt < 3) {
    const retryAfter = parseInt(resp.headers.get('Retry-After') ?? '0', 10)
    const delay = retryAfter > 0 ? retryAfter * 1000 : 2000 * 2 ** attempt
    await new Promise((r) => setTimeout(r, delay))
    return wpFetch(url, attempt + 1)
  }

  throw new Error(`Wikipedia HTTP ${resp.status}`)
}

export async function fetchMovieMetadata(
  title: string,
  year: number | null
): Promise<MovieMetadata | null> {
  const query = year ? `${title} ${year} film` : `${title} film`

  // Single request: generator=search returns search results WITH their extracts
  const url =
    `${WP_API}?action=query` +
    `&generator=search&gsrsearch=${encodeURIComponent(query)}&gsrlimit=1` +
    `&prop=extracts&exintro=true&explaintext=true` +
    `&format=json`

  const data = await wpFetch(url) as {
    query?: { pages?: Record<string, { extract?: string }> }
  }

  const pages = Object.values(data.query?.pages ?? {})
  if (!pages.length) return null

  const extract = pages[0].extract?.trim() ?? ''
  if (!extract) return null

  const firstSentence = extract.match(/^[^.!?]+[.!?]/)?.[0] ?? extract.slice(0, 250)

  return {
    title,
    year: year ?? parseYear(firstSentence),
    description: firstNSentences(extract, 3),
    genre: parseGenres(firstSentence) ?? parseGenres(extract)
  }
}
