import { watchState } from './resume'

/**
 * Whether a whole series has been gone through, for the "Series complete" dot
 * on a listing card and the pill on the series page. Both call this so they
 * always agree.
 *
 * Video (anime, TV): every episode has been opened. Extras never reach this;
 * the library leaves them out.
 *
 * Reading (manga, comics), when `progress` is given: every entry opened and
 * none left partway, so a series is not complete while its last chapter is
 * half read. An entry opened before positions were recorded, or marked read
 * by hand, has none and counts. Extras (Ch. 10.5 and the like) are not
 * required, unless the series is nothing but.
 */
export function isSeriesComplete<T extends { filePath: string; lastOpenedAt: number | null }>(
  entries: T[],
  reading?: { progress: Record<string, VideoProgress>; category: string; isExtra: (entry: T) => boolean }
): boolean {
  if (entries.length === 0) return false
  if (!reading) return entries.every((e) => e.lastOpenedAt != null)
  const main = entries.filter((e) => !reading.isExtra(e))
  const required = main.length > 0 ? main : entries
  return required.every((e) =>
    e.lastOpenedAt != null &&
    watchState(reading.progress[e.filePath], 0, reading.category).kind !== 'partial'
  )
}
