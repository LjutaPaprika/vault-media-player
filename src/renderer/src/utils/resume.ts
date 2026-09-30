/**
 * Resume rules shared by every page that plays video: where a video stands
 * given the position mpv last reported, where to start it, and what a series'
 * Continue button should play.
 */

/** Resuming backs up this far, so you catch the line you stopped on. */
export const RESUME_REWIND = 10
/** Stopping earlier than this is treated as never having really started. */
export const MIN_RESUME = 15

/**
 * How close to the end counts as finished.
 *
 * YouTube videos end on an end screen, not credits: the last 30 seconds, or
 * the last tenth of a short video, where 30 seconds would be a quarter of a
 * two-minute episode.
 *
 * Films and episodes roll credits, and people close the player when they
 * start: the last tenth, as Plex and Jellyfin treat 90% as watched. Capped at
 * ten minutes so stopping mid-climax of a three-hour film still resumes.
 */
function endMargin(duration: number, category?: string): number {
  if (category === 'youtube') return Math.min(30, duration * 0.1)
  return Math.min(600, duration * 0.1)
}

export type WatchState =
  | { kind: 'unstarted' }
  | { kind: 'partial'; position: number; duration: number; resumeAt: number }
  | { kind: 'finished' }

/**
 * Where a video stands. `fallbackDuration` covers a report from a run where
 * mpv never measured the length.
 */
export function watchState(progress: VideoProgress | undefined, fallbackDuration = 0, category?: string): WatchState {
  if (!progress) return { kind: 'unstarted' }
  const duration = progress.duration > 0 ? progress.duration : fallbackDuration
  if (progress.finished) return { kind: 'finished' }
  if (duration > 0 && progress.position >= duration - endMargin(duration, category)) return { kind: 'finished' }
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

/** Share of the video watched, for a progress bar; null for none. */
export function watchedFraction(state: WatchState): number | null {
  if (state.kind === 'finished') return 1
  if (state.kind === 'partial' && state.duration > 0) return Math.min(1, state.position / state.duration)
  return null
}

export function mostRecentlyOpened<T extends { lastOpenedAt: number | null }>(items: T[]): T | null {
  return items.reduce<T | null>(
    (best, v) => ((v.lastOpenedAt ?? 0) > (best?.lastOpenedAt ?? 0) ? v : best),
    null
  )
}

export interface ContinueTarget<T> {
  video: T
  /** Button label. */
  label: 'Play' | 'Continue' | 'Resume' | 'Next' | 'Play again'
  startAt: number
  /** Where it was left off, to show on the button; null when starting fresh. */
  leftOffAt: number | null
}

/**
 * What a series' Continue button plays, given its videos in viewing order. It
 * follows the video opened last: resume it if it was left partway, open it
 * again if it was closed in the first few seconds, and otherwise move on to
 * the one after it.
 *
 * A last-opened video with no position at all counts as finished: it was
 * watched before positions were recorded (most of the library's history) or
 * marked watched by hand, and either way the next one is what comes next.
 */
export function continueTarget<T extends { filePath: string; lastOpenedAt: number | null }>(
  videos: T[],
  progress: Record<string, VideoProgress>,
  durations: Record<string, number>,
  category?: string
): ContinueTarget<T> | null {
  if (videos.length === 0) return null
  const stateOf = (v: T): WatchState => watchState(progress[v.filePath], durations[v.filePath], category)
  const target = (video: T, label: ContinueTarget<T>['label']): ContinueTarget<T> => {
    const state = stateOf(video)
    return state.kind === 'partial'
      ? { video, label: label === 'Next' ? 'Next' : 'Resume', startAt: state.resumeAt, leftOffAt: state.position }
      : { video, label, startAt: 0, leftOffAt: null }
  }

  const lastOpened = mostRecentlyOpened(videos)
  if (!lastOpened) return target(videos[0], 'Play')
  if (progress[lastOpened.filePath] && stateOf(lastOpened).kind !== 'finished') return target(lastOpened, 'Continue')
  const i = videos.findIndex((v) => v.filePath === lastOpened.filePath)
  const next = videos[i + 1]
  return next ? target(next, 'Next') : target(videos[0], 'Play again')
}
