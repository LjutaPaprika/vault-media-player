import { useEffect, useState } from 'react'
import PageShell from '../components/PageShell'
import MediaGrid from '../components/MediaGrid'
import ShowDetailPage from './ShowDetailPage'
import { useLibrary } from '../hooks/useLibrary'
import { useAppStore } from '../store/appStore'

interface SelectedShow {
  title: string
  year: number | null
  posterPath: string | null
}

export default function AnimePage(): JSX.Element {
  const { items, loading, error } = useLibrary('anime')
  const { contentResetKey } = useAppStore()
  const [selected, setSelected] = useState<SelectedShow | null>(null)
  const [query, setQuery] = useState('')

  useEffect(() => { setSelected(null) }, [contentResetKey])

  if (selected) {
    return (
      <ShowDetailPage
        seriesTitle={selected.title}
        year={selected.year ?? null}
        posterPath={selected.posterPath ?? null}
        category="anime"
        onBack={() => setSelected(null)}
      />
    )
  }

  // Deduplicate: one card per unique series title; collect all episodes per series for completion check
  const seriesMap = new Map<string, MediaItem>()
  const episodesByTitle = new Map<string, MediaItem[]>()
  for (const item of items) {
    if (!seriesMap.has(item.title)) seriesMap.set(item.title, item)
    if (!episodesByTitle.has(item.title)) episodesByTitle.set(item.title, [])
    episodesByTitle.get(item.title)!.push(item)
  }
  const series = Array.from(seriesMap.values())
    .filter((i) => i.title.toLowerCase().includes(query.toLowerCase()))
    .map((i) => ({ ...i, complete: isSeriesComplete(episodesByTitle.get(i.title) ?? []) }))

  return (
    <PageShell title="Anime" searchValue={query} onSearch={setQuery}>
      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {!loading && !error && (
        <MediaGrid
          items={series}
          onSelect={(item) => setSelected({ title: item.title, year: item.year ?? null, posterPath: item.posterPath ?? null })}
          emptyMessage="No anime found. Add series folders to media/anime/ and scan your library."
        />
      )}
    </PageShell>
  )
}

// "Complete" = the highest-numbered main-series episode (S01E01 sort order) has been opened.
function isSeriesComplete(episodes: MediaItem[]): boolean {
  const parsed = episodes
    .map((ep) => {
      const m = ep.description?.match(/S(\d+)E(\d+)/i)
      return m ? { ep, season: parseInt(m[1], 10), num: parseInt(m[2], 10) } : null
    })
    .filter((x): x is { ep: MediaItem; season: number; num: number } => x !== null)
    .sort((a, b) => a.season - b.season || a.num - b.num)
  if (parsed.length === 0) return false
  return !!parsed[parsed.length - 1].ep.lastOpenedAt
}
