import { test } from 'node:test'
import assert from 'node:assert/strict'
import { checkPlaylistName, describeDestination, nextTrackNumber, playlistIndexField } from './playlistTarget'

const EXISTING = ['Meme', 'EFAP', 'Pretty Much It']

test('a plain new name is accepted, with its spacing tidied', () => {
  assert.deepEqual(checkPlaylistName('  Road   trip ', EXISTING), { ok: true, name: 'Road trip' })
})

test('a blank name is refused instead of quietly saving loose videos', () => {
  for (const raw of ['', '   ', '\t']) {
    assert.deepEqual(checkPlaylistName(raw, EXISTING), { ok: false, error: 'Enter a name for the playlist.' })
  }
})

test('characters that would make a subfolder or fail on the drive are refused', () => {
  for (const raw of ['Anime/OPs', 'a\\b', 'Why?', 'Part: 2', 'say "hi"', 'a<b', 'a|b', 'a*']) {
    const r = checkPlaylistName(raw, EXISTING)
    assert.equal(r.ok, false, raw)
    assert.ok('error' in r && r.error.includes('can\'t contain'), raw)
  }
})

test('names Windows reserves, dot names and overlong names are refused', () => {
  for (const raw of ['CON', 'nul', 'com1', 'LPT9.txt', '.', '..', 'Ends with a dot.', 'x'.repeat(101)]) {
    assert.equal(checkPlaylistName(raw, EXISTING).ok, false, raw)
  }
  assert.equal(checkPlaylistName('Console', EXISTING).ok, true)
})

test('a name the drive already has, in any case, points at that playlist', () => {
  assert.deepEqual(checkPlaylistName('meme', EXISTING), { ok: false, existing: 'Meme' })
  assert.deepEqual(checkPlaylistName(' pretty much  it ', EXISTING), { ok: false, existing: 'Pretty Much It' })
})

test('the next track number continues the playlist, ignoring unnumbered files', () => {
  assert.equal(nextTrackNumber([]), 1)
  assert.equal(nextTrackNumber(['cover.jpg', 'notes']), 1)
  assert.equal(nextTrackNumber(['01 - A.mp3', '17 - B.mp3', '03 - C.mp3', 'Bonus.mp3']), 18)
  assert.equal(nextTrackNumber(['099 - A.mp3']), 100)
})

test('a whole YouTube playlist added to a non-empty one continues its numbers', () => {
  assert.equal(playlistIndexField(1), '%(playlist_index)02d')
  assert.equal(playlistIndexField(18), '%(playlist_index+17)02d')
  assert.equal(playlistIndexField(0), '%(playlist_index)02d')
})

test('the sentence says plainly where videos go', () => {
  assert.equal(describeDestination({ target: { kind: 'none' }, noun: 'video', count: 2 }),
    '2 videos will be saved on their own, outside any playlist.')
  assert.equal(describeDestination({ target: { kind: 'none' }, noun: 'video', count: 1 }),
    '1 video will be saved on its own, outside any playlist.')
  assert.equal(describeDestination({ target: { kind: 'existing', name: 'Meme' }, noun: 'video', count: 1, existingCount: 14 }),
    '1 video will be added to Meme (14 videos now).')
  assert.equal(describeDestination({ target: { kind: 'new', name: '  Road  trip ' }, noun: 'video', count: 3 }),
    '3 videos will be saved in a new playlist, “Road trip”.')
  assert.equal(describeDestination({ target: { kind: 'new', name: '' }, noun: 'video', count: 0 }),
    'The videos you add will be saved in a new playlist.')
})

test('for music it also says which numbers the new tracks get', () => {
  const target = { kind: 'existing', name: 'Bleeding Out in the Snow' } as const
  assert.equal(describeDestination({ target, noun: 'track', count: 3, existingCount: 17, firstNumber: 18 }),
    '3 tracks will be added to Bleeding Out in the Snow (17 tracks now) as tracks 18–20.')
  assert.equal(describeDestination({ target, noun: 'track', count: 1, existingCount: 17, firstNumber: 18 }),
    '1 track will be added to Bleeding Out in the Snow (17 tracks now) as track 18.')
  assert.equal(describeDestination({ target, noun: 'track', count: null, existingCount: 17, firstNumber: 18 }),
    'Every track in the YouTube playlist will be added to Bleeding Out in the Snow (17 tracks now), numbered from 18.')
})
