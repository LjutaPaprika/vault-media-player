import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyTrackOrder, checkTrackOrder, compareTrackFiles, isCustomOrder, moveItem, reorderQueue, trackFileName
} from './trackOrder'

const FILES = ['02 - B.mp3', '01 - A.mp3', '03 - C.mp3']

test('with no saved order, tracks play in file-name order', () => {
  for (const saved of [undefined, null, [], 'nonsense', { a: 1 }]) {
    assert.deepEqual(applyTrackOrder(FILES, saved), ['01 - A.mp3', '02 - B.mp3', '03 - C.mp3'], String(saved))
  }
})

test('track numbers compare as numbers, so 100 follows 99', () => {
  const files = ['100 - Z.mp3', '99 - Y.mp3', '9 - X.mp3']
  assert.deepEqual([...files].sort(compareTrackFiles), ['9 - X.mp3', '99 - Y.mp3', '100 - Z.mp3'])
})

test('two-digit names keep exactly the order a plain sort gave them', () => {
  // Every playlist on the drive today is "NN - ..."; switching comparators must not move anything.
  const files = ['10 - b.mp3', '02 - a.mp3', '01 - Z.mp3', '01 - a.mp3', 'cover.mp3', 'Intro.mp3']
  assert.deepEqual([...files].sort(compareTrackFiles), [...files].sort())
})

test('a saved order is followed', () => {
  assert.deepEqual(applyTrackOrder(FILES, ['03 - C.mp3', '01 - A.mp3', '02 - B.mp3']), ['03 - C.mp3', '01 - A.mp3', '02 - B.mp3'])
})

test('tracks added since the order was saved go at the end, in file-name order', () => {
  const files = [...FILES, '05 - E.mp3', '04 - D.mp3']
  assert.deepEqual(
    applyTrackOrder(files, ['03 - C.mp3', '01 - A.mp3', '02 - B.mp3']),
    ['03 - C.mp3', '01 - A.mp3', '02 - B.mp3', '04 - D.mp3', '05 - E.mp3']
  )
})

test('saved names whose file is gone, repeats and non-strings are skipped', () => {
  assert.deepEqual(
    applyTrackOrder(FILES, ['03 - C.mp3', 'gone.mp3', 3, '03 - C.mp3', null, '02 - B.mp3']),
    ['03 - C.mp3', '02 - B.mp3', '01 - A.mp3']
  )
})

test('isCustomOrder: only an order that actually differs from file-name order counts', () => {
  assert.equal(isCustomOrder(FILES, undefined), false)
  assert.equal(isCustomOrder(FILES, []), false)
  assert.equal(isCustomOrder(FILES, ['01 - A.mp3', '02 - B.mp3', '03 - C.mp3']), false)
  assert.equal(isCustomOrder(FILES, ['01 - A.mp3']), false)
  assert.equal(isCustomOrder(FILES, ['02 - B.mp3', '01 - A.mp3']), true)
})

test('moveItem moves one item up or down and leaves the input alone', () => {
  const list = ['a', 'b', 'c', 'd']
  assert.deepEqual(moveItem(list, 0, 2), ['b', 'c', 'a', 'd'])
  assert.deepEqual(moveItem(list, 3, 0), ['d', 'a', 'b', 'c'])
  assert.deepEqual(moveItem(list, 1, 1), list)
  assert.deepEqual(moveItem(list, -1, 2), list)
  assert.deepEqual(moveItem(list, 1, 4), list)
  assert.deepEqual(list, ['a', 'b', 'c', 'd'])
})

test('checkTrackOrder accepts a list of the folder\'s names, dropping ones that are gone', () => {
  assert.deepEqual(checkTrackOrder(['03 - C.mp3', 'gone.mp3', '01 - A.mp3'], FILES), { ok: true, order: ['03 - C.mp3', '01 - A.mp3'] })
  assert.deepEqual(checkTrackOrder([], FILES), { ok: true, order: [] })
})

test('checkTrackOrder refuses paths, repeats and anything that is not a list of names', () => {
  for (const bad of [
    null, 'x', { 0: 'a' }, [1], [''], ['..'], ['.'],
    ['..\\..\\Windows\\win.ini'], ['sub/03 - C.mp3'], ['C:\\03 - C.mp3'],
    ['01 - A.mp3', '01 - A.mp3']
  ]) {
    assert.equal(checkTrackOrder(bad, FILES).ok, false, JSON.stringify(bad))
  }
})

test('trackFileName handles both separators', () => {
  assert.equal(trackFileName('E:\\media\\music\\Lofi\\01 - A.mp3'), '01 - A.mp3')
  assert.equal(trackFileName('/Volumes/VAULT/media/music/Lofi/01 - A.mp3'), '01 - A.mp3')
  assert.equal(trackFileName('01 - A.mp3'), '01 - A.mp3')
})

const t = (p: string): { path: string } => ({ path: p })
const A = t('a'), B = t('b'), C = t('c'), D = t('d'), X = t('x')

test('reorderQueue: playing straight through, the queue follows the drag and the song keeps playing', () => {
  const r = reorderQueue({ queue: [A, B, C, D], currentIndex: 1, original: [A, B, C, D], shuffled: false }, [A, B, C, D], [C, A, B, D])
  assert.deepEqual(r, { queue: [C, A, B, D], currentIndex: 2, original: [C, A, B, D] })
})

test('reorderQueue: shuffled, only the order shuffle-off returns to changes', () => {
  const r = reorderQueue({ queue: [B, D, A, C], currentIndex: 0, original: [A, B, C, D], shuffled: true }, [A, B, C, D], [D, C, B, A])
  assert.deepEqual(r, { queue: [B, D, A, C], currentIndex: 0, original: [D, C, B, A] })
})

test('reorderQueue: another playlist, a mix or a stale queue is left alone', () => {
  const before = [A, B, C], after = [C, B, A]
  // another playlist
  assert.equal(reorderQueue({ queue: [X], currentIndex: 0, original: [X], shuffled: false }, before, after), null)
  // a one-playlist "Shuffled Mix": random order, shuffle flag off
  assert.equal(reorderQueue({ queue: [B, C, A], currentIndex: 0, original: [B, C, A], shuffled: false }, before, after), null)
  // queue built before a track was added
  assert.equal(reorderQueue({ queue: [A, B], currentIndex: 0, original: [A, B], shuffled: false }, before, after), null)
  // shuffled, but from some other source
  assert.equal(reorderQueue({ queue: [X, A], currentIndex: 0, original: [X, A], shuffled: true }, before, after), null)
  // nothing playing
  assert.equal(reorderQueue({ queue: [], currentIndex: 0, original: [], shuffled: false }, before, after), null)
})
