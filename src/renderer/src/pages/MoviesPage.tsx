import { useEffect, useState } from 'react'
import PageShell from '../components/PageShell'
import MediaGrid from '../components/MediaGrid'
import MovieDetailPage from './MovieDetailPage'
import { useLibrary } from '../hooks/useLibrary'
import { useAppStore } from '../store/appStore'

interface SelectedMovie {
  title: string
  year: number | null
  posterPath: string | null
  filePath: string
  description: string | null
  genre: string | null
}

export default function MoviesPage(): JSX.Element {
  const { items, loading, error } = useLibrary('movies')
  const { contentResetKey } = useAppStore()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<SelectedMovie | null>(null)

  useEffect(() => { setSelected(null) }, [contentResetKey])

  if (selected) {
    return (
      <MovieDetailPage
        title={selected.title}
        year={selected.year}
        posterPath={selected.posterPath}
        filePath={selected.filePath}
        description={selected.description}
        genre={selected.genre}
        onBack={() => setSelected(null)}
      />
    )
  }

  const filtered = items.filter((i) => i.title.toLowerCase().includes(query.toLowerCase()))

  return (
    <PageShell title="Movies" searchValue={query} onSearch={setQuery}>
      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {!loading && !error && (
        <MediaGrid
          items={filtered.map((i) => ({ ...i, subtitle: i.year?.toString() ?? undefined }))}
          onSelect={(item) => setSelected({
            title: item.title,
            year: item.year ?? null,
            posterPath: item.posterPath ?? null,
            filePath: item.filePath ?? '',
            description: (item as { description?: string | null }).description ?? null,
            genre: (item as { genre?: string | null }).genre ?? null
          })}
          emptyMessage="No movies found. Add .mkv or .mp4 files to media/movies/ and scan your library."
        />
      )}
    </PageShell>
  )
}
