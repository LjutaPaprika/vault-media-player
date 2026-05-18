import { useEffect, useState, useMemo } from 'react'
import PageShell from '../components/PageShell'
import MediaGrid from '../components/MediaGrid'
import MovieDetailPage from './MovieDetailPage'
import { useLibrary } from '../hooks/useLibrary'
import { useAppStore } from '../store/appStore'
import styles from './MoviesPage.module.css'

interface SelectedMovie {
  title: string
  year: number | null
  posterPath: string | null
  filePath: string
  genre: string | null
}

export default function MoviesPage(): JSX.Element {
  const { items, loading, error } = useLibrary('movies')
  const { contentResetKey } = useAppStore()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<SelectedMovie | null>(null)
  const [activeGenres, setActiveGenres] = useState<Set<string>>(new Set())

  const allGenres = useMemo(() => {
    const set = new Set<string>()
    items.forEach(i => {
      if (i.genre) i.genre.split(',').forEach(g => set.add(g.trim()))
    })
    return [...set].sort()
  }, [items])

  useEffect(() => { setSelected(null) }, [contentResetKey])

  if (selected) {
    return (
      <MovieDetailPage
        title={selected.title}
        year={selected.year}
        posterPath={selected.posterPath}
        filePath={selected.filePath}
        initialGenre={selected.genre}
        onBack={() => setSelected(null)}
      />
    )
  }

  const filtered = items.filter((i) => {
    if (!i.title.toLowerCase().includes(query.toLowerCase())) return false
    if (activeGenres.size === 0) return true
    if (!i.genre) return false
    const movieGenres = i.genre.split(',').map(g => g.trim())
    return [...activeGenres].every(g => movieGenres.includes(g))
  })

  function toggleGenre(g: string): void {
    setActiveGenres(prev => {
      const next = new Set(prev)
      next.has(g) ? next.delete(g) : next.add(g)
      return next
    })
  }

  return (
    <PageShell title="Movies" searchValue={query} onSearch={setQuery}>
      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {!loading && !error && (
        <>
          {allGenres.length > 0 && (
            <div className={styles.genrePills}>
              {allGenres.map(g => (
                <button
                  key={g}
                  className={`${styles.genrePill} ${activeGenres.has(g) ? styles.genrePillActive : ''}`}
                  onClick={() => toggleGenre(g)}
                >
                  {g}
                </button>
              ))}
              {activeGenres.size > 0 && (
                <button className={styles.genrePillClear} onClick={() => setActiveGenres(new Set())}>
                  ✕ Clear
                </button>
              )}
            </div>
          )}
          <MediaGrid
            items={filtered.map((i) => ({ ...i, subtitle: i.year?.toString() ?? undefined }))}
            onSelect={(item) => setSelected({
              title: item.title,
              year: item.year ?? null,
              posterPath: item.posterPath ?? null,
              filePath: item.filePath ?? '',
              genre: item.genre ?? null
            })}
            emptyMessage="No movies found. Add .mkv or .mp4 files to media/movies/ and scan your library."
          />
        </>
      )}
    </PageShell>
  )
}
