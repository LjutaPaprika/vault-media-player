import { test } from 'node:test'
import assert from 'node:assert/strict'
import { posix } from 'path'
import { filePathFromProtocolUrl, parseThumbUrl } from './protocolPaths'
import { protocolUrl } from '../renderer/src/utils/mediaUrl'
import { artworkVersion, bumpArtworkVersion, subscribeArtworkVersion } from '../renderer/src/utils/artworkVersion'

// Both ends of the contract: the URL the renderer builds and what the main
// process reads back out of it.
const COVER = 'E:\\games\\pc\\Trails in the Sky 1st Chapter\\Trails in the Sky 1st Chapter.jpg'

test('the version rides in the query and the main process still reads the same file and width', () => {
  const url = protocolUrl('thumb', COVER, 310, 1234)
  assert.match(url, /\?v=1234$/)
  assert.deepEqual(parseThumbUrl(url, 'win32'), {
    width: 310, filePath: 'E:/games/pc/Trails in the Sky 1st Chapter/Trails in the Sky 1st Chapter.jpg'
  })
  assert.equal(filePathFromProtocolUrl(protocolUrl('media', COVER, undefined, 1234), 'win32'),
    'E:/games/pc/Trails in the Sky 1st Chapter/Trails in the Sky 1st Chapter.jpg')
})

test('a "?" or "#" in a file name stays part of the path, not the query', () => {
  for (const name of ['Who Is This Bro？.jpg', 'Why? #1.jpg', 'Hits #1 & more.jpg']) {
    const url = protocolUrl('thumb', `E:\\media\\x\\${name}`, 520, 7)
    assert.deepEqual(parseThumbUrl(url, 'win32'), { width: 520, filePath: `E:/media/x/${name}` })
  }
  // A POSIX path arrives as "//Volumes/..." (its leading "/" is an empty first
  // segment); it always has, and the file system reads it as "/Volumes/...".
  const mac = filePathFromProtocolUrl(protocolUrl('media', '/Volumes/VAULT/media/x/Why? #1.jpg', undefined, 7), 'darwin')
  assert.equal(posix.normalize(mac), '/Volumes/VAULT/media/x/Why? #1.jpg')
})

test('without a version the URL is as before', () => {
  assert.equal(protocolUrl('thumb', 'E:\\a\\b.jpg', 310), 'thumb://310/E%3A/a/b.jpg')
})

test('a scan gives every cover a new URL, so a replaced one is fetched again', () => {
  let heard = 0
  const stop = subscribeArtworkVersion(() => heard++)
  const before = protocolUrl('thumb', COVER, 310, artworkVersion())
  bumpArtworkVersion()
  const after = protocolUrl('thumb', COVER, 310, artworkVersion())
  assert.notEqual(after, before)
  assert.equal(heard, 1)
  stop()
  bumpArtworkVersion()
  assert.equal(heard, 1)
})

test('two scans in the same millisecond still give different versions', () => {
  const v1 = artworkVersion()
  bumpArtworkVersion(0)
  const v2 = artworkVersion()
  bumpArtworkVersion(0)
  assert.ok(v2 > v1 && artworkVersion() > v2)
})
