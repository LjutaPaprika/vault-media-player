import { useEffect, useState } from 'react'
import PosterImage from '../components/PosterImage'
import styles from './ShowDetailPage.module.css'

interface Props {
  title: string
  year: number | null
  posterPath: string | null
  filePath: string
  onBack: () => void
}

export default function MovieDetailPage({ title, year, posterPath, filePath, onBack }: Props): JSX.Element {
  const [extras, setExtras] = useState<MediaItem[]>([])

  useEffect(() => {
    window.api.library.getExtras(title).then(setExtras)
  }, [title])

  function playMovie(): void {
    window.api.playback.openVideo(filePath)
  }

  return (
    <div className={styles.page}>
      <button className={styles.back} onClick={onBack}>
        <span className={styles.backArrow}>‹</span> Back
      </button>

      <div className={styles.hero}>
        <div className={styles.heroPoster}>
          {posterPath
            ? <PosterImage filePath={posterPath} title={title} />
            : <div className={styles.posterPlaceholder}>{title.charAt(0)}</div>
          }
        </div>
        <div className={styles.heroInfo}>
          <div className={styles.heroTitle}>{title}</div>
          {year && <div className={styles.heroMeta}>{year}</div>}
          <button className={styles.playButton} onClick={playMovie}>▶ Play Movie</button>
        </div>
      </div>

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
                onClick={() => item.filePath && window.api.playback.openVideo(item.filePath as string)}
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
