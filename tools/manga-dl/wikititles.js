/**
 * Chapter titles from a Wikipedia chapter list ("List of X chapters", or a series article
 * with a volume table). Only tables with class "wikitable" are read. Four layouts are
 * understood, tried in this order (the first title found for a number wins):
 *
 *   1. Labelled entries anywhere in a table:   Chapter 12: "Title"   /   Days 100: "Title"
 *   2. Numbered lists per volume:              <ol start="N"><li>"Title" (Japanese)</li>…
 *   3. Bulleted items numbered in their text:  <li>N. "Title" (Japanese)</li>
 *   4. Wide cells (colspan >= 4):              1. "Title" 2. "Title" …   or, failing that,
 *      "Title" "Title" … numbered in order. That last, weakest form is only used when
 *      nothing else on the page matched: on a series article it otherwise picks up any
 *      quoted word in a wide cell (one such stray match named a chapter "fertilizer").
 */
import { parse } from 'node-html-parser'

const Q = '"'
const NUM = '(\\d+(?:\\.\\d+)?)'
const QUOTED = `${Q}([^${Q}]{2,})${Q}`

function clean(text) {
  return text
    .replace(/[“”]/g, Q)   // curly quotes
    .replace(/\[\d+\]/g, '')         // footnote markers [12]
    .replace(/\s+/g, ' ')
    .trim()
}

/** A "title" that is only a label or a number: Part1, Vol. 3, Chapter 12, 17. */
export function isJunkTitle(title) {
  const t = (title || '').trim()
  if (t.length < 2) return true
  if (/^\d+(\.\d+)?$/.test(t)) return true
  return /^(part|vol(ume)?|chapter|ch|episode|ep)\.?\s*\d+(\.\d+)?$/i.test(t)
}

export function parseWikipediaChapters(html) {
  const root = parse(html)
  const tables = root.querySelectorAll('table.wikitable')
  const map = new Map()
  const add = (n, title) => {
    const t = title.trim()
    if (!isNaN(n) && !isJunkTitle(t) && !map.has(n)) map.set(n, t)
  }

  // 1. Labelled entries
  const labelled = new RegExp(`(?:Chapter|Ch\\.?|Days?)\\s*${NUM}\\s*:\\s*${QUOTED}`, 'gi')
  for (const table of tables) {
    for (const m of clean(table.textContent).matchAll(labelled)) add(parseFloat(m[1]), m[2])
  }

  // 2. Numbered lists
  const leading = new RegExp(`^${QUOTED}`)
  for (const table of tables) {
    for (const ol of table.querySelectorAll('ol')) {
      let n = parseInt(ol.getAttribute('start') || '1', 10)
      for (const li of ol.childNodes.filter(c => c.tagName === 'LI')) {
        const v = parseInt(li.getAttribute('value') || '', 10)
        if (!isNaN(v)) n = v
        const m = clean(li.textContent).match(leading)
        if (m) add(n, m[1])
        n++
      }
    }
  }

  // 3. Bulleted items numbered in their text
  const numberedItem = new RegExp(`^${NUM}\\.\\s*${QUOTED}`)
  for (const table of tables) {
    for (const li of table.querySelectorAll('li')) {
      const m = clean(li.textContent).match(numberedItem)
      if (m) add(parseFloat(m[1]), m[2])
    }
  }

  // 4. Wide cells
  const numberedRun = new RegExp(`${NUM}\\.\\.?\\s*${QUOTED}`, 'g')
  const quotedRun = new RegExp(QUOTED, 'g')
  const sequential = []
  for (const table of tables) {
    for (const td of table.querySelectorAll('td')) {
      if (parseInt(td.getAttribute('colspan') ?? '1', 10) < 4) continue
      // Drop parentheticals (Japanese titles, romaji, inline CSS from ruby templates)
      const text = clean(td.textContent).replace(/\([^)]*\)/g, '').replace(/\s+/g, ' ')
      if (!text.includes(Q)) continue
      const numbered = [...text.matchAll(numberedRun)]
      if (numbered.length) {
        for (const m of numbered) add(parseFloat(m[1]), m[2])
      } else {
        for (const m of text.matchAll(quotedRun)) sequential.push(m[1])
      }
    }
  }
  if (map.size === 0) {
    let n = 0
    for (const title of sequential) if (!isJunkTitle(title)) add(++n, title)
  }

  return map
}
