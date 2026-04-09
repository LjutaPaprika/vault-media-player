import { useEffect, useState } from 'react'
import PageShell from '../components/PageShell'
import MediaGrid from '../components/MediaGrid'
import BookReaderPage from './BookReaderPage'
import PDFReaderPage from './PDFReaderPage'
import MangaDetailPage from './MangaDetailPage'
import MangaReaderPage from './MangaReaderPage'
import { useLibrary } from '../hooks/useLibrary'
import { useAppStore } from '../store/appStore'

// Group key is the parent folder name — always the series name regardless of filename format
function getSeriesName(filePath: string): string {
  const parts = filePath.replace(/\\/g, '/').split('/')
  return parts[parts.length - 2] ?? ''
}

function detectUnit(vols: MediaItem[]): { singular: string; plural: string } {
  const titles = vols.map((v) => v.title.toLowerCase())
  if (titles.some((t) => /(?:^|[\s_])ch(apter|\.)/.test(t))) return { singular: 'chapter', plural: 'chapters' }
  if (titles.some((t) => /(?:^|[\s_])vol(ume|\.)/.test(t))) return { singular: 'volume', plural: 'volumes' }
  return { singular: 'entry', plural: 'entries' }
}

function groupBySeries(items: MediaItem[]): Map<string, MediaItem[]> {
  const map = new Map<string, MediaItem[]>()
  for (const item of items) {
    const series = getSeriesName(item.filePath)
    if (!map.has(series)) map.set(series, [])
    map.get(series)!.push(item)
  }
  for (const vols of map.values()) {
    vols.sort((a, b) => a.title.localeCompare(b.title, undefined, { numeric: true }))
  }
  return map
}

export default function MangaPage(): JSX.Element {
  const { items, loading, error } = useLibrary('manga')
  const { contentResetKey }       = useAppStore()
  const [query,           setQuery]           = useState('')
  const [selectedSeries,  setSelectedSeries]  = useState<string | null>(null)
  const [selectedBook,    setSelectedBook]     = useState<MediaItem | null>(null)
  const [selectedPdf,     setSelectedPdf]      = useState<MediaItem | null>(null)
  const [lastOpenedMap,   setLastOpenedMap]    = useState<Record<string, number>>({})
  const [selectedCbz,     setSelectedCbz]      = useState<MediaItem | null>(null)

  useEffect(() => { setSelectedSeries(null); setSelectedBook(null); setSelectedPdf(null); setSelectedCbz(null) }, [contentResetKey])

  const ext = (path: string): string => path.slice(path.lastIndexOf('.')).toLowerCase()

  if (selectedCbz) {
    return (
      <MangaReaderPage
        filePath={selectedCbz.filePath}
        title={selectedCbz.title}
        onBack={() => setSelectedCbz(null)}
      />
    )
  }

  if (selectedPdf) {
    return (
      <PDFReaderPage
        filePath={selectedPdf.filePath}
        title={selectedPdf.title}
        onBack={() => setSelectedPdf(null)}
      />
    )
  }

  if (selectedBook) {
    return (
      <BookReaderPage
        filePath={selectedBook.filePath}
        title={selectedBook.title}
        isManga
        onBack={() => setSelectedBook(null)}
      />
    )
  }

  const grouped = groupBySeries(items)

  if (selectedSeries) {
    const volumes = (grouped.get(selectedSeries) ?? []).map((vol) =>
      lastOpenedMap[vol.filePath] !== undefined
        ? { ...vol, lastOpenedAt: lastOpenedMap[vol.filePath] }
        : vol
    )
    return (
      <MangaDetailPage
        seriesName={selectedSeries}
        volumes={volumes}
        onBack={() => setSelectedSeries(null)}
        onSelect={(vol) => {
          const now = Math.floor(Date.now() / 1000)
          window.api.library.markOpened(vol.filePath)
          setLastOpenedMap((prev) => ({ ...prev, [vol.filePath]: now }))
          if (ext(vol.filePath) === '.epub') setSelectedBook(vol)
          else if (ext(vol.filePath) === '.pdf') setSelectedPdf(vol)
          else setSelectedCbz(vol)
        }}
      />
    )
  }

  // Build series cards for MediaGrid
  const filteredSeries = Array.from(grouped.entries())
    .filter(([name]) => name.toLowerCase().includes(query.toLowerCase()))

  const seriesCards: MediaCard[] = filteredSeries.map(([name, vols]) => {
    const { singular, plural } = detectUnit(vols)
    return {
      id: vols[0].id,
      title: name,
      subtitle: `${vols.length} ${vols.length !== 1 ? plural : singular}`,
      posterPath: vols[0].posterPath,
    }
  })

  return (
    <PageShell title="Manga" searchValue={query} onSearch={setQuery}>
      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {!loading && !error && (
        <MediaGrid
          items={seriesCards}
          onSelect={(card) => {
            const name = card.title
            const vols = grouped.get(name) ?? []
            if (vols.length === 1) {
              // Single volume — open directly
              const vol = vols[0]
              window.api.library.markOpened(vol.filePath)
              if (ext(vol.filePath) === '.epub') setSelectedBook(vol)
              else if (ext(vol.filePath) === '.pdf') setSelectedPdf(vol)
              else setSelectedCbz(vol)
            } else {
              setSelectedSeries(name)
            }
          }}
          emptyMessage="No manga found. Add .cbz, .cbr, .epub or .pdf files to media/manga/ and scan your library."
        />
      )}
    </PageShell>
  )
}
