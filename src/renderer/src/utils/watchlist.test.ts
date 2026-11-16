import { test } from 'node:test'
import assert from 'node:assert/strict'
import { newestOnDrive, newestNumber, releaseStatus, watchNote, orderWatched } from './watchlist'

const vol = (title: string): MediaItem => ({ title, filePath: `E:/media/manga/X/${title}.cbz` } as MediaItem)
const now = Math.floor(Date.now() / 1000)

test('the newest entry on the drive is the last numbered one, extras skipped', () => {
  assert.equal(newestOnDrive([vol('Chapter 118 - A'), vol('Chapter 119 - B'), vol('Chapter 120 - C')], 'Ch.'), 'Ch. 120')
  assert.equal(newestOnDrive([vol('Chapter 119 - B'), vol('Chapter 120'), vol('Chapter 120.5 - Extras')], 'Ch.'), 'Ch. 120')
  assert.equal(newestOnDrive([vol('Volume 40'), vol('Volume 41')], 'Vol.'), 'Vol. 41')
  // Site-style names still give a number
  assert.equal(newestOnDrive([vol('Spy x Family Chapter 142'), vol('Spy x Family Chapter 143')], 'Ch.'), 'Ch. 143')
})

test('without a number, the newest entry is shown by its name', () => {
  assert.equal(newestOnDrive([vol('Prologue'), vol('The Last Day')], '#'), 'The Last Day')
  assert.equal(newestOnDrive([], 'Ch.'), null)
})

test('the note says when the series was last checked, or that it never was', () => {
  assert.equal(watchNote({ addedAt: now - 86400 * 9, checkedAt: now - 86400 * 3 }), 'checked 3 days ago')
  assert.equal(watchNote({ addedAt: now - 30, checkedAt: null }), 'not checked yet')
  assert.equal(watchNote({ addedAt: now - 86400 * 9, checkedAt: now - 10 }), 'checked just now')
})

test('series unchecked the longest come first; never-checked ones count from when they were added', () => {
  const order = orderWatched([
    { name: 'Fresh', info: { addedAt: now - 100, checkedAt: now - 50 } },
    { name: 'Old', info: { addedAt: now - 86400 * 40, checkedAt: now - 86400 * 20 } },
    { name: 'Never', info: { addedAt: now - 86400 * 30, checkedAt: null } },
    { name: 'Also fresh', info: { addedAt: now - 100, checkedAt: now - 50 } }
  ]).map((e) => e.name)
  assert.deepEqual(order, ['Never', 'Old', 'Also fresh', 'Fresh'])
})

const meta = (latest: number | null): SeriesReleaseInfo =>
  ({ muId: '1', muTitle: 'X', status: '5 Volumes (Ongoing)', ongoing: true, latest, fetchedAt: now })

test('the newest number on the drive ignores extras', () => {
  assert.equal(newestNumber([vol('Chapter 119'), vol('Chapter 120 - C'), vol('Chapter 120.5 - Extras')]), 120)
  assert.equal(newestNumber([vol('Prologue')]), null)
})

test('an online check: new chapters, up to date, or a source that lags', () => {
  assert.deepEqual(releaseStatus(120, meta(139)), { newCount: 19, badge: '+19 new', line: 'Ch. 139 is out' })
  assert.deepEqual(releaseStatus(143, meta(143)), { newCount: 0, line: 'up to date' })
  assert.deepEqual(releaseStatus(120, undefined), { newCount: 0, line: 'not checked online yet' })
  assert.equal(releaseStatus(120, meta(null)).line, 'No online info')
})

test('a source behind the drive reads "Unknown", short enough for a card, with the reason on hover', () => {
  // Bleach: the drive has more than MangaUpdates logged — unknown, not "up to date"
  const s = releaseStatus(686, meta(250))
  assert.equal(s.line, 'Unknown · online Ch. 250')
  assert.equal(s.newCount, 0)
  assert.match(s.why ?? '', /behind your drive/)
  assert.ok(s.line.length <= 26, `too long for a card: ${s.line}`)
})

test('volumes on the drive are not compared with chapters online (Berserk: Vol. 41 vs Ch. 386)', () => {
  const s = releaseStatus(41, meta(386), 'Vol.')
  assert.equal(s.line, 'Online: Ch. 386')
  assert.equal(s.newCount, 0)
  assert.equal(s.badge, undefined)
})
