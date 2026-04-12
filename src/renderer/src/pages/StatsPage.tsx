import { useState, useEffect } from 'react'
import PageShell from '../components/PageShell'
import styles from './StatsPage.module.css'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes >= 1e12) return `${(bytes / 1e12).toFixed(2)} TB`
  if (bytes >= 1e9)  return `${(bytes / 1e9).toFixed(1)} GB`
  if (bytes >= 1e6)  return `${(bytes / 1e6).toFixed(0)} MB`
  return `${(bytes / 1e3).toFixed(0)} KB`
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms
  if (diff < 60_000)      return 'just now'
  if (diff < 3_600_000)   return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000)  return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 2_592_000_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return new Date(ms).toLocaleDateString()
}

function epochAgo(epoch: number): string {
  return timeAgo(epoch * 1000)
}

const CATEGORY_LABEL: Record<string, string> = {
  movies: 'Movies', tv: 'TV Shows', anime: 'Anime',
  music: 'Playlists', books: 'Books', manga: 'Manga', games: 'Games'
}

const CATEGORY_ICON: Record<string, string> = {
  movies: '🎬', tv: '📺', anime: '⛩️',
  music: '🎵', books: '📖', manga: '📚', games: '🎮'
}

const PLATFORM_LABEL: Record<string, string> = {
  pc: 'PC', n64: 'N64', snes: 'SNES', gb: 'Game Boy', gbc: 'Game Boy Color',
  gba: 'GBA', nds: 'DS', gamecube: 'GameCube', wii: 'Wii',
  xbox360: 'Xbox 360', ps4: 'PS4', mame: 'Arcade (MAME)'
}

// ─── Sub-components ───────────────────────────────────────────────────────────

const CARD_ORDER = ['movies', 'tv', 'anime', 'music', 'manga', 'books', 'games']

function LibraryOverview({ stats }: { stats: LibraryStats }): JSX.Element {
  return (
    <section className={`${styles.section} ${styles.sectionFull}`}>
      <h2 className={styles.sectionTitle}>Library Overview</h2>
      <div className={styles.cardGrid}>
        {CARD_ORDER.map((cat) => {
          // Determine the primary count and optional sub-label
          let count: number
          let sub: string | null = null

          if (cat === 'tv' || cat === 'anime' || cat === 'manga') {
            // Show series count (distinct shows / series), not episode/chapter count
            count = stats.seriesCounts[cat] ?? 0
          } else if (cat === 'music') {
            count = stats.counts[cat] ?? 0
            const tracks = stats.storage?.musicTrackCount
            if (tracks != null && tracks > 0) sub = `${tracks.toLocaleString()} songs`
          } else {
            count = stats.counts[cat] ?? 0
          }

          if (count === 0) return null

          return (
            <div key={cat} className={styles.card}>
              <span className={styles.cardIcon}>{CATEGORY_ICON[cat]}</span>
              <span className={styles.cardCount}>{count.toLocaleString()}</span>
              <span className={styles.cardLabel}>{CATEGORY_LABEL[cat]}</span>
              {sub && <span className={styles.cardSub}>{sub}</span>}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function StorageSection({ storage, driveInfo }: {
  storage: LibraryStats['storage']
  driveInfo: AppInfo['driveInfo']
}): JSX.Element {
  if (!storage) {
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Storage</h2>
        <p className={styles.muted}>Run a library scan to compute storage usage.</p>
      </section>
    )
  }

  const { total, byCategory, computedAt } = storage
  const sorted = Object.entries(byCategory)
    .filter(([, b]) => b > 0)
    .sort(([, a], [, b]) => b - a)

  const driveFree = driveInfo?.freeBytes ?? null
  const driveTotal = driveInfo?.totalBytes ?? null

  return (
    <section className={styles.section}>
      <div className={styles.sectionHeader}>
        <h2 className={styles.sectionTitle}>Storage</h2>
        <span className={styles.muted} style={{ fontSize: 11 }}>Updated {timeAgo(computedAt)}</span>
      </div>
      <div className={styles.storageTotalRow}>
        <span className={styles.storageTotal}>{formatBytes(total)}</span>
        {driveFree !== null && driveTotal !== null && (
          <span className={styles.driveFree}>
            {formatBytes(driveFree)} free on drive
            <span className={styles.sysMuted}> / {formatBytes(driveTotal)}</span>
          </span>
        )}
      </div>
      <div className={styles.storageBars}>
        {sorted.map(([cat, bytes]) => {
          const pct = total > 0 ? (bytes / total) * 100 : 0
          return (
            <div key={cat} className={styles.storageRow}>
              <span className={styles.storageLabel}>
                {CATEGORY_ICON[cat] ?? '📁'} {CATEGORY_LABEL[cat] ?? cat}
              </span>
              <div className={styles.barTrack}>
                <div className={styles.barFill} style={{ width: `${pct}%` }} />
              </div>
              <span className={styles.storageValue}>{formatBytes(bytes)}</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function PlatformsSection({ platforms }: { platforms: LibraryStats['platforms'] }): JSX.Element | null {
  if (platforms.length === 0) return null
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Games by Platform</h2>
      <div className={styles.platformList}>
        {platforms.map(({ platform, count }) => (
          <div key={platform} className={styles.platformRow}>
            <span className={styles.platformLabel}>{PLATFORM_LABEL[platform] ?? platform}</span>
            <span className={styles.platformCount}>{count}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function RecentlyOpened({ items }: { items: LibraryStats['recentlyOpened'] }): JSX.Element {
  if (items.length === 0) {
    return (
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Recently Opened</h2>
        <p className={styles.muted}>Nothing opened yet.</p>
      </section>
    )
  }
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Recently Opened</h2>
      <div className={styles.recentList}>
        {items.map((item, i) => (
          <div key={i} className={styles.recentRow}>
            <span className={styles.recentIcon}>{CATEGORY_ICON[item.category] ?? '📁'}</span>
            <span className={styles.recentTitle}>{item.title}</span>
            <span className={styles.recentTime}>{epochAgo(item.lastOpenedAt)}</span>
          </div>
        ))}
      </div>
    </section>
  )
}

function SystemSection({ info }: { info: SystemInfo }): JSX.Element {
  const dedicatedGpu = info.gpus.find((g) => g.dedicated)
  const gpuDisplay = dedicatedGpu
    ? `${dedicatedGpu.name} (${dedicatedGpu.vramMB >= 1024 ? `${(dedicatedGpu.vramMB / 1024).toFixed(0)} GB` : `${dedicatedGpu.vramMB} MB`})`
    : info.gpus[0]?.name ?? 'Unknown'

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>System</h2>
      <div className={styles.sysGrid}>
        <span className={styles.sysLabel}>CPU</span>
        <span className={styles.sysValue}>{info.cpuModel} · {info.cpuCores} threads</span>
        <span className={styles.sysLabel}>RAM</span>
        <span className={styles.sysValue}>{info.ramGB} GB</span>
        <span className={styles.sysLabel}>GPU</span>
        <span className={styles.sysValue}>{gpuDisplay}</span>
      </div>
    </section>
  )
}

function AppSection({ appInfo }: { appInfo: AppInfo }): JSX.Element {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>App</h2>
      <div className={styles.sysGrid}>
        <span className={styles.sysLabel}>Version</span>
        <span className={styles.sysValue}>{appInfo.version}</span>
        <span className={styles.sysLabel}>Memory</span>
        <span className={styles.sysValue}>{appInfo.memoryMB} MB</span>
        <span className={styles.sysLabel}>Database</span>
        <span className={styles.sysValue}>{formatBytes(appInfo.dbSize)}</span>
      </div>
    </section>
  )
}

function RuntimeSection({ appInfo }: { appInfo: AppInfo }): JSX.Element {
  const { runtime, tools } = appInfo
  // Trim patch version for display: "130.0.6723.191" → "130.0"
  function trimVer(v: string): string {
    const parts = v.split('.')
    return parts.slice(0, 2).join('.')
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>Runtime & Tools</h2>
      <div className={styles.sysGrid}>
        <span className={styles.sysLabel}>Electron</span>
        <span className={styles.sysValue}>{trimVer(runtime.electron)}</span>
        <span className={styles.sysLabel}>Node</span>
        <span className={styles.sysValue}>{trimVer(runtime.node)}</span>
        <span className={styles.sysLabel}>Chromium</span>
        <span className={styles.sysValue}>{trimVer(runtime.chrome)}</span>
      </div>
      <div className={styles.toolList}>
        <div className={styles.toolRow}>
          <span className={styles.toolName}>ffprobe</span>
          <span className={tools.ffprobe ? styles.toolFound : styles.toolMissing}>
            {tools.ffprobe ? '✓ Found' : '✗ Not found'}
          </span>
        </div>
        <div className={styles.toolRow}>
          <span className={styles.toolName}>yt-dlp</span>
          <span className={tools.ytdlp ? styles.toolFound : styles.toolMissing}>
            {tools.ytdlp ? '✓ Found' : '✗ Not found'}
          </span>
        </div>
      </div>
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StatsPage(): JSX.Element {
  const [stats, setStats] = useState<LibraryStats | null>(null)
  const [sysInfo, setSysInfo] = useState<SystemInfo | null>(null)
  const [appInfo, setAppInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    window.api.library.getStats().then(setStats)
    window.api.system.getInfo().then(setSysInfo)
    window.api.system.getAppInfo().then(setAppInfo)
  }, [])

  if (!stats) {
    return (
      <PageShell title="Stats">
        <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>
      </PageShell>
    )
  }

  return (
    <PageShell title="Stats">
      <div className={styles.layout}>
        <LibraryOverview stats={stats} />
        <StorageSection storage={stats.storage} driveInfo={appInfo?.driveInfo ?? null} />
        <RecentlyOpened items={stats.recentlyOpened} />
        <PlatformsSection platforms={stats.platforms} />
        {sysInfo && <SystemSection info={sysInfo} />}
        {appInfo && <AppSection appInfo={appInfo} />}
        {appInfo && <RuntimeSection appInfo={appInfo} />}
      </div>
    </PageShell>
  )
}
