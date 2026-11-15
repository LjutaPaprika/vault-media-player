// Run with: node --test   (from tools/manga-dl)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fullChapterListUrl, lazyImagesUrl, hashTitle, seriesNameFromUrl } from './lazy.js'

const SERIES = 'https://weebcentral.com/series/01J76XYBYX6EGVR7ZNC8VKFJD1/To-You-The-Immortal'

test('the "Show All Chapters" button gives the full chapter list', () => {
  // weebcentral.com: the series page only shows chapters 1-3 and the newest 6
  const html = '<button class="p-2" hx-get="https://weebcentral.com/series/01J76XYBYX6EGVR7ZNC8VKFJD1/full-chapter-list" hx-target="#chapter-list">Show All Chapters</button>'
  assert.equal(fullChapterListUrl(html, SERIES), 'https://weebcentral.com/series/01J76XYBYX6EGVR7ZNC8VKFJD1/full-chapter-list')
  assert.equal(fullChapterListUrl('<button hx-get="/series/X/full-chapter-list">', SERIES), 'https://weebcentral.com/series/X/full-chapter-list')
})

test('pages without the button are left alone', () => {
  assert.equal(fullChapterListUrl('<a href="/manga/x-chapter-1/">Chapter 1</a>', SERIES), null)
  assert.equal(fullChapterListUrl('<div hx-get="https://weebcentral.com/comments/contents/X?content_type=series">', SERIES), null)
})

test('the reader script\'s image request gets every page at once', () => {
  const html = `htmx.ajax(
      'GET',
      "https://weebcentral.com/chapters/01J76XYYS4BDMVFT4XCXBWCNP8/images?is_prev=False",
      { target: el, values: { reading_style: this.reading_style, current_page: this.page } })`
  assert.equal(lazyImagesUrl(html, 'https://weebcentral.com/chapters/01J76XYYS4BDMVFT4XCXBWCNP8'),
    'https://weebcentral.com/chapters/01J76XYYS4BDMVFT4XCXBWCNP8/images?is_prev=False&current_page=1&reading_style=long_strip')
  assert.equal(lazyImagesUrl('<img src="https://x.com/static/images/brand.png">', 'https://x.com/c/1'), null)
})

test('"# N" chapter labels become padded chapter titles', () => {
  // the link also holds a hidden "Last Read" label and the release time
  assert.equal(hashTitle('# 1 Last Read 2024-09-07T17:04:15.717343Z'), 'Chapter 001')
  assert.equal(hashTitle('# 196'), 'Chapter 196')
  assert.equal(hashTitle('#12.5 Last Read'), 'Chapter 012.5')
  assert.equal(hashTitle('Chapter 5'), 'Chapter 5')        // other sites unchanged
  assert.equal(hashTitle('Vol 2 # 3'), 'Vol 2 # 3')
})

test('the series name comes from the series link', () => {
  assert.equal(seriesNameFromUrl(SERIES), 'To You The Immortal')
  assert.equal(seriesNameFromUrl('https://weebcentral.com/series/01ABC/Kagurabachi/'), 'Kagurabachi')
  assert.equal(seriesNameFromUrl('https://readkagura.com/'), null)
})
