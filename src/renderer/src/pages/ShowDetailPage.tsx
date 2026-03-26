import { useEffect, useState } from 'react'
import PosterImage from '../components/PosterImage'
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

export default function ShowDetailPage({ seriesTitle, year, posterPath, category, onBack }: Props): JSX.Element {
  const [episodes, setEpisodes] = useState<MediaItem[]>([])
  const [extras, setExtras] = useState<MediaItem[]>([])

  useEffect(() => {
    window.api.library.getItems(category).then((all) => {
      setEpisodes(all.filter((i) => i.title === seriesTitle))
    })
    window.api.library.getExtras(seriesTitle).then(setExtras)
  }, [seriesTitle])

  function playFile(filePath: string): void {
    window.api.playback.openVideo(filePath)
  }

  // Parse, sort by S/E number, group by season
  const parsed = episodes.map(parseEpisode).sort((a, b) =>
    a.season !== b.season ? a.season - b.season : a.episode - b.episode
  )

  const seasons = new Map<number, ParsedEpisode[]>()
  for (const ep of parsed) {
    if (!seasons.has(ep.season)) seasons.set(ep.season, [])
    seasons.get(ep.season)!.push(ep)
  }

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={onBack}>
        <span className={styles.backArrow}>‹</span> Back
      </button>

      <div className={styles.hero}>
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
        </div>
      </div>

      {Array.from(seasons.entries()).map(([seasonNum, eps]) => (
        <div key={seasonNum} className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>
              {seasonNum === 0 ? 'Episodes' : `Season ${seasonNum}`}
            </span>
            <span className={styles.sectionCount}>{eps.length}</span>
          </div>
          <div className={styles.episodeList}>
            {eps.map((ep) => (
              <button
                key={ep.id}
                className={styles.episodeRow}
                onClick={() => playFile(ep.filePath)}
              >
                {ep.badge && <span className={styles.episodeBadge}>{ep.badge}</span>}
                <span className={styles.episodeTitle}>{ep.title}</span>
                <span className={styles.playIcon}>▶</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {extras.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionHeader}>
            <span className={styles.sectionTitle}>Extras</span>
            <span className={styles.sectionCount}>{extras.length}</span>
          </div>
          <div className={styles.episodeList}>
            {extras.map((item) => (
              <button
                key={item.id}
                className={styles.episodeRow}
                onClick={() => item.filePath && playFile(item.filePath as string)}
              >
                <span className={styles.episodeTitle}>{item.title}</span>
                <span className={styles.playIcon}>▶</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
