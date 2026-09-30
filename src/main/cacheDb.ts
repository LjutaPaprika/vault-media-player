// The generated-artwork cache: downscaled posters, YouTube thumbnails and
// episode stills, in cache.db beside library.db.
//
// It used to be a table inside library.db, which mixed ~22 MB of images that
// can always be remade with ~5 MB of watch history, favourites and playtime
// that cannot. Every backup of the library carried the images, and deleted
// images left free pages that never shrank the file. Apart, library.db stays
// small, and cache.db can be deleted at any time: the app remakes it.
//
// Entries are keyed by the path relative to the library root, not the absolute
// path, so the same drive mounted as E:\ on Windows and /Volumes/VAULT on a
// Mac finds the same entries. A Mac without ffmpeg can then show the episode
// stills a Windows machine grabbed.

import Database from 'better-sqlite3'
import { getDataPath } from './database'

let cache: Database.Database | null = null
let resolveRoot: () => string | null = () => null

/**
 * Tells the cache where the library root is; only ipc.ts knows. Must return
 * null rather than a guess when the drive is not found, or entries would be
 * keyed against the wrong root.
 */
export function setCacheRootResolver(fn: () => string | null): void {
  resolveRoot = fn
}

function open(): Database.Database {
  if (cache) return cache
  const db = new Database(getDataPath('cache.db'))
  // Only takes effect on a new, empty file, so it comes before any table.
  // Pruning then hands pages back with incremental_vacuum instead of leaving
  // the file at its high-water mark.
  db.pragma('auto_vacuum = INCREMENTAL')
  db.pragma('journal_mode = WAL')
  // A WAL file keeps its high-water size until the last connection closes;
  // bulk writes (the first-launch move, a background still fill) would leave
  // tens of MB beside cache.db for the whole session, and for good if the app
  // is killed. Truncate it back after each checkpoint instead.
  db.pragma('journal_size_limit = 4194304')
  db.exec(`
    CREATE TABLE IF NOT EXISTS thumbnails (
      key          TEXT    PRIMARY KEY,
      source_mtime INTEGER NOT NULL,
      width        INTEGER NOT NULL,
      data         BLOB    NOT NULL
    );

    -- Videos no still could be grabbed from (a damaged file, or no usable
    -- frame), with the mtime they had. Skipped until the file changes, so a
    -- re-downloaded episode is tried again but a broken one is not retried on
    -- every launch.
    CREATE TABLE IF NOT EXISTS still_failures (
      key          TEXT    PRIMARY KEY,
      source_mtime INTEGER NOT NULL
    );
  `)
  // A session that was killed rather than closed leaves its WAL at full size;
  // fold it in and truncate it on open.
  try { db.pragma('wal_checkpoint(TRUNCATE)') } catch { /* busy: next checkpoint will do */ }
  cache = db
  return db
}

export function closeCache(): void {
  if (cache) {
    cache.close()
    cache = null
  }
}

/**
 * The cache key for a file: its path within the library, forward slashes,
 * composed Unicode (macOS reads names decomposed), lower case (exFAT ignores
 * case). Null when the library root is unknown, in which case callers skip
 * the cache entirely rather than key against a wrong root.
 */
export function cacheKey(sourcePath: string): string | null {
  const root = resolveRoot()
  return root ? keyWithin(root, sourcePath) : null
}

/**
 * The key for `filePath` under `root`, computed as plain strings rather than
 * with path.relative, whose Windows and POSIX flavours disagree about the other
 * OS's paths. "E:\media\x.mkv" under "E:\" and "/Volumes/VAULT/media/x.mkv"
 * under "/Volumes/VAULT" both give "media/x.mkv". A file outside the root
 * keys by its whole normalised path.
 */
export function keyWithin(root: string, filePath: string): string {
  const norm = (p: string): string => p.replace(/\\/g, '/').normalize('NFC').toLowerCase()
  const r = norm(root).replace(/\/+$/, '')
  const f = norm(filePath)
  return f.startsWith(r + '/') ? f.slice(r.length + 1) : f
}

/**
 * Whether two modification times are the same file state.
 *
 * Within two seconds, or apart by a whole number of quarter hours up to 14
 * hours. exFAT stores local time with a UTC offset, and the same file's time
 * may be read shifted by a timezone offset on the other OS; treating that as
 * a change would regenerate every image on each drive swap. A real edit
 * landing on an exact quarter-hour multiple is the price, and it costs one
 * stale thumbnail.
 */
export function sameMtime(a: number, b: number): boolean {
  const d = Math.abs(a - b)
  if (d <= 2000) return true
  if (d > 14 * 3_600_000 + 2000) return false
  const r = d % 900_000
  return r <= 2000 || r >= 900_000 - 2000
}

export interface CachedImage {
  data: Buffer
  /** Matches the source's current mtime and the requested width. */
  fresh: boolean
}

/** The cached image for a key, fresh or not; null if there is none. */
export function getCached(key: string, mtime: number, width: number): CachedImage | null {
  const row = open()
    .prepare('SELECT data, width, source_mtime FROM thumbnails WHERE key = ?')
    .get(key) as { data: Buffer; width: number; source_mtime: number } | undefined
  if (!row) return null
  return { data: row.data, fresh: row.width === width && sameMtime(row.source_mtime, mtime) }
}

export function putCached(key: string, mtime: number, width: number, data: Buffer): void {
  open()
    .prepare('INSERT OR REPLACE INTO thumbnails (key, source_mtime, width, data) VALUES (?, ?, ?, ?)')
    .run(key, mtime, width, data)
}

/** Adds entries unless the key is already cached; for the one-time move from library.db. */
export function importCached(rows: { key: string; mtime: number; width: number; data: Buffer }[]): number {
  const db = open()
  const insert = db.prepare('INSERT OR IGNORE INTO thumbnails (key, source_mtime, width, data) VALUES (?, ?, ?, ?)')
  let added = 0
  db.transaction(() => {
    for (const r of rows) added += insert.run(r.key, r.mtime, r.width, r.data).changes
  })()
  // Fold the bulk write into cache.db now and shrink the WAL behind it.
  db.pragma('wal_checkpoint(TRUNCATE)')
  return added
}

export function cachedKeys(): Set<string> {
  const rows = open().prepare('SELECT key FROM thumbnails').all() as { key: string }[]
  return new Set(rows.map((r) => r.key))
}

/** Whether a still grab already failed for this file as it is now. */
export function knownFailure(key: string, mtime: number): boolean {
  const row = open().prepare('SELECT source_mtime FROM still_failures WHERE key = ?').get(key) as { source_mtime: number } | undefined
  return !!row && sameMtime(row.source_mtime, mtime)
}

export function recordFailure(key: string, mtime: number): void {
  open().prepare('INSERT OR REPLACE INTO still_failures (key, source_mtime) VALUES (?, ?)').run(key, mtime)
}

export function clearFailure(key: string): void {
  open().prepare('DELETE FROM still_failures WHERE key = ?').run(key)
}

export function failedKeys(): Set<string> {
  const rows = open().prepare('SELECT key FROM still_failures').all() as { key: string }[]
  return new Set(rows.map((r) => r.key))
}

/** Drops entries not in `keep`, then returns the freed pages to the disk. */
export function pruneCached(keep: Set<string>): number {
  const db = open()
  const gone = [...cachedKeys()].filter((k) => !keep.has(k))
  const goneFailures = [...failedKeys()].filter((k) => !keep.has(k))
  if (gone.length > 0 || goneFailures.length > 0) {
    const del = db.prepare('DELETE FROM thumbnails WHERE key = ?')
    const delFailure = db.prepare('DELETE FROM still_failures WHERE key = ?')
    db.transaction(() => {
      for (const k of gone) del.run(k)
      for (const k of goneFailures) delFailure.run(k)
    })()
    db.pragma('incremental_vacuum')
  }
  return gone.length
}

export function cacheStats(): { count: number; bytes: number } {
  return open()
    .prepare('SELECT COUNT(*) AS count, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM thumbnails')
    .get() as { count: number; bytes: number }
}
