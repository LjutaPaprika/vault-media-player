/**
 * What a manga or comics series view shows about the series as a whole: its
 * entries in reading order, how far through it you are, and what Continue
 * opens. Shared by the series views and the shelf's progress and Continue row.
 */

import { continueTarget, watchState, type ContinueTarget, type WatchState } from './resume'
import { isExtra, sortKey } from './readingEntries'
import { isSeriesComplete } from './seriesComplete'

/** Strips a Suwayomi scanlation-group prefix and a redundant leading volume. */
export function cleanDisplayTitle(raw: string): string {
  // "Group_Vol.1 Ch.1 - Title" → "Vol.1 Ch.1 - Title"
  const m = raw.match(/^.+_(Vol\.[\d.]+.*|Ch\.[\d.]+.*)$/i)
  let title = m ? m[1].trim() : raw
  // "Vol.1 Ch.1 - Title" → "Ch.1 - Title"
  title = title.replace(/^Vol\.[\d.]+\s+(?=Ch\.)/i, '')
  return title
}

export interface SeriesUnit {
  section: string
  singular: string
  plural: string
  /** Short prefix for a numbered tile or label: "Ch.", "Vol.", "#". */
  short: string
}

export function unitOf(volumes: MediaItem[]): SeriesUnit {
  const titles = volumes.map((v) => cleanDisplayTitle(v.title).toLowerCase())
  if (titles.some((t) => /(?:^|[\s_])ch(apter|\.)/.test(t))) return { section: 'Chapters', singular: 'chapter', plural: 'chapters', short: 'Ch.' }
  if (titles.some((t) => /(?:^|[\s_])vol(ume|\.)/.test(t))) return { section: 'Volumes', singular: 'volume', plural: 'volumes', short: 'Vol.' }
  if (titles.some((t) => /(?:^|[\s_])issue/.test(t))) return { section: 'Issues', singular: 'issue', plural: 'issues', short: '#' }
  return { section: 'Entries', singular: 'entry', plural: 'entries', short: '#' }
}

/** EPUB volumes remember a chapter position; everything else a page. */
export function readingUnitOf(filePath: string): 'page' | 'chapter' {
  return filePath.toLowerCase().endsWith('.epub') ? 'chapter' : 'page'
}

export interface SeriesEntry {
  item: MediaItem
  state: WatchState
  /** Opened and not left partway: read, or marked read by hand. */
  done: boolean
}

export interface SeriesSummary {
  entries: SeriesEntry[]
  total: number
  done: number
  complete: boolean
  /** What Continue opens; null once the series is read through and nothing is partway. */
  next: ContinueTarget<MediaItem> | null
  /** The entry opened most recently, for the "Last read" marker. */
  lastRead: MediaItem | null
  unit: SeriesUnit
}

export function summarize(volumes: MediaItem[], progress: Record<string, VideoProgress>, category: string): SeriesSummary {
  const sorted = [...volumes].sort((a, b) => sortKey(a.title) - sortKey(b.title))
  const entries = sorted.map((item) => {
    const state = watchState(progress[item.filePath], 0, category)
    return { item, state, done: item.lastOpenedAt != null && state.kind !== 'partial' }
  })
  const complete = isSeriesComplete(volumes, { progress, category, isExtra: (v) => isExtra(v.title) })
  const lastRead = sorted.reduce<MediaItem | null>(
    (best, v) => ((v.lastOpenedAt ?? 0) > (best?.lastOpenedAt ?? 0) ? v : best), null)
  return {
    entries,
    total: sorted.length,
    done: entries.filter((e) => e.done).length,
    complete,
    // A series read through has no Continue, unless an entry is partway (a
    // reread): reopening a chapter for a moment shouldn't bring back "Read
    // next". Show pages and Home follow the same rule.
    next: complete && !entries.some((e) => e.state.kind === 'partial') ? null : continueTarget(sorted, progress, {}, category),
    lastRead,
    unit: unitOf(volumes)
  }
}

/** "3 days ago", "yesterday", "just now", from unix seconds. */
export function timeAgo(unixSeconds: number): string {
  const s = Math.max(0, Date.now() / 1000 - unixSeconds)
  if (s < 90) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} minutes ago`
  if (s < 86400) return `${Math.round(s / 3600)} hours ago`
  const d = Math.round(s / 86400)
  if (d === 1) return 'yesterday'
  if (d < 30) return `${d} days ago`
  const mo = Math.round(d / 30)
  if (mo < 12) return `${mo} month${mo === 1 ? '' : 's'} ago`
  const y = Math.round(d / 365)
  return `${y} year${y === 1 ? '' : 's'} ago`
}

const READING_LABEL: Record<ContinueTarget<unknown>['label'], string> = {
  'Play': 'Start reading',
  'Continue': 'Continue',
  'Resume': 'Resume',
  'Next': 'Read next',
  'Play again': 'Read again'
}

/** "Continue Ch.214", "Read next Ch.215", "Start reading Ch.1". */
export function continueLabel(target: ContinueTarget<MediaItem>): string {
  return READING_LABEL[target.label]
}
