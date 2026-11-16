import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normTitle, pickMatch, isOngoing, lookupSeries } from './mangaUpdates'

const hit = (id: string, title: string, hitTitle = title, type = 'Manga') =>
  ({ hit_title: hitTitle, record: { series_id: id, title, type } })

test('titles compare without case, punctuation or spacing', () => {
  assert.equal(normTitle("Frieren: Beyond Journey's End"), normTitle('frieren beyond journeys end'))
  assert.equal(normTitle('Kaguya-sama - Love is War'), 'kaguyasamaloveiswar')
})

test('an exact title or alias match wins over the first result', () => {
  const results = [
    hit('1', 'Kaguya Wants to be Confessed to Official Doujin', 'Kaguya Wants to be Confessed to Official Doujin'),
    hit('2', 'Kaguya-sama wa Kokurasetai', 'Kaguya-sama: Love is War')
  ]
  assert.deepEqual(pickMatch('Kaguya-sama - Love is War', results), { id: '2', title: 'Kaguya-sama wa Kokurasetai' })
})

test('the English name finds the series through its alias', () => {
  const results = [hit('7', 'Dosanko Gyaru wa Namara Menkoi', 'Hokkaido Gals Are Super Adorable!')]
  assert.deepEqual(pickMatch('Hokkaido Gals', results), { id: '7', title: 'Dosanko Gyaru wa Namara Menkoi' })
})

test('doujinshi, novels and anthologies are never picked', () => {
  const results = [
    hit('1', 'Spy x Family dj - Something', 'Spy x Family dj - Something', 'Doujinshi'),
    hit('2', 'Spy x Family (Novel)', 'Spy x Family (Novel)', 'Novel'),
    hit('3', 'SPY x FAMILY', 'SPY x FAMILY')
  ]
  assert.deepEqual(pickMatch('Spy X Family', results), { id: '3', title: 'SPY x FAMILY' })
})

test('no convincing match gives no answer rather than a wrong one', () => {
  assert.equal(pickMatch('Nemu The Corpse Bearer', [hit('9', 'Sleeping Flower (TOMOE Tenbu)')]), null)
  assert.equal(pickMatch('Anything', []), null)
})

test('running, paused and finished statuses', () => {
  assert.equal(isOngoing('18 Volumes (Ongoing)'), true)
  assert.equal(isOngoing('15 Volumes (Hiatus)'), true)
  assert.equal(isOngoing('27 Volumes (Complete)'), false)
  assert.equal(isOngoing('4 Volumes (Completed/Axed)'), false)
  assert.equal(isOngoing('10 Volumes (Complete/Discontinued)'), false)
  assert.equal(isOngoing(''), null)
})

test('a re-release still coming out does not make a finished series ongoing', () => {
  assert.equal(isOngoing('27 Volumes (Complete) 18 Kanzenban Volumes (Ongoing)'), false)
  assert.equal(isOngoing('43 Volumes (Ongoing) *[MORI Kouji continues]'), true)
})

test('a lookup searches once, then reuses the known id', async () => {
  const calls: string[] = []
  const fetchJson = async (url: string): Promise<unknown> => {
    calls.push(url)
    if (url.endsWith('/series/search')) return { results: [hit('42', 'Kagurabachi')] }
    return { title: 'Kagurabachi', status: '12 Volumes (Ongoing)', latest_chapter: 139 }
  }
  const first = await lookupSeries('Kagurabachi', null, fetchJson)
  assert.equal(first?.muId, '42')
  assert.equal(first?.latest, 139)
  assert.equal(first?.ongoing, true)
  calls.length = 0
  const again = await lookupSeries('Kagurabachi', '42', fetchJson)
  assert.equal(again?.latest, 139)
  assert.deepEqual(calls.map((u) => u.replace(/.*\/v1/, '')), ['/series/42'])
})

test('a missing latest chapter is null, not 0', async () => {
  const fetchJson = async (url: string): Promise<unknown> =>
    url.endsWith('/search') ? { results: [hit('5', 'Monster')] } : { title: 'Monster', status: '18 Volumes (Complete)', latest_chapter: 0 }
  assert.equal((await lookupSeries('Monster', null, fetchJson))?.latest, null)
})
