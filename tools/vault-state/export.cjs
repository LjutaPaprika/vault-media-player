#!/usr/bin/env node
/**
 * Export Vault's user-created state, keyed by library-RELATIVE path.
 *
 *   node tools/vault-state/export.cjs <library.db> <out.json>
 *
 * Why relative keys: library.db stores absolute paths, so every mark is tied to
 * a drive letter and mount root. Keying on the path from /media/ or /games/
 * onward makes the export survive drive swaps, letter changes, volume renames,
 * the Windows/macOS split — and crucially, archive-and-restore cycles. Media
 * moved off the drive has its row orphan-cleaned on the next scan, which
 * destroys the mark; this file is what brings it back when the media returns.
 *
 * Uses the same key derivation as libraryRelKey() in src/main/database.ts,
 * including NFC normalisation, so it agrees with the scanner's own rename
 * migration rather than competing with it.
 *
 * Deliberately NOT exported:
 *   dir_mtimes — a scan cache, rebuilt automatically
 *   config     — holds driveRoot/libraryLabel, which must never be restored
 *                blindly onto a different drive
 */
const fs = require('fs')
const path = require('path')

let Database
try { Database = require('better-sqlite3') }
catch { Database = require(path.resolve(__dirname, '..', '..', 'node_modules', 'better-sqlite3')) }

/** Mirrors libraryRelKey() in src/main/database.ts. */
function relKey(p) {
  const fwd = p.split('\\').join('/')
  const m = /\/(media|games)\//.exec(fwd)
  if (!m) return null
  return fwd.slice(m.index).normalize('NFC')
}

const dbPath = process.argv[2]
const outPath = process.argv[3]
if (!dbPath || !outPath) {
  console.error('usage: node tools/vault-state/export.cjs <library.db> <out.json>')
  process.exit(1)
}
if (!fs.existsSync(dbPath)) { console.error(`no such database: ${dbPath}`); process.exit(1) }

const db = new Database(dbPath, { readonly: true })

// Older databases predate the game_playtime table (added in 1.24.2, which moved
// play_seconds out of media_items so it would survive orphan cleanup) and can
// predate favourites entirely. Recovering marks from an archived copy is a
// primary use of this tool, so read whatever schema is actually present rather
// than assuming the current one.
const tables = new Set(
  db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name)
)
const hasCol = (t, c) => {
  try { return db.prepare(`PRAGMA table_info(${t})`).all().some((r) => r.name === c) } catch { return false }
}

const out = { exportedAt: new Date().toISOString(), sourceDb: path.resolve(dbPath), items: [], playtime: [], favourites: [], skipped: [] }

for (const r of db.prepare(
  `SELECT file_path, title, category, genre, last_opened_at
     FROM media_items
    WHERE last_opened_at IS NOT NULL OR (genre IS NOT NULL AND genre <> '')`
).all()) {
  const k = relKey(r.file_path)
  if (!k) { out.skipped.push(r.file_path); continue }
  out.items.push({ k, title: r.title, category: r.category, genre: r.genre, lastOpenedAt: r.last_opened_at })
}

const ptRows = tables.has('game_playtime')
  ? db.prepare('SELECT file_path, play_seconds FROM game_playtime WHERE play_seconds > 0').all()
  : hasCol('media_items', 'play_seconds')
    ? db.prepare('SELECT file_path, play_seconds FROM media_items WHERE play_seconds > 0').all()
    : []
for (const r of ptRows) {
  const k = relKey(r.file_path)
  if (!k) { out.skipped.push(r.file_path); continue }
  out.playtime.push({ k, seconds: r.play_seconds })
}

const favRows = tables.has('favourites') ? db.prepare('SELECT album_path FROM favourites').all() : []
for (const r of favRows) {
  const k = relKey(r.album_path)
  if (!k) { out.skipped.push(r.album_path); continue }
  out.favourites.push({ k })
}

db.close()
// Only create the parent when it's actually missing — mkdir on an existing
// drive root (F:\) fails with EPERM, and writing state to a drive root is the
// normal case here.
const outDir = path.dirname(path.resolve(outPath))
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(outPath, JSON.stringify(out, null, 1))

const marked = out.items.filter((i) => i.lastOpenedAt !== null).length
const genred = out.items.filter((i) => i.genre).length
console.log(`exported to ${outPath}`)
console.log(`  watch marks (last_opened_at) : ${marked}`)
console.log(`  rows carrying a genre        : ${genred}`)
console.log(`  game playtime entries        : ${out.playtime.length}`)
console.log(`  favourite albums             : ${out.favourites.length}`)
console.log(`  unkeyable paths skipped      : ${out.skipped.length}`)
if (out.skipped.length) {
  console.log('  (skipped paths sit outside media/ and games/, so they have no stable identity)')
}
