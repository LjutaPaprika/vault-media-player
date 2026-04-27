const WP_API  = 'https://en.wikipedia.org/w/api.php'
const WP_REST = 'https://en.wikipedia.org/api/rest_v1'
const UA      = 'Vault/1.0 (personal media player; no commercial use)'

export interface MovieMetadata {
  title: string
  year: number | null
  description: string | null
  genre: string | null
}

const GENRES = [
  'action', 'adventure', 'animated', 'animation', 'biographical', 'biography',
  'comedy', 'crime', 'documentary', 'drama', 'fantasy', 'horror', 'martial arts',
  'musical', 'mystery', 'noir', 'psychological', 'romance', 'science fiction',
  'sport', 'superhero', 'thriller', 'war', 'western'
]

// Country/nationality adjectives to skip when parsing genres
const SKIP_WORDS = new Set([
  'american', 'british', 'french', 'german', 'italian', 'japanese', 'korean',
  'chinese', 'indian', 'australian', 'canadian', 'spanish', 'russian',
  'english', 'irish', 'international', 'animated'
])

function firstNSentences(text: string, n: number): string {
  const sentences = text.match(/[^.!?]+[.!?][\s"')»]*/g) ?? []
  const result = sentences.slice(0, n).join('').trim()
  return result || text.slice(0, 500).trim()
}

function parseYear(shortDesc: string): number | null {
  // "1979 American science fiction horror film directed by..."
  const m = shortDesc.match(/^(\d{4})\s/)
  if (m) {
    const y = parseInt(m[1], 10)
    if (y >= 1880 && y <= 2100) return y
  }
  return null
}

function parseGenres(text: string): string | null {
  const lower = text.toLowerCase()
  // Multi-word genres must be checked before their component words
  const found: string[] = []
  const usedRanges: [number, number][] = []

  const sorted = [...GENRES].sort((a, b) => b.length - a.length) // longest first
  for (const g of sorted) {
    const idx = lower.indexOf(g)
    if (idx === -1) continue
    // Skip if this range overlaps a previously matched genre
    const overlaps = usedRanges.some(([s, e]) => idx < e && idx + g.length > s)
    if (overlaps) continue
    // Only accept if near (within 120 chars of) the word "film" or "movie"
    const nearFilm = /\b(film|movie)\b/.test(lower.slice(Math.max(0, idx - 5), idx + g.length + 80))
    if (!nearFilm) continue
    usedRanges.push([idx, idx + g.length])
    found.push(g.charAt(0).toUpperCase() + g.slice(1))
  }
  return found.length ? found.join(', ') : null
}

async function wpFetch(url: string): Promise<unknown> {
  const resp = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!resp.ok) throw new Error(`Wikipedia HTTP ${resp.status}`)
  return resp.json()
}

async function searchWikipedia(query: string): Promise<string | null> {
  const url = `${WP_API}?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5`
  const data = await wpFetch(url) as { query: { search: { title: string }[] } }
  return data.query.search[0]?.title ?? null
}

async function getPageSummary(pageTitle: string): Promise<{
  shortDesc: string | null
  extract: string | null
} | null> {
  const slug = encodeURIComponent(pageTitle.replace(/ /g, '_'))
  const url = `${WP_REST}/page/summary/${slug}`
  const resp = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!resp.ok) return null
  const data = await resp.json() as { description?: string; extract?: string; type?: string }
  // Skip disambiguation pages
  if (data.type === 'disambiguation') return null
  return {
    shortDesc: data.description ?? null,
    extract: data.extract ?? null
  }
}

export async function fetchMovieMetadata(
  title: string,
  year: number | null
): Promise<MovieMetadata | null> {
  // Include year in the search query for better disambiguation
  const query = year ? `${title} ${year} film` : `${title} film`
  const pageTitle = await searchWikipedia(query)
  if (!pageTitle) return null

  const summary = await getPageSummary(pageTitle)
  if (!summary) return null

  const resolvedYear = year
    ?? (summary.shortDesc ? parseYear(summary.shortDesc) : null)

  // Parse genre from the short description ("1979 American science fiction horror film...")
  // then fall back to the full extract if nothing found there
  const genreSource = summary.shortDesc ?? summary.extract ?? ''
  const genre = parseGenres(genreSource)

  const description = summary.extract ? firstNSentences(summary.extract, 3) : null

  return {
    title,
    year: resolvedYear,
    description,
    genre
  }
}
