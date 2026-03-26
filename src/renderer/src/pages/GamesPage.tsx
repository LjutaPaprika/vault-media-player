import { useState } from 'react'
import PageShell from '../components/PageShell'
import MediaGrid from '../components/MediaGrid'
import { useLibrary } from '../hooks/useLibrary'

const PLATFORM_LABELS: Record<string, string> = {
  pc: 'PC',
  n64: 'Nintendo 64',
  gamecube: 'GameCube',
  wii: 'Wii',
  xbox360: 'Xbox 360',
  ps4: 'PS4',
  gba: 'Game Boy Advance',
  nds: 'Nintendo DS',
  snes: 'SNES'
}

export default function GamesPage(): JSX.Element {
  const { items, loading, error } = useLibrary('games')
  const [query, setQuery] = useState('')

  function handleSelect(item: MediaCard): void {
    if (item.filePath && item.platform) {
      window.api.playback.launchGame(item.filePath, item.platform)
    }
  }

  const filtered = items.filter((i) => i.title.toLowerCase().includes(query.toLowerCase()))

  return (
    <PageShell title="Games" searchValue={query} onSearch={setQuery}>
      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {!loading && !error && (
        <MediaGrid
          items={filtered.map((i) => ({
            ...i,
            subtitle: i.platform ? (PLATFORM_LABELS[i.platform] ?? i.platform) : undefined
          }))}
          onSelect={handleSelect}
          emptyMessage="No games found. Add games to games/pc/ or games/roms/ and scan your library."
        />
      )}
    </PageShell>
  )
}
