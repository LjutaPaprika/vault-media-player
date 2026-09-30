import { useEffect, useState } from 'react'
import PageShell from '../components/PageShell'
import MediaGrid from '../components/MediaGrid'
import BookReaderPage from './BookReaderPage'
import { useLibrary } from '../hooks/useLibrary'
import { useAppStore } from '../store/appStore'
import { startPosition, watchState } from '../utils/resume'

export default function BooksPage(): JSX.Element {
  const { items, loading, error } = useLibrary('books')
  const { contentResetKey }       = useAppStore()
  const [query,        setQuery]        = useState('')
  const [selectedBook, setSelectedBook] = useState<MediaItem | null>(null)
  const [startAt,      setStartAt]      = useState(0)

  useEffect(() => { setSelectedBook(null) }, [contentResetKey])

  if (selectedBook) {
    return (
      <BookReaderPage
        filePath={selectedBook.filePath}
        startAt={startAt}
        onBack={() => setSelectedBook(null)}
      />
    )
  }

  const filtered = items.filter((i) => i.title.toLowerCase().includes(query.toLowerCase()))

  return (
    <PageShell title="Books" searchValue={query} onSearch={setQuery}>
      {loading && <p style={{ color: 'var(--text-muted)', padding: '24px' }}>Loading…</p>}
      {error   && <p style={{ color: 'var(--danger)',     padding: '24px' }}>{error}</p>}
      {!loading && !error && (
        <MediaGrid
          category="books"
          items={filtered.map(i => ({
            id:         i.id,
            title:      i.title,
            subtitle:   i.genre ?? undefined,
            posterPath: i.posterPath
          }))}
          onSelect={(card) => {
            const item = items.find(i => i.id === card.id)
            if (!item) return
            // Reopen where the book was left.
            window.api.playback.getProgress([item.filePath]).then((p) => {
              setStartAt(startPosition(watchState(p[item.filePath], 0, 'books')))
              setSelectedBook(item)
            })
          }}
          emptyMessage="No books found. Add a folder per book to media/books/ and scan."
        />
      )}
    </PageShell>
  )
}
