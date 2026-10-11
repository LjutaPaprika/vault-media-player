// What the Home page shows: the series and films you are in the middle of,
// across the poster shelves, and the games played most recently. YouTube is
// left out: its 16:9 thumbnails don't sit in a row of posters, and its
// playlists are a click away on their own shelf.

import { dirname, basename } from 'path'
import { getItems } from './database'
import { readProgress, type VideoProgress } from './playbackProgress'

interface Item {
  id: number
  title: string
  description: string | null
  category: string
  filePath: string
  posterPath: string | null
  year: number | null
  platform: string | null
  lastOpenedAt: number | null
  playSeconds: number
}

export interface HomeEntryRef {
  id: number
  filePath: string
  title: string
  /** The scanner's "S01E05 · Title" for an episode; how a show's page names it. */
  description: string | null
  progress: VideoProgress | null
}

export interface HomeEntry {
  category: string
  /** The film's title, or the series a chapter or episode belongs to. */
  series: string
  year: number | null
  posterPath: string | null
  /** Episodes or chapters in the series; 1 for a film. */
  entryCount: number
  /** Of those, how many have been gone through. */
  doneCount: number
  /** The entry touched most recently. */
  current: HomeEntryRef
  /** The entry after it, when `current` has been finished. */
  next: HomeEntryRef | null
  /** Unix seconds of the last activity in the series. */
  activityAt: number
}

export interface HomeGame {
  title: string
  platform: string | null
  filePath: string
  posterPath: string | null
  playSeconds: number
  lastOpenedAt: number | null
}

export interface HomeData {
  entries: HomeEntry[]
  games: HomeGame[]
}

const SHELVES = ['movies', 'tv', 'anime', 'manga', 'comics'] as const
const READING = new Set(['manga', 'comics'])
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** The shelf groups entries the same way: episodes by show title, chapters by folder. */
function seriesOf(item: Item): string {
  if (item.category === 'tv' || item.category === 'anime') return item.title
  if (READING.has(item.category)) return basename(dirname(item.filePath))
  return item.filePath
}

/** How close to the end counts as finished, as the renderer's watchState has it: the last tenth, capped at ten minutes of credits. */
function endMargin(duration: number): number {
  return Math.min(600, duration * 0.1)
}

/**
 * Gone through: played or read to the end, or opened before positions were
 * recorded (or marked watched by hand), which leaves no position behind.
 */
function isDone(item: Item, p: VideoProgress | undefined): boolean {
  if (p) return p.finished || (p.duration > 0 && p.position >= p.duration - endMargin(p.duration) && !READING.has(item.category))
  return item.lastOpenedAt != null
}

export function getHomeData(root: string, limit = 24): HomeData {
  const groups = new Map<string, Item[]>()
  const all: Item[] = []
  for (const shelf of SHELVES) {
    for (const item of getItems(shelf) as Item[]) {
      all.push(item)
      const key = `${shelf}\u0000${seriesOf(item)}`
      let g = groups.get(key)
      if (!g) groups.set(key, (g = []))
      g.push(item)
    }
  }
  const progress = readProgress(root, all.map((i) => i.filePath))

  const entries: HomeEntry[] = []
  for (const items of groups.values()) {
    const activityOf = (i: Item): number => Math.max(i.lastOpenedAt ?? 0, progress[i.filePath]?.savedAt ?? 0)
    let current: Item | null = null
    for (const i of items) if (activityOf(i) > 0 && (!current || activityOf(i) > activityOf(current))) current = i
    if (!current) continue

    const first = items[0]
    // Chapters run in title order, as their pages list them; episodes in
    // file order (S01E01, S01E02…).
    const byTitle = READING.has(first.category)
    const ordered = [...items].sort((a, b) => collator.compare(byTitle ? a.title : a.filePath, byTitle ? b.title : b.filePath))
    const ref = (i: Item): HomeEntryRef => ({ id: i.id, filePath: i.filePath, title: i.title, description: i.description, progress: progress[i.filePath] ?? null })
    const currentDone = isDone(current, progress[current.filePath])
    const after = ordered[ordered.findIndex((i) => i.filePath === current!.filePath) + 1]

    entries.push({
      category: first.category,
      series: first.category === 'movies' ? first.title : seriesOf(first),
      year: first.year,
      posterPath: ordered.find((i) => i.posterPath)?.posterPath ?? null,
      entryCount: items.length,
      doneCount: items.filter((i) => isDone(i, progress[i.filePath])).length,
      current: ref(current),
      next: currentDone && after ? ref(after) : null,
      activityAt: activityOf(current)
    })
  }
  entries.sort((a, b) => b.activityAt - a.activityAt)

  const games = (getItems('games') as Item[])
    .filter((g) => g.lastOpenedAt != null || g.playSeconds > 0)
    .sort((a, b) => (b.lastOpenedAt ?? 0) - (a.lastOpenedAt ?? 0) || b.playSeconds - a.playSeconds)
    .slice(0, 12)
    .map((g) => ({
      title: g.title, platform: g.platform, filePath: g.filePath, posterPath: g.posterPath,
      playSeconds: g.playSeconds, lastOpenedAt: g.lastOpenedAt
    }))

  return { entries: entries.slice(0, limit), games }
}
