import { isExtra } from './readingEntries'
import { cleanDisplayTitle, timeAgo } from './mangaSeries'

/** When a watched series was added and last checked for new chapters (unix seconds). */
export interface WatchInfo { addedAt: number; checkedAt: number | null }

const NUMBER_RE = /(?:chapter|ch\.?|volume|vol\.?|issue|#)\s*(\d+(?:\.\d+)?)/i

/** The last main (non-extra) entry, in reading order. */
function lastMain(vols: MediaItem[]): MediaItem | undefined {
  const main = vols.filter((v) => !isExtra(v.title))
  return main[main.length - 1] ?? vols[vols.length - 1]
}

/** The newest entry's number (120 for "Chapter 120 - ..."), or null when it has none. */
export function newestNumber(vols: MediaItem[]): number | null {
  const last = lastMain(vols)
  const m = last ? NUMBER_RE.exec(last.title) : null
  return m ? parseFloat(m[1]) : null
}

/**
 * The newest entry on the drive, short: "Ch. 120", "Vol. 41". Extras (120.5)
 * don't count. Falls back to the entry's own name when it has no number.
 * `vols` are in reading order.
 */
export function newestOnDrive(vols: MediaItem[], unitShort: string): string | null {
  const last = lastMain(vols)
  if (!last) return null
  const n = newestNumber(vols)
  return n != null ? `${unitShort} ${n}` : cleanDisplayTitle(last.title)
}

/**
 * What an online check found, against the newest entry on the drive. `line`
 * is short enough for a card; `why` explains it on hover. MangaUpdates logs
 * releases, so its latest can lag for series with official releases: below
 * the drive means "unknown", never "up to date".
 */
export function releaseStatus(localLast: number | null, meta: SeriesReleaseInfo | undefined, unitShort = 'Ch.'):
  { newCount: number; badge?: string; line: string; why?: string } {
  if (!meta) return { newCount: 0, line: 'not checked online yet' }
  const latest = meta.latest
  if (latest == null) return { newCount: 0, line: 'No online info', why: 'MangaUpdates has no releases logged for this series.' }
  // MangaUpdates counts chapters: nothing to compare a volume count with.
  if (unitShort !== 'Ch.') {
    return {
      newCount: 0, line: `Online: Ch. ${latest}`,
      why: "Your files are volumes; MangaUpdates counts chapters, so they can't be compared."
    }
  }
  if (localLast == null) return { newCount: 0, line: `Online: ${unitShort} ${latest}` }
  const n = Math.floor(latest) - Math.floor(localLast)
  if (n > 0) return { newCount: n, badge: `+${n} new`, line: `${unitShort} ${latest} is out` }
  if (n === 0) return { newCount: 0, line: 'up to date' }
  return {
    newCount: 0, line: `Unknown · online ${unitShort} ${latest}`,
    why: `MangaUpdates only lists up to ${unitShort} ${latest}, behind your drive, so it can't tell whether more is out.`
  }
}

/** "checked 3 days ago", or "not checked yet". */
export function watchNote(info: WatchInfo): string {
  return info.checkedAt == null ? 'not checked yet' : `checked ${timeAgo(info.checkedAt)}`
}

/** Longest since checked first (never-checked ones count from when they were added); ties by name. */
export function orderWatched<T extends { name: string; info: WatchInfo }>(entries: T[]): T[] {
  const since = (e: T): number => e.info.checkedAt ?? e.info.addedAt
  return [...entries].sort((a, b) => since(a) - since(b) || a.name.localeCompare(b.name, undefined, { numeric: true }))
}
