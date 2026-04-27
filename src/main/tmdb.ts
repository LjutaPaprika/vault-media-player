const TMDB_BASE = 'https://api.themoviedb.org/3'

export interface MovieMetadata {
  title: string
  year: number | null
  description: string | null
  genre: string | null
}

let genreCache: Map<number, string> | null = null

async function tmdbGet(path: string, apiKey: string): Promise<unknown> {
  const sep = path.includes('?') ? '&' : '?'
  const url = `${TMDB_BASE}${path}${sep}api_key=${apiKey}&language=en-US`
  const resp = await fetch(url)
  if (resp.status === 401) throw new Error('Invalid TMDb API key')
  if (!resp.ok) throw new Error(`TMDb HTTP ${resp.status}`)
  return resp.json()
}

async function getGenreMap(apiKey: string): Promise<Map<number, string>> {
  if (genreCache) return genreCache
  const data = await tmdbGet('/genre/movie/list', apiKey) as {
    genres: { id: number; name: string }[]
  }
  genreCache = new Map(data.genres.map((g) => [g.id, g.name]))
  return genreCache
}

export function clearGenreCache(): void { genreCache = null }

export async function fetchMovieMetadata(
  title: string,
  year: number | null,
  apiKey: string
): Promise<MovieMetadata | null> {
  const genres = await getGenreMap(apiKey)
  const base = `/search/movie?query=${encodeURIComponent(title)}`
  // Try with year first for precision, then without as fallback
  const queries = year ? [`${base}&year=${year}`, base] : [base]

  for (const q of queries) {
    const data = await tmdbGet(q, apiKey) as {
      results: Array<{
        title: string
        overview: string
        release_date: string
        genre_ids: number[]
      }>
    }
    if (!data.results.length) continue
    const m = data.results[0]
    const releaseYear = m.release_date ? parseInt(m.release_date.split('-')[0], 10) : null
    const genreStr = m.genre_ids
      .map((id) => genres.get(id))
      .filter((g): g is string => Boolean(g))
      .join(', ') || null
    return {
      title: m.title,
      year: releaseYear && !isNaN(releaseYear) ? releaseYear : null,
      description: m.overview || null,
      genre: genreStr
    }
  }
  return null
}
