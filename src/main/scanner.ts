import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, extname, basename } from 'path'
import { upsertItem, getStoredFileTimes, deleteOrphanedEntries } from './database'

// ─── Incremental scan session state ─────────────────────────────────────────
// Populated at the start of each scanLibrary call, cleared at the end.
let _storedTimes = new Map<string, number>()
let _foundPaths  = new Set<string>()

// Call instead of upsertItem directly. Skips files whose mtime hasn't changed.
function checkAndUpsert(filePath: string, item: Parameters<typeof upsertItem>[0]): boolean {
  const mtime = Math.floor(statSync(filePath).mtimeMs)
  _foundPaths.add(filePath)
  if (_storedTimes.get(filePath) === mtime) return false // unchanged — skip
  upsertItem({ ...item, fileModified: mtime })
  return true
}

const VIDEO_EXTS = new Set(['.mkv', '.mp4', '.avi', '.mov', '.m4v', '.wmv'])
const AUDIO_EXTS = new Set(['.mp3', '.flac', '.aac', '.ogg', '.wav', '.m4a'])
const BOOK_EXTS  = new Set(['.epub', '.pdf', '.mobi'])
const MANGA_EXTS = new Set(['.cbz', '.cbr'])
const ROM_EXTS   = new Set(['.z64', '.n64', '.iso', '.wbfs', '.rvz', '.xex', '.pkg', '.gba', '.nds', '.sfc', '.smc'])

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
  gbc: 'gbc'
}

function tryReadJson(filePath: string): Record<string, unknown> {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'))
  } catch {
    return {}
  }
}

function findPoster(dir: string): string | null {
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

function titleFromFilename(filename: string): string {
  // "The Dark Knight (2008) [1080p].mkv" → "The Dark Knight"
  return basename(filename, extname(filename))
    .replace(/\s*\(\d{4}\).*$/, '')
    .replace(/\s*\[.*?\]/g, '')
    .replace(/\./g, ' ')
    .trim()
}

function yearFromFilename(filename: string): number | null {
  const match = filename.match(/\((\d{4})\)/)
  return match ? parseInt(match[1], 10) : null
}

// Folders to scan as extras/bonus content
const KNOWN_EXTRAS_FOLDERS = new Set([
  'featurettes', 'extras', 'bonus', 'specials', 'behind the scenes',
  'deleted scenes', 'interviews', 'scenes', 'shorts', 'trailers'
])

// Folders to skip entirely
const SKIP_FOLDERS = new Set(['subtitles', 'subs', 'sample'])

function folderType(name: string): 'episode' | 'extras' | 'skip' {
  const lower = name.toLowerCase()
  if (SKIP_FOLDERS.has(lower)) return 'skip'
  if (KNOWN_EXTRAS_FOLDERS.has(lower)) return 'extras'
  return 'episode'
}

// Parse episode info from a filename like:
// "Show Name (2023) - S01E01 - Episode Title (quality).mkv"
function parseEpisodeInfo(filename: string, season?: number): string | null {
  // Standard SxxExx format: "- S01E01 - Title"
  const seMatch = filename.match(/[-–]\s*(S\d+E\d+)\s*[-–]\s*(.+?)(?:\s*\(.*\))*\.[^.]+$/i)
  if (seMatch) return `${seMatch[1].toUpperCase()} · ${seMatch[2].trim()}`

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

function scanMovies(rootDir: string): number {
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
        year: (meta.year as number) ?? yearFromFilename(entry.name),
        category: 'movies',
        filePath: firstVideo,
        posterPath: poster,
        description: (meta.description as string) ?? null,
        genre: Array.isArray(meta.genre) ? (meta.genre as string[]).join(', ') : null
      })
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

function scanEpisodeCategory(rootDir: string, category: string): number {
  if (!existsSync(rootDir)) return 0
  let count = 0

  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const showDir = join(rootDir, entry.name)
    const poster = findPoster(showDir)
    const seriesTitle = titleFromFilename(entry.name)
    const year = yearFromFilename(entry.name)
    count += scanEpisodes(showDir, seriesTitle, year, poster, category)
  }
  return count
}

function scanEpisodes(
  dir: string,
  seriesTitle: string,
  year: number | null,
  poster: string | null,
  category: string,
  season?: number
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
        const childSeason = seasonMatch ? parseInt(seasonMatch[1], 10) : season
        count += scanEpisodes(join(dir, entry.name), seriesTitle, year, poster, category, childSeason)
      }
      continue
    }
    if (!entry.isFile() || !VIDEO_EXTS.has(extname(entry.name).toLowerCase())) continue

    const episodeInfo = parseEpisodeInfo(entry.name, season) ?? titleFromFilename(entry.name)
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
    const fileTitle = titleFromFilename(entry.name)
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

function scanMusic(rootDir: string): number {
  if (!existsSync(rootDir)) return 0
  let count = 0
  // Artist → Album → tracks
  for (const artist of readdirSync(rootDir, { withFileTypes: true })) {
    if (!artist.isDirectory()) continue
    const artistDir = join(rootDir, artist.name)
    for (const album of readdirSync(artistDir, { withFileTypes: true })) {
      if (!album.isDirectory()) continue
      const albumDir = join(artistDir, album.name)
      const firstTrack = readdirSync(albumDir).find((f) =>
        AUDIO_EXTS.has(extname(f).toLowerCase())
      )
      if (firstTrack) {
        const trackPath = join(albumDir, firstTrack)
        checkAndUpsert(trackPath, {
          title: album.name.replace(/\s*\(\d{4}\)$/, '').trim(),
          year: yearFromFilename(album.name),
          category: 'music',
          filePath: trackPath,
          posterPath: findPoster(albumDir),
          genre: artist.name
        })
        count++
      }
    }
  }
  return count
}

// ─── Books ─────────────────────────────────────────────────────────────────

function scanBooks(rootDir: string): number {
  if (!existsSync(rootDir)) return 0
  let count = 0
  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) { walk(full); continue }
      if (BOOK_EXTS.has(extname(entry.name).toLowerCase())) {
        checkAndUpsert(full, {
          title: titleFromFilename(entry.name),
          category: 'books',
          filePath: full
        })
        count++
      }
    }
  }
  walk(rootDir)
  return count
}

// ─── Manga ─────────────────────────────────────────────────────────────────

function scanManga(rootDir: string): number {
  if (!existsSync(rootDir)) return 0
  let count = 0
  // Series folder → volume files
  for (const series of readdirSync(rootDir, { withFileTypes: true })) {
    if (!series.isDirectory()) continue
    const seriesDir = join(rootDir, series.name)
    const firstVol = readdirSync(seriesDir).find((f) =>
      MANGA_EXTS.has(extname(f).toLowerCase())
    )
    if (firstVol) {
      const volPath = join(seriesDir, firstVol)
      checkAndUpsert(volPath, {
        title: series.name,
        category: 'manga',
        filePath: volPath,
        posterPath: findPoster(seriesDir)
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
  return entries.find((f) => extname(f).toLowerCase() === '.exe') ?? null
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
    for (const entry of readdirSync(platformDir, { withFileTypes: true })) {
      if (!entry.isFile()) continue
      if (!ROM_EXTS.has(extname(entry.name).toLowerCase())) continue
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
  return count
}

// ─── Main entry ─────────────────────────────────────────────────────────────

export function scanLibrary(root: string): number {
  const m = (sub: string) => join(root, 'media', sub)
  const g = (sub: string) => join(root, 'games', sub)

  // Initialize incremental scan session
  _storedTimes = getStoredFileTimes()
  _foundPaths  = new Set<string>()

  let total = 0
  total += scanMovies(m('movies'))
  total += scanEpisodeCategory(m('tv'), 'tv')
  total += scanEpisodeCategory(m('anime'), 'anime')
  total += scanMusic(m('music'))
  total += scanBooks(m('books'))
  total += scanManga(m('manga'))
  total += scanPcGames(g('pc'))
  total += scanRoms(g('roms'))

  // Remove DB entries for files that no longer exist on disk
  deleteOrphanedEntries(_foundPaths)

  // Clear session state
  _storedTimes = new Map()
  _foundPaths  = new Set()

  return total
}
