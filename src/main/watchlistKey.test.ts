import { test } from 'node:test'
import assert from 'node:assert/strict'
import { watchKey } from './watchlistKey'

test('a series folder gets the same key on any drive letter or OS', () => {
  const win = watchKey('E:\\', 'E:\\media\\manga\\Kagurabachi')
  assert.equal(win, 'media/manga/kagurabachi')
  assert.equal(watchKey('F:\\', 'F:\\media\\manga\\Kagurabachi'), win)
  assert.equal(watchKey('/Volumes/VAULT', '/Volumes/VAULT/media/manga/Kagurabachi'), win)
})

test('case, slashes and Unicode spelling do not change the key', () => {
  assert.equal(watchKey('E:\\', 'E:/media/manga/KAGURABACHI/'), 'media/manga/kagurabachi')
  // é as one code point (NFC) and as e + combining accent (NFD, as macOS may report it)
  assert.equal(watchKey('E:\\', 'E:\\media\\manga\\Caf\u00e9'), watchKey('E:\\', 'E:\\media\\manga\\Cafe\u0301'))
})

test('a folder outside the library has no key', () => {
  assert.equal(watchKey('E:\\', 'D:\\elsewhere\\Kagurabachi'), null)
  assert.equal(watchKey('E:\\', 'E:\\'), null)
})
