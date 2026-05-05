#!/usr/bin/env node
/**
 * manga-dl — download manga chapters into CBZ files
 *
 * Usage:
 *   node index.js <series-url> [options]
 *
 * Options:
 *   --output, -o <dir>    Output directory (default: ./downloads)
 *   --delay,  -d <ms>     Delay between chapter requests in ms (default: 1500)
 *   --from    <n>         Start from chapter n in the list (1-based, default: 1)
 *   --to      <n>         Stop after chapter n in the list
 *   --name,   -n <title>  Override series folder name
 *   --reverse             Reverse chapter order before slicing (use if site lists newest-first)
 *   --dry-run             Print chapters that would be downloaded without downloading
 *
 * Examples:
 *   node index.js https://readkagura.com/
 *   node index.js https://readkagura.com/ --from 50 --to 80 --output E:/media/manga
 *   node index.js https://readkagura.com/ --dry-run
 */

import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, resolve, extname } from 'node:path'
import { parseArgs } from 'node:util'
import { parse as parseHtml } from 'node-html-parser'
import AdmZip from 'adm-zip'

// ── Config ────────────────────────────────────────────────────────────────────

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// CSS selectors for the chapter image container, tried in order.
// The first one that yields images wins.
const CONTENT_SELECTORS = [
  '.post-body',        // Blogger themes
  '.entry-content',
  '.chapter-content',
  '.reading-content',
  '#chapter-content',
  'article',
]

// Image URL patterns that are clearly not manga pages
const SKIP_IMAGE_RE = /logo|icon|banner|avatar|button|spinner|placeholder|blank|spacer|\/ads?\/|pixel/i

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function sanitize(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim()
}

// Extract chapter number from a title or URL for numeric sorting
function chapterNumber(str) {
  const m = str.match(/chapter[\s_-]*(\d+(?:\.\d+)?)/i) || str.match(/(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : 0
}

async function httpGet(url, referer) {
  const headers = { 'User-Agent': UA, 'Accept': '*/*' }
  if (referer) headers['Referer'] = referer
  const resp = await fetch(url, { headers })
  if (!resp.ok) throw new Error(`HTTP ${resp.status} — ${url}`)
  return resp
}

async function getHtml(url) {
  return (await httpGet(url)).text()
}

async function getBuffer(url, referer) {
  const resp = await httpGet(url, referer)
  return Buffer.from(await resp.arrayBuffer())
}

// ── Scraping ──────────────────────────────────────────────────────────────────

function extractChapters(html, baseUrl) {
  const root = parseHtml(html)
  const seen = new Set()
  const chapters = []

  for (const a of root.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href') || ''

    let absUrl
    try {
      absUrl = href.startsWith('http') ? href : new URL(href, baseUrl).href
    } catch {
      continue
    }

    // Check the URL PATH for "chapter" — not the full URL, which may include
    // the word "chapter" in the domain name (e.g. chainsawmanchapter.com).
    // Also skip taxonomy/category/tag archive pages that contain "chapter" in their path.
    const pathname = new URL(absUrl).pathname
    if (!pathname.includes('chapter')) continue
    if (/\/(category|tag|archive|feed)\//i.test(pathname)) continue

    // Strip anchors/query strings for dedup
    const key = absUrl.split('?')[0].split('#')[0].replace(/\/$/, '')
    if (seen.has(key)) continue
    seen.add(key)

    const title = a.textContent.replace(/\s+/g, ' ').trim()
    if (!title) continue

    chapters.push({ url: absUrl, title })
  }

  return chapters
}

// Parse a sitemap XML and return chapters whose URL path contains "chapter"
function extractChaptersFromSitemap(xml, baseUrl) {
  const seen = new Set()
  const chapters = []

  for (const m of xml.matchAll(/<loc>\s*(https?:\/\/[^<]+)\s*<\/loc>/gi)) {
    const url = m[1].trim()
    let pathname
    try { pathname = new URL(url).pathname } catch { continue }
    if (!pathname.includes('chapter')) continue

    const key = url.replace(/\/$/, '')
    if (seen.has(key)) continue
    seen.add(key)

    // Derive a title from the URL path: /manga/centuria-chapter-89/ → "Centuria Chapter 89"
    const slug = pathname.replace(/^\/manga\/|\/$/g, '')
    const title = slug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    chapters.push({ url, title })
  }

  return chapters
}

function extractImages(html, chapterUrl) {
  const root = parseHtml(html)

  // Try content selectors first — avoids picking up header/footer/ad images
  for (const sel of CONTENT_SELECTORS) {
    const container = root.querySelector(sel)
    if (!container) continue
    const imgs = filterImages(container.querySelectorAll('img[src]'), chapterUrl)
    if (imgs.length > 0) return imgs
  }

  // Fallback: all images on page, filtered aggressively
  return filterImages(root.querySelectorAll('img[src]'), chapterUrl)
}

function filterImages(imgEls, chapterUrl) {
  const urls = []

  for (const img of imgEls) {
    // Try real-URL attributes in priority order — lazy loaders use various attr names
    const src =
      img.getAttribute('data-lazy-src') ||  // Rocket Lazy Load (Blogger)
      img.getAttribute('data-src') ||        // generic lazy load
      img.getAttribute('data-original') ||   // Lazyload.js
      img.getAttribute('src') ||
      ''
    if (!src.startsWith('http')) continue
    if (SKIP_IMAGE_RE.test(src)) continue

    // Skip images explicitly declared as tiny
    const w = parseInt(img.getAttribute('width') || '0')
    const h = parseInt(img.getAttribute('height') || '0')
    if ((w > 0 && w < 100) || (h > 0 && h < 100)) continue

    urls.push(src)
  }

  // Deduplicate preserving order
  return [...new Set(urls)]
}

// ── Core ──────────────────────────────────────────────────────────────────────

async function downloadChapter(chapter, seriesDir) {
  const html = await getHtml(chapter.url)
  const images = extractImages(html, chapter.url)

  if (images.length === 0) {
    console.log(`  ⚠  No images found — skipping`)
    return false
  }

  const zip = new AdmZip()
  let failures = 0

  for (let i = 0; i < images.length; i++) {
    const imgUrl = images[i]
    const rawExt = extname(imgUrl.split('?')[0]).toLowerCase()
    const ext = ['.jpg', '.jpeg', '.png', '.webp', '.gif'].includes(rawExt) ? rawExt : '.jpg'
    const filename = `${String(i + 1).padStart(3, '0')}${ext}`

    try {
      const buf = await getBuffer(imgUrl, chapter.url)
      zip.addFile(filename, buf)
    } catch (e) {
      failures++
      console.log(`\n  ⚠  Page ${i + 1} failed: ${e.message}`)
    }

    process.stdout.write(`\r  Pages: ${i + 1}/${images.length}${failures ? ` (${failures} failed)` : ''}   `)
    if (i < images.length - 1) await sleep(200)
  }

  process.stdout.write('\n')

  const cbzPath = join(seriesDir, `${sanitize(chapter.title)}.cbz`)
  zip.writeZip(cbzPath)
  console.log(`  ✓  ${cbzPath}`)
  return true
}

// ── CLI ───────────────────────────────────────────────────────────────────────

async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      output:    { type: 'string',  short: 'o', default: './downloads' },
      delay:     { type: 'string',  short: 'd', default: '1500' },
      from:      { type: 'string',              default: '1' },
      to:        { type: 'string',              default: '' },
      name:      { type: 'string',  short: 'n', default: '' },
      reverse:   { type: 'boolean',             default: false },
      'dry-run': { type: 'boolean',             default: false },
    },
    allowPositionals: true,
  })

  const [seriesUrl] = positionals
  if (!seriesUrl) {
    console.error([
      'Usage: node index.js <series-url> [options]',
      '',
      'Options:',
      '  --output, -o <dir>   Output directory (default: ./downloads)',
      '  --delay,  -d <ms>    Delay between chapters in ms (default: 1500)',
      '  --from <n>           Start at chapter index n (1-based)',
      '  --to   <n>           End at chapter index n (1-based)',
      '  --name, -n <title>   Override series folder name',
      '  --reverse            Reverse chapter list order',
      '  --dry-run            List chapters without downloading',
    ].join('\n'))
    process.exit(1)
  }

  const delay   = Math.max(500, parseInt(values.delay) || 1500)
  const fromIdx = Math.max(0, parseInt(values.from) - 1)
  const toIdx   = values.to ? parseInt(values.to) - 1 : Infinity
  const dryRun  = values['dry-run']

  // ── Fetch chapter list ─────────────────────────────────────────────────────
  console.log(`Fetching chapter list: ${seriesUrl}`)
  let rawText
  try {
    rawText = await getHtml(seriesUrl)
  } catch (e) {
    console.error(`Failed to fetch series page: ${e.message}`)
    process.exit(1)
  }

  const isSitemap = seriesUrl.endsWith('.xml') || seriesUrl.includes('sitemap')
  let chapters = isSitemap
    ? extractChaptersFromSitemap(rawText, seriesUrl)
    : extractChapters(rawText, seriesUrl)

  if (chapters.length === 0) {
    console.error('No chapters found. The site structure may not be supported yet.')
    if (!isSitemap) console.error('Tip: try passing the sitemap URL (e.g. https://example.com/sitemap.xml)')
    process.exit(1)
  }

  // Sort by chapter number (handles unsorted or newest-first lists)
  chapters.sort((a, b) => chapterNumber(a.title + a.url) - chapterNumber(b.title + b.url))
  if (values.reverse) chapters.reverse()

  const slice = chapters.slice(fromIdx, toIdx === Infinity ? undefined : toIdx + 1)
  console.log(`Found ${chapters.length} chapters — downloading ${slice.length}`)

  // ── Derive series name ─────────────────────────────────────────────────────
  let seriesName = values.name
  if (!seriesName) {
    // Find the first URL that has a chapter number (skip nav/category pages)
    const firstUrl = chapters.find(c => /chapter[\s_-]*\d+/i.test(c.url))?.url || chapters[0]?.url || seriesUrl
    // /manga/kagurabachi-chapter-1/          → "kagurabachi"
    // /chainsaw-man-manga-chapter-1/         → "chainsaw-man"
    // /manga/centuria-chapter-89/            → "centuria"
    const m = firstUrl.match(/\/manga\/([^/]+?)-chapter/i)
           || firstUrl.match(/\/([^/]+?)-(?:manga-)?chapter/i)
    if (m) {
      seriesName = m[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    } else {
      seriesName = new URL(seriesUrl).hostname.replace(/^(www\.|read\.)/, '').replace(/\..*/, '')
    }
  }

  if (dryRun) {
    console.log(`\nSeries: "${seriesName}"`)
    console.log('Chapters that would be downloaded:')
    slice.forEach((ch, i) => console.log(`  ${i + 1}. ${ch.title}\n     ${ch.url}`))
    return
  }

  const seriesDir = resolve(values.output, sanitize(seriesName))
  mkdirSync(seriesDir, { recursive: true })
  console.log(`Output: ${seriesDir}\n`)

  // ── Download ───────────────────────────────────────────────────────────────
  let done = 0
  let skipped = 0
  let failed = 0

  for (let i = 0; i < slice.length; i++) {
    const chapter = slice[i]
    const label = `[${i + 1}/${slice.length}] ${chapter.title}`
    const cbzPath = join(seriesDir, `${sanitize(chapter.title)}.cbz`)

    if (existsSync(cbzPath)) {
      console.log(`${label} — already exists, skipping`)
      skipped++
      continue
    }

    console.log(label)
    try {
      const ok = await downloadChapter(chapter, seriesDir)
      ok ? done++ : failed++
    } catch (e) {
      console.error(`  ✗  ${e.message}`)
      failed++
    }

    if (i < slice.length - 1) {
      process.stdout.write(`  Waiting ${delay}ms…\n`)
      await sleep(delay)
    }
  }

  console.log(`\n─────────────────────────────`)
  console.log(`Downloaded: ${done}  |  Skipped: ${skipped}  |  Failed: ${failed}`)
  console.log(`Output:     ${seriesDir}`)
}

main().catch(e => {
  console.error(`Fatal: ${e.message}`)
  process.exit(1)
})
