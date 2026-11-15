// Run with: node --test   (from tools/manga-dl)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseTitleId, pickUploads, chapterFileName, seriesFolderName } from './mangadex.js'

const up = (chapter, groups, extra = {}) => ({
  id: `${chapter}-${groups.join('+')}-${extra.pages ?? 20}`, chapter, title: extra.title ?? '', pages: extra.pages ?? 20,
  externalUrl: extra.externalUrl ?? null, groups, publishAt: extra.publishAt ?? '2020-01-01T00:00:00Z',
})

test('title ids are read from MangaDex links', () => {
  assert.equal(parseTitleId('https://mangadex.org/title/28b5d037-175d-4119-96f8-e860e408ebe9/shimeji-simulation'), '28b5d037-175d-4119-96f8-e860e408ebe9')
  assert.equal(parseTitleId('https://mangadex.org/title/28b5d037-175d-4119-96f8-e860e408ebe9'), '28b5d037-175d-4119-96f8-e860e408ebe9')
  assert.equal(parseTitleId('https://w9.smokingbehindthesupermarket.com/'), null)
  assert.equal(parseTitleId('https://mangadex.org/chapter/28b5d037-175d-4119-96f8-e860e408ebe9'), null)
})

test('one upload per chapter, sorted by number, extras kept', () => {
  const picked = pickUploads([up('2', ['A']), up('1', ['A']), up('10.5', ['A']), up('10', ['A'])])
  assert.deepEqual(picked.map(u => u.chapter), ['1', '2', '10', '10.5'])
})

test('the group that translated the most chapters wins every chapter it has', () => {
  const picked = pickUploads([
    up('1', ['big']), up('2', ['big']), up('3', ['big']),
    up('2', ['solo'], { pages: 40, publishAt: '2024-01-01T00:00:00Z' }), // more pages and newer, but a one-off
    up('4', ['solo']),                                                     // only one with chapter 4: used
  ])
  assert.deepEqual(picked.map(u => `${u.chapter}:${u.groups[0]}`), ['1:big', '2:big', '3:big', '4:solo'])
})

test('links to other sites and empty uploads are never picked', () => {
  const picked = pickUploads([
    up('1', ['A'], { externalUrl: 'https://mangaplus.shueisha.co.jp/viewer/1' }),
    up('1', ['B']),
    up('2', ['A'], { pages: 0 }),
  ])
  assert.deepEqual(picked.map(u => `${u.chapter}:${u.groups[0]}`), ['1:B'])
})

test('uploads with no chapter number (oneshots) are left out', () => {
  assert.deepEqual(pickUploads([up(null, ['A']), up('1', ['A'])]).map(u => u.chapter), ['1'])
})

test('a tie in coverage goes to the fuller upload, then the newer one', () => {
  const pages = pickUploads([up('1', ['A'], { pages: 18 }), up('1', ['B'], { pages: 22 })])
  assert.equal(pages[0].groups[0], 'B')
  const newer = pickUploads([up('1', ['A'], { publishAt: '2019-01-01T00:00:00Z' }), up('1', ['B'], { publishAt: '2021-01-01T00:00:00Z' })])
  assert.equal(newer[0].groups[0], 'B')
})

test('file names match the drive standard', () => {
  assert.equal(chapterFileName('1', 'The Beginning'), 'Chapter 001 - The Beginning.cbz')
  assert.equal(chapterFileName('10.5', ''), 'Chapter 010.5.cbz')
  assert.equal(chapterFileName('123', 'What? Why: "No"'), 'Chapter 123 - What Why No.cbz')
  assert.equal(chapterFileName('7', '  '), 'Chapter 007.cbz')
})

test('series folder names lose characters Windows and exFAT reject', () => {
  assert.equal(seriesFolderName('Keyman: The Hand of Judgement'), 'Keyman - The Hand of Judgement')
  assert.equal(seriesFolderName('7 Seeds'), '7 Seeds')
  assert.equal(seriesFolderName('What?/Why'), 'WhatWhy')
})
