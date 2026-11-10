import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { readAlbumJson, updateAlbumJson } from './albumJson'

function withDir(fn: (dir: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), 'vault-albumjson-'))
  try { fn(dir) } finally { rmSync(dir, { recursive: true, force: true }) }
}

test('readAlbumJson gives {} for a missing, corrupt or non-object file', () => {
  withDir((dir) => {
    assert.deepEqual(readAlbumJson(dir), {})
    for (const body of ['{oops', '[1,2]', 'null', '"x"']) {
      writeFileSync(join(dir, 'album.json'), body)
      assert.deepEqual(readAlbumJson(dir), {}, body)
    }
  })
})

test('updateAlbumJson changes only its own key and keeps the rest', () => {
  withDir((dir) => {
    writeFileSync(join(dir, 'album.json'), JSON.stringify({ artist: 'TV Girl', durations: { '01 - A.mp3': { duration: 1, probed: true } } }))
    updateAlbumJson(dir, (d) => ({ ...d, order: ['02 - B.mp3', '01 - A.mp3'] }))
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'album.json'), 'utf8')), {
      artist: 'TV Girl',
      durations: { '01 - A.mp3': { duration: 1, probed: true } },
      order: ['02 - B.mp3', '01 - A.mp3']
    })
    assert.deepEqual(readdirSync(dir), ['album.json'], 'no temporary file left behind')
  })
})

test('updateAlbumJson reads the file afresh, so an order saved meanwhile survives a metadata write', () => {
  withDir((dir) => {
    writeFileSync(join(dir, 'album.json'), JSON.stringify({ durations: {} }))
    const staleRead = readAlbumJson(dir)                      // the playlist page reads, then probes...
    updateAlbumJson(dir, (d) => ({ ...d, order: ['b', 'a'] }))  // ...a drag saves meanwhile...
    updateAlbumJson(dir, (d) => ({ ...d, durations: { ...(staleRead.durations as object), a: { duration: 2 } } }))
    assert.deepEqual(readAlbumJson(dir).order, ['b', 'a'])
  })
})

test('updateAlbumJson creates the file when there is none', () => {
  withDir((dir) => {
    updateAlbumJson(dir, (d) => ({ ...d, artist: 'X' }))
    assert.deepEqual(readAlbumJson(dir), { artist: 'X' })
  })
})

test('updateAlbumJson refuses to overwrite a file it cannot parse', () => {
  withDir((dir) => {
    writeFileSync(join(dir, 'album.json'), '{"artist": "Kept", ')
    assert.throws(() => updateAlbumJson(dir, (d) => ({ ...d, order: [] })))
    assert.equal(readFileSync(join(dir, 'album.json'), 'utf8'), '{"artist": "Kept", ')
    writeFileSync(join(dir, 'album.json'), '[1]')
    assert.throws(() => updateAlbumJson(dir, (d) => ({ ...d, order: [] })))
    assert.equal(readFileSync(join(dir, 'album.json'), 'utf8'), '[1]')
  })
})
