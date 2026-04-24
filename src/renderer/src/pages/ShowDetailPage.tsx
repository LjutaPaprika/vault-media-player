import { useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import PosterImage from '../components/PosterImage'
import { useController } from '../hooks/useController'
import { useAppStore } from '../store/appStore'
import styles from './ShowDetailPage.module.css'

interface Props {
  seriesTitle: string
  year: number | null
  posterPath: string | null
  category: string
  onBack: () => void
}

interface ParsedEpisode {
  id: number
  season: number
  episode: number
  badge: string
  title: string
  filePath: string
}

function parseEpisode(item: MediaItem): ParsedEpisode {
  // Full format: "S01E01 · Title"
  const full = item.description?.match(/^(S(\d+)E(\d+))\s*·\s*(.+)$/)
  if (full) {
    return {
      id: item.id,
      season: parseInt(full[2], 10),
      episode: parseInt(full[3], 10),
      badge: full[1],
      title: full[4],
      filePath: item.filePath
    }
  }
  // Badge-only format: "S01E01" (no title in filename)
  const badge = item.description?.match(/^(S(\d+)E(\d+))$/)
  if (badge) {
    return {
      id: item.id,
      season: parseInt(badge[2], 10),
      episode: parseInt(badge[3], 10),
      badge: badge[1],
      title: `Episode ${parseInt(badge[3], 10)}`,
      filePath: item.filePath
    }
  }
  return { id: item.id, season: 0, episode: 0, badge: '', title: item.description ?? item.title, filePath: item.filePath }
}

type NavItem =
  | { kind: 'header'; seasonNum: number }
  | { kind: 'episode'; ep: ParsedEpisode }
  | { kind: 'extra'; item: MediaItem }

function formatResolution(height: number): string {
  if (height >= 2160) return '4K'
  if (height >= 1080) return '1080p'
  if (height >= 720) return '720p'
  if (height >= 480) return '480p'
  return height ? `${height}p` : ''
}

function formatCodec(codec: string): string {
  const map: Record<string, string> = {
    hevc: 'H.265', h265: 'H.265', h264: 'H.264', avc: 'H.264',
    av1: 'AV1', vp9: 'VP9', mpeg4: 'MPEG-4', mpeg2video: 'MPEG-2'
  }
  return map[codec.toLowerCase()] ?? codec.toUpperCase()
}

function formatChannels(n: number): string {
  if (n === 1) return 'Mono'
  if (n === 2) return 'Stereo'
  if (n === 6) return '5.1'
  if (n === 8) return '7.1'
  return `${n}ch`
}

function formatLang(code: string): string {
  const map: Record<string, string> = {
    eng: 'English', jpn: 'Japanese', fre: 'French', fra: 'French',
    spa: 'Spanish', ger: 'German', deu: 'German', ita: 'Italian',
    por: 'Portuguese', rus: 'Russian', chi: 'Chinese', zho: 'Chinese',
    kor: 'Korean', ara: 'Arabic', hin: 'Hindi', und: 'Unknown'
  }
  return map[code.toLowerCase()] ?? code.toUpperCase()
}

function formatAudioCodec(codec: string): string {
  const map: Record<string, string> = {
    dts: 'DTS', ac3: 'AC3', eac3: 'E-AC3', aac: 'AAC',
    mp3: 'MP3', flac: 'FLAC', truehd: 'TrueHD', opus: 'Opus', vorbis: 'Vorbis'
  }
  return map[codec.toLowerCase()] ?? codec.toUpperCase()
}

export default function ShowDetailPage({ seriesTitle, year, posterPath, category, onBack }: Props): JSX.Element {
  const { setFocusZone } = useAppStore()
  const [episodes, setEpisodes] = useState<MediaItem[]>([])
  const [extras, setExtras] = useState<MediaItem[]>([])
  const [techInfo, setTechInfo] = useState<MediaTechInfo | null>(null)
  const [watchOrder, setWatchOrder] = useState<WatchOrderData | null>(null)
  const [watchGuide, setWatchGuide] = useState<string[] | null>(null)
  const [launchingPath, setLaunchingPath] = useState<string | null>(null)
  const [collapsedSeasons, setCollapsedSeasons] = useState<Set<number>>(new Set())
  const [focusedIdx, setFocusedIdx] = useState(0)
  const focusedIdxRef = useRef(0)
  const rowRefs = useRef<(HTMLButtonElement | null)[]>([])
  const navItemsRef = useRef<NavItem[]>([])
  // When a season is toggled, store it here so the effect can re-focus the header
  const pendingFocusSeasonRef = useRef<number | null>(null)

  useEffect(() => {
    window.api.library.getItems(category).then((all) => {
      const eps = all.filter((i) => i.title === seriesTitle)
      setEpisodes(eps)
      if (eps.length > 0 && eps[0].filePath) {
        window.api.library.getTechInfo(eps[0].filePath).then(setTechInfo)
      }
    })
    window.api.library.getExtras(seriesTitle).then(setExtras)
    window.api.library.getWatchOrder(seriesTitle, category).then(setWatchOrder)
    window.api.library.getWatchGuide(seriesTitle, category).then(setWatchGuide)
  }, [seriesTitle])

  function playFile(filePath: string): void {
    flushSync(() => setLaunchingPath(filePath))
    setTimeout(() => setLaunchingPath(null), 1500)
    window.api.playback.openVideo(filePath, category)
    const now = Math.floor(Date.now() / 1000)
    setEpisodes((prev) => prev.map((ep) => ep.filePath === filePath ? { ...ep, lastOpenedAt: now } : ep))
  }

  function focusRow(idx: number): void {
    const items = navItemsRef.current
    const clamped = Math.max(0, Math.min(items.length - 1, idx))
    focusedIdxRef.current = clamped
    setFocusedIdx(clamped)
    rowRefs.current[clamped]?.focus()
    rowRefs.current[clamped]?.scrollIntoView({ block: 'nearest' })
  }

  function toggleSeason(n: number): void {
    pendingFocusSeasonRef.current = n
    setCollapsedSeasons((prev) => {
      const next = new Set(prev)
      if (next.has(n)) next.delete(n)
      else next.add(n)
      return next
    })
  }

  const parsed = useMemo(() =>
    episodes.map(parseEpisode).sort((a, b) =>
      a.season !== b.season ? a.season - b.season : a.episode - b.episode
    ),
    [episodes]
  )

  const lastWatchedId = useMemo(() => {
    return episodes.reduce<MediaItem | null>(
      (best, ep) => ((ep.lastOpenedAt ?? 0) > (best?.lastOpenedAt ?? 0) ? ep : best),
      null
    )?.id ?? -1
  }, [episodes])

  const seriesComplete = useMemo(() => {
    if (parsed.length === 0 || lastWatchedId === -1) return false
    return parsed[parsed.length - 1].id === lastWatchedId
  }, [parsed, lastWatchedId])

  const seasons = useMemo(() => {
    const map = new Map<number, ParsedEpisode[]>()
    for (const ep of parsed) {
      if (!map.has(ep.season)) map.set(ep.season, [])
      map.get(ep.season)!.push(ep)
    }
    return map
  }, [parsed])

  function sectionLabel(seasonNum: number): string {
    return seasonNum === 0 ? 'Movies / Specials' : `Season ${seasonNum}`
  }

  const orderedSeasons = useMemo(() => {
    let entries = Array.from(seasons.entries())

    if (watchOrder) {
      // Order sections
      entries = entries.sort(([a], [b]) => {
        const ai = watchOrder.sectionOrder.findIndex((l) => l.toLowerCase() === sectionLabel(a).toLowerCase())
        const bi = watchOrder.sectionOrder.findIndex((l) => l.toLowerCase() === sectionLabel(b).toLowerCase())
        return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi)
      })

      // Order items within sections that have explicit item lists
      entries = entries.map(([seasonNum, eps]) => {
        const order = watchOrder.itemOrder[sectionLabel(seasonNum).toLowerCase()]
        if (!order?.length) return [seasonNum, eps] as [number, ParsedEpisode[]]
        const sorted = [...eps].sort((a, b) => {
          const ai = order.findIndex((t) => t.toLowerCase() === a.title.toLowerCase())
          const bi = order.findIndex((t) => t.toLowerCase() === b.title.toLowerCase())
          if (ai === -1 && bi === -1) return 0
          if (ai === -1) return 1
          if (bi === -1) return -1
          return ai - bi
        })
        return [seasonNum, sorted] as [number, ParsedEpisode[]]
      })
    }

    return entries
  }, [seasons, watchOrder])

  const sortedExtras = useMemo(() => {
    const order = watchOrder?.itemOrder['extras']
    if (!order?.length) return extras
    return [...extras].sort((a, b) => {
      const ai = order.findIndex((t) => t.toLowerCase() === a.title.toLowerCase())
      const bi = order.findIndex((t) => t.toLowerCase() === b.title.toLowerCase())
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi)
    })
  }, [extras, watchOrder])

  // Flat nav items — rebuilt whenever collapsed state or data changes
  const navItems = useMemo((): NavItem[] => {
    const items: NavItem[] = []
    for (const [seasonNum, eps] of orderedSeasons) {
      items.push({ kind: 'header', seasonNum })
      if (!collapsedSeasons.has(seasonNum)) {
        for (const ep of eps) items.push({ kind: 'episode', ep })
      }
    }
    for (const item of sortedExtras) {
      if (item.filePath) items.push({ kind: 'extra', item })
    }
    return items
  }, [orderedSeasons, collapsedSeasons, sortedExtras])

  // Keep ref in sync for controller callbacks
  navItemsRef.current = navItems

  // After a season toggle, move the controller highlight to that season's header
  useEffect(() => {
    if (pendingFocusSeasonRef.current === null) return
    const target = pendingFocusSeasonRef.current
    pendingFocusSeasonRef.current = null
    const idx = navItems.findIndex((it) => it.kind === 'header' && it.seasonNum === target)
    if (idx !== -1) {
      focusedIdxRef.current = idx
      setFocusedIdx(idx)
      rowRefs.current[idx]?.scrollIntoView({ block: 'nearest' })
    }
  }, [navItems])

  const { resetState } = useController({ onButton: (btn) => {
    if (btn === 'back') { setFocusZone('content'); onBack(); return }
    if (btn === 'up')   focusRow(focusedIdxRef.current - 1)
    if (btn === 'down') focusRow(focusedIdxRef.current + 1)
    if (btn === 'confirm') {
      const item = navItemsRef.current[focusedIdxRef.current]
      if (!item) return
      if (item.kind === 'header')  toggleSeason(item.seasonNum)
      else if (item.kind === 'episode') playFile(item.ep.filePath)
      else if (item.kind === 'extra' && item.item.filePath) playFile(item.item.filePath as string)
    }
  } })

  // Absorb any held buttons when detail page mounts
  useEffect(() => { resetState() }, [])

  // Render — navIdx must mirror navItems order exactly
  let navIdx = 0

  return (
    <div className={styles.page}>
      {/* Left panel — poster, title, tech info */}
      <div className={styles.leftPanel}>
        <button className={styles.back} onClick={onBack}>
          <span className={styles.backArrow}>‹</span> Back
        </button>

        <div className={styles.heroPoster}>
          {posterPath
            ? <PosterImage filePath={posterPath} title={seriesTitle} />
            : <div className={styles.posterPlaceholder}>{seriesTitle.charAt(0)}</div>
          }
        </div>

        <div className={styles.heroInfo}>
          <div className={styles.heroTitle}>{seriesTitle}</div>
          {year && <div className={styles.heroMeta}>{year}</div>}
          <div className={styles.heroMeta}>{episodes.length} episode{episodes.length !== 1 ? 's' : ''}</div>
          {seriesComplete && <span className={styles.seriesCompletePill}>Series Complete</span>}
        </div>

        {/* Technical metadata from first episode */}
        {techInfo && (
          <div className={styles.metaSection}>
            {techInfo.videoCodec && (
              <div className={styles.metaBlock}>
                <div className={styles.metaLabel}>Video</div>
                <div className={styles.metaValue}>
                  {[formatResolution(techInfo.height), formatCodec(techInfo.videoCodec)].filter(Boolean).join(' · ')}
                </div>
              </div>
            )}
            {techInfo.audioTracks.length > 0 && (
              <div className={styles.metaBlock}>
                <div className={styles.metaLabel}>Audio</div>
                <div className={styles.metaRows}>
                  {techInfo.audioTracks.map((t, i) => (
                    <div key={i} className={styles.metaRow}>
                      <span className={styles.metaLang}>{formatLang(t.lang)}</span>
                      <span className={styles.metaDot}>·</span>
                      <span className={styles.metaValue}>{formatAudioCodec(t.codec)} {formatChannels(t.channels)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {techInfo.subtitleTracks.length > 0 && (
              <div className={styles.metaBlock}>
                <div className={styles.metaLabel}>Subtitles</div>
                <div className={styles.metaValue}>
                  {[...new Set(techInfo.subtitleTracks.map((s) => formatLang(s.lang)))].join(', ')}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Watch guide */}
        {watchGuide && watchGuide.length > 0 && (
          <div className={styles.guideSection}>
            <div className={styles.metaLabel}>Watch Order</div>
            <ol className={styles.guideList}>
              {watchGuide.map((entry, i) => (
                <li key={i} className={styles.guideEntry}>{entry}</li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* Right panel — episode list */}
      <div className={styles.rightPanel}>
      {orderedSeasons.map(([seasonNum, eps]) => {
        const headerIdx = navIdx++
        const isCollapsed = collapsedSeasons.has(seasonNum)

        return (
          <div key={seasonNum} className={styles.section}>
            <button
              ref={(el) => (rowRefs.current[headerIdx] = el)}
              className={`${styles.sectionHeader} ${headerIdx === focusedIdx ? styles.sectionHeaderFocus : ''}`}
              onClick={() => toggleSeason(seasonNum)}
            >
              <span className={`${styles.chevron} ${isCollapsed ? '' : styles.chevronOpen}`}>›</span>
              <span className={styles.sectionTitle}>
                {sectionLabel(seasonNum)}
              </span>
              <span className={styles.sectionCount}>{eps.length}</span>
            </button>

            <div className={`${styles.episodeList} ${isCollapsed ? styles.episodeListCollapsed : ''}`}>
              <div className={styles.episodeListInner}>
                {eps.map((ep) => {
                  const thisIdx = navIdx++
                  return (
                    <button
                      key={ep.id}
                      ref={(el) => (rowRefs.current[thisIdx] = el)}
                      className={`${styles.episodeRow} ${thisIdx === focusedIdx ? styles.controllerFocus : ''} ${launchingPath === ep.filePath ? styles.episodeRowLaunching : ''}`}
                      onClick={() => playFile(ep.filePath)}
                    >
                      {ep.badge && <span className={styles.episodeBadge}>{ep.badge}</span>}
                      <div className={styles.episodeTitleGroup}>
                        <span className={styles.episodeTitle}>{ep.title}</span>
                        {!seriesComplete && ep.id === lastWatchedId && (
                          <span className={styles.lastOpenedPill}>Last Watched</span>
                        )}
                      </div>
                      {launchingPath === ep.filePath
                        ? <span className={styles.launchingLabel}>Opening…</span>
                        : <span className={styles.playIcon}>▶</span>
                      }
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )
      })}

      {sortedExtras.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeaderPlain}>
            <span className={styles.sectionTitle}>Extras</span>
            <span className={styles.sectionCount}>{sortedExtras.length}</span>
          </div>
          <div className={styles.episodeList}>
            <div className={styles.episodeListInner}>
              {sortedExtras.map((item) => {
                const thisIdx = navIdx++
                return (
                  <button
                    key={item.id}
                    ref={(el) => (rowRefs.current[thisIdx] = el)}
                    className={`${styles.episodeRow} ${thisIdx === focusedIdx ? styles.controllerFocus : ''}`}
                    onClick={() => item.filePath && playFile(item.filePath as string)}
                  >
                    <span className={styles.episodeTitle}>{item.title}</span>
                    <span className={styles.playIcon}>▶</span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
      </div>{/* end rightPanel */}
    </div>
  )
}
