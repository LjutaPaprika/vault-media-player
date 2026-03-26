import Database from 'better-sqlite3'
import { app } from 'electron'
import { join, dirname } from 'path'
import { mkdirSync, existsSync } from 'fs'

let db: Database.Database | null = null

/**
 * In production the app lives somewhere inside the drive (e.g. E:\launcher\windows\).
 * Walk up from the exe location until we find the .vault marker file that sits at
 * the drive root, then return <driveRoot>/launcher as the folder for library.db.
 *
 * In dev mode there is no packaged exe, so fall back to a local dev-data/ folder.
 */
function getDbDir(): string {
  if (!app.isPackaged) {
    return join(process.cwd(), 'dev-data')
  }
  // Store DB in local app data so the VAULT drive is never locked by the app
  return app.getPath('userData')
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

  // Migrate existing DBs that don't have file_modified yet
  try { db.exec('ALTER TABLE media_items ADD COLUMN file_modified INTEGER DEFAULT 0') } catch { /* already exists */ }

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

export function getItems(category: string): object[] {
  return getDb()
    .prepare(
      `SELECT id, title, year, category, file_path as filePath,
              poster_path as posterPath, description, genre, platform, executable
       FROM media_items WHERE category = ? ORDER BY title ASC`
    )
    .all(category)
}

export function getItem(id: number): object | null {
  return (
    (getDb()
      .prepare(
        `SELECT id, title, year, category, file_path as filePath,
                poster_path as posterPath, description, genre, platform, executable
         FROM media_items WHERE id = ?`
      )
      .get(id) as object | undefined) ?? null
  )
}

export function getExtras(seriesTitle: string): object[] {
  return getDb()
    .prepare(
      `SELECT id, title, year, category, file_path as filePath,
              poster_path as posterPath, description, genre, platform, executable
       FROM media_items WHERE category = 'extras' AND genre = ? ORDER BY title ASC`
    )
    .all(seriesTitle)
}

export function clearCategory(category: string): void {
  getDb().prepare('DELETE FROM media_items WHERE category = ?').run(category)
}

export function closeDb(): void {
  if (db) {
    db.close()
    db = null
  }
}
