/**
 * The order of the tracks in a music playlist, shared by the main process (which
 * reads and saves it) and the playlist page (which drags tracks around). Pure,
 * so it is unit-tested.
 *
 * A playlist is a folder of "NN - Title - Artist.mp3" files. With no saved
 * order the tracks play in file-name order. Dragging saves the file names, in
 * their new order, as `order` in the folder's album.json; no file is renamed,
 * because the library row and the favourite star both point at the folder's
 * first file by name.
 */

const LEADING_NUMBER = /^(\d+)/

/**
 * File-name order: the leading track number compared as a number, so "100 - x"
 * follows "99 - y", then the plain name. Without leading numbers on both sides
 * it is the plain code-unit order a bare `sort()` gives.
 */
export function compareTrackFiles(a: string, b: string): number {
  const na = a.match(LEADING_NUMBER)
  const nb = b.match(LEADING_NUMBER)
  if (na && nb) {
    const diff = parseInt(na[1], 10) - parseInt(nb[1], 10)
    if (diff !== 0) return diff
  }
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * The playlist's files in play order. Files in the saved order come first, as
 * saved; names whose file is gone are skipped. Files the order doesn't mention
 * (added since it was saved, e.g. by "Add tracks") follow in file-name order,
 * so a new track lands at the bottom just as it does with no saved order.
 */
export function applyTrackOrder(files: readonly string[], savedOrder: unknown): string[] {
  const present = new Set(files)
  const placed = new Set<string>()
  const out: string[] = []
  if (Array.isArray(savedOrder)) {
    for (const name of savedOrder) {
      if (typeof name === 'string' && present.has(name) && !placed.has(name)) {
        placed.add(name)
        out.push(name)
      }
    }
  }
  const rest = files.filter((f) => !placed.has(f)).sort(compareTrackFiles)
  return out.concat(rest)
}

/** Whether a saved order differs from plain file-name order (so "Reset" has something to undo). */
export function isCustomOrder(files: readonly string[], savedOrder: unknown): boolean {
  if (!Array.isArray(savedOrder) || savedOrder.length === 0) return false
  const ordered = applyTrackOrder(files, savedOrder)
  const plain = [...files].sort(compareTrackFiles)
  return ordered.some((f, i) => f !== plain[i])
}

/** `list` with the item at `from` moved to `to`. Out-of-range indexes give the list unchanged. */
export function moveItem<T>(list: readonly T[], from: number, to: number): T[] {
  const out = [...list]
  if (from === to || from < 0 || to < 0 || from >= out.length || to >= out.length) return out
  const [item] = out.splice(from, 1)
  out.splice(to, 0, item)
  return out
}

export type OrderCheck = { ok: true; order: string[] } | { ok: false; error: string }

/**
 * Checks an order sent to be saved, against the files the playlist folder
 * holds now. Refuses anything that isn't a list of plain, distinct file names.
 * Names whose file has gone since the page loaded are dropped rather than
 * refused, and files the list lacks (added meanwhile) aren't an error either:
 * `applyTrackOrder` puts them at the end.
 */
export function checkTrackOrder(names: unknown, files: readonly string[]): OrderCheck {
  if (!Array.isArray(names)) return { ok: false, error: 'The track order must be a list of file names.' }
  const seen = new Set<string>()
  for (const name of names) {
    if (typeof name !== 'string' || name === '' || /[\\/]/.test(name) || name === '.' || name === '..') {
      return { ok: false, error: `Not a track file name: ${JSON.stringify(name)}` }
    }
    if (seen.has(name)) return { ok: false, error: `“${name}” is listed twice.` }
    seen.add(name)
  }
  const present = new Set(files)
  return { ok: true, order: (names as string[]).filter((n) => present.has(n)) }
}

/** The file name at the end of a track's path, whichever separator the path uses. */
export function trackFileName(path: string): string {
  return path.slice(Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\')) + 1)
}

interface QueueTrack { path: string }

export interface QueueState<T extends QueueTrack> {
  queue: readonly T[]
  currentIndex: number
  /** The straight (unshuffled) order shuffle-off goes back to. */
  original: readonly T[]
  shuffled: boolean
}

function samePaths(a: readonly QueueTrack[], b: readonly QueueTrack[]): boolean {
  return a.length === b.length && a.every((t, i) => t.path === b[i].path)
}

/**
 * What the player should hold after the playlist on screen is reordered from
 * `before` to `after`, or null to leave it alone.
 *
 * - Playing this playlist straight through: the queue takes the new order and
 *   the current song keeps playing, so "next" follows the drag.
 * - Playing it shuffled: only the order shuffle-off returns to changes.
 * - Anything else (another playlist, a "Shuffled Mix", a queue built before
 *   tracks were added): untouched. The queue is matched by its tracks, not by
 *   the playlist's name, since a one-playlist mix carries that name too.
 */
export function reorderQueue<T extends QueueTrack>(
  state: QueueState<T>, before: readonly T[], after: readonly T[]
): { queue: T[]; currentIndex: number; original: T[] } | null {
  if (!state.shuffled && samePaths(state.queue, before)) {
    const currentPath = state.queue[state.currentIndex]?.path
    const currentIndex = after.findIndex((t) => t.path === currentPath)
    if (currentIndex === -1) return null
    return { queue: [...after], currentIndex, original: [...after] }
  }
  if (state.shuffled && samePaths(state.original, before)) {
    return { queue: [...state.queue], currentIndex: state.currentIndex, original: [...after] }
  }
  return null
}
