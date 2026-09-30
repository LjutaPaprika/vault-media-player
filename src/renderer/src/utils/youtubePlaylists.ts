/**
 * Grouping for the YouTube page. A playlist is a subfolder of media/youtube;
 * the scanner records the folder name as the video's genre, so videos with no
 * genre sit loose in the root folder.
 */

import { mostRecentlyOpened } from './resume'

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

/** "3d ago" style label for a unix-seconds timestamp. */
export function openedAgo(epochSeconds: number, now = Date.now()): string {
  const diff = now - epochSeconds * 1000
  if (diff < 60_000) return 'just now'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`
  if (diff < 2_592_000_000) return `${Math.floor(diff / 86_400_000)}d ago`
  return new Date(epochSeconds * 1000).toLocaleDateString()
}
