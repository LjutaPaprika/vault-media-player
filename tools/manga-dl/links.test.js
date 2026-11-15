// Run with: node --test   (from tools/manga-dl)
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parse } from 'node-html-parser'
import { chapterLinkTitle, fixChapterNumber, urlChapterNumber } from './links.js'

const title = (html) => chapterLinkTitle(parse(html).querySelector('a'))

test('a date in its own element is dropped, not glued onto the number', () => {
  // smokingbehindthesupermarket.com: "Chapter 21.1" + "3 years ago" used to read "Chapter 21.13 years ago"
  assert.equal(title('<a href="/x-chapter-21-1/"><span>Chapter 21.1</span><span class="chapter-date">3 years ago</span></a>'), 'Chapter 21.1')
  assert.equal(title('<a href="/x-chapter-2/"><span>Chapter 2</span><span class="chapter-date">3 years ago</span></a>'), 'Chapter 2')
  // Madara-style themes
  assert.equal(title('<a href="/c/5/">Chapter 5 <span class="chapter-release-date"><i>May 3, 2024</i></span></a>'), 'Chapter 5')
})

test('a relative date with no class is still trimmed off the end', () => {
  assert.equal(title('<a href="/c/21/"><span>Chapter 21</span><span>3 years ago</span></a>'), 'Chapter 21')
  assert.equal(title('<a href="/c/42-5/"><b>Chapter 42.5</b><i>10 months ago</i></a>'), 'Chapter 42.5')
})

test('"First / New Chapter" button labels are dropped', () => {
  assert.equal(title('<a href="/c/1/"><span>First Chapter</span><span class="chapter-title">Chapter 1</span></a>'), 'Chapter 1')
  assert.equal(title('<a href="/c/67/"><span>New Chapter</span><span class="chapter-title hover-push1">Chapter 67</span></a>'), 'Chapter 67')
  // A label alone is left alone: there is nothing better to name it by.
  assert.equal(title('<a href="/c/67/">Latest Chapter</a>'), 'Latest Chapter')
})

test('elements are separated by a space; plain titles are unchanged', () => {
  assert.equal(title('<a href="/c/3/"><span>Chapter 3</span><span>The Rooftop</span></a>'), 'Chapter 3 The Rooftop')
  assert.equal(title('<a href="/c/9/">Chainsaw Man, Chapter 9:  Rescue</a>'), 'Chainsaw Man, Chapter 9: Rescue')
  assert.equal(title('<a href="/c/9/">Vol. 2 Chapter 9 - Year One</a>'), 'Vol. 2 Chapter 9 - Year One')
  assert.equal(title('<a href="/c/9/"></a>'), '')
})

test('a title whose number disagrees with its link takes the link\'s number', () => {
  // dandadanmanga-online.net titles chapter 249 "Dandadan Manga Chapter 24": it was skipped as "already exists"
  assert.equal(fixChapterNumber('Dandadan Manga Chapter 24', 'https://dandadanmanga-online.net/manga/dandadan-chapter-249/'), 'Dandadan Manga Chapter 249')
  assert.equal(fixChapterNumber('Chapter 7: The Lake', 'https://x.com/series-chapter-8/'), 'Chapter 8: The Lake')
  assert.equal(urlChapterNumber('https://x.com/manga/x-chapter-21-1/'), '21.1')
})

test('titles that agree with their link, or have no number to compare, are unchanged', () => {
  assert.equal(fixChapterNumber('Dandadan Manga Chapter 24', 'https://dandadanmanga-online.net/manga/dandadan-chapter-24/'), 'Dandadan Manga Chapter 24')
  assert.equal(fixChapterNumber('Chapter 21.1', 'https://x.com/x-chapter-21-1/'), 'Chapter 21.1')
  assert.equal(fixChapterNumber('Chapter 024', 'https://x.com/x-chapter-24/'), 'Chapter 024')
  assert.equal(fixChapterNumber('Chapter 001', 'https://weebcentral.com/chapters/01J76XYYS4BDMVFT4XCXBWCNP8'), 'Chapter 001')
  assert.equal(fixChapterNumber('First chapter', 'https://x.com/x-chapter-1/'), 'First chapter')
  assert.equal(fixChapterNumber('Chapter 3', 'https://x.com/read.php?c=4'), 'Chapter 3')
})
