/**
 * Grouping for the YouTube page. A playlist is a subfolder of media/youtube;
 * the scanner records the folder name as the video's genre, so videos with no
 * genre sit loose in the root folder.
 */

export interface YouTubePlaylist {
  name: string
  /** Sorted by title, the order the folder's files are meant to be watched in. */
  videos: MediaItem[]
  /** Art for the card and detail view, with the width to request it at. */
  cover: { path: string; width: number } | null
  /** Sum of the durations known so far; videos not yet probed count as zero. */
  totalSeconds: number
  /** Most recently opened video, or null if none has been opened. */
  lastOpened: MediaItem | null
}

/**
 * Titles and playlist names compare the way a person reads them: "Part 2"
 * before "Part 10", case ignored.
 */
export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })
}

export function sortByTitle(items: MediaItem[]): MediaItem[] {
  return [...items].sort((a, b) => naturalCompare(a.title, b.title))
}

export function mostRecentlyOpened(items: MediaItem[]): MediaItem | null {
  return items.reduce<MediaItem | null>(
    (best, v) => ((v.lastOpenedAt ?? 0) > (best?.lastOpenedAt ?? 0) ? v : best),
    null
  )
}

/**
 * A playlist's own cover (poster.jpg in its folder) is 16:9 art shown larger
 * than a video card, so it is requested at 720. Without one, the first video's
 * thumbnail stands in, requested at the same 520 its video card uses: the
 * thumbnail cache keeps one width per source file, so asking for a second
 * width would regenerate it back and forth between the two.
 */
export const COVER_WIDTH = 720
export const VIDEO_THUMB_WIDTH = 520

export function buildPlaylists(
  items: MediaItem[],
  covers: Record<string, string | null>,
  durations: Record<string, number>
): YouTubePlaylist[] {
  const byName = new Map<string, MediaItem[]>()
  for (const item of items) {
    if (!item.genre) continue
    const list = byName.get(item.genre)
    if (list) list.push(item)
    else byName.set(item.genre, [item])
  }

  const playlists: YouTubePlaylist[] = []
  for (const [name, list] of byName) {
    const videos = sortByTitle(list)
    const own = covers[name]
    const firstThumb = videos.find((v) => v.posterPath)?.posterPath
    playlists.push({
      name,
      videos,
      cover: own
        ? { path: own, width: COVER_WIDTH }
        : firstThumb ? { path: firstThumb, width: VIDEO_THUMB_WIDTH } : null,
      totalSeconds: videos.reduce((sum, v) => sum + (durations[v.filePath] ?? 0), 0),
      lastOpened: mostRecentlyOpened(videos)
    })
  }
  return playlists.sort((a, b) => naturalCompare(a.name, b.name))
}

// ─── Resume ───────────────────────────────────────────────────────────────────

/** Resuming backs up this far, so you catch the line you stopped on. */
export const RESUME_REWIND = 10
/** Stopping earlier than this is treated as never having really started. */
export const MIN_RESUME = 15

/**
 * How close to the end counts as finished: the last 30 seconds (YouTube end
 * screens), or the last tenth for short videos, where 30 seconds would be a
 * quarter of a two-minute episode.
 */
function endMargin(duration: number): number {
  return Math.min(30, duration * 0.1)
}

export type WatchState =
  | { kind: 'unstarted' }
  | { kind: 'partial'; position: number; duration: number; resumeAt: number }
  | { kind: 'finished' }

/**
 * Where a video stands. `fallbackDuration` covers a progress file from a run
 * where mpv never reported the length.
 */
export function watchState(progress: VideoProgress | undefined, fallbackDuration = 0): WatchState {
  if (!progress) return { kind: 'unstarted' }
  const duration = progress.duration > 0 ? progress.duration : fallbackDuration
  if (progress.finished) return { kind: 'finished' }
  if (duration > 0 && progress.position >= duration - endMargin(duration)) return { kind: 'finished' }
  if (progress.position < MIN_RESUME) return { kind: 'unstarted' }
  return {
    kind: 'partial',
    position: progress.position,
    duration,
    resumeAt: Math.max(0, progress.position - RESUME_REWIND)
  }
}

/** Seconds to start a video at when it is opened: resume if partway, else 0. */
export function startPosition(state: WatchState): number {
  return state.kind === 'partial' ? state.resumeAt : 0
}

/** Share of the video watched, for the bar under a thumbnail; null for none. */
export function watchedFraction(state: WatchState): number | null {
  if (state.kind === 'finished') return 1
  if (state.kind === 'partial' && state.duration > 0) return Math.min(1, state.position / state.duration)
  return null
}

export interface ContinueTarget {
  video: MediaItem
  /** Button label. */
  label: 'Play' | 'Continue' | 'Resume' | 'Next' | 'Play again'
  startAt: number
  /** Where it was left off, to show on the button; null when starting fresh. */
  leftOffAt: number | null
}

/**
 * What the playlist's Continue button plays. It follows the video opened last:
 * resume it if it was left partway, move to the one after it if it was
 * finished, or open it again if there is no position for it (played before
 * positions were recorded, or closed in the first few seconds).
 */
export function continueTarget(
  playlist: YouTubePlaylist,
  progress: Record<string, VideoProgress>,
  durations: Record<string, number>
): ContinueTarget | null {
  const { videos, lastOpened } = playlist
  if (videos.length === 0) return null
  const stateOf = (v: MediaItem): WatchState => watchState(progress[v.filePath], durations[v.filePath])
  const target = (video: MediaItem, label: ContinueTarget['label']): ContinueTarget => {
    const state = stateOf(video)
    return state.kind === 'partial'
      ? { video, label: label === 'Next' ? 'Next' : 'Resume', startAt: state.resumeAt, leftOffAt: state.position }
      : { video, label, startAt: 0, leftOffAt: null }
  }

  if (!lastOpened) return target(videos[0], 'Play')
  if (stateOf(lastOpened).kind !== 'finished') return target(lastOpened, 'Continue')
  const i = videos.findIndex((v) => v.filePath === lastOpened.filePath)
  const next = videos[i + 1]
  return next ? target(next, 'Next') : target(videos[0], 'Play again')
}

/** "3d ago" style label for a unix-seconds timestamp. */
export function openedAgo(epochSeconds: number, now = Date.now()): string {
  const diff = now - epochSeconds * 1000
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 2_592_000_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return new Date(epochSeconds * 1000).toLocaleDateString()
}
