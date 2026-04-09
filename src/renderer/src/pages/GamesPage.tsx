import { useState, useEffect } from 'react'
import PageShell from '../components/PageShell'
import MediaGrid from '../components/MediaGrid'
import { useLibrary } from '../hooks/useLibrary'
import styles from './GamesPage.module.css'

const PLATFORM_LABELS: Record<string, string> = {
  pc:       'PC',
  n64:      'Nintendo 64',
  gamecube: 'GameCube',
  wii:      'Wii',
  xbox360:  'Xbox 360',
  ps4:      'PS4',
  gba:      'Game Boy Advance',
  nds:      'Nintendo DS',
  snes:     'SNES',
  gb:       'Game Boy',
  gbc:      'Game Boy Color',
  mame:     'Arcade (MAME)'
}

const PLATFORM_EMULATOR: Record<string, string> = {
  pc:       'Native (no emulator)',
  n64:      'Simple64',
  gamecube: 'Dolphin',
  wii:      'Dolphin',
  xbox360:  'Xenia Canary',
  ps4:      'ShadPS4',
  gba:      'mGBA',
  nds:      'melonDS',
  snes:     'Snes9x',
  gb:       'mGBA',
  gbc:      'mGBA',
  mame:     'MAME'
}

type Status = 'ok' | 'warn' | 'fail' | 'info'

interface CompareRow {
  label: string
  required: string
  actual: string
  status: Status
}

function buildComparison(platform: string, sys: SystemInfo): CompareRow[] {
  const rows: CompareRow[] = []
  const dedicated = sys.gpus.find((g) => g.dedicated)
  const bestGpu   = dedicated ?? sys.gpus[0] ?? null
  const gpuName   = bestGpu ? bestGpu.name : 'Not detected'
  const vramGB    = bestGpu ? Math.round(bestGpu.vramMB / 1024) : 0
  const isWindows = sys.platform === 'win32'

  // OS check — only matters for Windows-only platforms
  if (platform === 'xbox360' || platform === 'ps4') {
    rows.push({
      label:    'OS',
      required: 'Windows only',
      actual:   isWindows ? 'Windows' : sys.platform === 'darwin' ? 'macOS' : 'Linux',
      status:   isWindows ? 'ok' : 'fail'
    })
  }

  // RAM
  const ramReqs: Record<string, number> = {
    xbox360: 8, ps4: 16, gamecube: 4, wii: 4, n64: 2, nds: 2
  }
  const minRam = ramReqs[platform]
  if (minRam) {
    rows.push({
      label:    'RAM',
      required: `${minRam} GB+`,
      actual:   `${sys.ramGB} GB`,
      status:   sys.ramGB >= minRam ? 'ok' : sys.ramGB >= minRam * 0.75 ? 'warn' : 'fail'
    })
  }

  // GPU
  if (platform === 'xbox360') {
    rows.push({
      label:    'GPU',
      required: 'Dedicated (GTX 950+ / RX 470+)',
      actual:   bestGpu ? `${gpuName} (${vramGB} GB)` : 'Not detected',
      status:   dedicated ? 'ok' : 'fail'
    })
  } else if (platform === 'ps4') {
    const ok   = !!dedicated && vramGB >= 8
    const warn = !!dedicated && vramGB >= 4
    rows.push({
      label:    'GPU',
      required: 'High-end dedicated (8 GB+ VRAM)',
      actual:   bestGpu ? `${gpuName} (${vramGB} GB)` : 'Not detected',
      status:   ok ? 'ok' : warn ? 'warn' : 'fail'
    })
  } else if (platform === 'gamecube' || platform === 'wii') {
    rows.push({
      label:    'GPU',
      required: 'Dedicated recommended',
      actual:   bestGpu ? gpuName : 'Not detected',
      status:   dedicated ? 'ok' : 'warn'
    })
  } else if (['n64', 'nds', 'gba', 'snes', 'gb', 'gbc', 'mame', 'pc'].includes(platform)) {
    rows.push({
      label:    'GPU',
      required: 'Any',
      actual:   bestGpu ? gpuName : 'Not detected',
      status:   'ok'
    })
  }

  // CPU — always show for context, no pass/fail (AVX2 detection isn't reliable)
  rows.push({
    label:    'CPU',
    required: platform === 'xbox360' ? 'AVX2 support (Intel 4th gen+ / Ryzen)' : 'Any modern CPU',
    actual:   `${sys.cpuModel} (${sys.cpuCores} threads)`,
    status:   'info'
  })

  return rows
}

const PLATFORM_WARNINGS: Record<string, string> = {
  xbox360: 'Integrated graphics will not run Xbox 360 games. A dedicated NVIDIA or AMD GPU is required. Will not launch on Mac or Linux.',
  ps4:     'PS4 emulation is experimental and very demanding. Only high-end machines should attempt this. Will not launch on Mac or Linux.'
}

interface PendingGame {
  filePath: string
  platform: string
  title: string
}

const STATUS_ICON: Record<Status, string> = { ok: '✓', warn: '⚠', fail: '✗', info: '·' }
const STATUS_COLOR: Record<Status, string> = {
  ok:   'var(--text-success, #4caf50)',
  warn: '#ffaa00',
  fail: 'var(--danger, #e05252)',
  info: 'var(--text-muted)'
}

export default function GamesPage(): JSX.Element {
  const { items, loading, error } = useLibrary('games')
  const [query, setQuery]     = useState('')
  const [pending, setPending] = useState<PendingGame | null>(null)
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)

  useEffect(() => {
    window.api.system.getInfo().then(setSysInfo)
  }, [])

  function handleSelect(item: MediaCard): void {
    if (item.filePath && item.platform) {
      setPending({ filePath: item.filePath, platform: item.platform, title: item.title })
    }
  }

  function handleLaunch(): void {
    if (!pending) return
    window.api.playback.launchGame(pending.filePath, pending.platform)
    setPending(null)
  }

  const filtered    = items.filter((i) => i.title.toLowerCase().includes(query.toLowerCase()))
  const comparison  = pending && sysInfo ? buildComparison(pending.platform, sysInfo) : null
  const warning     = pending ? PLATFORM_WARNINGS[pending.platform] : null
  const hasFail     = comparison?.some((r) => r.status === 'fail') ?? false

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

      {pending && (
        <div className={styles.overlay} onClick={() => setPending(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>

            <div className={styles.header}>
              <span className={styles.gameTitle}>{pending.title}</span>
              <span className={styles.platformBadge}>
                {PLATFORM_LABELS[pending.platform] ?? pending.platform}
                {' · '}
                {PLATFORM_EMULATOR[pending.platform] ?? pending.platform}
              </span>
            </div>

            <div className={styles.divider} />

            <div className={styles.compareHeader}>
              <span />
              <span className={styles.colHead}>Required</span>
              <span className={styles.colHead}>Your System</span>
            </div>

            {!sysInfo && (
              <p className={styles.detecting}>Detecting system specs...</p>
            )}

            {comparison && comparison.map((row) => (
              <div key={row.label} className={styles.compareRow}>
                <span className={styles.compareLabel}>{row.label}</span>
                <span className={styles.compareRequired}>{row.required}</span>
                <span className={styles.compareActual}>
                  <span style={{ color: STATUS_COLOR[row.status], marginRight: 5, fontWeight: 600 }}>
                    {STATUS_ICON[row.status]}
                  </span>
                  {row.actual}
                </span>
              </div>
            ))}

            {warning && (
              <>
                <div className={styles.divider} />
                <div className={styles.warning}>{warning}</div>
              </>
            )}

            <div className={styles.actions}>
              <button className={styles.btnCancel} onClick={() => setPending(null)}>Cancel</button>
              <button
                className={hasFail ? styles.btnLaunchWarn : styles.btnLaunch}
                onClick={handleLaunch}
              >
                {hasFail ? 'Launch Anyway' : 'Launch'}
              </button>
            </div>

          </div>
        </div>
      )}
    </PageShell>
  )
}
