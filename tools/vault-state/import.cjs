#!/usr/bin/env node
/**
 * Restore Vault state from an export produced by export.cjs, matching on
 * library-RELATIVE path so the target drive's letter, label and root don't
 * matter.
 *
 *   preview:  node tools/vault-state/import.cjs <library.db> <state.json>
 *   apply  :  node tools/vault-state/import.cjs <library.db> <state.json> --apply
 *
 * Conservative by design — it only ever adds information back:
 *   * previews unless --apply is passed
 *   * never overwrites a NEWER last_opened_at already in the target, so
 *     anything watched since the export survives
 *   * playtime merges with MAX, the same rule rerootPaths uses, so a larger
 *     accumulated total is never reduced
 *   * genre only fills where the target has none, so scanner-derived values
 *     from movie.json / album.json keep priority
 *   * idempotent — running twice is a no-op
 *
 * Entries whose media isn't present are reported, not invented. Restore the
 * media and re-run to pick them up.
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
const jsonPath = process.argv[3]
const APPLY = process.argv.includes('--apply')
if (!dbPath || !jsonPath) {
  console.error('usage: node tools/vault-state/import.cjs <library.db> <state.json> [--apply]')
  process.exit(1)
}
if (!fs.existsSync(dbPath))   { console.error(`no such database: ${dbPath}`); process.exit(1) }
if (!fs.existsSync(jsonPath)) { console.error(`no such state file: ${jsonPath}`); process.exit(1) }

const state = JSON.parse(fs.readFileSync(jsonPath, 'utf8'))
const db = new Database(dbPath)

console.log(`state file : ${jsonPath}`)
console.log(`exported   : ${state.exportedAt}`)
console.log(`target db  : ${path.resolve(dbPath)}`)
console.log(APPLY ? 'mode       : APPLY\n' : 'mode       : PREVIEW (pass --apply to write)\n')

// Index the target library by relative key.
const byKey = new Map()
for (const r of db.prepare('SELECT file_path, genre, last_opened_at FROM media_items').all()) {
  const k = relKey(r.file_path)
  if (k) byKey.set(k, r)
}
console.log(`target holds ${byKey.size} keyable rows\n`)

const st = { markApplied: 0, markNewerKept: 0, markSame: 0, genreApplied: 0, genreKept: 0,
             ptApplied: 0, ptKeptLarger: 0, favApplied: 0, favAlready: 0, missing: [] }

const setMark  = db.prepare('UPDATE media_items SET last_opened_at = ? WHERE file_path = ?')
const setGenre = db.prepare('UPDATE media_items SET genre = ? WHERE file_path = ?')
const upsertPt = db.prepare(`INSERT INTO game_playtime (file_path, play_seconds) VALUES (?, ?)
                             ON CONFLICT(file_path) DO UPDATE SET play_seconds = MAX(play_seconds, excluded.play_seconds)`)
const addFav   = db.prepare('INSERT OR IGNORE INTO favourites (album_path) VALUES (?)')
const hasFav   = db.prepare('SELECT 1 FROM favourites WHERE album_path = ?')
const getPt    = db.prepare('SELECT play_seconds FROM game_playtime WHERE file_path = ?')

db.transaction(() => {
  for (const it of state.items) {
    const cur = byKey.get(it.k)
    if (!cur) { st.missing.push(it.k); continue }

    if (it.lastOpenedAt !== null && it.lastOpenedAt !== undefined) {
      if (cur.last_opened_at === null || cur.last_opened_at === undefined || cur.last_opened_at < it.lastOpenedAt) {
        if (APPLY) setMark.run(it.lastOpenedAt, cur.file_path)
        st.markApplied++
      } else if (cur.last_opened_at > it.lastOpenedAt) st.markNewerKept++
      else st.markSame++
    }

    if (it.genre) {
      if (!cur.genre || cur.genre.trim() === '') {
        if (APPLY) setGenre.run(it.genre, cur.file_path)
        st.genreApplied++
      } else st.genreKept++
    }
  }

  for (const p of state.playtime) {
    const cur = byKey.get(p.k)
    if (!cur) { st.missing.push(p.k); continue }
    const existing = getPt.get(cur.file_path)
    if (existing && existing.play_seconds >= p.seconds) { st.ptKeptLarger++; continue }
    if (APPLY) upsertPt.run(cur.file_path, p.seconds)
    st.ptApplied++
  }

  // favourites.album_path holds the album's FIRST TRACK file path, not a
  // directory — the same key the music page identifies an album by. So this is
  // an ordinary file lookup. Re-keying also repairs entries left pointing at a
  // previous OS's mount root, which the app's own reroot can miss.
  for (const f of state.favourites) {
    const cur = byKey.get(f.k)
    if (!cur) { st.missing.push('(favourite) ' + f.k); continue }
    if (hasFav.get(cur.file_path)) { st.favAlready++; continue }
    if (APPLY) addFav.run(cur.file_path)
    st.favApplied++
  }
})()

console.log('=== RESULT ===')
console.log(`  watch marks restored      : ${st.markApplied}`)
console.log(`  marks already newer, kept : ${st.markNewerKept}`)
console.log(`  marks identical           : ${st.markSame}`)
console.log(`  genres filled in          : ${st.genreApplied}`)
console.log(`  genres already set, kept  : ${st.genreKept}`)
console.log(`  playtime rows restored    : ${st.ptApplied}`)
console.log(`  playtime already larger   : ${st.ptKeptLarger}`)
console.log(`  favourites restored       : ${st.favApplied}`)
console.log(`  favourites already set    : ${st.favAlready}`)
console.log(`  entries with no match     : ${st.missing.length}`)
if (st.missing.length) {
  console.log('\n  not present in the target library (media not restored yet):')
  for (const m of st.missing.slice(0, 25)) console.log(`    ${m}`)
  if (st.missing.length > 25) console.log(`    ... +${st.missing.length - 25} more`)
}
if (!APPLY) console.log('\n  PREVIEW ONLY — nothing was written. Re-run with --apply.')
db.close()
