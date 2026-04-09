import { readFileSync } from 'fs'
import { inflateRawSync } from 'zlib'
import { dirname } from 'path'

// ─── Minimal ZIP reader (no external dependency) ─────────────────────────────

function readZip(filePath: string): Map<string, Buffer> {
  const buf     = readFileSync(filePath)
  const entries = new Map<string, Buffer>()

  // Locate End of Central Directory record
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65558); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break }
  }
  if (eocd === -1) return entries

  const cdOff  = buf.readUInt32LE(eocd + 16)
  const cdSize = buf.readUInt32LE(eocd + 12)

  let pos = cdOff
  while (pos < cdOff + cdSize) {
    if (buf.readUInt32LE(pos) !== 0x02014b50) break
    const comp     = buf.readUInt16LE(pos + 10)
    const cSize    = buf.readUInt32LE(pos + 20)
    const fnLen    = buf.readUInt16LE(pos + 28)
    const exLen    = buf.readUInt16LE(pos + 30)
    const cmLen    = buf.readUInt16LE(pos + 32)
    const lhOff    = buf.readUInt32LE(pos + 42)
    const name     = buf.slice(pos + 46, pos + 46 + fnLen).toString('utf8')
    pos += 46 + fnLen + exLen + cmLen

    if (buf.readUInt32LE(lhOff) !== 0x04034b50) continue
    const lhFn   = buf.readUInt16LE(lhOff + 26)
    const lhEx   = buf.readUInt16LE(lhOff + 28)
    const data   = buf.slice(lhOff + 30 + lhFn + lhEx, lhOff + 30 + lhFn + lhEx + cSize)
    entries.set(name, comp === 8 ? inflateRawSync(data) : data)
  }
  return entries
}

// Resolve a path inside the ZIP relative to a base entry
function zipResolve(base: string, rel: string): string {
  if (rel.startsWith('/')) return rel.slice(1)
  const baseDir = dirname(base).replace(/\\/g, '/')
  const parts   = baseDir === '.' ? [] : baseDir.split('/').filter(Boolean)
  for (const seg of rel.split('/')) {
    if (seg === '..') parts.pop()
    else if (seg !== '.') parts.push(seg)
  }
  return parts.join('/')
}

// ─── ZIP cache — avoids re-reading the file on every chapter navigation ──────
let _cachedPath: string | null = null
let _cachedZip:  Map<string, Buffer> | null = null

function getCachedZip(filePath: string): Map<string, Buffer> {
  if (_cachedPath !== filePath) {
    _cachedPath = filePath
    _cachedZip  = readZip(filePath)
  }
  return _cachedZip!
}

// ─── Public API ──────────────────────────────────────────────────────────────

export interface EpubChapter {
  id: string
  title: string
  href: string
}

export interface EpubInfo {
  title: string
  author: string
  chapters: EpubChapter[]
  coverDataUrl: string | null
}

export function getEpubInfo(filePath: string): EpubInfo {
  const zip = getCachedZip(filePath)

  // Find OPF path from META-INF/container.xml
  const container  = zip.get('META-INF/container.xml')?.toString('utf8') ?? ''
  const opfMatch   = container.match(/full-path="([^"]+)"/)
  const opfPath    = opfMatch?.[1] ?? 'content.opf'
  const opfDir     = dirname(opfPath).replace(/\\/g, '/')

  const opf = zip.get(opfPath)?.toString('utf8') ?? ''

  // Metadata
  const title  = opf.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/)?.[1]?.trim()  ?? 'Unknown Title'
  const author = opf.match(/<dc:creator[^>]*>([^<]+)<\/dc:creator>/)?.[1]?.trim() ?? ''

  // Manifest: id → { href, mediaType }
  // Attributes can appear in any order, so extract each attribute independently per <item> tag
  const manifest = new Map<string, { href: string; mediaType: string }>()
  for (const itemMatch of opf.matchAll(/<item\s([^>]+?)>/g)) {
    const attrs   = itemMatch[1]
    const id      = attrs.match(/\bid="([^"]+)"/)?.[1]
    const rawHref = attrs.match(/\bhref="([^"]+)"/)?.[1]
    const mt      = attrs.match(/\bmedia-type="([^"]+)"/)?.[1]
    if (!id || !rawHref || !mt) continue
    const href = (opfDir && opfDir !== '.') ? `${opfDir}/${rawHref}` : rawHref
    manifest.set(id, { href, mediaType: mt })
  }

  // Cover image
  let coverDataUrl: string | null = null
  const coverId = opf.match(/<meta\s[^>]*name="cover"[^>]*content="([^"]+)"/)?.[1]
  if (coverId) {
    const item = manifest.get(coverId)
    if (item) {
      const data = zip.get(item.href)
      if (data) {
        const mt = item.mediaType.includes('png') ? 'image/png' : 'image/jpeg'
        coverDataUrl = `data:${mt};base64,${data.toString('base64')}`
      }
    }
  }

  // NCX → href-to-title map
  const ncxItem = [...manifest.values()].find(v => v.mediaType.includes('ncx'))
  const ncxText = ncxItem ? (zip.get(ncxItem.href)?.toString('utf8') ?? '') : ''
  const ncxTitles = new Map<string, string>()
  for (const m of ncxText.matchAll(/<navPoint[\s\S]*?<text>([^<]+)<\/text>[\s\S]*?<content\s+src="([^"#]+)/g)) {
    const hrefBase = m[2].split('/').pop() ?? m[2]
    ncxTitles.set(hrefBase, m[1].trim())
    ncxTitles.set(m[2], m[1].trim())
  }

  // Spine → ordered chapters
  const chapters: EpubChapter[] = []
  let fallbackIdx = 0
  for (const m of opf.matchAll(/<itemref\s[^>]*idref="([^"]+)"/g)) {
    const item = manifest.get(m[1])
    if (!item) continue
    const hrefBase = item.href.split('/').pop() ?? item.href
    let chTitle = ncxTitles.get(hrefBase) ?? ncxTitles.get(item.href)
    if (!chTitle) {
      const fileContent = zip.get(item.href)?.toString('utf8') ?? ''
      // 1. First semantic heading
      const headingMatch = fileContent.match(/<h[123456][^>]*>([\s\S]*?)<\/h[123456]>/i)
      if (headingMatch) {
        chTitle = headingMatch[1].replace(/<[^>]+>/g, '').trim()
      }
      // 2. <title> tag (skip if it's just the book title)
      if (!chTitle) {
        const htmlTitle = fileContent.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.trim()
        if (htmlTitle && htmlTitle !== title) chTitle = htmlTitle
      }
      // 3. First non-empty text in the body (e.g. "Table of Contents", "List of Characters")
      if (!chTitle) {
        const bodyContent = fileContent.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? ''
        const firstText = bodyContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        // Split on sentence/list separators, take first segment
        const firstSegment = firstText.split(/[,;.!?]/)[0].trim()
        // Cap at 4 words to avoid dumping whole sentences
        const words = firstSegment.split(/\s+/).slice(0, 3).join(' ')
        if (words.length > 2) chTitle = words
      }
      // 4. Generic fallback
      if (!chTitle) chTitle = `Section ${++fallbackIdx}`
    }
    chapters.push({ id: m[1], title: chTitle, href: item.href })
  }

  return { title, author, chapters, coverDataUrl }
}

export function readEpubChapter(filePath: string, chapterHref: string): string {
  const zip  = getCachedZip(filePath)
  let   html = zip.get(chapterHref)?.toString('utf8') ?? '<p>Chapter not found.</p>'

  // Inline stylesheets
  html = html.replace(/<link\b[^>]*rel=["']stylesheet["'][^>]*href="([^"]+)"[^>]*\/?>/gi, (_, href) => {
    const css = zip.get(zipResolve(chapterHref, href))?.toString('utf8') ?? ''
    return `<style>${css}</style>`
  })

  // Inline images — handle both double and single quoted src attributes
  html = html.replace(/(<img\b[^>]*\bsrc=)(["'])([^"']+)\2/gi, (full, pre, q, src) => {
    if (src.startsWith('data:')) return full
    const data = zip.get(zipResolve(chapterHref, src))
    if (!data) return full
    const ext = src.split('.').pop()?.toLowerCase() ?? ''
    const mt  = ext === 'png' ? 'image/png' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg'
    return `${pre}${q}data:${mt};base64,${data.toString('base64')}${q}`
  })

  return html
}
