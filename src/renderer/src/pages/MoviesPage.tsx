import { useEffect, useState, useMemo } from 'react'
import PageShell from '../components/PageShell'
import MediaGrid from '../components/MediaGrid'
import MovieModal from '../components/MovieModal'
import { usePosterModal } from '../components/PosterModal'
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
  // Genres edited in the modal this session. The shelf list isn't refetched
  // for a genre edit, so these keep the filter pills, the filtering and a
  // reopened modal in step with the edit.
  const [genreEdits, setGenreEdits] = useState<Record<string, string | null>>({})
  const genreOf = (i: MediaItem): string | null => (i.filePath in genreEdits ? genreEdits[i.filePath] : i.genre)
  const { closing, close } = usePosterModal(() => setSelected(null))

  const allGenres = useMemo(() => {
    const set = new Set<string>()
    items.forEach(i => {
      const g = genreOf(i)
      if (g) g.split(',').forEach(x => set.add(x.trim()))
    })
    return [...set].sort()
  }, [items, genreEdits])

  useEffect(() => { setSelected(null) }, [contentResetKey])

  const filtered = items.filter((i) => {
    if (!i.title.toLowerCase().includes(query.toLowerCase())) return false
    if (activeGenres.size === 0) return true
    const genre = genreOf(i)
    if (!genre) return false
    const movieGenres = genre.split(',').map(g => g.trim())
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
            category="movies"
            items={filtered.map((i) => ({ ...i, subtitle: i.year?.toString() ?? undefined }))}
            onSelect={(item) => {
              // A click landing during the fade-out would be cleared by its timer.
              if (closing) return
              setSelected({
                title: item.title,
                year: item.year ?? null,
                posterPath: item.posterPath ?? null,
                filePath: item.filePath ?? '',
                genre: item.genre ?? null
              })
            }}
            suspended={!!selected}
            emptyMessage="No movies found. Add .mkv or .mp4 files to media/movies/ and scan your library."
          />
        </>
      )}

      {selected && (
        <MovieModal
          key={selected.filePath}
          title={selected.title}
          year={selected.year}
          posterPath={selected.posterPath}
          filePath={selected.filePath}
          genre={selected.filePath in genreEdits ? genreEdits[selected.filePath] : selected.genre}
          onGenreChange={(g) => setGenreEdits((prev) => ({ ...prev, [selected.filePath]: g }))}
          closing={closing}
          onClose={close}
        />
      )}
    </PageShell>
  )
}
