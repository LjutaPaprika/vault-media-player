/**
 * A number every artwork URL carries (?v=), changed by each library scan.
 *
 * Chromium caches thumb:// responses by URL, and a URL is just the file's
 * path. A cover replaced under the same name therefore kept showing the old
 * image however often the library was scanned. Changing this number after a
 * scan gives every poster a new URL, so it is asked for again; the main
 * process answers from cache.db, which already knows the file changed (it
 * compares mtimes), so this costs a database read per poster, not a drive read.
 *
 * It starts at the launch time rather than 0, so a session never matches URLs
 * an earlier session's Chromium might still hold.
 */

let version = Date.now()
const listeners = new Set<() => void>()

export function artworkVersion(): number {
  return version
}

/** Call after a library scan: every artwork URL changes, and mounted images reload. */
export function bumpArtworkVersion(now: number = Date.now()): void {
  // Two scans within the same millisecond must still differ.
  version = Math.max(now, version + 1)
  for (const l of listeners) l()
}

export function subscribeArtworkVersion(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
