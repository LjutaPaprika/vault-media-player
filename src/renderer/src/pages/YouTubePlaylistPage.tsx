import { useLayoutEffect, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import ContinueButton from '../components/ContinueButton'
import PosterImage from '../components/PosterImage'
import WatchedBar from '../components/WatchedBar'
import { useEscapeKey } from '../hooks/useEscapeKey'
import { formatClock, formatRuntime } from '../utils/duration'
import { continueTarget, watchedFraction, watchState } from '../utils/resume'
import { VIDEO_THUMB_WIDTH, type YouTubePlaylist } from '../utils/youtubePlaylists'
import sd from './ShowDetailPage.module.css'
import styles from './YouTubePlaylistPage.module.css'

interface Props {
  playlist: YouTubePlaylist
  durations: Record<string, number>
  progress: Record<string, VideoProgress>
  onBack: () => void
  /**
   * Opens the video and records it as last opened. Without startAt it resumes
   * wherever the video was left off.
   */
  onPlay: (filePath: string, startAt?: number) => void
}

// Video-list scroll offset per playlist, kept for the life of the app, so
// going Back to the shelf and into the same playlist again lands where it was.
const listScrollByPlaylist = new Map<string, number>()

export default function YouTubePlaylistPage({ playlist, durations, progress, onBack, onPlay }: Props): JSX.Element {
  useEscapeKey(onBack)
  const { name, videos, cover, totalSeconds, lastOpened } = playlist
  const [launchingPath, setLaunchingPath] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Restore before paint so the list never flashes at the top first.
  useLayoutEffect(() => {
    const saved = listScrollByPlaylist.get(name)
    if (saved && listRef.current) listRef.current.scrollTop = saved
  }, [name])

  function play(filePath: string, startAt?: number): void {
    // mpv takes a moment to appear; mark the row straight away so the click
    // visibly registered.
    flushSync(() => setLaunchingPath(filePath))
    setTimeout(() => setLaunchingPath(null), 1500)
    onPlay(filePath, startAt)
  }

  const next = continueTarget(videos, progress, durations, 'youtube')

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

        {next && (
          <ContinueButton target={next} title={next.video.title} onClick={() => play(next.video.filePath, next.startAt)} />
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
              const watched = watchedFraction(watchState(progress[v.filePath], duration, 'youtube'))
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
                    {watched !== null && <WatchedBar fraction={watched} />}
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
