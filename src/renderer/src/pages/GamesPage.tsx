import { useState, useEffect } from 'react'
import PageShell from '../components/PageShell'
import MediaGrid from '../components/MediaGrid'
import GameLaunchModal, { type CompareRow, type Status } from '../components/GameLaunchModal'
import { usePosterModal } from '../components/PosterModal'
import { useLibrary } from '../hooks/useLibrary'
import { useOpenRequest } from '../store/appStore'

const PLATFORM_LABELS: Record<string, string> = {
  pc:       'PC',
  n64:      'Nintendo 64',
  gamecube: 'GameCube',
  wii:      'Wii',
  xbox:     'Xbox',
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
  xbox:     'xemu',
  xbox360:  'Xenia Canary',
  ps4:      'ShadPS4',
  gba:      'mGBA',
  nds:      'melonDS',
  snes:     'Snes9x',
  gb:       'mGBA',
  gbc:      'mGBA',
  mame:     'MAME'
}

// Wall-clock time the game's process (or its emulator) was running. Undercounts
// paused/idle time but matches how Steam tallies playtime.
function formatPlaytime(seconds: number | undefined): string | null {
  if (!seconds || seconds < 60) return null
  const hours   = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  if (hours === 0) return `${minutes}m`
  if (minutes === 0) return `${hours}h`
  return `${hours}h ${minutes}m`
}

// What each emulator asks of the CPU, from the projects' own requirement pages.
// Below `min` threads it may not run (fail); below `rec` it may struggle (warn).
//   Xenia Canary quickstart: x86-64 with AVX (AVX2 better), 6+ cores recommended.
//   shadPS4 FAQ: 4 cores / 6 threads, x86-64-v3 (Intel Haswell / AMD Excavator
//   or newer), which includes AVX2.
//   Dolphin: dual core; xemu has no published minimum, so it gets Dolphin's.
interface CpuNeed { min: number; rec: number; needs?: 'avx' | 'avx2'; text: string }
const EMULATOR_CPU: Record<string, CpuNeed> = {
  xbox360:  { min: 4, rec: 6, needs: 'avx',  text: 'AVX support, 4+ threads (6+ cores recommended)' },
  ps4:      { min: 6, rec: 8, needs: 'avx2', text: 'AVX2 (Intel 4th gen / Ryzen or newer), 6+ threads' },
  gamecube: { min: 2, rec: 4, text: 'Dual core (quad core recommended)' },
  wii:      { min: 2, rec: 4, text: 'Dual core (quad core recommended)' },
  xbox:     { min: 2, rec: 4, text: 'Dual core (quad core recommended)' }
}
const RETRO_CPU: CpuNeed = { min: 2, rec: 2, text: 'Any dual-core CPU' }

const worst = (a: Status, b: Status): Status => {
  const rank: Record<Status, number> = { info: 0, ok: 1, warn: 2, fail: 3 }
  return rank[a] >= rank[b] ? a : b
}

/** A CPU row from a thread count and an optional instruction-set need. */
function cpuRow(sys: SystemInfo, required: string, threadStatus: Status, needs: 'avx' | 'avx2' | null): CompareRow {
  let status = threadStatus
  let featureNote = ''
  if (needs) {
    const has = sys.cpuFeatures?.[needs] ?? null
    const name = needs.toUpperCase()
    // Unknown (macOS, or a Windows too old to say) is never shown as a pass.
    if (has === false) { status = 'fail'; featureNote = `, no ${name}` }
    else if (has === null) { status = worst(status, 'warn'); featureNote = `, ${name} not verified` }
    else featureNote = `, ${name}`
  }
  return {
    label:  'CPU',
    required,
    actual: `${sys.cpuModel} (${sys.cpuCores} threads${featureNote})`,
    status
  }
}

/** Rows for a PC game, judged against the minimum specs in its game.json. */
function pcRows(sys: SystemInfo, req: GameRequirements | null, bestGpu: GpuInfo | null, vramGB: number): CompareRow[] {
  const rows: CompareRow[] = []
  const noSpecs = 'No specs recorded for this game'

  if (req?.ramGB) {
    // Windows reports installed RAM minus what's reserved (integrated graphics
    // take a slice), so a 16 GB laptop can show 15 GB. Allow 10% for that.
    rows.push({
      label:    'RAM',
      required: `${req.ramGB} GB+`,
      actual:   `${sys.ramGB} GB`,
      status:   sys.ramGB >= req.ramGB * 0.9 ? 'ok' : sys.ramGB >= req.ramGB * 0.75 ? 'warn' : 'fail'
    })
  }

  if (!req || req.vramGB === null) {
    rows.push({ label: 'GPU', required: req?.gpu ?? noSpecs, actual: bestGpu ? bestGpu.name : 'Not detected', status: 'info' })
  } else {
    const need = req.vramGB
    const required = need === 0
      ? `${req.gpu ?? 'Any'} (integrated is fine)`
      : `${req.gpu ? `${req.gpu}, ` : ''}${need < 1 ? `${Math.round(need * 1024)} MB` : `${need} GB`} VRAM`
    const dedicated = bestGpu?.dedicated ?? false
    // An undetected GPU (macOS, or the PowerShell query failing) isn't judged.
    const status: Status = !bestGpu ? 'info'
      : need === 0 ? 'ok'
      : dedicated ? (vramGB >= need ? 'ok' : 'warn')
      : need <= 1 ? 'warn' : 'fail'
    rows.push({
      label: 'GPU',
      required,
      actual: bestGpu ? (dedicated ? `${bestGpu.name} (${vramGB} GB)` : `${bestGpu.name} (integrated)`) : 'Not detected',
      status
    })
  }

  if (!req || req.cpuThreads === null) {
    rows.push({ label: 'CPU', required: req?.cpu ?? noSpecs, actual: `${sys.cpuModel} (${sys.cpuCores} threads)`, status: 'info' })
  } else {
    // Thread count is a rough stand-in for the listed CPU: below it the game
    // may struggle, and well below it (under three quarters) it may not run.
    const min = req.cpuThreads
    const threads: Status = sys.cpuCores >= min ? 'ok' : sys.cpuCores >= min * 0.75 ? 'warn' : 'fail'
    const parts = [`${min}+ threads`, ...(req.avx2 ? ['AVX2'] : [])].join(', ')
    rows.push(cpuRow(sys, req.cpu ? `${req.cpu} (${parts})` : parts, threads, req.avx2 ? 'avx2' : null))
  }
  return rows
}

function buildComparison(platform: string, sys: SystemInfo, req: GameRequirements | null): CompareRow[] {
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

  if (platform === 'pc') return [...rows, ...pcRows(sys, req, bestGpu, vramGB)]

  // RAM
  const ramReqs: Record<string, number> = {
    xbox360: 8, ps4: 16, gamecube: 4, wii: 4, xbox: 4, n64: 2, nds: 2
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
  } else if (platform === 'gamecube' || platform === 'wii' || platform === 'xbox') {
    rows.push({
      label:    'GPU',
      required: 'Dedicated recommended',
      actual:   bestGpu ? gpuName : 'Not detected',
      status:   dedicated ? 'ok' : 'warn'
    })
  } else if (['n64', 'nds', 'gba', 'snes', 'gb', 'gbc', 'mame'].includes(platform)) {
    rows.push({
      label:    'GPU',
      required: 'Any',
      actual:   bestGpu ? gpuName : 'Not detected',
      status:   'ok'
    })
  }

  // CPU
  const cpu = EMULATOR_CPU[platform] ?? RETRO_CPU
  const threads: Status = sys.cpuCores >= cpu.rec ? 'ok' : sys.cpuCores >= cpu.min ? 'warn' : 'fail'
  rows.push(cpuRow(sys, cpu.text, threads, cpu.needs ?? null))

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
  playSeconds?: number
  posterPath?: string | null
}

export default function GamesPage(): JSX.Element {
  const { items, loading, error, reload } = useLibrary('games')
  const [query, setQuery]     = useState('')
  const [pending, setPending] = useState<PendingGame | null>(null)
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)
  const [launchError, setLaunchError] = useState<string | null>(null)
  const { closing, close: closeModal } = usePosterModal(() => setPending(null))

  useEffect(() => {
    window.api.system.getInfo().then(setSysInfo)
  }, [])

  // A PC game's minimum specs live in its game.json; read them each time its
  // modal opens, so an edit there shows without a rescan. Tagged with the
  // game's path so a quick switch can't show the previous game's specs.
  const [requirements, setRequirements] = useState<{ filePath: string; req: GameRequirements | null } | null>(null)
  useEffect(() => {
    if (pending?.platform !== 'pc') return
    const filePath = pending.filePath
    let live = true
    window.api.system.getGameRequirements(filePath)
      .catch(() => null)
      .then((req) => { if (live) setRequirements({ filePath, req }) })
    return () => { live = false }
  }, [pending?.filePath, pending?.platform])

  // Re-fetch the games list when playtime is saved so the card / launch
  // modal show the new playtime without needing a manual scan. The event
  // fires ~10 s after the game closes (its first missed check), and again
  // when the session ends a minute later.
  useEffect(() => {
    return window.api.playback.onPlaytimeUpdate(() => reload())
  }, [reload])

  // Home asked for a game: open its launch modal once the shelf has loaded.
  // Closing it, or launching the game, goes back to Home.
  const { backOr } = useOpenRequest('games', !loading, (req) => {
    const item = items.find((i) => i.filePath === req.filePath)
    if (item) handleSelect(item)
    return !!item
  })

  function handleSelect(item: MediaCard): void {
    // A click landing during the fade-out would be cleared by its timer.
    if (closing) return
    if (item.filePath && item.platform) {
      setLaunchError(null)
      setPending({ filePath: item.filePath, platform: item.platform, title: item.title, playSeconds: item.playSeconds, posterPath: item.posterPath })
    }
  }

  // The main process throws for anything it can't run here — a Windows .exe on
  // macOS, an emulator with no build for this OS. The PC shelf is now indexed
  // on every host, so that rejection is a normal thing for a user to hit and
  // has to be shown rather than lost as an unhandled rejection.
  async function handleLaunch(): Promise<void> {
    if (!pending) return
    setLaunchError(null)
    try {
      await window.api.playback.launchGame(pending.filePath, pending.platform)
      backOr(closeModal)
    } catch (e) {
      // ipcRenderer.invoke wraps the main-process error as
      // "Error invoking remote method 'playback:launchGame': Error: <real msg>".
      // Show only the part written for a human.
      const raw = e instanceof Error ? e.message : String(e)
      setLaunchError(raw.split(/Error:\s*/).pop()?.trim() || 'Launch failed.')
    }
  }

  const filtered    = items.filter((i) => i.title.toLowerCase().includes(query.toLowerCase()))
  // A PC game waits for its specs ("Detecting system specs…" meanwhile).
  const req         = pending && requirements?.filePath === pending.filePath ? requirements.req : undefined
  const comparison  = pending && sysInfo && (pending.platform !== 'pc' || req !== undefined)
    ? buildComparison(pending.platform, sysInfo, req ?? null)
    : null
  const warning     = pending ? PLATFORM_WARNINGS[pending.platform] : null
  const hasFail     = comparison?.some((r) => r.status === 'fail') ?? false

  return (
    <PageShell title="Games" searchValue={query} onSearch={setQuery}>
      {loading && <p style={{ color: 'var(--text-muted)' }}>Loading...</p>}
      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {!loading && !error && (
        <MediaGrid
          category="games"
          items={filtered.map((i) => ({
            ...i,
            subtitle: i.platform ? (PLATFORM_LABELS[i.platform] ?? i.platform) : undefined
          }))}
          onSelect={handleSelect}
          suspended={!!pending}
          emptyMessage="No games found. Add games to games/pc/ or games/roms/ and scan your library."
        />
      )}

      {pending && (
        <GameLaunchModal
          key={pending.filePath}
          title={pending.title}
          platform={PLATFORM_LABELS[pending.platform] ?? pending.platform}
          emulator={pending.platform === 'pc' ? null : (PLATFORM_EMULATOR[pending.platform] ?? null)}
          playtime={formatPlaytime(pending.playSeconds)}
          posterPath={pending.posterPath ?? null}
          comparison={comparison}
          warning={warning}
          launchError={launchError}
          hasFail={hasFail}
          closing={closing}
          onCancel={() => backOr(closeModal)}
          onLaunch={handleLaunch}
        />
      )}
    </PageShell>
  )
}
