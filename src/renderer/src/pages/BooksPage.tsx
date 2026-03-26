import { useState } from 'react'
import PageShell from '../components/PageShell'
import MediaGrid from '../components/MediaGrid'
import { useLibrary } from '../hooks/useLibrary'

export default function BooksPage(): JSX.Element {
  const { items, loading, error } = useLibrary('books')
  const [query, setQuery] = useState('')

  const filtered = items.filter((i) => i.title.toLowerCase().includes(query.toLowerCase()))

  function handleSelect(_item: MediaCard): void {
    // Book reader will be wired in playback integration task
  }

  return (
    <PageShell title="Books" searchValue={query} onSearch={setQuery}>
      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {!loading && !error && (
        <MediaGrid
          items={filtered}
          onSelect={handleSelect}
          emptyMessage="No books found. Add .epub or .pdf files to media/books/ and scan your library."
        />
      )}
    </PageShell>
  )
}
