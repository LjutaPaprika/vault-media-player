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

for (const r of db.prepare('SELECT file_path, play_seconds FROM game_playtime WHERE play_seconds > 0').all()) {
  const k = relKey(r.file_path)
  if (!k) { out.skipped.push(r.file_path); continue }
  out.playtime.push({ k, seconds: r.play_seconds })
}

for (const r of db.prepare('SELECT album_path FROM favourites').all()) {
  const k = relKey(r.album_path)
  if (!k) { out.skipped.push(r.album_path); continue }
  out.favourites.push({ k })
}

db.close()
fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true })
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
