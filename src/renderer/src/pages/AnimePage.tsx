import { useState } from 'react'
import PageShell from '../components/PageShell'
import MediaGrid from '../components/MediaGrid'
import ShowDetailPage from './ShowDetailPage'
import { useLibrary } from '../hooks/useLibrary'

interface SelectedShow {
  title: string
  year: number | null
  posterPath: string | null
}

export default function AnimePage(): JSX.Element {
  const { items, loading, error } = useLibrary('anime')
  const [selected, setSelected] = useState<SelectedShow | null>(null)
  const [query, setQuery] = useState('')

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

  // Deduplicate: one card per unique series title
  const seriesMap = new Map<string, MediaItem>()
  for (const item of items) {
    if (!seriesMap.has(item.title)) seriesMap.set(item.title, item)
  }
  const series = Array.from(seriesMap.values())
    .filter((i) => i.title.toLowerCase().includes(query.toLowerCase()))

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
