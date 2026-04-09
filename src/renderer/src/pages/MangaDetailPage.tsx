import { useMemo } from 'react'
import PosterImage from '../components/PosterImage'
import styles from './ShowDetailPage.module.css'

interface Props {
  seriesName: string
  volumes: MediaItem[]
  onBack: () => void
  onSelect: (item: MediaItem) => void
}

// Strip Suwayomi scanlation group prefix at display time for entries already in DB with raw titles
function cleanDisplayTitle(raw: string): string {
  // Strip Suwayomi scanlation group prefix: "Group_Vol.1 Ch.1 - Title" → "Vol.1 Ch.1 - Title"
  const m = raw.match(/^.+_(Vol\.[\d.]+.*|Ch\.[\d.]+.*)$/i)
  let title = m ? m[1].trim() : raw
  // Strip leading "Vol.X " when followed by a chapter: "Vol.1 Ch.1 - Title" → "Ch.1 - Title"
  title = title.replace(/^Vol\.[\d.]+\s+(?=Ch\.)/i, '')
  return title
}

function sortKey(title: string): number {
  const ch = title.match(/ch(?:apter)?\.?\s*(\d+(?:\.\d+)?)/i)
  if (ch) return parseFloat(ch[1])
  const vol = title.match(/vol(?:ume)?\.?\s*(\d+(?:\.\d+)?)/i)
  if (vol) return parseFloat(vol[1])
  const num = title.match(/(\d+(?:\.\d+)?)/)
  if (num) return parseFloat(num[1])
  return Infinity
}

function isExtra(title: string): boolean {
  const key = sortKey(title)
  return isFinite(key) && key !== Math.floor(key)
}

export default function MangaDetailPage({ seriesName, volumes, onBack, onSelect }: Props): JSX.Element {
  const lastReadId = useMemo(() =>
    volumes.reduce<MediaItem | null>(
      (best, vol) => ((vol.lastOpenedAt ?? 0) > (best?.lastOpenedAt ?? 0) ? vol : best),
      null
    )?.id ?? -1
  , [volumes])

  const sortedVolumes = useMemo(() =>
    [...volumes].sort((a, b) => sortKey(a.title) - sortKey(b.title))
  , [volumes])

  const { sectionTitle, unitSingular, unitPlural } = useMemo(() => {
    const titles = volumes.map(v => cleanDisplayTitle(v.title).toLowerCase())
    if (titles.some(t => /(?:^|[\s_])ch(apter|\.)/.test(t))) return { sectionTitle: 'Chapters', unitSingular: 'chapter', unitPlural: 'chapters' }
    if (titles.some(t => /(?:^|[\s_])vol(ume|\.)/.test(t))) return { sectionTitle: 'Volumes', unitSingular: 'volume', unitPlural: 'volumes' }
    return { sectionTitle: 'Entries', unitSingular: 'entry', unitPlural: 'entries' }
  }, [volumes])

  return (
    <div className={styles.page}>
      {/* Left panel */}
      <div className={styles.leftPanel}>
        <button className={styles.back} onClick={onBack}>
          <span className={styles.backArrow}>‹</span> Back
        </button>
        <div className={styles.heroPoster}>
          {volumes[0]?.posterPath
            ? <PosterImage filePath={volumes[0].posterPath} title={seriesName} />
            : <div className={styles.posterPlaceholder}>{seriesName.charAt(0)}</div>
          }
        </div>
        <div className={styles.heroInfo}>
          <div className={styles.heroTitle}>{seriesName}</div>
          <div className={styles.heroMeta}>{volumes.length} {volumes.length !== 1 ? unitPlural : unitSingular}</div>
        </div>
      </div>

      {/* Right panel — volume list */}
      <div className={styles.rightPanel}>
        <div className={styles.section}>
          <div className={styles.sectionHeaderPlain}>
            <span className={styles.sectionTitle}>{sectionTitle}</span>
            <span className={styles.sectionCount}>{volumes.length}</span>
          </div>
          <div className={styles.episodeList}>
            <div className={styles.episodeListInner}>
              {sortedVolumes.map((vol) => (
                <button
                  key={vol.id}
                  className={styles.episodeRow}
                  onClick={() => onSelect(vol)}
                >
                  <span className={styles.episodeTitle}>{cleanDisplayTitle(vol.title)}</span>
                  {isExtra(vol.title) && (
                    <span className={styles.extraPill}>Extra</span>
                  )}
                  {vol.id === lastReadId && (
                    <span className={styles.lastOpenedPill}>Last Read</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
