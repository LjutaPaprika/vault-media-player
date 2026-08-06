import { existsSync, readdirSync, readFileSync, writeFileSync, statSync } from 'fs'
import { join, extname, basename, dirname, sep } from 'path'
import { execSync } from 'child_process'
import { upsertItem, getStoredFileTimes, deleteOrphanedEntries, migrateRenamedPaths, updateTechInfo, needsTechInfo, setConfig, getStoredDirTimes, setStoredDirTimes } from './database'
import { probeFile, probeAudioFileSync } from './mediaInfo'

// macOS Finder drops these into any directory it touches — `.DS_Store` for
// folder metadata, `._<name>` AppleDouble sidecars carrying resource forks and
// extended attributes for each real file. On a drive that's been to a Mac and
// back, `readdirSync` on Windows will happily return them, and the scanner's
// `find(...)` calls can end up picking `._Halo.iso` or `._poster.jpg` as the
// "real" file. That silently rewrites DB rows to point at 4KB stub files, or —
// worse — the AppleDouble file passes the extension filter but the real one
// doesn't get counted, so the real path gets orphan-deleted.
//
// Filtering these at every readdir touchpoint is cheaper than trying to fix each
// call site individually, and matches the ignore list in sync.ts's SYSTEM_FILE_GLOBS.
function isOsMetadata(name: string): boolean {
  return name === '.DS_Store' || name.startsWith('._') || name === 'Thumbs.db' || name === 'desktop.ini'
}

// Returns the set of subdirectory names inside `dir` flagged as hidden by the OS.
// Windows: parses `attrib /D <dir>\*` for the H bit.
// Mac/Linux: honors the dot-prefix convention (caller can also check directly).
function listHiddenDirs(dir: string): Set<string> {
  const hidden = new Set<string>()
  if (process.platform !== 'win32') return hidden
  try {
    const out = execSync(`attrib /D "${join(dir, '*')}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
    for (const line of out.split(/\r?\n/)) {
      // attrib output: flags occupy fixed columns at the start, path follows.
      // We look for ' H ' in the attribute span (first ~20 chars) and capture the trailing path.
      const m = line.match(/^(.{0,20}?)\s{2,}([A-Za-z]:\\.+)$/)
      if (!m) continue
      const flags = m[1]
      const path = m[2]
      if (/\bH\b/.test(flags)) hidden.add(basename(path))
    }
  } catch { /* attrib not available or dir empty — treat as nothing hidden */ }
  return hidden
}

// ─── Incremental scan session state ─────────────────────────────────────────
// Populated at the start of each scanLibrary call, cleared at the end.
let _storedTimes     = new Map<string, number>()
let _storedDirTimes  = new Map<string, number>()
// Per-directory set of basenames that the DB knew about at scan start. Built
// once from _storedTimes. Used by isDirChanged to detect renames on
// filesystems where renaming a file inside a directory doesn't bump the
// directory's mtime (Windows NTFS / exFAT) — if a previously-indexed file is
// gone from disk, something in the dir changed even though mtime says it didn't.
let _storedDirFiles  = new Map<string, Set<string>>()
// Set of directories that isDirChanged flagged as dirty this scan. Used by
// checkAndUpsert to force a DB write even when a file's mtime is unchanged,
// so sidecar updates (new poster, episodes.json edits) propagate.
let _dirtyDirs       = new Set<string>()
let _foundPaths      = new Set<string>()
let _updatedCount    = 0
let _categoryBytes   = new Map<string, number>()
let _extrasBytesByParent = new Map<string, number>()
let _musicTrackCount = 0
let _mangaSeriesCount = 0
let _smartMode       = false
// Set by a Force Rescan. Bypasses the per-file mtime skip for this run without
// touching the stored mtimes themselves — those are the match key
// migrateRenamedPaths needs to carry last_opened_at across a path change, so
// destroying them (as clearStoredFileTimes used to) guaranteed total state loss
// on every drive swap.
let _forceRescan     = false

// Call instead of upsertItem directly. Skips files whose mtime hasn't changed.
// (Note: `force` here just bypasses the mtime skip — it does NOT relate to the
// keepPosterOnNull flag on the upsert; that one rides along in `item`.)
function checkAndUpsert(filePath: string, item: Parameters<typeof upsertItem>[0], force = false): boolean {
  const { mtimeMs, size } = statSync(filePath)
  const mtime = Math.floor(mtimeMs)
  _foundPaths.add(filePath)
  // Accumulate file size per category regardless of whether the file changed
  const cat = item.category
  _categoryBytes.set(cat, (_categoryBytes.get(cat) ?? 0) + size)
  // For extras, also attribute bytes to the parent category (movies/tv/anime) so the stats
  // page can fold extras storage into its parent category.
  if (cat === 'extras') {
    const norm = filePath.replace(/\\/g, '/').toLowerCase()
    const m = norm.match(/\/media\/(movies|tv|anime)\//)
    if (m) {
      const parent = m[1]
      _extrasBytesByParent.set(parent, (_extrasBytesByParent.get(parent) ?? 0) + size)
    }
  }
  // Skip only when the file is unchanged AND nothing forces an upsert.
  // Sidecar changes (new poster, edited episodes.json) leave media mtimes
  // alone but still require us to push fresh metadata into the DB; the
  // _dirtyDirs membership check propagates that signal from isDirChanged.
  if (!force && !_forceRescan && !_dirtyDirs.has(dirname(filePath)) && _storedTimes.get(filePath) === mtime) return false
  upsertItem({ ...item, fileModified: mtime })
  _updatedCount++
  return true
}


// Smart-scan helpers: skip directories whose contents haven't changed since
// last scan. On exFAT (and occasionally NTFS) the parent directory's mtime
// isn't reliably bumped when files inside are added/renamed/replaced, so an
// mtime-only check silently misses real changes. We back the mtime check with
// a one-level file probe.
//
// `_storedDirTimes` holds a *watermark*: the max of the directory's mtime and
// every file mtime at last scan. A directory is clean iff the current dir
// mtime is <= the watermark AND no file inside has an mtime > the watermark.
// Using a watermark (instead of just the dir mtime) fixes a re-dirty loop —
// previously, when a file's mtime was newer than the dir's, we'd write the
// file mtime into the dir slot, and the next scan would see stored != dirMtime
// and mark the dir dirty again, every scan, forever.
function isDirChanged(dirPath: string): boolean {
  try {
    const dirMtime = Math.floor(statSync(dirPath).mtimeMs)
    // A full scan has nothing to compare against — every directory is dirty by
    // definition — but it still walks the files below, because the watermark it
    // records is what the *next* smart scan trusts. Force Rescan wipes
    // dir_mtimes and then runs full, so without this the table stayed empty and
    // the next "Scan Library" degraded into a full walk. Seeding the watermark
    // from the directory's mtime alone isn't enough either: a directory holding
    // files the scanner doesn't index (posters, episodes.json, subtitles) that
    // are newer than the directory itself would re-dirty on the next scan.
    const stored = _smartMode ? _storedDirTimes.get(dirPath) : undefined
    let watermark = dirMtime
    let dirty = !_smartMode || stored === undefined || dirMtime > stored

    const onDiskNames = new Set<string>()
    for (const e of readdirSync(dirPath, { withFileTypes: true })) {
      if (!e.isFile()) continue
      if (isOsMetadata(e.name)) continue
      onDiskNames.add(e.name)
      const fp = join(dirPath, e.name)
      try {
        const fm = Math.floor(statSync(fp).mtimeMs)
        if (fm > watermark) watermark = fm
        if (stored !== undefined && fm > stored) dirty = true
      } catch { /* ignore stat failure */ }
    }

    // Desync guard: the mtime cache remembers this directory but the DB holds
    // no rows under it. The cache and the rows have drifted apart, so the
    // "unchanged since last scan" answer is meaningless — re-index instead.
    //
    // This is the load-bearing fix for drive swaps. Directory mtimes survive a
    // Mac↔Windows swap byte-identical (measured: 586/586 stored watermarks
    // compare clean after a swap), so an mtime-only check finds *nothing*
    // dirty and a regular scan re-indexes nothing at all. Any shelf whose rows
    // were dropped — orphan-cleaned under the other OS's paths, or never
    // indexed on that OS in the first place — then stays invisible no matter
    // how many times you press Scan Library, and only a Force Rescan brings it
    // back. It also covers the stale-root case: when rows still carry the other
    // OS's paths, _storedDirFiles is keyed by those paths, so every directory
    // looks row-less here, goes dirty, and gets re-indexed — which gives
    // migrateRenamedPaths the fresh rows it needs to carry last_opened_at
    // across before orphan cleanup runs.
    if (!dirty && onDiskNames.size > 0 && !_storedDirFiles.has(dirPath)) dirty = true

    // Rename detection that survives stale dir mtimes (NTFS / exFAT don't bump
    // the parent dir mtime on rename-within-dir). If a file the DB knew about
    // at scan start is no longer on disk under the same name, the dir really
    // did change even though mtime says otherwise.
    if (!dirty && stored !== undefined) {
      const expected = _storedDirFiles.get(dirPath)
      if (expected) {
        for (const name of expected) {
          if (!onDiskNames.has(name)) { dirty = true; break }
        }
      }
    }

    if (!dirty) return false
    _storedDirTimes.set(dirPath, watermark)
    _dirtyDirs.add(dirPath)
    return true
  } catch {
    return true
  }
}

function preserveStoredPaths(dirPrefix: string): void {
  const prefix = dirPrefix.endsWith(sep) ? dirPrefix : dirPrefix + sep
  for (const [filePath] of _storedTimes) {
    if (filePath.startsWith(prefix)) _foundPaths.add(filePath)
  }
}

function preserveDirectFiles(dirPrefix: string): void {
  const prefix = dirPrefix.endsWith(sep) ? dirPrefix : dirPrefix + sep
  for (const [filePath] of _storedTimes) {
    if (filePath.startsWith(prefix) && !filePath.slice(prefix.length).includes(sep)) {
      _foundPaths.add(filePath)
    }
  }
}

const VIDEO_EXTS = new Set(['.mkv', '.mp4', '.avi', '.mov', '.m4v', '.wmv'])
const AUDIO_EXTS = new Set(['.mp3', '.flac', '.aac', '.ogg', '.wav', '.m4a'])
const BOOK_EXTS  = new Set(['.epub', '.pdf', '.mobi'])
const MANGA_EXTS = new Set(['.cbz', '.cbr', '.epub', '.pdf'])
const ROM_EXTS   = new Set(['.z64', '.n64', '.iso', '.wbfs', '.rvz', '.xex', '.pkg', '.shadps4', '.gba', '.gbc', '.gb', '.nds', '.sfc', '.smc'])

// Map rom subfolder name → platform key
const ROM_PLATFORM: Record<string, string> = {
  n64: 'n64',
  gamecube: 'gamecube',
  wii: 'wii',
  xbox: 'xbox',
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

/**
 * Detailed poster lookup. Distinguishes "readable directory, no image inside"
 * (path=null, readable=true — safe to clear DB poster) from "readdir failed"
 * (path=null, readable=false — DB poster must be preserved). Without this
 * split, a transient readdir hiccup on the series/album/movie folder wipes
 * covers off every child row when checkAndUpsert next fires.
 */
export function findPosterStrict(dir: string): { path: string | null; readable: boolean } {
  for (const name of ['poster.jpg', 'poster.png', 'cover.jpg', 'cover.png', 'folder.jpg']) {
    const p = join(dir, name)
    if (existsSync(p)) return { path: p, readable: true }
  }
  try {
    const img = readdirSync(dir).find((f) => !isOsMetadata(f) && /\.(jpe?g|png|webp)$/i.test(f))
    return { path: img ? join(dir, img) : null, readable: true }
  } catch {
    return { path: null, readable: false }
  }
}

/** Back-compat shim for external callers that don't need the readable flag. */
export function findPoster(dir: string): string | null {
  return findPosterStrict(dir).path
}

function stableSeasonHash(name: string): number {
  let h = 5381
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) & 0x7fffffff
  return 100 + (h % 900)
}

function titleFromFilename(filename: string): string {
  // "The Dark Knight (2008) [1080p].mkv" → "The Dark Knight"
  // Only strip the trailing extension if it's a known media ext — otherwise
  // titles containing dots (e.g. "Mr. Deeds Goes to Town") get truncated by
  // Node's extname(), which treats the first dot as an extension boundary.
  const ext = extname(filename).toLowerCase()
  const knownExts = new Set([...VIDEO_EXTS, '.jpg', '.jpeg', '.png', '.webp'])
  const stripped = knownExts.has(ext) ? basename(filename, extname(filename)) : filename
  return stripped
    .replace(/\s*\(\d{4}\).*$/, '')
    .replace(/\s*\[.*?\]/g, '')
    .replace(/\./g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Abbreviation → readable label for anime extras.
// The trailing `(?=…)` lookahead ensures the abbreviation isn't actually the
// start of a longer word — e.g. `/^SP/i` would otherwise chew the "Sp" off
// "Special", producing "Special ecial" (Toradora bug).
const ABBR_TAIL = '(?=$|[\\s\\d\\-_(\\[.])'
const EXTRAS_TYPE_MAP: [RegExp, string][] = [
  [new RegExp(`^NCED${ABBR_TAIL}`, 'i'), 'Non-Credit Ending'],
  [new RegExp(`^NCOP${ABBR_TAIL}`, 'i'), 'Non-Credit Opening'],
  [new RegExp(`^PV${ABBR_TAIL}`,   'i'), 'Promo Video'],
  [new RegExp(`^CM${ABBR_TAIL}`,   'i'), 'Commercial'],
  [new RegExp(`^OP${ABBR_TAIL}`,   'i'), 'Opening'],
  [new RegExp(`^ED${ABBR_TAIL}`,   'i'), 'Ending'],
  [new RegExp(`^OAD${ABBR_TAIL}`,  'i'), 'OAD'],
  [new RegExp(`^OVA${ABBR_TAIL}`,  'i'), 'OVA'],
  [new RegExp(`^SP${ABBR_TAIL}`,   'i'), 'Special'],
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

// Matches extras titles that are pure type-code labels with no built-in series/season context
// (i.e. the series prefix was stripped). These get a season prefix prepended when available.
const NEEDS_CONTEXT_RE = /^(?:Special|Non-Credit (?:Ending|Opening)|Promo Video|Commercial|Opening|Ending|OAD|OVA)(?:\s*\d+)?$/i

// Folders to scan as extras/bonus content
const KNOWN_EXTRAS_FOLDERS = new Set([
  'featurettes', 'extras', 'bonus', 'specials', 'behind the scenes',
  'deleted scenes', 'interviews', 'scenes', 'shorts', 'trailers', 'nc',
  'openings', 'endings', 'openings & endings', 'openings and endings',
  'ovas', 'oads', 'pv', 'pvs', 'commercials', 'cms'
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
  // Multi-episode bundle: "Show - S01E01-E02 - Title.mkv" or "Show - S03E18-E21 - Title.mkv"
  // Produces a range badge like "S01E01-02" so two-part / multi-part files are visible as such.
  const multiSeMatch = filename.match(/[-–]\s*S(\d+)E(\d+)-E(\d+)\s*[-–]\s*(.+?)(?:\s*\(.*\))*\.[^.]+$/i)
  if (multiSeMatch) {
    const s = multiSeMatch[1].padStart(2, '0')
    const e1 = multiSeMatch[2].padStart(2, '0')
    const e2 = multiSeMatch[3].padStart(2, '0')
    const title = multiSeMatch[4].trim()
    const badge = `S${s}E${e1}-${e2}`
    return title && !QUALITY_RE.test(title) ? `${badge} · ${title}` : badge
  }

  // Multi-episode bare leading form (named-subfolder): "E001-E002 - Pilot.mkv"
  const multiLeadEMatch = filename.match(/^E(\d+)-E(\d+)[-\s]+(.+?)(?:\s*\[[^\]]*\])?\.[^.]+$/i)
  if (multiLeadEMatch) {
    const e1 = String(parseInt(multiLeadEMatch[1], 10)).padStart(2, '0')
    const e2 = String(parseInt(multiLeadEMatch[2], 10)).padStart(2, '0')
    const title = multiLeadEMatch[3].trim()
    const badge = season !== undefined
      ? `S${String(season).padStart(2, '0')}E${e1}-${e2}`
      : `E${e1}-${e2}`
    return title && !QUALITY_RE.test(title) ? `${badge} · ${title}` : badge
  }

  // Filename starts directly with SxxExx: "S01E01-Title [hash].mkv"
  const leadMatch = filename.match(/^(S\d+E\d+)[-\s]+(.+?)(?:\s*\[[^\]]*\])?\.[^.]+$/i)
  if (leadMatch) {
    const badge = leadMatch[1].toUpperCase()
    const title = leadMatch[2].trim()
    if (!title || QUALITY_RE.test(title)) return badge
    return `${badge} · ${title}`
  }

  // Filename starts with bare Exx (named-subfolder convention): "E05 - Title.mkv"
  const leadEMatch = filename.match(/^E(\d+)[-\s]+(.+?)(?:\s*\[[^\]]*\])?\.[^.]+$/i)
  if (leadEMatch) {
    const epNum = String(parseInt(leadEMatch[1], 10)).padStart(2, '0')
    const badge = season !== undefined
      ? `S${String(season).padStart(2, '0')}E${epNum}`
      : `E${epNum}`
    const title = leadEMatch[2].trim()
    if (!title || QUALITY_RE.test(title)) return badge
    return `${badge} · ${title}`
  }

  // Standard dash-delimited SxxExx: "- S01E01 - Title"
  const seMatch = filename.match(/[-–]\s*(S\d+E\d+)\s*[-–]\s*(.+?)(?:\s*\(.*\))*\.[^.]+$/i)
  if (seMatch) return `${seMatch[1].toUpperCase()} · ${seMatch[2].trim()}`

  // Space-separated SxxExx: "- S01 E01 - Title" (e.g. GitS SAC naming)
  const seSpaceMatch = filename.match(/[-–]\s*(S\d+)\s+(E\d+)\s*[-–]\s*(.+?)(?:\s*\(.*\))*\.[^.]+$/i)
  if (seSpaceMatch) return `${seSpaceMatch[1].toUpperCase()}${seSpaceMatch[2].toUpperCase()} · ${seSpaceMatch[3].trim()}`

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
  // Category root not reachable this instant (transient TCC / USB / mount race).
  // Preserve every stored row under it so orphan cleanup doesn't wipe the shelf.
  if (!existsSync(rootDir)) { preserveStoredPaths(rootDir); return 0 }
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
    if (!isDirChanged(movieDir)) { preserveStoredPaths(movieDir); count++; continue }
    const meta = tryReadJson(join(movieDir, 'movie.json'))
    const posterRes = findPosterStrict(movieDir)
    const firstVideo = findFirstMovieVideo(movieDir)
    if (firstVideo) {
      const movieTitle = (meta.title as string) ?? titleFromFilename(entry.name)
      checkAndUpsert(firstVideo, {
        title: movieTitle,
        year: (meta.year as number) ?? yearFromFilename(entry.name) ?? yearFromFilename(basename(firstVideo)),
        category: 'movies',
        filePath: firstVideo,
        posterPath: posterRes.path,
        keepPosterOnNull: !posterRes.readable,
        description: (meta.description as string) ?? null,
        genre: Array.isArray(meta.genre) ? (meta.genre as string[]).join(',') : typeof meta.genre === 'string' ? meta.genre : null
      })
      probeMovieIfNeeded(firstVideo, ffprobePath)
      scanMovieExtras(movieDir, movieTitle, posterRes.path)
      count++
    } else {
      // Movie folder is dirty but we couldn't find a video file this pass
      // (transient readdir miss on shared exFAT, macOS metadata shuffle).
      // Keep the previously-indexed rows so the DB doesn't blank out the
      // whole movie shelf on a bad enumeration.
      preserveStoredPaths(movieDir)
    }
  }
  return count
}

// Find the first video in a movie folder, ignoring extras subfolders
function findFirstMovieVideo(dir: string): string | null {
  const entries = readdirSync(dir, { withFileTypes: true })
  // Check files in this directory first
  for (const entry of entries) {
    if (entry.isFile() && !isOsMetadata(entry.name) && VIDEO_EXTS.has(extname(entry.name).toLowerCase())) {
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
  if (!existsSync(rootDir)) { preserveStoredPaths(rootDir); return 0 }
  let count = 0

  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const showDir = join(rootDir, entry.name)
    const posterRes = findPosterStrict(showDir)
    const seriesTitle = titleFromFilename(entry.name)
    const year = yearFromFilename(entry.name)
    const episodeMap = loadEpisodeMap(showDir)
    count += scanEpisodes(showDir, seriesTitle, year, posterRes.path, category, undefined, episodeMap, undefined, !posterRes.readable)
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
  subSeriesLabel?: string,
  keepPosterOnNull = false
): number {
  let count = 0
  const dirChanged = isDirChanged(dir)
  const entries = readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const type = folderType(entry.name)
      if (type === 'skip') continue
      if (type === 'extras') {
        const ctx = subSeriesLabel ?? (season !== undefined ? `Season ${season}` : undefined)
        scanExtrasFolder(join(dir, entry.name), seriesTitle, poster, undefined, ctx, keepPosterOnNull)
      } else {
        // Detect season folder (S01, S02, Season 1, etc.)
        const seasonMatch = entry.name.match(/^(?:S|Season\s*)(\d+)$/i)
        if (seasonMatch) {
          count += scanEpisodes(join(dir, entry.name), seriesTitle, year, poster, category, parseInt(seasonMatch[1], 10), episodeMap, undefined, keepPosterOnNull)
        } else {
          // Named subfolder (e.g. "Heya Camp", "OVA") — check if it contains multiple video files
          const subDir = join(dir, entry.name)
          const subVideoCount = readdirSync(subDir, { withFileTypes: true })
            .filter((e) => e.isFile() && VIDEO_EXTS.has(extname(e.name).toLowerCase())).length
          if (subVideoCount >= 1) {
            // Named sub-series (single or multi-file): description is stored as "§Label§Exx · Title".
            // episodes.json uses bare Exx keys (E01, E02, ...).
            count += scanEpisodes(subDir, seriesTitle, year, poster, category, stableSeasonHash(entry.name), loadEpisodeMap(subDir), entry.name, keepPosterOnNull)
          } else {
            // No video files directly in folder — recurse without a sub-series label
            count += scanEpisodes(subDir, seriesTitle, year, poster, category, season, episodeMap, undefined, keepPosterOnNull)
          }
        }
      }
      continue
    }
    if (!entry.isFile() || !VIDEO_EXTS.has(extname(entry.name).toLowerCase())) continue
    // Smart-scan short-circuit only applies to files we already know about.
    // Unknown files (e.g. renamed via Windows, which doesn't bump parent dir
    // mtime) must fall through to full processing or they'd never get indexed.
    const epPathEarly = join(dir, entry.name)
    if (!dirChanged && _storedTimes.has(epPathEarly)) { _foundPaths.add(epPathEarly); count++; continue }

    let episodeInfo: string
    if (subSeriesLabel) {
      // Sub-series: strip synthetic season, produce "§Label§Exx · Title"
      const raw = parseEpisodeInfo(entry.name, season) ?? titleFromFilename(entry.name)
      const bare = raw.replace(/^S\d+E(\d+)(?:\s*·\s*.+)?$/, 'E$1')
      const eKey = bare.match(/^(E\d+)$/i)
      // Prefer episodes.json title; fall back to inline title parsed from filename
      const mappedTitle = eKey ? episodeMap?.[eKey[1]] : undefined
      const inlineTitle = raw.match(/^S\d+E\d+\s*·\s*(.+)$/)?.[1]
      const titleSuffix = mappedTitle ?? inlineTitle
      const title = titleSuffix ? `${bare} · ${titleSuffix}` : bare
      episodeInfo = `§${subSeriesLabel}§${title}`
    } else {
      episodeInfo = parseEpisodeInfo(entry.name, season) ?? titleFromFilename(entry.name)
      if (episodeMap) episodeInfo = applyEpisodeMap(episodeInfo, episodeMap)
    }
    const epPath = join(dir, entry.name)
    checkAndUpsert(epPath, {
      title: seriesTitle,
      year,
      category,
      filePath: epPath,
      posterPath: poster,
      keepPosterOnNull,
      description: episodeInfo
    })
    count++
  }
  return count
}

function scanExtrasFolder(dir: string, seriesTitle: string, poster: string | null, prefix?: string, seasonContext?: string, keepPosterOnNull = false): void {
  if (!existsSync(dir)) return
  const entries = readdirSync(dir, { withFileTypes: true })

  // Pre-pass: detect duplicate titles so we can disambiguate them with an index.
  // Without this, three "NCED.mkv" files all collapse to "Non-Credit Ending"
  // (Mob Psycho 100 / Yuru Camp grouping bugs).
  const titleCounts = new Map<string, number>()
  const fileTitles = new Map<string, string>()
  for (const entry of entries) {
    if (!entry.isFile() || !VIDEO_EXTS.has(extname(entry.name).toLowerCase())) continue
    const rawTitle = titleFromExtrasFilename(entry.name)
    const withContext = (seasonContext && NEEDS_CONTEXT_RE.test(rawTitle))
      ? `${seasonContext} ${rawTitle}`
      : rawTitle
    const title = prefix ? `${prefix} - ${withContext}` : withContext
    fileTitles.set(entry.name, title)
    titleCounts.set(title, (titleCounts.get(title) ?? 0) + 1)
  }
  const dupSeen = new Map<string, number>()

  for (const entry of entries) {
    if (entry.isDirectory()) {
      scanExtrasFolder(join(dir, entry.name), seriesTitle, poster, entry.name, seasonContext, keepPosterOnNull)
      continue
    }
    if (!entry.isFile() || !VIDEO_EXTS.has(extname(entry.name).toLowerCase())) continue
    let title = fileTitles.get(entry.name)!
    if ((titleCounts.get(title) ?? 0) > 1) {
      const n = (dupSeen.get(title) ?? 0) + 1
      dupSeen.set(title, n)
      title = `${title} ${String(n).padStart(2, '0')}`
    }
    const extraPath = join(dir, entry.name)
    checkAndUpsert(extraPath, {
      title,
      category: 'extras',
      filePath: extraPath,
      posterPath: poster,
      keepPosterOnNull,
      genre: seriesTitle
    })
  }
}

// ─── Music ─────────────────────────────────────────────────────────────────

function scanMusic(rootDir: string, ffprobePath = ''): number {
  if (!existsSync(rootDir)) { preserveStoredPaths(rootDir); return 0 }
  let count = 0
  // Each top-level folder is an album or playlist
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const albumDir = join(rootDir, entry.name)
    if (!isDirChanged(albumDir)) { preserveStoredPaths(albumDir); count++; continue }
    let audioFiles: string[] = []
    try { audioFiles = readdirSync(albumDir).filter((f) => AUDIO_EXTS.has(extname(f).toLowerCase())).sort() }
    catch { preserveStoredPaths(albumDir); continue }
    if (audioFiles.length === 0) { preserveStoredPaths(albumDir); continue }
    _musicTrackCount += audioFiles.length

    // Probe and cache full audio metadata during scan so album opens are instant
    if (ffprobePath) {
      const albumJsonPath = join(albumDir, 'album.json')
      const albumData = tryReadJson(albumJsonPath)
      const rawCache = (albumData.durations ?? {}) as Record<string, number | { duration: number; probed?: boolean }>
      // Normalise legacy number entries
      const cache: Record<string, { duration: number; title?: string; artist?: string; probed?: boolean }> = {}
      for (const [k, v] of Object.entries(rawCache)) {
        cache[k] = typeof v === 'number' ? { duration: v } : v
      }
      let updated = false
      for (const f of audioFiles) {
        if (cache[f]?.probed) continue  // already fully cached
        const meta = probeAudioFileSync(join(albumDir, f), ffprobePath)
        cache[f] = { ...meta, probed: true }
        updated = true
      }
      if (updated) {
        try { writeFileSync(albumJsonPath, JSON.stringify({ ...albumData, durations: cache })) } catch { /* non-fatal */ }
      }
    }

    const firstTrack = audioFiles[0]
    const trackPath = join(albumDir, firstTrack)
    const albumMeta = tryReadJson(join(albumDir, 'album.json'))
    const albumPoster = findPosterStrict(albumDir)
    checkAndUpsert(trackPath, {
      title: entry.name.replace(/\s*\(\d{4}\)$/, '').trim(),
      year: yearFromFilename(entry.name),
      category: 'music',
      filePath: trackPath,
      posterPath: albumPoster.path,
      keepPosterOnNull: !albumPoster.readable,
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
  if (!existsSync(rootDir)) { preserveStoredPaths(rootDir); return 0 }
  let count = 0

  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const bookDir = join(rootDir, entry.name)
    if (!isDirChanged(bookDir)) { preserveStoredPaths(bookDir); count++; continue }

    // Parse "Title - Author" from folder name
    const dashIdx = entry.name.indexOf(' - ')
    const title   = dashIdx >= 0 ? entry.name.slice(0, dashIdx).trim() : entry.name
    const author  = dashIdx >= 0 ? entry.name.slice(dashIdx + 3).trim() : null

    // Find the first book file inside the folder
    let bookFile: string | null = null
    try {
      bookFile = readdirSync(bookDir).find(f => BOOK_EXTS.has(extname(f).toLowerCase())) ?? null
    } catch { preserveStoredPaths(bookDir); continue }
    if (!bookFile) { preserveStoredPaths(bookDir); continue }

    const filePath = join(bookDir, bookFile)
    const posterRes = findPosterStrict(bookDir)

    checkAndUpsert(filePath, {
      title,
      category: 'books',
      filePath,
      posterPath: posterRes.path,
      keepPosterOnNull: !posterRes.readable,
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

function scanManga(rootDir: string, category: 'manga' | 'comics' = 'manga'): number {
  if (!existsSync(rootDir)) { preserveStoredPaths(rootDir); return 0 }
  let count = 0
  for (const series of readdirSync(rootDir, { withFileTypes: true })) {
    if (!series.isDirectory()) continue
    const seriesDir = join(rootDir, series.name)
    if (!isDirChanged(seriesDir)) { preserveStoredPaths(seriesDir); count++; continue }
    let files: string[] = []
    try { files = readdirSync(seriesDir).filter(f => MANGA_EXTS.has(extname(f).toLowerCase())).sort() }
    catch { preserveStoredPaths(seriesDir); continue }
    if (!files.length) { preserveStoredPaths(seriesDir); continue }
    _mangaSeriesCount++
    const posterRes = findPosterStrict(seriesDir)
    for (const file of files) {
      const filePath = join(seriesDir, file)
      // Single file in folder → use folder name as title; multiple → use filename
      const title = files.length === 1 ? series.name : cleanMangaTitle(basename(file, extname(file)))
      checkAndUpsert(filePath, {
        title,
        category,
        filePath,
        posterPath: posterRes.path,
        keepPosterOnNull: !posterRes.readable
      })
      count++
    }
  }
  return count
}

// ─── PC Games ──────────────────────────────────────────────────────────────

function scanPcGames(rootDir: string): number {
  // Indexed on every OS, Windows or not. This shelf used to be skipped outright
  // on non-Windows hosts (rows merely preserved), which made the library's
  // contents depend on which machine last scanned it: once the rows were gone,
  // a Mac scan could never recreate them, and the shelf stayed empty until the
  // drive next saw Windows. Cataloguing is not launching — findExe picks the
  // same .exe on every host so the row is byte-identical after a reroot, and
  // launchGame is what refuses to run a Windows binary on macOS.
  if (!existsSync(rootDir)) { preserveStoredPaths(rootDir); return 0 }
  let count = 0
  const hidden = listHiddenDirs(rootDir)
  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.') || hidden.has(entry.name)) continue
    const gameDir = join(rootDir, entry.name)
    if (!isDirChanged(gameDir)) { preserveStoredPaths(gameDir); count++; continue }
    const meta = tryReadJson(join(gameDir, 'game.json'))
    const execName = (meta.executable as string) ?? findExe(gameDir)
    if (!execName) { preserveStoredPaths(gameDir); continue }
    const exePath = join(gameDir, execName)
    const posterRes = findPosterStrict(gameDir)
    checkAndUpsert(exePath, {
      title: (meta.title as string) ?? entry.name,
      year: (meta.year as number) ?? null,
      category: 'games',
      filePath: exePath,
      posterPath: posterRes.path,
      keepPosterOnNull: !posterRes.readable,
      description: (meta.description as string) ?? null,
      genre: Array.isArray(meta.genre) ? (meta.genre as string[]).join(', ') : null,
      platform: 'pc',
      executable: execName
    })
    // The exe is one file in a much larger directory — accumulate the rest of the dir
    // so the stats page reflects the actual on-disk footprint (game data, saves, etc).
    const exeSize = statSync(exePath).size
    const dirSize = walkDirBytes(gameDir)
    _categoryBytes.set('games', (_categoryBytes.get('games') ?? 0) + (dirSize - exeSize))
    count++
  }
  return count
}

function walkDirBytes(dir: string): number {
  let total = 0
  let entries: import('fs').Dirent[]
  try { entries = readdirSync(dir, { withFileTypes: true }) } catch { return 0 }
  for (const e of entries) {
    const p = join(dir, e.name)
    try {
      if (e.isDirectory()) total += walkDirBytes(p)
      else if (e.isFile()) total += statSync(p).size
    } catch { /* permission denied / broken link — skip */ }
  }
  return total
}

// Filenames that are .exe files but should NEVER be picked as the game launcher.
const NON_GAME_EXE_RE = /^(unins\d*|uninstall|setup|installer|redist|vcredist|dxsetup|directx|crashreport|launcher_settings)/i

function findExe(dir: string): string | null {
  const entries = readdirSync(dir).filter((f) => !isOsMetadata(f))

  // The .exe wins on every host, not just Windows. games/pc holds Windows
  // games; resolving to a host-specific binary instead (the inner Mach-O of a
  // .app on macOS) would give one game two different file_paths depending on
  // where it was scanned, and every drive swap would orphan-delete the shelf
  // and reinsert it under the other name.
  const exes = entries.filter((f) => extname(f).toLowerCase() === '.exe')
  const exe = exes.find((f) => !NON_GAME_EXE_RE.test(f)) ?? exes[0]
  if (exe) return exe

  if (process.platform === 'win32') return null

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
  if (!existsSync(rootDir)) { preserveStoredPaths(rootDir); return 0 }
  let count = 0
  for (const platformFolder of readdirSync(rootDir, { withFileTypes: true })) {
    if (!platformFolder.isDirectory()) continue
    const platform = ROM_PLATFORM[platformFolder.name.toLowerCase()]
    if (!platform) continue
    const platformDir = join(rootDir, platformFolder.name)
    if (platform === 'mame') {
      for (const entry of readdirSync(platformDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue
        const gameDir = join(platformDir, entry.name)
        if (!isDirChanged(gameDir)) { preserveStoredPaths(gameDir); count++; continue }
        const zips = readdirSync(gameDir).filter((f) => !isOsMetadata(f) && extname(f).toLowerCase() === '.zip')
        // Safety net: if the dir is dirty but we couldn't find a ROM this pass
        // (transient FS hiccup, macOS metadata shuffling readdir order, missing
        // extension in ROM_EXTS after an external tool touched things), keep
        // the previously-indexed rows so `deleteOrphanedEntries` doesn't wipe
        // real games. Force Rescan is still available to correct real changes.
        if (!zips.length) { preserveStoredPaths(gameDir); continue }
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
        const posterRes = findPosterStrict(gameDir)
        checkAndUpsert(romPath, {
          title: entry.name,
          category: 'games',
          filePath: romPath,
          posterPath: posterRes.path,
          keepPosterOnNull: !posterRes.readable,
          platform
        })
        count++
      }
    } else {
      for (const entry of readdirSync(platformDir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
          const gameDir = join(platformDir, entry.name)
          if (!isDirChanged(gameDir)) { preserveStoredPaths(gameDir); count++; continue }
          const rom = readdirSync(gameDir).find((f) => !isOsMetadata(f) && ROM_EXTS.has(extname(f).toLowerCase()))
          // Same safety net as MAME above — don't let a transient miss drop
          // real ROM entries from the DB.
          if (!rom) { preserveStoredPaths(gameDir); continue }
          const romPath = join(gameDir, rom)
          const posterRes = findPosterStrict(gameDir)
          checkAndUpsert(romPath, {
            title: entry.name,
            category: 'games',
            filePath: romPath,
            posterPath: posterRes.path,
            keepPosterOnNull: !posterRes.readable,
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

// ─── YouTube videos ──────────────────────────────────────────────────────────

function scanYouTube(rootDir: string, ffprobePath = ''): number {
  if (!existsSync(rootDir)) { preserveStoredPaths(rootDir); return 0 }
  let count = 0

  function scanVideoFile(filePath: string, playlist: string | null): void {
    const base = basename(filePath, extname(filePath))
    const dir = dirname(filePath)
    const sidecarPoster = ['jpg', 'png', 'jpeg', 'webp']
      .map((e) => join(dir, `${base}.${e}`))
      .find(existsSync) ?? null
    checkAndUpsert(filePath, {
      title: base,
      category: 'youtube',
      filePath,
      posterPath: sidecarPoster,
      genre: playlist
    })
    // Probe for duration (used by YouTube card overlay). Runs only on first scan; subsequent scans skip.
    if (ffprobePath && needsTechInfo(filePath)) {
      const info = probeFile(filePath, ffprobePath)
      if (info) updateTechInfo(filePath, info)
    }
    count++
  }

  for (const entry of readdirSync(rootDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const playlistDir = join(rootDir, entry.name)
      if (!isDirChanged(playlistDir)) { preserveStoredPaths(playlistDir); continue }
      // Wrap the inner readdir so a transient EPERM/EIO on one playlist doesn't
      // throw out of scanYouTube (which would abort the whole scanLibrary run
      // and skip every category that runs after this one). Preserve the
      // playlist's stored rows in that case.
      try {
        for (const file of readdirSync(playlistDir, { withFileTypes: true })) {
          if (file.isFile() && VIDEO_EXTS.has(extname(file.name).toLowerCase())) {
            scanVideoFile(join(playlistDir, file.name), entry.name)
          }
        }
      } catch { preserveStoredPaths(playlistDir) }
    } else if (entry.isFile() && VIDEO_EXTS.has(extname(entry.name).toLowerCase())) {
      scanVideoFile(join(rootDir, entry.name), null)
    }
  }
  return count
}

// ─── Main entry ─────────────────────────────────────────────────────────────

export function scanLibrary(root: string, ffprobePath = '', smart = false, force = false): { total: number; updated: number } {
  const m = (sub: string) => join(root, 'media', sub)
  const g = (sub: string) => join(root, 'games', sub)

  // Initialize incremental scan session
  _storedTimes      = getStoredFileTimes()
  _storedDirTimes   = smart ? getStoredDirTimes() : new Map()
  _dirtyDirs        = new Set()
  // Build per-dir basename set so isDirChanged can detect renames on
  // filesystems that don't bump parent dir mtime on rename (NTFS/exFAT).
  _storedDirFiles   = new Map()
  if (smart) {
    for (const fp of _storedTimes.keys()) {
      const d = dirname(fp)
      let set = _storedDirFiles.get(d)
      if (!set) { set = new Set(); _storedDirFiles.set(d, set) }
      set.add(basename(fp))
    }
  }
  _smartMode        = smart
  _forceRescan      = force
  _foundPaths       = new Set<string>()
  _updatedCount     = 0
  _categoryBytes    = new Map<string, number>()
  _extrasBytesByParent = new Map<string, number>()
  _musicTrackCount  = 0
  _mangaSeriesCount = 0

  let total = 0
  total += scanMovies(m('movies'), ffprobePath)
  total += scanEpisodeCategory(m('tv'), 'tv')
  total += scanEpisodeCategory(m('anime'), 'anime')
  total += scanYouTube(m('youtube'), ffprobePath)
  total += scanMusic(m('music'), ffprobePath)
  total += scanBooks(m('books'))
  total += scanManga(m('manga'), 'manga')
  total += scanManga(m('comics'), 'comics')
  total += scanPcGames(g('pc'))
  total += scanRoms(g('roms'))

  // Carry last_opened_at / tech_info from renamed-or-moved files (matched by
  // basename + mtime) to their new path before orphan cleanup wipes them.
  const relocated = migrateRenamedPaths(_foundPaths, new Set(_storedTimes.keys()))
  // Remove DB entries for files that no longer exist on disk, plus the rows
  // migrateRenamedPaths positively re-identified under a new path.
  deleteOrphanedEntries(_foundPaths, relocated)

  const updated = _updatedCount

  // Persist directory mtimes. Both scan modes now rebuild the cache: a smart
  // scan updates the map it loaded, a full scan builds one from scratch (it
  // starts empty and isDirChanged fills it per directory walked). Directories
  // that weren't reached this run — missing category root, unreadable dir —
  // simply drop out of the cache and read as unknown next time, which makes
  // the next scan re-walk them.
  setStoredDirTimes(_storedDirTimes)

  // Persist storage stats only during full scan (smart scan skips directories → incomplete bytes)
  if (!_smartMode) {
    const storageTotal = [..._categoryBytes.values()].reduce((a, b) => a + b, 0)
    setConfig('storageStats', JSON.stringify({
      total: storageTotal,
      byCategory: Object.fromEntries(_categoryBytes),
      musicTrackCount: _musicTrackCount,
      mangaSeriesCount: _mangaSeriesCount,
      extrasBytesByParent: Object.fromEntries(_extrasBytesByParent),
      computedAt: Date.now()
    }))
  }

  // Clear session state
  _storedTimes      = new Map()
  _storedDirTimes   = new Map()
  _storedDirFiles   = new Map()
  _smartMode        = false
  _forceRescan      = false
  _foundPaths       = new Set()
  _updatedCount     = 0
  _categoryBytes    = new Map()
  _extrasBytesByParent = new Map()
  _musicTrackCount  = 0
  _mangaSeriesCount = 0

  return { total, updated }
}
