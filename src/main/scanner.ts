import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs'
import { join, extname, basename } from 'path'
import { upsertItem, getStoredFileTimes, deleteOrphanedEntries, updateTechInfo, needsTechInfo, setConfig } from './database'
import { probeFile } from './mediaInfo'

// ─── Incremental scan session state ─────────────────────────────────────────
// Populated at the start of each scanLibrary call, cleared at the end.
let _storedTimes     = new Map<string, number>()
let _foundPaths      = new Set<string>()
let _updatedCount    = 0
let _categoryBytes   = new Map<string, number>()
let _musicTrackCount = 0
let _mangaSeriesCount = 0

// Call instead of upsertItem directly. Skips files whose mtime hasn't changed.
function checkAndUpsert(filePath: string, item: Parameters<typeof upsertItem>[0]): boolean {
  const { mtimeMs, size } = statSync(filePath)
  const mtime = Math.floor(mtimeMs)
  _foundPaths.add(filePath)
  // Accumulate file size per category regardless of whether the file changed
  const cat = item.category
  _categoryBytes.set(cat, (_categoryBytes.get(cat) ?? 0) + size)
  if (_storedTimes.get(filePath) === mtime) return false // unchanged — skip
  upsertItem({ ...item, fileModified: mtime })
  _updatedCount++
  return true
}

const VIDEO_EXTS = new Set(['.mkv', '.mp4', '.avi', '.mov', '.m4v', '.wmv'])
const AUDIO_EXTS = new Set(['.mp3', '.flac', '.aac', '.ogg', '.wav', '.m4a'])
const BOOK_EXTS  = new Set(['.epub', '.pdf', '.mobi'])
const MANGA_EXTS = new Set(['.cbz', '.cbr', '.epub', '.pdf'])
const ROM_EXTS   = new Set(['.z64', '.n64', '.iso', '.wbfs', '.rvz', '.xex', '.pkg', '.gba', '.gbc', '.gb', '.nds', '.sfc', '.smc'])

// Map rom subfolder name → platform key
const ROM_PLATFORM: Record<string, string> = {
  n64: 'n64',
  gamecube: 'gamecube',
  wii: 'wii',
  xbox360: 'xbox360',
  ps4: 'ps4',
  gba: 'gba',
  nds: 'nds',
  snes: 'snes',
  gb: 'gb',
  gbc: 'gbc',
  mame: 'mame'
}

function tryReadJson(filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return {}
  }
}

export function findPoster(dir: string): string | null {
  // Check preferred names first
  for (const name of ['poster.jpg', 'poster.png', 'cover.jpg', 'cover.png', 'folder.jpg']) {
    const p = join(dir, name)
    if (existsSync(p)) return p
  }
  // Fall back to any image file in the folder
  try {
    const img = readdirSync(dir).find((f) => /\.(jpe?g|png|webp)$/i.test(f))
    if (img) return join(dir, img)
  } catch { /* ignore */ }
  return null
}

function stableSeasonHash(name: string): number {
  let h = 5381
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) & 0x7fffffff
  return 100 + (h % 900)
}

function titleFromFilename(filename: string): string {
  // "The Dark Knight (2008) [1080p].mkv" → "The Dark Knight"
  return basename(filename, extname(filename))
    .replace(/\s*\(\d{4}\).*$/, '')
    .replace(/\s*\[.*?\]/g, '')
    .replace(/\./g, ' ')
    .trim()
}

// Abbreviation → readable label for anime extras
const EXTRAS_TYPE_MAP: [RegExp, string][] = [
  [/^NCED/i, 'Non-Credit Ending'],
  [/^NCOP/i, 'Non-Credit Opening'],
  [/^PV/i,   'Promo Video'],
  [/^CM/i,   'Commercial'],
  [/^OP/i,   'Opening'],
  [/^ED/i,   'Ending'],
  [/^OAD/i,  'OAD'],
  [/^OVA/i,  'OVA'],
  [/^SP/i,   'Special'],
]

function titleFromExtrasFilename(filename: string): string {
  let name = basename(filename, extname(filename))
  // Strip leading [Group] tag
  name = name.replace(/^\[.*?\]\s*/, '')
  // Strip trailing quality/encoding parenthetical: _(10bit_BD1080p_x265), _(Dual Audio_...)
  name = name.replace(/_?\([^)]*(?:\d+bit|\d+p)[^)]*\)$/, '')
  // Normalize underscores → spaces
  name = name.replace(/_/g, ' ').trim()
  // If pattern is "Series Name - Suffix", strip the series prefix when suffix is a known type code
  const sep = name.indexOf(' - ')
  if (sep > 0) {
    const suffix = name.slice(sep + 3).trim()
    if (EXTRAS_TYPE_MAP.some(([pat]) => pat.test(suffix))) {
      name = suffix
    }
  }
  // Translate abbreviations, e.g. "NCED01" → "Non-Credit Ending 01", "NCOP(EP24)" → "Non-Credit Opening (EP24)"
  for (const [pat, label] of EXTRAS_TYPE_MAP) {
    if (pat.test(name)) {
      const rest = name.replace(pat, '').trim()
      return rest ? `${label} ${rest}` : label
    }
  }
  return name || titleFromFilename(filename)
}

function yearFromFilename(filename: string): number | null {
  // Prefer explicit (YYYY) form; fall back to bare year between word boundaries
  const explicit = filename.match(/\((\d{4})\)/)
  if (explicit) return parseInt(explicit[1], 10)
  const bare = filename.match(/\b((?:19|20)\d{2})\b/)
  return bare ? parseInt(bare[1], 10) : null
}

// Folders to scan as extras/bonus content
const KNOWN_EXTRAS_FOLDERS = new Set([
  'featurettes', 'extras', 'bonus', 'specials', 'behind the scenes',
  'deleted scenes', 'interviews', 'scenes', 'shorts', 'trailers', 'nc'
])

// Folders to skip entirely
const SKIP_FOLDERS = new Set(['subtitles', 'subs', 'sample'])

function folderType(name: string): 'episode' | 'extras' | 'skip' {
  const lower = name.toLowerCase()
  if (SKIP_FOLDERS.has(lower)) return 'skip'
  if (KNOWN_EXTRAS_FOLDERS.has(lower)) return 'extras'
  return 'episode'
}

// Matches strings that start with quality/release info (not real episode titles)
const QUALITY_RE = /^(720p|1080p|2160p|480p|4k|blu[\s-]?ray|brrip|br\d{3,4}p|web[\s-]?dl|webrip|hdtv|dvdrip|x264|x265|hevc|avc|xvid|divx|aac|ac3|dts|mp3|flac|proper|repack|remux|extended|uncut|theatrical|directors|complete)/i

// Parse episode info from a filename like:
// "Show Name (2023) - S01E01 - Episode Title (quality).mkv"
// "Show.Name.S01E01.Episode.Title.mkv"
// "show.e01e01.extended.mkv" (non-standard season prefix)
function parseEpisodeInfo(filename: string, season?: number): string | null {
  // Filename starts directly with SxxExx: "S01E01-Title [hash].mkv"
  const leadMatch = filename.match(/^(S\d+E\d+)[-\s]+(.+?)(?:\s*\[[^\]]*\])?\.[^.]+$/i)
  if (leadMatch) {
    const badge = leadMatch[1].toUpperCase()
    const title = leadMatch[2].trim()
    if (!title || QUALITY_RE.test(title)) return badge
    return `${badge} · ${title}`
  }

  // Standard dash-delimited SxxExx: "- S01E01 - Title"
  const seMatch = filename.match(/[-–]\s*(S\d+E\d+)\s*[-–]\s*(.+?)(?:\s*\(.*\))*\.[^.]+$/i)
  if (seMatch) return `${seMatch[1].toUpperCase()} · ${seMatch[2].trim()}`

  // Dot-delimited SxxExx: "show.S01E01.title.or.quality.mkv"
  const dotSeMatch = filename.match(/\.(S\d+E\d+)\.(.+?)\.[^.]+$/i)
  if (dotSeMatch) {
    const badge = dotSeMatch[1].toUpperCase()
    const rawTitle = dotSeMatch[2].replace(/\./g, ' ').trim()
    if (QUALITY_RE.test(rawTitle)) return badge   // quality tag — no real title
    return `${badge} · ${rawTitle}`
  }

  // Dot-delimited ExxExx (non-standard, e.g. "poi.e01e01.extended..."):
  // treat first number as season, second as episode
  const dotEEMatch = filename.match(/\.E(\d+)E(\d+)\./i)
  if (dotEEMatch) {
    return `S${dotEEMatch[1].padStart(2, '0')}E${dotEEMatch[2].padStart(2, '0')}`
  }

  // Dash before SxxExx with no title after (optional version suffix): "[Group] Show - S03E01v2.mkv"
  const dashBadgeMatch = filename.match(/[-–]\s*(S\d+E\d+)(?:v\d+)?\s*\.[^.]+$/i)
  if (dashBadgeMatch) return dashBadgeMatch[1].toUpperCase()

  // Space + dash: "Show Name S01E01 - Title - Year Quality.mkv"
  const spaceDashMatch = filename.match(/\s(S\d+E\d+)\s*[-–]\s*(.+)\.[^.]+$/i)
  if (spaceDashMatch) {
    const badge = spaceDashMatch[1].toUpperCase()
    const parts = spaceDashMatch[2].split(/\s*[-–]\s*/)
    const titleParts: string[] = []
    for (const part of parts) {
      if (/^\d{4}/.test(part) || QUALITY_RE.test(part)) break
      titleParts.push(part)
    }
    const title = titleParts.join(' - ').trim()
    if (!title || QUALITY_RE.test(title)) return badge
    return `${badge} · ${title}`
  }

  // Space-delimited without dashes: "Show Name S01E01 Episode Title.mkv"
  const spaceMatch = filename.match(/\s(S\d+E\d+)\s+(.+?)\.[^.]+$/i)
  if (spaceMatch) return `${spaceMatch[1].toUpperCase()} · ${spaceMatch[2].trim()}`

  // Space-delimited badge only: "Show Name S01E01.mkv"
  const spaceBadge = filename.match(/\s(S\d+E\d+)\.[^.]+$/i)
  if (spaceBadge) return spaceBadge[1].toUpperCase()

  if (season !== undefined) {
    const s = String(season).padStart(2, '0')

    // "23. Frenzy.mp4" — starts with number + dot + title
    const dotTitleMatch = filename.match(/^0*(\d{1,3})\.\s+(.+?)\.[^.]+$/)
    if (dotTitleMatch) {
      const e = String(parseInt(dotTitleMatch[1], 10)).padStart(2, '0')
      return `S${s}E${e} · ${dotTitleMatch[2].trim()}`
    }

    // "[Group] Show Name 23 .mkv" — episode number at end before extension
    const endNumMatch = filename.match(/ (\d{1,3})\s*\.[^.]+$/)
    if (endNumMatch) {
      const e = String(parseInt(endNumMatch[1], 10)).padStart(2, '0')
      return `S${s}E${e}`
    }

    // "_-_01_(" or "- 01 -" — bare number with dash/underscore separators
    const epMatch = filename.match(/[-–_]+0*(\d{1,3})[-–_]+/)
    if (epMatch) {
      const e = String(parseInt(epMatch[1], 10)).padStart(2, '0')
      return `S${s}E${e}`
    }
  }

  return null
}

// Walk a movie's directory tree and scan any known extras subfolders
function scanMovieExtras(dir: string, movieTitle: string, poster: string | null): void {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const subDir = join(dir, entry.name)
    if (folderType(entry.name) === 'extras') {
      scanExtrasFolder(subDir, movieTitle, poster)
    } else {
      scanMovieExtras(subDir, movieTitle, poster)
    }
  }
}

// ─── Video (movies) ─────────────────────────────────────────────────────────

function probeMovieIfNeeded(filePath: string, ffprobePath: string): void {
  if (!ffprobePath || !needsTechInfo(filePath)) return
  const info = probeFile(filePath, ffprobePath)
  if (info) updateTechInfo(filePath, info)
}

function scanMovies(rootDir: string, ffprobePath = ''): number {
  if (!existsSync(rootDir)) return 0
  let count = 0

  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
      // Flat movie file
      if (VIDEO_EXTS.has(extname(entry.name).toLowerCase())) {
        const filePath = join(rootDir, entry.name)
        const base = basename(entry.name, extname(entry.name))
        const sidecarPoster = ['jpg', 'png', 'jpeg', 'webp']
          .map((e) => join(rootDir, `${base}.${e}`))
          .find(existsSync) ?? null
        checkAndUpsert(filePath, {
          title: titleFromFilename(entry.name),
          year: yearFromFilename(entry.name),
          category: 'movies',
          filePath,
          posterPath: sidecarPoster
        })
        probeMovieIfNeeded(filePath, ffprobePath)
        count++
      }
      continue
    }

    const movieDir = join(rootDir, entry.name)
    const meta = tryReadJson(join(movieDir, 'movie.json'))
    const poster = findPoster(movieDir)
    const firstVideo = findFirstMovieVideo(movieDir)
    if (firstVideo) {
      const movieTitle = (meta.title as string) ?? titleFromFilename(entry.name)
      checkAndUpsert(firstVideo, {
        title: movieTitle,
        year: (meta.year as number) ?? yearFromFilename(entry.name) ?? yearFromFilename(basename(firstVideo)),
        category: 'movies',
        filePath: firstVideo,
        posterPath: poster,
        description: (meta.description as string) ?? null,
        genre: Array.isArray(meta.genre) ? (meta.genre as string[]).join(', ') : null
      })
      probeMovieIfNeeded(firstVideo, ffprobePath)
      scanMovieExtras(movieDir, movieTitle, poster)
      count++
    }
  }
  return count
}

// Find the first video in a movie folder, ignoring extras subfolders
function findFirstMovieVideo(dir: string): string | null {
  const entries = readdirSync(dir, { withFileTypes: true })
  // Check files in this directory first
  for (const entry of entries) {
    if (entry.isFile() && VIDEO_EXTS.has(extname(entry.name).toLowerCase())) {
      return join(dir, entry.name)
    }
  }
  // Then recurse into non-extras subdirectories
  for (const entry of entries) {
    if (entry.isDirectory() && folderType(entry.name) === 'episode') {
      const found = findFirstMovieVideo(join(dir, entry.name))
      if (found) return found
    }
  }
  return null
}

// ─── Video (tv / anime — episode-per-entry) ─────────────────────────────────

// Load optional episodes.json from a show's root folder.
// Format: { "S01E01": "Pilot", "S01E02": "Ghosts", ... }
function loadEpisodeMap(showDir: string): Record<string, string> | null {
  const mapPath = join(showDir, 'episodes.json')
  if (!existsSync(mapPath)) return null
  try {
    return JSON.parse(readFileSync(mapPath, 'utf-8')) as Record<string, string>
  } catch {
    return null
  }
}

// Apply episode name lookup: given a raw episodeInfo string (e.g. "S01E01" or "S01E01 · Raw Title"),
// replace/set the title from the map if available.
function applyEpisodeMap(info: string, map: Record<string, string>): string {
  const badgeMatch = info.match(/^(S\d+E\d+)/i)
  if (!badgeMatch) return info
  const badge = badgeMatch[1].toUpperCase()
  const name = map[badge]
  if (!name) return info
  return `${badge} · ${name}`
}

function scanEpisodeCategory(rootDir: string, category: string): number {
  if (!existsSync(rootDir)) return 0
  let count = 0

  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const showDir = join(rootDir, entry.name)
    const poster = findPoster(showDir)
    const seriesTitle = titleFromFilename(entry.name)
    const year = yearFromFilename(entry.name)
    const episodeMap = loadEpisodeMap(showDir)
    count += scanEpisodes(showDir, seriesTitle, year, poster, category, undefined, episodeMap)
  }
  return count
}

function scanEpisodes(
  dir: string,
  seriesTitle: string,
  year: number | null,
  poster: string | null,
  category: string,
  season?: number,
  episodeMap?: Record<string, string> | null,
  subSeriesLabel?: string
): number {
  let count = 0
  const entries = readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const type = folderType(entry.name)
      if (type === 'skip') continue
      if (type === 'extras') {
        scanExtrasFolder(join(dir, entry.name), seriesTitle, poster)
      } else {
        // Detect season folder (S01, S02, Season 1, etc.)
        const seasonMatch = entry.name.match(/^(?:S|Season\s*)(\d+)$/i)
        if (seasonMatch) {
          count += scanEpisodes(join(dir, entry.name), seriesTitle, year, poster, category, parseInt(seasonMatch[1], 10), episodeMap)
        } else {
          // Named subfolder (e.g. "Heya Camp", "OVA") — check if it contains multiple video files
          const subDir = join(dir, entry.name)
          const subVideoCount = readdirSync(subDir, { withFileTypes: true })
            .filter((e) => e.isFile() && VIDEO_EXTS.has(extname(e.name).toLowerCase())).length
          if (subVideoCount > 1) {
            // Multi-episode sub-series: assign a stable synthetic season number and label.
            // Optionally load episodes.json from the subfolder; keys use bare Exx format
            // which we promote to the synthetic SxxxExx badge so applyEpisodeMap works.
            const subSeason = stableSeasonHash(entry.name)
            const rawSubMap = loadEpisodeMap(subDir)
            let subEpisodeMap: Record<string, string> | null = rawSubMap
            if (rawSubMap) {
              subEpisodeMap = {}
              for (const [k, v] of Object.entries(rawSubMap)) {
                const eKey = k.match(/^E(\d+)$/i)
                if (eKey) {
                  subEpisodeMap[`S${subSeason}E${eKey[1].padStart(2, '0')}`] = v
                } else {
                  subEpisodeMap[k] = v
                }
              }
            }
            count += scanEpisodes(subDir, seriesTitle, year, poster, category, subSeason, subEpisodeMap, entry.name)
          } else {
            // Single file or unknown: fall back to current behaviour (season 0 = Movies / Specials)
            count += scanEpisodes(subDir, seriesTitle, year, poster, category, season, episodeMap)
          }
        }
      }
      continue
    }
    if (!entry.isFile() || !VIDEO_EXTS.has(extname(entry.name).toLowerCase())) continue

    let episodeInfo = parseEpisodeInfo(entry.name, season) ?? titleFromFilename(entry.name)
    if (episodeMap) episodeInfo = applyEpisodeMap(episodeInfo, episodeMap)
    if (subSeriesLabel) episodeInfo = `§${subSeriesLabel}§${episodeInfo}`
    const epPath = join(dir, entry.name)
    checkAndUpsert(epPath, {
      title: seriesTitle,
      year,
      category,
      filePath: epPath,
      posterPath: poster,
      description: episodeInfo
    })
    count++
  }
  return count
}

function scanExtrasFolder(dir: string, seriesTitle: string, poster: string | null, prefix?: string): void {
  if (!existsSync(dir)) return
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    if (entry.isDirectory()) {
      // Use this folder's name as prefix for files inside it
      scanExtrasFolder(join(dir, entry.name), seriesTitle, poster, entry.name)
      continue
    }
    if (!entry.isFile() || !VIDEO_EXTS.has(extname(entry.name).toLowerCase())) continue
    const fileTitle = titleFromExtrasFilename(entry.name)
    // Prefix with subfolder name when inside a named subfolder (e.g. "Next Episode Preview - Episode 9")
    const title = prefix ? `${prefix} - ${fileTitle}` : fileTitle
    const extraPath = join(dir, entry.name)
    checkAndUpsert(extraPath, {
      title,
      category: 'extras',
      filePath: extraPath,
      posterPath: poster,
      genre: seriesTitle
    })
  }
}

// ─── Music ─────────────────────────────────────────────────────────────────

function scanMusic(rootDir: string, ffprobePath = ''): number {
  if (!existsSync(rootDir)) return 0
  let count = 0
  // Each top-level folder is an album or playlist
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const albumDir = join(rootDir, entry.name)
    const audioFiles = readdirSync(albumDir).filter((f) => AUDIO_EXTS.has(extname(f).toLowerCase())).sort()
    if (audioFiles.length === 0) continue
    _musicTrackCount += audioFiles.length

    // Probe and cache durations for all tracks during scan — keeps album opens instant
    if (ffprobePath) {
      const albumJsonPath = join(albumDir, 'album.json')
      const albumData = tryReadJson(albumJsonPath)
      const cache = (albumData.durations as Record<string, number>) ?? {}
      let updated = false
      for (const f of audioFiles) {
        if (cache[f] !== undefined) continue
        const info = probeFile(join(albumDir, f), ffprobePath)
        if (info && info.duration > 0) { cache[f] = info.duration; updated = true }
      }
      if (updated) {
        try { writeFileSync(albumJsonPath, JSON.stringify({ ...albumData, durations: cache })) } catch { /* non-fatal */ }
      }
    }

    const firstTrack = audioFiles[0]
    const trackPath = join(albumDir, firstTrack)
    const albumMeta = tryReadJson(join(albumDir, 'album.json'))
    checkAndUpsert(trackPath, {
      title: entry.name.replace(/\s*\(\d{4}\)$/, '').trim(),
      year: yearFromFilename(entry.name),
      category: 'music',
      filePath: trackPath,
      posterPath: findPoster(albumDir),
      genre: (albumMeta.artist as string) ?? null
    })
    count++
  }
  return count
}

// ─── Books ─────────────────────────────────────────────────────────────────
// Structure: books/{Title} - {Author}/{filename}.epub
//            books/{Title}.jpg   (optional cover at root level)


function scanBooks(rootDir: string): number {
  if (!existsSync(rootDir)) return 0
  let count = 0

  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const bookDir = join(rootDir, entry.name)

    // Parse "Title - Author" from folder name
    const dashIdx = entry.name.indexOf(' - ')
    const title   = dashIdx >= 0 ? entry.name.slice(0, dashIdx).trim() : entry.name
    const author  = dashIdx >= 0 ? entry.name.slice(dashIdx + 3).trim() : null

    // Find the first book file inside the folder
    let bookFile: string | null = null
    try {
      bookFile = readdirSync(bookDir).find(f => BOOK_EXTS.has(extname(f).toLowerCase())) ?? null
    } catch { continue }
    if (!bookFile) continue

    const filePath   = join(bookDir, bookFile)
    const posterPath = findPoster(bookDir)

    checkAndUpsert(filePath, {
      title,
      category: 'books',
      filePath,
      posterPath: posterPath ?? null,
      genre: author   // repurpose genre field for author
    })
    count++
  }
  return count
}

// ─── Manga ─────────────────────────────────────────────────────────────────

// Strip Suwayomi scanlation group prefix: "Group Name_Vol.1 Ch.8.5 - Title" → "Vol.1 Ch.8.5 - Title"
function cleanMangaTitle(raw: string): string {
  const m = raw.match(/^.+_(Vol\.[\d.]+.*|Ch\.[\d.]+.*)$/i)
  if (m) return m[1].trim()
  return raw
}

function scanManga(rootDir: string): number {
  if (!existsSync(rootDir)) return 0
  let count = 0
  for (const series of readdirSync(rootDir, { withFileTypes: true })) {
    if (!series.isDirectory()) continue
    const seriesDir = join(rootDir, series.name)
    let files: string[] = []
    try { files = readdirSync(seriesDir).filter(f => MANGA_EXTS.has(extname(f).toLowerCase())).sort() }
    catch { continue }
    if (!files.length) continue
    _mangaSeriesCount++
    const poster = findPoster(seriesDir)
    for (const file of files) {
      const filePath = join(seriesDir, file)
      // Single file in folder → use folder name as title; multiple → use filename
      const title = files.length === 1 ? series.name : cleanMangaTitle(basename(file, extname(file)))
      checkAndUpsert(filePath, {
        title,
        category: 'manga',
        filePath,
        posterPath: poster
      })
      count++
    }
  }
  return count
}

// ─── PC Games ──────────────────────────────────────────────────────────────

function scanPcGames(rootDir: string): number {
  if (!existsSync(rootDir)) return 0
  let count = 0
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const gameDir = join(rootDir, entry.name)
    const meta = tryReadJson(join(gameDir, 'game.json'))
    const execName = (meta.executable as string) ?? findExe(gameDir)
    if (!execName) continue
    const exePath = join(gameDir, execName)
    checkAndUpsert(exePath, {
      title: (meta.title as string) ?? entry.name,
      year: (meta.year as number) ?? null,
      category: 'games',
      filePath: exePath,
      posterPath: findPoster(gameDir),
      description: (meta.description as string) ?? null,
      genre: Array.isArray(meta.genre) ? (meta.genre as string[]).join(', ') : null,
      platform: 'pc',
      executable: execName
    })
    count++
  }
  return count
}

function findExe(dir: string): string | null {
  const entries = readdirSync(dir)

  if (process.platform === 'win32') {
    return entries.find((f) => extname(f).toLowerCase() === '.exe') ?? null
  }

  if (process.platform === 'darwin') {
    // .app bundles are directories — return the path to the inner binary so it can be spawned directly
    const bundle = entries.find((f) => extname(f).toLowerCase() === '.app')
    if (bundle) {
      const appName = basename(bundle, '.app')
      const innerBin = join(bundle, 'Contents', 'MacOS', appName)
      if (existsSync(join(dir, innerBin))) return innerBin
    }
    return null
  }

  // Linux — find any file with executable permission bits set
  for (const f of entries) {
    try {
      const st = statSync(join(dir, f))
      if (!st.isDirectory() && (st.mode & 0o111) !== 0) return f
    } catch { /* skip unreadable entries */ }
  }
  return null
}

// ─── ROMs ───────────────────────────────────────────────────────────────────

function scanRoms(rootDir: string): number {
  if (!existsSync(rootDir)) return 0
  let count = 0
  for (const platformFolder of readdirSync(rootDir, { withFileTypes: true })) {
    if (!platformFolder.isDirectory()) continue
    const platform = ROM_PLATFORM[platformFolder.name.toLowerCase()]
    if (!platform) continue
    const platformDir = join(rootDir, platformFolder.name)
    if (platform === 'mame') {
      // Each game lives in its own subfolder: mame/Mappy/mappy.zip
      for (const entry of readdirSync(platformDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const gameDir = join(platformDir, entry.name)
        const zips = readdirSync(gameDir).filter((f) => extname(f).toLowerCase() === '.zip')
        if (!zips.length) continue
        // When multiple zips exist (e.g. parent + clone), prefer the one whose
        // name shares the longest common prefix with the folder name.
        const folderKey = entry.name.toLowerCase().replace(/[^a-z0-9]/g, '')
        const zip = zips.reduce((best, f) => {
          const nameKey = basename(f, '.zip').toLowerCase().replace(/[^a-z0-9]/g, '')
          const bestKey = basename(best, '.zip').toLowerCase().replace(/[^a-z0-9]/g, '')
          let nMatch = 0; let bMatch = 0
          for (let i = 0; i < Math.min(nameKey.length, folderKey.length); i++) {
            if (nameKey[i] !== folderKey[i]) break; nMatch++
          }
          for (let i = 0; i < Math.min(bestKey.length, folderKey.length); i++) {
            if (bestKey[i] !== folderKey[i]) break; bMatch++
          }
          return nMatch > bMatch ? f : best
        })
        if (!zip) continue
        const romPath = join(gameDir, zip)
        checkAndUpsert(romPath, {
          title: entry.name,
          category: 'games',
          filePath: romPath,
          posterPath: findPoster(gameDir),
          platform
        })
        count++
      }
    } else {
      for (const entry of readdirSync(platformDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          // Folder-per-game structure: rom/xbox360/Halo 3/game.iso — supports posters
          const gameDir = join(platformDir, entry.name)
          const rom = readdirSync(gameDir).find((f) => ROM_EXTS.has(extname(f).toLowerCase()))
          if (!rom) continue
          const romPath = join(gameDir, rom)
          checkAndUpsert(romPath, {
            title: entry.name,
            category: 'games',
            filePath: romPath,
            posterPath: findPoster(gameDir),
            platform
          })
          count++
        } else if (entry.isFile() && ROM_EXTS.has(extname(entry.name).toLowerCase())) {
          // Flat file fallback: rom/xbox360/game.iso
          const romPath = join(platformDir, entry.name)
          checkAndUpsert(romPath, {
            title: titleFromFilename(entry.name),
            category: 'games',
            filePath: romPath,
            platform
          })
          count++
        }
      }
    }
  }
  return count
}

// ─── Main entry ─────────────────────────────────────────────────────────────

export function scanLibrary(root: string, ffprobePath = ''): { total: number; updated: number } {
  const m = (sub: string) => join(root, 'media', sub)
  const g = (sub: string) => join(root, 'games', sub)

  // Initialize incremental scan session
  _storedTimes      = getStoredFileTimes()
  _foundPaths       = new Set<string>()
  _updatedCount     = 0
  _categoryBytes    = new Map<string, number>()
  _musicTrackCount  = 0
  _mangaSeriesCount = 0

  let total = 0
  total += scanMovies(m('movies'), ffprobePath)
  total += scanEpisodeCategory(m('tv'), 'tv')
  total += scanEpisodeCategory(m('anime'), 'anime')
  total += scanMusic(m('music'), ffprobePath)
  total += scanBooks(m('books'))
  total += scanManga(m('manga'))
  total += scanPcGames(g('pc'))
  total += scanRoms(g('roms'))

  // Remove DB entries for files that no longer exist on disk
  deleteOrphanedEntries(_foundPaths)

  const updated = _updatedCount

  // Persist storage and count stats to config so the stats page can read them without re-walking the disk
  const storageTotal = [..._categoryBytes.values()].reduce((a, b) => a + b, 0)
  setConfig('storageStats', JSON.stringify({
    total: storageTotal,
    byCategory: Object.fromEntries(_categoryBytes),
    musicTrackCount: _musicTrackCount,
    mangaSeriesCount: _mangaSeriesCount,
    computedAt: Date.now()
  }))

  // Clear session state
  _storedTimes      = new Map()
  _foundPaths       = new Set()
  _updatedCount     = 0
  _categoryBytes    = new Map()
  _musicTrackCount  = 0
  _mangaSeriesCount = 0

  return { total, updated }
}
