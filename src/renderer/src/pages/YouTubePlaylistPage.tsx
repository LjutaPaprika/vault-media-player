import { useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import PosterImage from '../components/PosterImage'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { formatClock, formatRuntime } from '../utils/duration'
import { VIDEO_THUMB_WIDTH, type YouTubePlaylist } from '../utils/youtubePlaylists'
import sd from './ShowDetailPage.module.css'
import styles from './YouTubePlaylistPage.module.css'

interface Props {
  playlist: YouTubePlaylist
  durations: Record<string, number>
  onBack: () => void
  /** Opens the video and records it as last opened. */
  onPlay: (filePath: string) => void
}

// Video-list scroll offset per playlist, kept for the life of the app, so
// going Back to the shelf and into the same playlist again lands where it was.
const listScrollByPlaylist = new Map<string, number>()

export default function YouTubePlaylistPage({ playlist, durations, onBack, onPlay }: Props): JSX.Element {
  useEscapeKey(onBack)
  const { name, videos, cover, totalSeconds, lastOpened } = playlist
  const [launchingPath, setLaunchingPath] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Restore before paint so the list never flashes at the top first.
  useLayoutEffect(() => {
    const saved = listScrollByPlaylist.get(name)
    if (saved && listRef.current) listRef.current.scrollTop = saved
  }, [name])

  function play(filePath: string): void {
    // mpv takes a moment to appear; mark the row straight away so the click
    // visibly registered.
    flushSync(() => setLaunchingPath(filePath))
    setTimeout(() => setLaunchingPath(null), 1500)
    onPlay(filePath)
  }

  // Continue picks up the video opened most recently; a playlist never opened
  // starts from the top.
  const resume = lastOpened ?? videos[0]

  return (
    <div className={sd.page}>
      {/* Left panel — cover, title, continue */}
      <div className={sd.leftPanel}>
        <button className={sd.back} onClick={onBack}>
          <span className={sd.backArrow}>‹</span> Back
        </button>

        <div className={styles.heroCover}>
          {cover
            ? <PosterImage filePath={cover.path} title={name} width={cover.width} />
            : <div className={sd.posterPlaceholder}>{name.charAt(0)}</div>
          }
        </div>

        <div className={sd.heroInfo}>
          <div className={sd.heroTitle}>{name}</div>
          <div className={sd.heroMeta}>
            {videos.length} video{videos.length !== 1 ? 's' : ''}
            {totalSeconds > 0 && ` · ${formatRuntime(totalSeconds)}`}
          </div>
        </div>

        {resume && (
          <button className={styles.continueBtn} onClick={() => play(resume.filePath)}>
            <svg viewBox="0 0 24 24" fill="currentColor" className={styles.continueIcon}>
              <path d="M8 5v14l11-7z"/>
            </svg>
            <span className={styles.continueText}>
              <span className={styles.continueLabel}>{lastOpened ? 'Continue' : 'Play'}</span>
              <span className={styles.continueTitle}>{resume.title}</span>
            </span>
          </button>
        )}
      </div>

      {/* Right panel — video list */}
      <div
        className={sd.rightPanel}
        ref={listRef}
        onScroll={(e) => listScrollByPlaylist.set(name, e.currentTarget.scrollTop)}
      >
        <div className={sd.section}>
          <div className={sd.sectionHeaderPlain}>
            <span className={sd.sectionTitle}>Videos</span>
            <span className={sd.sectionCount}>{videos.length}</span>
          </div>
          <div className={sd.episodeListInner}>
            {videos.map((v, i) => {
              const duration = durations[v.filePath]
              const launching = launchingPath === v.filePath
              return (
                <button
                  key={v.id}
                  className={`${sd.episodeRow} ${styles.videoRow} ${launching ? sd.episodeRowLaunching : ''}`}
                  onClick={() => play(v.filePath)}
                >
                  <span className={styles.index}>{i + 1}</span>
                  <div className={styles.rowThumb}>
                    {v.posterPath
                      ? <PosterImage filePath={v.posterPath} title={v.title} width={VIDEO_THUMB_WIDTH} />
                      : <div className={sd.posterPlaceholder}>{v.title.charAt(0)}</div>
                    }
                    {duration !== undefined && duration > 0 && (
                      <span className={styles.rowDuration}>{formatClock(duration)}</span>
                    )}
                  </div>
                  <div className={styles.rowText}>
                    <span className={styles.rowTitle}>{v.title}</span>
                    {v.id === lastOpened?.id && (
                      <span className={sd.lastOpenedPill}>Last Watched</span>
                    )}
                  </div>
                  {launching
                    ? <span className={sd.launchingLabel}>Opening…</span>
                    : <span className={sd.playIcon}>▶</span>
                  }
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
