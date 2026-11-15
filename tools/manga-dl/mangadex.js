/**
 * MangaDex mode: download a series through MangaDex's public API.
 *
 * The API returns the whole chapter list (paged), so nothing depends on how a
 * reader page happens to render. Licensed series have no English chapters on
 * MangaDex, so this only ever fetches fan translations of unlicensed work.
 *
 * API notes (https://api.mangadex.org/docs):
 *   GET /manga/{id}/feed            chapter uploads, 500 per page
 *   GET /at-home/server/{chapter}   image server + file names (limit 40/min)
 *   images: {baseUrl}/data/{hash}/{file}
 */
import { existsSync, mkdirSync, readdirSync, renameSync, writeFileSync } from 'node:fs'
import { join, resolve, extname } from 'node:path'
import AdmZip from 'adm-zip'

const API = 'https://api.mangadex.org'
const UA = 'VaultMangaDl/1.0'
const RATINGS = ['safe', 'suggestive', 'erotica'].map(r => `contentRating[]=${r}`).join('&')

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

export function parseTitleId(url) {
  const m = /^https?:\/\/(?:www\.)?mangadex\.org\/title\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i.exec(url)
  return m ? m[1].toLowerCase() : null
}

function sanitize(s) {
  return s.replace(/[<>:"/\\|?*\x00-\x1f]/g, '').replace(/\s+/g, ' ').trim()
}

export function seriesFolderName(title) {
  return sanitize(title.replace(/\s*:\s*/g, ' - '))
}

function padChapter(num) {
  const [int, dec] = String(num).split('.')
  return dec ? `${int.padStart(3, '0')}.${dec}` : int.padStart(3, '0')
}

export function chapterFileName(chapter, title) {
  const t = sanitize(title || '')
  return t ? `Chapter ${padChapter(chapter)} - ${t}.cbz` : `Chapter ${padChapter(chapter)}.cbz`
}

/**
 * One upload per chapter number. Readable uploads only (no external links, at
 * least one page). Groups are ranked by how many chapters they cover, so a
 * series reads in one translation wherever that group has the chapter; a tie
 * goes to the upload with more pages, then the newer one.
 */
export function pickUploads(uploads) {
  const readable = uploads.filter(u => u.chapter != null && u.chapter !== '' && !u.externalUrl && u.pages > 0)
  const key = (u) => [...u.groups].sort().join('+') || 'none'
  const coverage = new Map()
  for (const k of new Set(readable.map(u => `${key(u)}|${u.chapter}`))) {
    const g = k.split('|')[0]
    coverage.set(g, (coverage.get(g) || 0) + 1)
  }
  const best = new Map()
  for (const u of readable) {
    const cur = best.get(u.chapter)
    if (!cur) { best.set(u.chapter, u); continue }
    const a = [coverage.get(key(u)), u.pages, Date.parse(u.publishAt) || 0]
    const b = [coverage.get(key(cur)), cur.pages, Date.parse(cur.publishAt) || 0]
    for (let i = 0; i < a.length; i++) {
      if (a[i] === b[i]) continue
      if (a[i] > b[i]) best.set(u.chapter, u)
      break
    }
  }
  return [...best.values()].sort((x, y) => parseFloat(x.chapter) - parseFloat(y.chapter))
}

async function api(path, attempt = 0) {
  const resp = await fetch(API + path, { headers: { 'User-Agent': UA } })
  if (resp.status === 429 && attempt < 5) {
    const wait = (parseInt(resp.headers.get('retry-after') || '0', 10) || 10) * 1000
    await sleep(wait)
    return api(path, attempt + 1)
  }
  if (!resp.ok) throw new Error(`MangaDex HTTP ${resp.status} — ${path}`)
  return resp.json()
}

async function fetchUploads(mangaId, lang) {
  const out = []
  const groupNames = new Map()
  for (let offset = 0; ; offset += 500) {
    const j = await api(`/manga/${mangaId}/feed?translatedLanguage[]=${lang}&limit=500&offset=${offset}` +
      `&includes[]=scanlation_group&order[chapter]=asc&${RATINGS}`)
    for (const c of j.data) {
      const groups = c.relationships.filter(r => r.type === 'scanlation_group')
      for (const g of groups) if (g.attributes?.name) groupNames.set(g.id, g.attributes.name)
      const a = c.attributes
      out.push({ id: c.id, chapter: a.chapter, title: a.title || '', pages: a.pages, externalUrl: a.externalUrl,
        groups: groups.map(g => g.id), publishAt: a.publishAt })
    }
    if (offset + 500 >= j.total) break
    await sleep(250)
  }
  return { uploads: out, groupNames }
}

async function getImage(url) {
  const resp = await fetch(url, { headers: { 'User-Agent': UA } })
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
  const buf = Buffer.from(await resp.arrayBuffer())
  if (buf.length < 100) throw new Error(`only ${buf.length} bytes`)
  return buf
}

/**
 * Run fn over items with at most `limit` running at once; results keep the
 * items' order. The first error stops new work and is thrown.
 */
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length)
  let next = 0, failed = null
  async function worker() {
    while (failed === null && next < items.length) {
      const i = next++
      try { results[i] = await fn(items[i], i) } catch (e) { failed ??= e }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  if (failed) throw failed
  return results
}

const PAGE_CONCURRENCY = 4

/** All pages of one chapter, or an error: a chapter is never saved with pages missing. */
async function downloadPages(chapterId, onPage) {
  let server = await api(`/at-home/server/${chapterId}`)
  let refreshing = null
  // A failing image node: ask for another one, as the API docs recommend (once for all pages in flight).
  const refresh = () => (refreshing ??= api(`/at-home/server/${chapterId}`).then(s => { server = s }).finally(() => { refreshing = null }))
  const files = server.chapter.data
  let done = 0
  return mapLimit(files, PAGE_CONCURRENCY, async (file, i) => {
    let buf
    for (let attempt = 0; attempt < 4 && !buf; attempt++) {
      try {
        buf = await getImage(`${server.baseUrl}/data/${server.chapter.hash}/${file}`)
      } catch (e) {
        if (attempt === 3) throw new Error(`page ${i + 1}: ${e.message}`)
        await sleep(2000 * (attempt + 1))
        if (attempt >= 1) await refresh()
      }
    }
    onPage(++done, files.length)
    return { name: `${String(i + 1).padStart(3, '0')}${extname(file).toLowerCase() || '.jpg'}`, buf }
  })
}

async function saveCover(mangaId, seriesDir, seriesName) {
  if (readdirSync(seriesDir).some(f => /\.(jpe?g|png|webp)$/i.test(f))) return
  const j = await api(`/manga/${mangaId}?includes[]=cover_art`)
  const cover = j.data.relationships.find(r => r.type === 'cover_art')?.attributes?.fileName
  if (!cover) return
  const buf = await getImage(`https://uploads.mangadex.org/covers/${mangaId}/${cover}`)
  writeFileSync(join(seriesDir, `${seriesName}${extname(cover).toLowerCase() || '.jpg'}`), buf)
  console.log(`  ✓  cover`)
}

export async function runMangadex(mangaId, values) {
  const lang = values.lang || 'en'
  const delay = Math.max(1600, parseInt(values.delay) || 1600) // at-home server: 40 requests/min

  const manga = (await api(`/manga/${mangaId}`)).data.attributes
  const title = values.name || manga.title.en || manga.altTitles.find(t => t.en)?.en || Object.values(manga.title)[0]
  const seriesName = seriesFolderName(title)

  console.log(`MangaDex: ${title} (${manga.status})`)
  const { uploads, groupNames } = await fetchUploads(mangaId, lang)
  const chapters = pickUploads(uploads)
  if (chapters.length === 0) {
    console.error(`No readable ${lang} chapters on MangaDex.`)
    process.exitCode = 1
    return
  }
  const fromIdx = Math.max(0, parseInt(values.from) - 1)
  const toIdx = values.to ? parseInt(values.to) : undefined
  const slice = chapters.slice(fromIdx, toIdx)
  const groupLabel = (u) => u.groups.map(g => groupNames.get(g) || g.slice(0, 8)).join(' & ') || 'no group'
  console.log(`Found ${chapters.length} chapters (${uploads.length} uploads) — downloading ${slice.length}`)

  if (values['dry-run']) {
    console.log(`\nSeries: "${seriesName}"`)
    for (const u of slice) console.log(`  ${chapterFileName(u.chapter, u.title)}  [${u.pages} p, ${groupLabel(u)}]`)
    return
  }

  const seriesDir = resolve(values.output, seriesName)
  mkdirSync(seriesDir, { recursive: true })
  console.log(`Output: ${seriesDir}\n`)
  try { await saveCover(mangaId, seriesDir, seriesName) } catch (e) { console.log(`  ⚠  cover: ${e.message}`) }

  const existing = new Set(readdirSync(seriesDir))
  const has = (u) => [...existing].some(f => f.startsWith(`Chapter ${padChapter(u.chapter)}`) &&
    /^( - .*)?\.cbz$/.test(f.slice(`Chapter ${padChapter(u.chapter)}`.length)))
  let done = 0, skipped = 0, failed = 0
  for (let i = 0; i < slice.length; i++) {
    const u = slice[i]
    const name = chapterFileName(u.chapter, u.title)
    const label = `[${i + 1}/${slice.length}] ${name} (${groupLabel(u)})`
    if (has(u)) { console.log(`${label} — already exists, skipping`); skipped++; continue }
    console.log(label)
    try {
      const pages = await downloadPages(u.id, (n, total) => process.stdout.write(`\r  Pages: ${n}/${total}   `))
      process.stdout.write('\n')
      const zip = new AdmZip()
      for (const p of pages) zip.addFile(p.name, p.buf)
      const tmp = join(seriesDir, `${name}.part`)
      zip.writeZip(tmp)
      renameSync(tmp, join(seriesDir, name))
      console.log(`  ✓  ${name}`)
      done++
    } catch (e) {
      process.stdout.write('\n')
      console.error(`  ✗  ${e.message}`)
      failed++
    }
    if (i < slice.length - 1) await sleep(delay)
  }
  console.log(`\n─────────────────────────────`)
  console.log(`Downloaded: ${done}  |  Skipped: ${skipped}  |  Failed: ${failed}`)
  console.log(`Output:     ${seriesDir}`)
  if (failed) process.exitCode = 2
}
