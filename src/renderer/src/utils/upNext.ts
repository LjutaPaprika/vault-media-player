import { startPosition, watchState } from './resume'

/**
 * The videos after `filePath` in `ordered` - the rest of a YouTube playlist,
 * or the episodes that follow - for mpv to play on in the same window. Each
 * resumes where it was left (with the usual rewind) if part-watched, and
 * starts from the beginning otherwise, finished ones included: autoplay plays
 * everything in order, as YouTube does. Empty when the video is not in the
 * list, which keeps loose videos and extras single.
 */
export function upNextAfter<T extends { filePath: string }>(
  ordered: T[],
  filePath: string,
  titleOf: (v: T) => string,
  progress: Record<string, VideoProgress>,
  durations: Record<string, number>,
  category?: string
): UpNextEntry[] {
  const i = ordered.findIndex((v) => v.filePath === filePath)
  if (i < 0) return []
  return ordered.slice(i + 1).map((v) => {
    const start = startPosition(watchState(progress[v.filePath], durations[v.filePath] ?? 0, category))
    return { filePath: v.filePath, title: titleOf(v), ...(start > 0 ? { startSeconds: start } : {}) }
  })
}
