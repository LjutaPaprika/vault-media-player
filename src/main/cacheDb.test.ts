import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import Database from 'better-sqlite3'
import { cachedKeys, cacheStats, closeCache, getCached, pruneCached, putCached, useCacheFile } from './cacheDb'

// A real cache.db in a temp folder; better-sqlite3 runs because the tests run
// inside Electron's Node (scripts/run-tests.mjs).
let dir: string
let file: string
const KEY = 'games/pc/trails in the sky 1st chapter/trails in the sky 1st chapter.jpg'
const T0 = Date.UTC(2026, 9, 28, 11, 43, 40)  // the cover as first added
const T1 = Date.UTC(2026, 10, 8, 22, 16, 48)  // the cover replaced under the same name
const img = (s: string): Buffer => Buffer.from(s)

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'vault-cachedb-test-'))
  file = join(dir, 'cache.db')
  useCacheFile(file)
})

afterEach(() => {
  useCacheFile(null)
  rmSync(dir, { recursive: true, force: true })
})

// Exactly what builds before 1.36.1 create and run (cacheDb.ts at 1.36.0).
const OLD_SCHEMA = `
  CREATE TABLE IF NOT EXISTS thumbnails (
    key          TEXT    PRIMARY KEY,
    source_mtime INTEGER NOT NULL,
    width        INTEGER NOT NULL,
    data         BLOB    NOT NULL
  );
  CREATE TABLE IF NOT EXISTS still_failures (
    key          TEXT    PRIMARY KEY,
    source_mtime INTEGER NOT NULL
  );`
const OLD_GET = 'SELECT data, width, source_mtime FROM thumbnails WHERE key = ?'
const OLD_PUT = 'INSERT OR REPLACE INTO thumbnails (key, source_mtime, width, data) VALUES (?, ?, ?, ?)'

function primaryKey(): string[] {
  const db = new Database(file, { readonly: true })
  try {
    return (db.prepare('PRAGMA table_info(thumbnails)').all() as { name: string; pk: number }[])
      .filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk).map((c) => c.name)
  } finally { db.close() }
}

test('the shelf (310) and the show page (640) keep their own copies instead of evicting each other', () => {
  putCached(KEY, T0, 310, img('small'))
  putCached(KEY, T0, 640, img('large'))
  const small = getCached(KEY, T0, 310)
  const large = getCached(KEY, T0, 640)
  assert.deepEqual([small?.data.toString(), small?.fresh], ['small', true])
  assert.deepEqual([large?.data.toString(), large?.fresh], ['large', true])
  assert.deepEqual(cacheStats().count, 2)
})

test('a cover replaced under the same name is not fresh at any width until remade', () => {
  putCached(KEY, T0, 310, img('old small'))
  putCached(KEY, T0, 640, img('old large'))
  assert.equal(getCached(KEY, T1, 310)?.fresh, false)
  assert.equal(getCached(KEY, T1, 640)?.fresh, false)
})

test('remaking one width drops the other widths made from the old file', () => {
  putCached(KEY, T0, 310, img('old small'))
  putCached(KEY, T0, 640, img('old large'))
  putCached(KEY, T1, 640, img('new large'))
  const small = getCached(KEY, T1, 310)
  // The old 310 is gone, so the 310 lookup falls back to the new 640 (not fresh).
  assert.deepEqual([small?.data.toString(), small?.fresh], ['new large', false])
  assert.equal(cacheStats().count, 1)
})

test('a width read an hour off (the same exFAT file seen from the other OS) is not dropped as stale', () => {
  putCached(KEY, T0, 310, img('small'))
  putCached(KEY, T0 + 3_600_000, 640, img('large'))
  assert.equal(cacheStats().count, 2)
  assert.equal(getCached(KEY, T0, 310)?.fresh, true)
})

test('with nothing at the asked width, another width is offered as not fresh; with nothing at all, null', () => {
  putCached(KEY, T0, 640, img('large'))
  assert.deepEqual([getCached(KEY, T0, 310)?.data.toString(), getCached(KEY, T0, 310)?.fresh], ['large', false])
  assert.equal(getCached('media/movies/none/none.jpg', T0, 310), null)
})

test('cachedKeys lists each source once, and pruning a source drops every width of it', () => {
  putCached(KEY, T0, 310, img('a'))
  putCached(KEY, T0, 640, img('b'))
  putCached('media/anime/k-on!/k-on!.jpg', T0, 310, img('c'))
  assert.deepEqual([...cachedKeys()].sort(), ['games/pc/trails in the sky 1st chapter/trails in the sky 1st chapter.jpg', 'media/anime/k-on!/k-on!.jpg'])
  assert.equal(pruneCached(new Set(['media/anime/k-on!/k-on!.jpg'])), 1)
  assert.equal(cacheStats().count, 1)
  assert.equal(getCached(KEY, T0, 310), null)
})

test('a cache made by an older build moves to per-width rows with every image kept', () => {
  closeCache()
  const old = new Database(file)
  old.exec(OLD_SCHEMA)
  old.prepare(OLD_PUT).run(KEY, T0, 640, img('cover'))
  old.prepare(OLD_PUT).run('media/anime/gintama/season 1/e003.mkv', T0, 310, img('still'))
  old.prepare('INSERT INTO still_failures (key, source_mtime) VALUES (?, ?)').run('media/tv/broken.mkv', T0)
  old.close()
  assert.deepEqual(primaryKey(), ['key'])

  assert.equal(getCached(KEY, T0, 640)?.data.toString(), 'cover')   // opens, and migrates
  assert.equal(getCached('media/anime/gintama/season 1/e003.mkv', T0, 310)?.data.toString(), 'still')
  assert.deepEqual(primaryKey(), ['key', 'width'])
  assert.equal(cacheStats().count, 2)

  // Opening again finds nothing to move and changes nothing.
  closeCache()
  assert.equal(getCached(KEY, T0, 640)?.fresh, true)
  assert.equal(cacheStats().count, 2)
  const db = new Database(file, { readonly: true })
  const tables = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name).sort()
  const failures = db.prepare('SELECT COUNT(*) AS n FROM still_failures').get() as { n: number }
  db.close()
  assert.deepEqual(tables, ['still_failures', 'thumbnails'])
  assert.equal(failures.n, 1)
})

test('an older build (a Mac not yet updated) still works against the migrated file', () => {
  putCached(KEY, T0, 310, img('small'))
  putCached(KEY, T0, 640, img('large'))
  closeCache()

  const old = new Database(file)
  old.exec(OLD_SCHEMA)                               // its CREATE IF NOT EXISTS is a no-op
  const row = old.prepare(OLD_GET).get(KEY) as { data: Buffer; width: number } | undefined
  assert.ok(row && ['small', 'large'].includes(row.data.toString()))
  old.prepare(OLD_PUT).run(KEY, T0, 640, img('large again'))   // replaces only its own width
  const n = (old.prepare('SELECT COUNT(*) AS n FROM thumbnails WHERE key = ?').get(KEY) as { n: number }).n
  old.close()
  assert.equal(n, 2)
  assert.equal(getCached(KEY, T0, 310)?.data.toString(), 'small')
  assert.equal(getCached(KEY, T0, 640)?.data.toString(), 'large again')
})
