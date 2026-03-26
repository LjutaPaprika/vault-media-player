import { useState } from 'react'
import PageShell from '../components/PageShell'
import PosterImage from '../components/PosterImage'
import AlbumDetailPage from './AlbumDetailPage'
import { useLibrary } from '../hooks/useLibrary'
import styles from './MusicPage.module.css'

interface SelectedAlbum {
  title: string
  artist: string
  year: number | null
  artPath: string | null
  firstTrackPath: string
}

export default function MusicPage(): JSX.Element {
  const { items, loading, error } = useLibrary('music')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<SelectedAlbum | null>(null)

  if (selected) {
    return (
      <AlbumDetailPage
        albumTitle={selected.title}
        artist={selected.artist}
        year={selected.year}
        artPath={selected.artPath}
        firstTrackPath={selected.firstTrackPath}
        onBack={() => setSelected(null)}
      />
    )
  }

  const filtered = items.filter((i) =>
    i.title.toLowerCase().includes(query.toLowerCase()) ||
    (i.genre ?? '').toLowerCase().includes(query.toLowerCase())
  )

  return (
    <PageShell title="Music" searchValue={query} onSearch={setQuery}>
      {loading && <p style={{ color: 'var(--text-muted)', padding: '24px' }}>Loading...</p>}
      {error   && <p style={{ color: 'var(--danger)',     padding: '24px' }}>{error}</p>}
      {!loading && !error && filtered.length === 0 && (
        <p style={{ color: 'var(--text-muted)', padding: '24px' }}>
          {items.length === 0 ? 'No music found. Add artist folders to media/music/ and scan your library.' : 'No results.'}
        </p>
      )}
      {!loading && !error && filtered.length > 0 && (
        <div className={styles.grid}>
          {filtered.map((item) => (
            <button
              key={item.id}
              className={styles.card}
              onClick={() => setSelected({
                title:          item.title,
                artist:         item.genre ?? '',
                year:           item.year ?? null,
                artPath:        item.posterPath ?? null,
                firstTrackPath: item.filePath ?? ''
              })}
            >
              <div className={styles.art}>
                {item.posterPath
                  ? <PosterImage filePath={item.posterPath} title={item.title} />
                  : <div className={styles.artPlaceholder}>{item.title.charAt(0)}</div>
                }
                <div className={styles.playOverlay}>
                  <svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                </div>
              </div>
              <div className={styles.info}>
                <span className={styles.albumTitle}>{item.title}</span>
                <span className={styles.artist}>{item.genre ?? ''}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </PageShell>
  )
}
