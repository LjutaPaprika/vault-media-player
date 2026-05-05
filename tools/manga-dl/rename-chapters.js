#!/usr/bin/env node
/**
 * rename-chapters.js — fetch chapter titles from MangaDex and/or Wikipedia, rename CBZ files
 *
 * Usage:
 *   node rename-chapters.js --manga "Chainsaw Man" --folder "E:/media/manga/Chainsaw Man"
 *   node rename-chapters.js --id <mangadex-uuid> --folder "E:/media/manga/Centuria"
 *   node rename-chapters.js --wikipedia "https://en.wikipedia.org/wiki/Kagurabachi" --folder "E:/media/manga/Kagurabachi"
 *   node rename-chapters.js --manga "Kagurabachi" --wikipedia "https://en.wikipedia.org/wiki/Kagurabachi" --folder "..."
 *   node rename-chapters.js --manga "Kagurabachi" --folder "E:/media/manga/Kagurabachi" --dry-run
 *
 * Sources can be combined: MangaDex runs first, Wikipedia fills gaps and overrides with official titles.
 * Either source can be used alone (--wikipedia without --manga/--id, or vice versa).
 *
 * Output format:  Chapter 001 - Title.cbz
 *                 Chapter 010.5 - Bonus.cbz   ← decimal = "Extra" pill in Vault
 */

import { readdirSync, renameSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { parse as parseHtml } from 'node-html-parser'

const MDEX = 'https://api.mangadex.org'
const UA   = 'VaultMangaDl/1.0'

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function sanitize(s) {
  return s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim()
}

// Zero-pad the integer part: 1 → "001", 10.5 → "010.5"
function padChapter(num) {
  const str = String(num)
  const [int, dec] = str.split('.')
  return dec ? `${int.padStart(3, '0')}.${dec}` : int.padStart(3, '0')
}

// Extract chapter number from current filename, regardless of naming style
function extractChapterNum(filename) {
  // "Chapter 10", "chapter-10", "Ch.10"
  const m = filename.match(/ch(?:apter)?[\s._-]*(\d+(?:\.\d+)?)/i)
  if (m) return parseFloat(m[1])
  // Fallback: all numbers, take the last one (handles "First Chapter – 1", "Latest Chapter – 232")
  const nums = [...filename.matchAll(/\b(\d+(?:\.\d+)?)\b/g)]
  if (nums.length) return parseFloat(nums[nums.length - 1][1])
  return null
}

// ── MangaDex ──────────────────────────────────────────────────────────────────

async function mdFetch(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!resp.ok) throw new Error(`MangaDex HTTP ${resp.status}: ${url}`)
  return resp.json()
}

async function searchManga(title) {
  const data = await mdFetch(`${MDEX}/manga?title=${encodeURIComponent(title)}&limit=10&order[relevance]=desc`)
  return data.data ?? []
}

async function getMangaById(id) {
  const data = await mdFetch(`${MDEX}/manga/${id}`)
  return data.data ?? null
}

async function getAllChapters(mangaId) {
  const chapters = []
  let offset = 0

  while (true) {
    const url =
      `${MDEX}/chapter?manga=${mangaId}` +
      `&translatedLanguage%5B%5D=en` +
      `&limit=100&offset=${offset}` +
      `&order%5Bchapter%5D=asc`

    const data = await mdFetch(url)
    if (!data.data?.length) break
    chapters.push(...data.data)
    if (chapters.length >= (data.total ?? 0)) break
    offset += 500
    await sleep(400)
  }

  return chapters
}

// MangaDex can have multiple scanlation entries for the same chapter number —
// pick the first one that has a non-empty title, or fall back to any entry.
function buildChapterMap(chapterData) {
  const map = new Map()

  for (const ch of chapterData) {
    const numStr = ch.attributes?.chapter
    if (!numStr) continue
    const num = parseFloat(numStr)
    if (isNaN(num)) continue

    const name = ch.attributes?.title?.trim() || null

    if (!map.has(num)) {
      map.set(num, name)
    } else if (name && !map.get(num)) {
      map.set(num, name)
    }
  }

  return map
}

// ── Wikipedia ─────────────────────────────────────────────────────────────────

async function fetchWikipediaChapters(url) {
  console.log(`Fetching Wikipedia: ${url}`)
  const resp = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!resp.ok) throw new Error(`Wikipedia HTTP ${resp.status}: ${url}`)
  const html = await resp.text()
  const root = parseHtml(html)
  const map = new Map()

  // Wikipedia manga chapter tables use a volume+chapter structure:
  //   Volume row:   <th>1</th> <td>release date</td> <td>ISBN</td> ...
  //   Chapter row:  <td colspan=”4-5”>1. “Title” (Japanese) 2. “Title2” ...</td>
  // The chapter-listing cells span all columns (colspan >= 4).
  // Some series have explicit numbers (1. “Title”); others list titles sequentially.
  let runningChapter = 0

  // Use \x22 (ASCII double quote U+0022) in all regexes to avoid file-encoding
  // converting literal “ characters to curly quotes (U+201C/U+201D) during save.
  const Q = '\x22'
  const reNumbered  = new RegExp(`(\\d+(?:\\.\\d+)?)\\.\\.?\\s*${Q}([^${Q}]{2,})${Q}`, 'g')
  const reUnnumbered = new RegExp(`${Q}([^${Q}]{2,})${Q}`, 'g')

  for (const table of root.querySelectorAll('table.wikitable')) {
    for (const td of table.querySelectorAll('td')) {
      const colspan = parseInt(td.getAttribute('colspan') ?? '1')
      if (colspan < 4) continue

      // Strip parentheticals before parsing — removes Japanese titles, romaji, and
      // the CSS injected by Wikipedia's ruby/citation templates inside parens.
      const text = td.textContent
        .replace(/\[\d+\]/g, '')   // footnote markers [1]
        .replace(/\([^)]*\)/g, '') // (Japanese, Romaji) and embedded CSS blocks
        .replace(/\s+/g, ' ')
        .trim()

      if (!text.includes(Q)) continue

      // Numbered format: 1. “Title” 2. “Title” ...
      reNumbered.lastIndex = 0
      const numbered = [...text.matchAll(reNumbered)]
      if (numbered.length > 0) {
        for (const m of numbered) {
          const num = parseFloat(m[1])
          const title = m[2].trim()
          if (!isNaN(num) && title && !/^\d+$/.test(title) && !map.has(num)) {
            map.set(num, title)
          }
        }
        const lastNum = parseFloat(numbered[numbered.length - 1][1])
        if (lastNum > runningChapter) runningChapter = Math.floor(lastNum)
      } else {
        // Unnumbered format: “Title” “Title2” ... — assign sequential numbers
        reUnnumbered.lastIndex = 0
        const unnumbered = [...text.matchAll(reUnnumbered)]
        for (const m of unnumbered) {
          const title = m[1].trim()
          if (!title || /^\d+$/.test(title)) continue
          runningChapter++
          if (!map.has(runningChapter)) map.set(runningChapter, title)
        }
      }
    }
  }

  return map
}

// ── Fandom wiki ───────────────────────────────────────────────────────────────

// Fetches titles for specific chapter numbers from a Fandom wiki.
// Only called for chapters that still lack a title after MangaDex/Wikipedia.
// Each chapter page has the title in <meta name="description"> as:
//   "Title (Japanese...) is the Nth chapter of..."
async function fetchFandomChapters(wikiBase, chapterNums) {
  const map = new Map()
  let fetched = 0

  for (const num of chapterNums) {
    const intNum = Math.floor(num)
    if (intNum !== num) continue // skip decimal bonus chapters
    const url = `${wikiBase}/wiki/Chapter_${intNum}`
    try {
      const resp = await fetch(url, { headers: { 'User-Agent': UA } })
      if (!resp.ok) continue
      const html = await resp.text()
      const desc = html.match(/<meta name="description" content="([^"]+)"/)?.[1]
      if (!desc) continue
      // Decode HTML entities present in meta attribute values
      const decoded = desc
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      const m = decoded.match(/^(.+?)\s+is the/)
      if (!m) continue
      // Strip trailing Japanese/non-ASCII parentheticals and corner-bracket suffixes (｢...｣)
      const title = m[1]
        .replace(/\s*\([^\x00-\x7F].*$/, '')
        .replace(/\s*[「｢].*$/, '')
        .trim()
      // Clean up disambig prefixes like "For the other chapter ... see Ch N. Title"
      const cleaned = title.replace(/^For the other chapter[^.]+\.\s*/i, '').trim()
      if (cleaned) {
        map.set(num, cleaned)
        fetched++
      }
    } catch { /* skip on error */ }
    await sleep(300)
  }

  console.log(`Fandom wiki: ${fetched} additional titles found`)
  return map
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      manga:      { type: 'string', short: 'm', default: '' },
      id:         { type: 'string',              default: '' },
      wikipedia:  { type: 'string', short: 'w', default: '' },
      fandom:     { type: 'string',              default: '' },
      folder:     { type: 'string', short: 'f', default: '' },
      'dry-run':  { type: 'boolean',             default: false },
    },
    allowPositionals: true,
  })

  if (!values.folder) {
    console.error([
      'Usage: node rename-chapters.js [--manga "Title" | --id <uuid>] [--wikipedia <url>] --folder <path> [--dry-run]',
      '',
      'At least one of --manga, --id, or --wikipedia must be provided.',
      'Sources combine: MangaDex runs first, Wikipedia fills gaps and overrides with official titles.',
    ].join('\n'))
    process.exit(1)
  }

  if (!values.manga && !values.id && !values.wikipedia && !values.fandom) {
    console.error('Provide at least one of: --manga, --id, --wikipedia, --fandom')
    process.exit(1)
  }

  const dryRun = values['dry-run']

  // ── MangaDex (optional) ────────────────────────────────────────────────────
  let chapterMap = new Map()
  let mdexCount = 0

  if (values.id || values.manga) {
    let manga
    if (values.id) {
      console.log(`Fetching manga by ID: ${values.id}`)
      manga = await getMangaById(values.id)
      if (!manga) { console.error('Manga not found by ID.'); process.exit(1) }
    } else {
      console.log(`Searching MangaDex: "${values.manga}"`)
      const results = await searchManga(values.manga)
      if (!results.length) { console.error('No results on MangaDex. Try --id <uuid> instead.'); process.exit(1) }
      manga = results[0]
    }

    const displayTitle =
      manga.attributes?.title?.en ??
      Object.values(manga.attributes?.title ?? {})[0] ??
      '(unknown)'
    console.log(`Matched: "${displayTitle}" — https://mangadex.org/title/${manga.id}`)

    console.log('Fetching chapter list from MangaDex…')
    const chapterData = await getAllChapters(manga.id)
    chapterMap = buildChapterMap(chapterData)
    mdexCount = [...chapterMap.values()].filter(Boolean).length
    console.log(`MangaDex: ${chapterMap.size} chapters found, ${mdexCount} with titles`)
  }

  // ── Wikipedia (optional, overrides MangaDex titles) ───────────────────────
  let wikiCount = 0

  if (values.wikipedia) {
    const wikiMap = await fetchWikipediaChapters(values.wikipedia)
    for (const [num, title] of wikiMap) {
      if (title) chapterMap.set(num, title)
    }
    wikiCount = wikiMap.size
    const totalTitled = [...chapterMap.values()].filter(Boolean).length
    console.log(`Wikipedia: ${wikiCount} chapters found — combined total with titles: ${totalTitled}`)
  }

  // ── Fandom wiki (optional, fills gaps left by other sources) ─────────────
  if (values.fandom) {
    // Collect chapter numbers that are in files but still have no title
    const existingFiles = readdirSync(values.folder).filter(f => f.toLowerCase().endsWith('.cbz'))
    const untitledNums = []
    for (const f of existingFiles) {
      const num = extractChapterNum(f)
      if (num !== null && !chapterMap.get(num)) untitledNums.push(num)
    }
    console.log(`Fandom wiki: fetching titles for ${untitledNums.length} untitled chapters…`)
    const fandomMap = await fetchFandomChapters(values.fandom, untitledNums)
    for (const [num, title] of fandomMap) {
      if (title) chapterMap.set(num, title)
    }
  }

  // ── Rename files ───────────────────────────────────────────────────────────
  const files = readdirSync(values.folder)
    .filter(f => f.toLowerCase().endsWith('.cbz'))
    .sort()

  console.log(`\nProcessing ${files.length} CBZ files in ${values.folder}\n`)

  let renamed = 0, alreadyGood = 0, unmatched = 0

  for (const file of files) {
    const chNum = extractChapterNum(file)

    if (chNum === null) {
      console.log(`  ?  Cannot extract chapter number: ${file}`)
      unmatched++
      continue
    }

    // Find the closest chapter number in map (handles minor float precision issues)
    let matchedNum = chapterMap.has(chNum) ? chNum : null
    if (!matchedNum) {
      for (const k of chapterMap.keys()) {
        if (Math.abs(k - chNum) < 0.05) { matchedNum = k; break }
      }
    }

    const title = matchedNum !== null ? chapterMap.get(matchedNum) : null
    const num   = matchedNum ?? chNum

    const newName = title
      ? `Chapter ${padChapter(num)} - ${sanitize(title)}.cbz`
      : `Chapter ${padChapter(num)}.cbz`

    if (file === newName) {
      alreadyGood++
      continue
    }

    const oldPath = join(values.folder, file)
    const newPath = join(values.folder, newName)

    if (dryRun) {
      console.log(`  ${file}\n  → ${newName}\n`)
      renamed++
    } else {
      if (existsSync(newPath)) {
        console.log(`  ⚠  Skipping (target exists): ${newName}`)
        alreadyGood++
        continue
      }
      renameSync(oldPath, newPath)
      console.log(`  ✓  ${newName}`)
      renamed++
    }
  }

  console.log(`\n${'─'.repeat(40)}`)
  console.log(`Renamed: ${renamed}  |  Already correct: ${alreadyGood}  |  Unmatched: ${unmatched}`)
  if (unmatched > 0) console.log('Tip: unmatched files were left untouched.')
}

main().catch(e => { console.error(`Fatal: ${e.message}`); process.exit(1) })
