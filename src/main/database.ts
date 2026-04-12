import Database from 'better-sqlite3'
import { app } from 'electron'
import { join, dirname, basename } from 'path'
import { mkdirSync, existsSync } from 'fs'
import type { MediaTechInfo } from './mediaInfo'

let db: Database.Database | null = null

/**
 * Walk up from the packaged exe location until we find the .vault marker file
 * at the drive root (e.g. E:\). Returns the drive root path, or null in dev mode
 * or if the marker isn't found.
 */
export function findDriveRoot(): string | null {
  if (!app.isPackaged) return null
  let dir = dirname(app.getPath('exe'))
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, '.vault'))) return dir
    const parent = dirname(dir)
    if (parent === dir) break // reached filesystem root without finding marker
    dir = parent
  }
  return null
}

/**
 * Returns the directory where library.db and app data should be stored.
 * In production: <driveRoot>/app  (travels with the drive)
 * In dev:        <cwd>/dev-data
 */
function getDbDir(): string {
  if (!app.isPackaged) return join(process.cwd(), 'dev-data')
  const driveRoot = findDriveRoot()
  if (driveRoot) return join(driveRoot, 'app')
  return app.getPath('userData') // fallback if .vault marker not found
}

function getDb(): Database.Database {
  if (db) return db

  const dbDir = getDbDir()
  mkdirSync(dbDir, { recursive: true })
  const dbPath = join(dbDir, 'library.db')

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  db.exec(`
    CREATE TABLE IF NOT EXISTS config (
      key   TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS media_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      title         TEXT NOT NULL,
      year          INTEGER,
      category      TEXT NOT NULL,
      file_path     TEXT NOT NULL UNIQUE,
      poster_path   TEXT,
      description   TEXT,
      genre         TEXT,
      platform      TEXT,
      executable    TEXT,
      file_modified INTEGER DEFAULT 0,
      updated_at    INTEGER DEFAULT (unixepoch())
    );

    CREATE INDEX IF NOT EXISTS idx_media_category ON media_items(category);
  `)

  // Migrations
  try { db.exec('ALTER TABLE media_items ADD COLUMN file_modified INTEGER DEFAULT 0') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE media_items ADD COLUMN tech_info TEXT') } catch { /* already exists */ }
  try { db.exec('ALTER TABLE media_items ADD COLUMN last_opened_at INTEGER DEFAULT NULL') } catch { /* already exists */ }

  return db
}

export function getConfig(key: string): string | null {
  const row = getDb().prepare('SELECT value FROM config WHERE key = ?').get(key) as
    | { value: string }
    | undefined
  return row?.value ?? null
}

export function setConfig(key: string, value: string): void {
  getDb().prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').run(key, value)
}

export function upsertItem(item: {
  title: string
  year?: number | null
  category: string
  filePath: string
  posterPath?: string | null
  description?: string | null
  genre?: string | null
  platform?: string | null
  executable?: string | null
  fileModified?: number
}): void {
  getDb()
    .prepare(
      `INSERT INTO media_items
        (title, year, category, file_path, poster_path, description, genre, platform, executable, file_modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(file_path) DO UPDATE SET
         title         = excluded.title,
         year          = excluded.year,
         category      = excluded.category,
         poster_path   = excluded.poster_path,
         description   = excluded.description,
         genre         = excluded.genre,
         platform      = excluded.platform,
         executable    = excluded.executable,
         file_modified = excluded.file_modified,
         updated_at    = unixepoch()`
    )
    .run(
      item.title,
      item.year ?? null,
      item.category,
      item.filePath,
      item.posterPath ?? null,
      item.description ?? null,
      item.genre ?? null,
      item.platform ?? null,
      item.executable ?? null,
      item.fileModified ?? 0
    )
}

export function updateTechInfo(filePath: string, info: MediaTechInfo): void {
  getDb()
    .prepare('UPDATE media_items SET tech_info = ? WHERE file_path = ?')
    .run(JSON.stringify(info), filePath)
}

export function getTechInfo(filePath: string): MediaTechInfo | null {
  const row = getDb()
    .prepare('SELECT tech_info FROM media_items WHERE file_path = ?')
    .get(filePath) as { tech_info: string | null } | undefined
  if (!row?.tech_info) return null
  try { return JSON.parse(row.tech_info) as MediaTechInfo } catch { return null }
}

export function needsTechInfo(filePath: string): boolean {
  const row = getDb()
    .prepare('SELECT tech_info FROM media_items WHERE file_path = ?')
    .get(filePath) as { tech_info: string | null } | undefined
  return !row?.tech_info
}

export function clearStoredFileTimes(): void {
  getDb().prepare('UPDATE media_items SET file_modified = 0').run()
}

export function getStoredFileTimes(): Map<string, number> {
  const rows = getDb()
    .prepare('SELECT file_path, file_modified FROM media_items')
    .all() as { file_path: string; file_modified: number }[]
  return new Map(rows.map((r) => [r.file_path, r.file_modified]))
}

export function deleteOrphanedEntries(foundPaths: Set<string>): void {
  const all = getDb()
    .prepare('SELECT file_path FROM media_items')
    .all() as { file_path: string }[]
  const toDelete = all.map((r) => r.file_path).filter((p) => !foundPaths.has(p))
  if (toDelete.length === 0) return
  // Batch to avoid SQLite parameter limits
  const BATCH = 500
  for (let i = 0; i < toDelete.length; i += BATCH) {
    const batch = toDelete.slice(i, i + BATCH)
    const placeholders = batch.map(() => '?').join(',')
    getDb().prepare(`DELETE FROM media_items WHERE file_path IN (${placeholders})`).run(...batch)
  }
}

export function setLastOpened(filePath: string): void {
  getDb()
    .prepare('UPDATE media_items SET last_opened_at = unixepoch() WHERE file_path = ?')
    .run(filePath)
}

export function getItems(category: string): object[] {
  return getDb()
    .prepare(
      `SELECT id, title, year, category, file_path as filePath,
              poster_path as posterPath, description, genre, platform, executable,
              last_opened_at as lastOpenedAt
       FROM media_items WHERE category = ? ORDER BY title ASC`
    )
    .all(category)
}

export function getItem(id: number): object | null {
  return (
    (getDb()
      .prepare(
        `SELECT id, title, year, category, file_path as filePath,
                poster_path as posterPath, description, genre, platform, executable,
                last_opened_at as lastOpenedAt
         FROM media_items WHERE id = ?`
      )
      .get(id) as object | undefined) ?? null
  )
}

export function getExtras(seriesTitle: string): object[] {
  return getDb()
    .prepare(
      `SELECT id, title, year, category, file_path as filePath,
              poster_path as posterPath, description, genre, platform, executable,
              last_opened_at as lastOpenedAt
       FROM media_items WHERE category = 'extras' AND genre = ? ORDER BY title ASC`
    )
    .all(seriesTitle)
}

export interface LibraryStats {
  counts: Record<string, number>
  seriesCounts: Record<string, number>
  platforms: { platform: string; count: number }[]
  recentlyOpened: { title: string; category: string; filePath: string; lastOpenedAt: number }[]
  total: number
  storage: {
    total: number
    byCategory: Record<string, number>
    musicTrackCount: number
    mangaSeriesCount: number
    computedAt: number
  } | null
}

export function getStats(): LibraryStats {
  const db = getDb()

  const countRows = db
    .prepare('SELECT category, COUNT(*) as count FROM media_items GROUP BY category')
    .all() as { category: string; count: number }[]
  const counts: Record<string, number> = {}
  for (const r of countRows) counts[r.category] = r.count

  // TV and anime: COUNT(DISTINCT title) works because all episodes share the show's title
  const seriesRows = db
    .prepare("SELECT category, COUNT(DISTINCT title) as count FROM media_items WHERE category IN ('tv', 'anime') GROUP BY category")
    .all() as { category: string; count: number }[]
  const seriesCounts: Record<string, number> = {}
  for (const r of seriesRows) seriesCounts[r.category] = r.count

  // Manga: each chapter has its own title, so we count distinct parent directories in JS
  const mangaPaths = db
    .prepare("SELECT file_path FROM media_items WHERE category = 'manga'")
    .all() as { file_path: string }[]
  if (mangaPaths.length > 0) {
    seriesCounts.manga = new Set(mangaPaths.map((r) => dirname(r.file_path))).size
  }

  const platforms = db
    .prepare("SELECT platform, COUNT(*) as count FROM media_items WHERE category = 'games' AND platform IS NOT NULL GROUP BY platform ORDER BY count DESC")
    .all() as { platform: string; count: number }[]

  // Recently opened: fetch a larger window and deduplicate in JS so manga chapters
  // collapse to their series name (TV/anime already share a title, so SQL GROUP BY
  // works for them, but manga chapter titles are unique per file).
  const allRecent = db
    .prepare('SELECT title, category, file_path as filePath, last_opened_at as lastOpenedAt FROM media_items WHERE last_opened_at IS NOT NULL ORDER BY last_opened_at DESC LIMIT 200')
    .all() as { title: string; category: string; filePath: string; lastOpenedAt: number }[]

  const seen = new Map<string, { title: string; category: string; filePath: string; lastOpenedAt: number }>()
  for (const row of allRecent) {
    const key = row.category === 'manga'
      ? `manga:${dirname(row.filePath)}`
      : `${row.category}:${row.title}`
    if (!seen.has(key)) {
      seen.set(key, {
        ...row,
        title: row.category === 'manga' ? basename(dirname(row.filePath)) : row.title
      })
    }
  }
  const recentlyOpened = [...seen.values()].slice(0, 8)

  const totalRow = db.prepare('SELECT COUNT(*) as total FROM media_items').get() as { total: number }

  let storage: LibraryStats['storage'] = null
  const storageJson = getConfig('storageStats')
  if (storageJson) {
    try { storage = JSON.parse(storageJson) as LibraryStats['storage'] } catch { /* corrupt — leave null */ }
  }

  return { counts, seriesCounts, platforms, recentlyOpened, total: totalRow.total, storage }
}

export function getDbPath(): string {
  return join(getDbDir(), 'library.db')
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
