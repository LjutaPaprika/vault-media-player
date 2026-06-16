import { app, ipcMain, BrowserWindow, shell, protocol, session } from 'electron'
import { readFileSync, existsSync, statSync, readdirSync, writeFileSync, mkdirSync, appendFileSync, unlinkSync } from 'fs'
import type { Cookie } from 'electron'
import { extname, dirname, join, basename } from 'path'
import { spawn, spawnSync } from 'child_process'
import { cpus, totalmem, tmpdir } from 'os'
import AdmZip from 'adm-zip'

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.wav', '.opus', '.wma'])

// In-memory CBZ state — populated by manga:openCbz, served by the cbz:// protocol
const IMAGE_RE = /\.(jpe?g|png|webp|gif|bmp)$/i
let cbzEntries: AdmZip.IZipEntry[] | null = null
import { getConfig, setConfig, getItems, getItem, getExtras, clearStoredFileTimes, clearStoredDirTimes, getTechInfo, getDurationsForCategory, setLastOpened, setWatched, setGenre, getStats, getDbPath, rerootPaths, getFavourites, setFavourite } from './database'
import { getEpubInfo, readEpubChapter } from './epubReader'
import { scanLibrary, findPoster } from './scanner'
import { openVideo, openAudio, launchGame, getToolPath, openWithSystem } from './launcher'
import { findDriveByLabel, hideSystemFolders, runSync, getDriveStats } from './sync'
import { runTransfer, checkConflicts, type TransferRequest, type Side as TransferSide } from './storageTransfer'
import { getBindings, setBindings, resetBindings, type ControllerBinding } from './controllerBindings'
import { getKeyboardBindings, setKeyboardBindings, resetKeyboardBindings, type KeyboardBinding } from './keyboardBindings'

const YT_SUFFIX_RE = /\s*[\[(](audio|official\s*audio|official\s*video|official\s*music\s*video|music\s*video|lyric\s*video?|lyrics|official|hd|hq)[\])]$/i

/** Async, non-blocking ffprobe — reads duration + ID3 tags from a file. */
function probeAudioMeta(filePath: string, ffprobePath: string): Promise<{ duration: number; title?: string; artist?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(ffprobePath, [
      '-v', 'quiet', '-print_format', 'json',
      '-show_entries', 'format_tags=title,artist:format=duration',
      filePath
    ], { windowsHide: true })
    let stdout = ''
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.on('close', (code) => {
      if (code !== 0 || !stdout) { resolve({ duration: 0 }); return }
      try {
        const data = JSON.parse(stdout) as { format?: { duration?: string; tags?: { title?: string; artist?: string } } }
        resolve({
          duration: parseFloat(data.format?.duration ?? '0') || 0,
          title:  data.format?.tags?.title,
          artist: data.format?.tags?.artist
        })
      } catch { resolve({ duration: 0 }) }
    })
    proc.on('error', () => resolve({ duration: 0 }))
  })
}

/** Async, non-blocking ffprobe — reads only the duration from a file's format metadata. */

/** Cached drive root — findDriveByLabel runs execSync in a loop, so we only do it once per session. */
let cachedLibraryRoot: string | null = null

/**
 * Append a timestamped line to <driveRoot>/app/logs/yt-dlp.log so YouTube download
 * failures are inspectable in a packaged build (console output goes nowhere there).
 */
function logYtDlp(driveRoot: string, scope: string, message: string): void {
  try {
    const logDir = join(driveRoot, 'app', 'logs')
    if (!existsSync(logDir)) mkdirSync(logDir, { recursive: true })
    const line = `[${new Date().toISOString()}] [${scope}] ${message}\n`
    appendFileSync(join(logDir, 'yt-dlp.log'), line, 'utf-8')
  } catch {
    /* logging is best-effort — never break a download because the log file is unwritable */
  }
}

// ─── YouTube cookies (for age-gated / bot-checked videos) ────────────────────

function getCookiesPath(driveRoot: string): string {
  return join(driveRoot, 'app', 'yt-cookies.txt')
}

// Cookies whose presence + expiration genuinely gate YouTube auth. Used to pick
// which expiration is meaningful — LOGIN_INFO often shows decades-out timestamps,
// the SID-family cookies are the real authority on session lifetime.
const AUTH_COOKIE_NAMES = new Set([
  'SID', 'HSID', 'SSID', 'APISID', 'SAPISID',
  '__Secure-1PSID', '__Secure-3PSID',
  '__Secure-1PAPISID', '__Secure-3PAPISID',
  'LOGIN_INFO'
])

interface CookieStatus {
  exists: boolean
  path: string
  expiresAt: number | null    // unix seconds — earliest auth cookie expiry
  daysRemaining: number | null
  refreshedAt: number | null  // unix seconds — file mtime
}

function readCookieStatus(driveRoot: string): CookieStatus {
  const path = getCookiesPath(driveRoot)
  if (!existsSync(path)) {
    return { exists: false, path, expiresAt: null, daysRemaining: null, refreshedAt: null }
  }
  const refreshedAt = Math.floor(statSync(path).mtimeMs / 1000)
  let earliest: number | null = null
  try {
    const lines = readFileSync(path, 'utf-8').split('\n')
    for (const raw of lines) {
      const line = raw.trim()
      if (!line || line.startsWith('#')) continue
      const fields = line.split('\t')
      if (fields.length < 7) continue
      const [, , , , expirationStr, name] = fields
      const expiration = parseInt(expirationStr, 10)
      if (!Number.isFinite(expiration) || expiration <= 0) continue
      if (!AUTH_COOKIE_NAMES.has(name)) continue
      if (earliest === null || expiration < earliest) earliest = expiration
    }
  } catch {
    /* corrupt cookies file — treat as no expiration data */
  }
  const daysRemaining = earliest === null
    ? null
    : Math.floor((earliest - Date.now() / 1000) / 86400)
  return { exists: true, path, expiresAt: earliest, daysRemaining, refreshedAt }
}

function writeCookiesFile(driveRoot: string, cookies: Cookie[]): void {
  const path = getCookiesPath(driveRoot)
  const dir = dirname(path)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  // Netscape cookies.txt format. yt-dlp reads this format directly.
  // Fields: domain \t includeSubdomains \t path \t secure \t expiration \t name \t value
  const header = [
    '# Netscape HTTP Cookie File',
    '# Generated by Vault — refresh from Settings → YouTube Cookies',
    ''
  ].join('\n')

  const lines = cookies.map((c) => {
    // hostOnly=true means "exact host match" — Netscape encodes this as no leading dot
    // and includeSubdomains=FALSE. Otherwise we add a leading dot if missing.
    const includeSubdomains = !c.hostOnly
    let domain = c.domain ?? ''
    if (includeSubdomains && !domain.startsWith('.')) domain = '.' + domain
    if (!includeSubdomains && domain.startsWith('.')) domain = domain.slice(1)
    const expiration = c.expirationDate ? Math.floor(c.expirationDate) : 0
    return [
      domain,
      includeSubdomains ? 'TRUE' : 'FALSE',
      c.path ?? '/',
      c.secure ? 'TRUE' : 'FALSE',
      expiration.toString(),
      c.name,
      c.value
    ].join('\t')
  })

  writeFileSync(path, header + lines.join('\n') + '\n', 'utf-8')
}

/** Classify a yt-dlp stderr blob into a user-friendly error kind. */
function classifyYtDlpError(stderr: string): 'age-restricted' | 'bot-check' | 'unavailable' | 'other' {
  const s = stderr.toLowerCase()
  if (s.includes('confirm your age') || s.includes('age-restricted')) return 'age-restricted'
  if (s.includes("confirm you're not a bot") || s.includes('confirm you are not a bot')) return 'bot-check'
  if (s.includes('video unavailable') || s.includes('private video') || s.includes('removed')) return 'unavailable'
  return 'other'
}

export function registerIpcHandlers(win: BrowserWindow): void {
  // ─── Window controls ──────────────────────────────────────────────────────
  ipcMain.handle('window:minimize', () => win.minimize())
  ipcMain.handle('window:maximize', () => {
    if (win.isMaximized()) win.unmaximize()
    else win.maximize()
  })
  ipcMain.handle('window:close', () => win.close())

  // ─── Library config ───────────────────────────────────────────────────────
  // Returns the saved label AND resolves it to a path (or null if drive not found)
  ipcMain.handle('library:getConfig', () => {
    const label = getConfig('libraryLabel')
    const resolvedPath = label ? findDriveByLabel(label) : null
    // If the drive's mount point changed since last run (different PC, different
    // letter, or Windows↔Mac swap), reroot stored paths now so posters resolve
    // without requiring a manual scan.
    if (resolvedPath) {
      const storedRoot = getConfig('driveRoot')
      if (storedRoot && storedRoot !== resolvedPath) rerootPaths(storedRoot, resolvedPath)
      setConfig('driveRoot', resolvedPath)
    }
    return { label, resolvedPath }
  })

  ipcMain.handle('library:setLabel', (_event, label: string) => {
    setConfig('libraryLabel', label)
    cachedLibraryRoot = null  // invalidate so next call re-resolves the new drive
  })

  ipcMain.handle('library:findDrive', (_event, label: string) => findDriveByLabel(label))

  // ─── Library scan ─────────────────────────────────────────────────────────
  function resolveRootForScan(label: string): string {
    const root = findDriveByLabel(label)
    if (!root) throw new Error(`Library drive "${label}" not found. Is it plugged in?`)
    const storedRoot = getConfig('driveRoot')
    if (storedRoot && storedRoot !== root) rerootPaths(storedRoot, root)
    setConfig('driveRoot', root)
    return root
  }

  ipcMain.handle('library:scan', () => {
    const label = getConfig('libraryLabel')
    if (!label) throw new Error('Library drive label is not configured.')
    const root = resolveRootForScan(label)
    hideSystemFolders(root)
    const { updated } = scanLibrary(root, getToolPath(root, 'ffprobe'), true)
    return { count: updated }
  })

  ipcMain.handle('library:forceScan', () => {
    const label = getConfig('libraryLabel')
    if (!label) throw new Error('Library drive label is not configured.')
    const root = resolveRootForScan(label)
    hideSystemFolders(root)
    clearStoredFileTimes()
    clearStoredDirTimes()
    const { total } = scanLibrary(root, getToolPath(root, 'ffprobe'))
    return { count: total }
  })

  // ─── Library queries ──────────────────────────────────────────────────────
  ipcMain.handle('library:getAlbumTracks', async (_event, firstTrackPath: string) => {
    const dir = dirname(firstTrackPath)
    if (!existsSync(dir)) return []

    const allFiles = readdirSync(dir)
    const audioFiles = allFiles.filter((f) => AUDIO_EXTS.has(extname(f).toLowerCase())).sort()

    // Find album art to attach to each track (enables per-track cover in multi-album shuffle)
    const artPath = findPoster(dir)

    // Metadata cache — stored inside album.json under a "durations" key
    // Format evolved from Record<string, number> → Record<string, { duration, title?, artist?, probed? }>
    const albumJsonPath = join(dir, 'album.json')
    let albumData: Record<string, unknown> = {}
    try { albumData = JSON.parse(readFileSync(albumJsonPath, 'utf8')) } catch { /* no file yet */ }
    const rawCache = (albumData.durations ?? {}) as Record<string, number | { duration: number; title?: string; artist?: string; probed?: boolean }>
    type TrackMeta = { duration: number; title?: string; artist?: string; probed?: boolean }
    const cache: Record<string, TrackMeta> = {}
    for (const [k, v] of Object.entries(rawCache)) {
      cache[k] = typeof v === 'number' ? { duration: v } : v
    }

    // Resolve ffprobe path once if any tracks need probing
    const needsProbe = audioFiles.some((f) => !cache[f]?.probed)
    const ffprobePath = needsProbe ? getToolPath(resolveLibraryRoot(), 'ffprobe') : ''

    // Probe all uncached tracks in parallel
    const entries = await Promise.all(audioFiles.map(async (f) => {
      let entry = cache[f]
      if (!entry?.probed) {
        const meta = await probeAudioMeta(join(dir, f), ffprobePath)
        entry = { ...meta, probed: true }
        cache[f] = entry
      }
      return { f, entry }
    }))

    const cacheUpdated = needsProbe

    const tracks = entries.map(({ f, entry }) => {
      const fullPath = join(dir, f)
      const base = basename(f, extname(f))
      const trackMatch = base.match(/^(\d+)[.\s\-]+(.+)$/)
      const trackNumber = trackMatch ? parseInt(trackMatch[1], 10) : 0

      // Parse filename — convention: "NN - Title - Artist.mp3"
      const rawFilename = trackMatch ? trackMatch[2].trim() : base
      const stripped = rawFilename.replace(/^\d+[\.\s]+/, '').trim() || rawFilename
      const firstDash = stripped.indexOf(' - ')
      const fileTitle  = firstDash >= 0 ? stripped.slice(0, firstDash).trim() : stripped
      const fileArtist = firstDash >= 0 ? stripped.slice(firstDash + 3).trim() || undefined : undefined

      const idTitle  = entry.title  ? entry.title.replace(YT_SUFFIX_RE, '').trim()  : ''
      const idArtist = entry.artist ? entry.artist.replace(YT_SUFFIX_RE, '').trim() : ''

      // Some YouTube Music playlists embed the track title as the ID3 artist and the album
      // name as the ID3 title — detectable when the artist field starts with an ordinal like "1. "
      const metaInverted = !!idArtist && /^\d+[\.\s]/.test(idArtist)

      let title: string
      let artist: string | undefined
      if (metaInverted) {
        title  = fileTitle
        artist = fileArtist
      } else if (idTitle) {
        title  = idTitle
        artist = idArtist || undefined
      } else {
        title  = fileTitle
        artist = fileArtist
      }

      return { path: fullPath, trackNumber, title, artist, duration: entry.duration, artPath }
    })

    if (cacheUpdated) {
      try { writeFileSync(albumJsonPath, JSON.stringify({ ...albumData, durations: cache })) } catch { /* non-fatal */ }
    }

    return tracks
  })

  ipcMain.handle('library:getStats',        () => getStats())
  ipcMain.handle('library:getItems',        (_event, category: string) => getItems(category))
  ipcMain.handle('library:getItem',         (_event, id: number) => getItem(id))
  ipcMain.handle('library:getExtras',       (_event, seriesTitle: string) => getExtras(seriesTitle))
  ipcMain.handle('library:getTechInfo',     (_event, filePath: string) => getTechInfo(filePath))
  ipcMain.handle('library:getDurations',    (_event, category: string) => getDurationsForCategory(category))
  ipcMain.handle('library:getEpubInfo',     (_event, filePath: string) => getEpubInfo(filePath))
  ipcMain.handle('library:readEpubChapter', (_event, filePath: string, chapterHref: string) => readEpubChapter(filePath, chapterHref))

  // ─── Last opened tracking ─────────────────────────────────────────────────
  ipcMain.handle('library:markOpened', (_event, filePath: string) => setLastOpened(filePath))
  ipcMain.handle('library:setWatched', (_event, filePath: string, watched: boolean) => setWatched(filePath, watched))

  // ─── Genre editing (movies) ───────────────────────────────────────────────
  ipcMain.handle('library:setGenre', (_event, filePath: string, genre: string | null) => {
    setGenre(filePath, genre)
    // Persist to sidecar movie.json so genres survive a full rescan
    try {
      const movieDir = dirname(filePath)
      const sidecarPath = join(movieDir, 'movie.json')
      let sidecar: Record<string, unknown> = {}
      if (existsSync(sidecarPath)) {
        try { sidecar = JSON.parse(readFileSync(sidecarPath, 'utf-8')) } catch { /* corrupt — overwrite */ }
      }
      if (genre && genre.trim().length > 0) {
        sidecar.genre = genre.split(',').map((g) => g.trim()).filter(Boolean)
      } else {
        delete sidecar.genre
      }
      writeFileSync(sidecarPath, JSON.stringify(sidecar, null, 2), 'utf-8')
    } catch (err) {
      console.warn('[library:setGenre] sidecar write failed:', err)
    }
  })

  // ─── Favourites ───────────────────────────────────────────────────────────
  ipcMain.handle('playlist:getFavourites', () => getFavourites())
  ipcMain.handle('playlist:setFavourite', (_event, albumPath: string, isFav: boolean) => setFavourite(albumPath, isFav))

  // ─── Watch order ──────────────────────────────────────────────────────────

  function resolveSeriesDir(seriesTitle: string, category: string): string | null {
    const root = resolveLibraryRoot()
    const categoryDir = join(root, 'media', category)
    const direct = join(categoryDir, seriesTitle)
    if (existsSync(direct)) return direct
    try {
      const match = readdirSync(categoryDir, { withFileTypes: true }).find((d) => {
        if (!d.isDirectory()) return false
        const processed = d.name
          .replace(/\s*\(\d{4}\).*$/, '')
          .replace(/\s*\[.*?\]/g, '')
          .replace(/\./g, ' ')
          .trim()
        return processed === seriesTitle
      })
      return match ? join(categoryDir, match.name) : null
    } catch { return null }
  }

  ipcMain.handle('library:getWatchOrder', (_event, seriesTitle: string, category: string) => {
    const seriesDir = resolveSeriesDir(seriesTitle, category)
    if (!seriesDir) return null

    const filePath = join(seriesDir, 'watchorder.txt')
    if (!existsSync(filePath)) return null

    const sectionOrder: string[] = []
    const itemOrder: Record<string, string[]> = {}
    let currentSection: string | null = null

    const lines = readFileSync(filePath, 'utf8').split(/\r?\n/).filter((l) => l.trim())

    // Use relative indentation — whatever the minimum indent is counts as the section level
    const minIndent = lines.reduce((min, l) => Math.min(min, l.match(/^(\s*)/)?.[1].length ?? 0), Infinity)

    for (const line of lines) {
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0
      const trimmed = line.trim()
      if (indent === minIndent) {
        currentSection = trimmed
        sectionOrder.push(trimmed)
      } else if (currentSection) {
        ;(itemOrder[currentSection.toLowerCase()] ??= []).push(trimmed)
      }
    }

    return { sectionOrder, itemOrder }
  })

  ipcMain.handle('library:getWatchGuide', (_event, seriesTitle: string, category: string) => {
    const seriesDir = resolveSeriesDir(seriesTitle, category)
    if (!seriesDir) return null
    const filePath = join(seriesDir, 'watchguide.txt')
    if (!existsSync(filePath)) return null
    return readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean)
  })

  // ─── Image loading ────────────────────────────────────────────────────────
  ipcMain.handle('library:readImage', (_event, filePath: string) => {
    if (!filePath || !existsSync(filePath)) return null
    const ext = extname(filePath).toLowerCase().replace('.', '')
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    const data = readFileSync(filePath).toString('base64')
    return `data:${mime};base64,${data}`
  })

  // ─── Playback ─────────────────────────────────────────────────────────────
  function resolveLibraryRoot(): string {
    if (!cachedLibraryRoot) {
      const label = getConfig('libraryLabel')
      const resolved = label ? findDriveByLabel(label) : null
      if (!resolved) console.error('[vault] Library drive not found — falling back to cwd. Playback may fail.')
      cachedLibraryRoot = resolved ?? process.cwd()
    }
    return cachedLibraryRoot
  }

  ipcMain.handle('playback:openFile', async (_event, filePath: string) => {
    const err = await shell.openPath(filePath)
    if (err) console.error('[vault] shell.openPath failed:', err)
  })

  ipcMain.handle('playback:openVideo', (_event, filePath: string, category?: string) => {
    setLastOpened(filePath)
    openVideo(filePath, resolveLibraryRoot(), getConfig('hwdec') ?? 'off', category)
    win.webContents.send('music:pause')
  })

  ipcMain.handle('settings:get', (_event, key: string, fallback: string) => getConfig(key) ?? fallback)
  ipcMain.handle('settings:set', (_event, key: string, value: string) => { setConfig(key, value) })
  ipcMain.on('settings:set-sync', (event, key: string, value: string) => { setConfig(key, value); event.returnValue = null })
  ipcMain.handle('playback:openAudio', (_event, filePath: string) => {
    openAudio(filePath, resolveLibraryRoot())
    win.webContents.send('music:pause')
  })
  ipcMain.handle('playback:launchGame', (_event, filePath: string, platform: string) =>
    launchGame(filePath, platform, resolveLibraryRoot())
  )

  // ─── YouTube import ───────────────────────────────────────────────────────
  ipcMain.handle('library:getMusicAlbums', () => {
    const root = resolveLibraryRoot()
    const musicDir = join(root, 'media', 'music')
    const albums = existsSync(musicDir)
      ? readdirSync(musicDir, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => ({ name: d.name, path: join(musicDir, d.name) }))
          .sort((a, b) => a.name.localeCompare(b.name))
      : []
    return { musicDir, albums }
  })

  ipcMain.handle('library:downloadYouTube', async (
    _event,
    { urls, albumPath, artist }: { urls: { url: string; title: string; artist?: string }[]; albumPath: string; artist?: string }
  ) => {
    if (!existsSync(albumPath)) mkdirSync(albumPath, { recursive: true })
    if (artist) {
      const albumJsonPath = join(albumPath, 'album.json')
      let existing: Record<string, unknown> = {}
      try { existing = JSON.parse(readFileSync(albumJsonPath, 'utf8')) } catch { /* new file */ }
      writeFileSync(albumJsonPath, JSON.stringify({ ...existing, artist }))
    }

    const existing = readdirSync(albumPath).filter((f) => AUDIO_EXTS.has(extname(f).toLowerCase()))
    let nextTrack = 1
    for (const f of existing) {
      const m = basename(f, extname(f)).match(/^(\d+)/)
      if (m) nextTrack = Math.max(nextTrack, parseInt(m[1], 10) + 1)
    }

    const root = resolveLibraryRoot()
    const ytdlpPath = getToolPath(root, 'yt-dlp')
    logYtDlp(root, 'music', `start: ${urls.length} track(s), tool=${ytdlpPath}${ytdlpPath === 'yt-dlp' ? ' (PATH lookup — bundled yt-dlp.exe missing on drive!)' : ''}`)

    for (let i = 0; i < urls.length; i++) {
      const { url, title, artist: trackArtist } = urls[i]
      const trackNum = (nextTrack + i).toString().padStart(2, '0')
      const suffix = trackArtist ? ` - ${trackArtist}` : ''
      const outTemplate = join(albumPath, `${trackNum} - ${title}${suffix}.%(ext)s`)

      win.webContents.send('download:progress', { index: i, total: urls.length, url, status: 'downloading', percent: 0 })

      await new Promise<void>((resolve) => {
        const proc = spawn(ytdlpPath, [
          '-x', '--audio-format', 'mp3', '--audio-quality', '0',
          '--newline', '--no-playlist', '--no-update', '-o', outTemplate, url
        ])
        let stderrBuf = ''

        proc.stdout.on('data', (chunk: Buffer) => {
          const text = chunk.toString()
          const m = text.match(/\[download\]\s+([\d.]+)%/)
          if (m) {
            win.webContents.send('download:progress', {
              index: i, total: urls.length, url, status: 'downloading', percent: parseFloat(m[1])
            })
          }
          if (text.includes('[ExtractAudio]')) {
            win.webContents.send('download:progress', {
              index: i, total: urls.length, url, status: 'converting', percent: 100
            })
          }
        })

        proc.stderr.on('data', (chunk: Buffer) => { stderrBuf += chunk.toString() })

        proc.on('error', (err) => {
          console.error('[yt-dlp music] spawn error', url, err)
          logYtDlp(root, 'music', `spawn error for ${url}: ${String(err)}`)
          win.webContents.send('download:progress', {
            index: i, total: urls.length, url, status: 'error', percent: 0, error: String(err)
          })
          resolve()
        })

        proc.on('close', (code) => {
          if (code !== 0) {
            console.error(`[yt-dlp music] exit ${code} for ${url}\n${stderrBuf.trim()}`)
            logYtDlp(root, 'music', `exit ${code} for ${url}\n${stderrBuf.trim()}`)
          } else {
            logYtDlp(root, 'music', `ok: ${url}`)
          }
          win.webContents.send('download:progress', {
            index: i, total: urls.length, url, status: code === 0 ? 'done' : 'error', percent: 100,
            error: code === 0 ? undefined : stderrBuf.trim().split('\n').slice(-3).join(' | ')
          })
          resolve()
        })
      })
    }

    return { success: true }
  })

  ipcMain.handle('library:downloadYouTubePlaylist', async (
    _event,
    { url, albumPath, artist }: { url: string; albumPath: string; artist?: string }
  ) => {
    if (!existsSync(albumPath)) mkdirSync(albumPath, { recursive: true })
    if (artist) {
      const albumJsonPath = join(albumPath, 'album.json')
      let existing: Record<string, unknown> = {}
      try { existing = JSON.parse(readFileSync(albumJsonPath, 'utf8')) } catch { /* new file */ }
      writeFileSync(albumJsonPath, JSON.stringify({ ...existing, artist }))
    }

    const root = resolveLibraryRoot()
    const ytdlpPath = getToolPath(root, 'yt-dlp')
    const outTemplate = join(albumPath, '%(playlist_index)02d - %(title)s.%(ext)s')
    logYtDlp(root, 'playlist', `start: ${url}, tool=${ytdlpPath}${ytdlpPath === 'yt-dlp' ? ' (PATH lookup — bundled yt-dlp.exe missing on drive!)' : ''}`)

    let currentItem = -1  // -1 = no track started yet
    let totalItems = 0
    let lineBuffer = ''

    await new Promise<void>((resolve) => {
      const proc = spawn(ytdlpPath, [
        '-x', '--audio-format', 'mp3', '--audio-quality', '0',
        '--yes-playlist', '--newline', '--no-update',
        '-o', outTemplate, url
      ])
      let stderrBuf = ''
      proc.stderr.on('data', (chunk: Buffer) => { stderrBuf += chunk.toString() })

      proc.stdout.on('data', (chunk: Buffer) => {
        lineBuffer += chunk.toString()
        const lines = lineBuffer.split('\n')
        lineBuffer = lines.pop() ?? ''

        for (const text of lines) {
          // "Downloading item 3 of 12" — mark previous track done, start next
          const itemMatch = text.match(/Downloading item (\d+) of (\d+)/)
          if (itemMatch) {
            const newItem = parseInt(itemMatch[1], 10) - 1  // 0-based
            totalItems = parseInt(itemMatch[2], 10)
            // Mark the previous track as done before starting the next
            if (currentItem >= 0) {
              win.webContents.send('download:progress', {
                index: currentItem, total: totalItems, url, status: 'done', percent: 100
              })
            }
            currentItem = newItem
            win.webContents.send('download:progress', {
              index: currentItem, total: totalItems, url, status: 'downloading', percent: 0
            })
          }

          const pctMatch = text.match(/\[download\]\s+([\d.]+)%/)
          if (pctMatch && currentItem >= 0) {
            win.webContents.send('download:progress', {
              index: currentItem, total: Math.max(totalItems, 1), url, status: 'downloading', percent: parseFloat(pctMatch[1])
            })
          }

          if (text.includes('[ExtractAudio]') && currentItem >= 0) {
            win.webContents.send('download:progress', {
              index: currentItem, total: Math.max(totalItems, 1), url, status: 'converting', percent: 100
            })
          }
        }
      })

      proc.on('error', (err) => {
        console.error('[yt-dlp playlist] spawn error', url, err)
        logYtDlp(root, 'playlist', `spawn error for ${url}: ${String(err)}`)
        win.webContents.send('download:progress', {
          index: Math.max(currentItem, 0), total: Math.max(totalItems, 1), url, status: 'error', percent: 0, error: String(err)
        })
        resolve()
      })
      proc.on('close', (code) => {
        if (code !== 0) {
          console.error(`[yt-dlp playlist] exit ${code} for ${url}\n${stderrBuf.trim()}`)
          logYtDlp(root, 'playlist', `exit ${code} for ${url}\n${stderrBuf.trim()}`)
        } else {
          logYtDlp(root, 'playlist', `ok: ${url}`)
        }
        // Mark the final track done (or errored)
        if (currentItem >= 0) {
          win.webContents.send('download:progress', {
            index: currentItem, total: Math.max(totalItems, 1), url,
            status: code === 0 ? 'done' : 'error', percent: 100,
            error: code === 0 ? undefined : stderrBuf.trim().split('\n').slice(-3).join(' | ')
          })
        }
        resolve()
      })
    })

    return { success: true }
  })

  // ─── Controller bindings ──────────────────────────────────────────────────
  ipcMain.handle('controller:getBindings', () => getBindings())
  ipcMain.handle('controller:setBindings', (_event, bindings: ControllerBinding[]) => setBindings(bindings))
  ipcMain.handle('controller:resetBindings', () => resetBindings())

  // ─── Keyboard bindings ────────────────────────────────────────────────────
  ipcMain.handle('keyboard:getBindings', () => getKeyboardBindings())
  ipcMain.handle('keyboard:setBindings', (_event, bindings: KeyboardBinding[]) => setKeyboardBindings(bindings))
  ipcMain.handle('keyboard:resetBindings', () => resetKeyboardBindings())

  // ─── System info ─────────────────────────────────────────────────────────
  // Cached after first call — hardware doesn't change during a session
  let cachedSystemInfo: { platform: string; ramGB: number; cpuModel: string; cpuCores: number; gpus: { name: string; vramMB: number; dedicated: boolean }[] } | null = null

  ipcMain.handle('system:getInfo', async () => {
    if (cachedSystemInfo) return cachedSystemInfo

    const ramGB    = Math.round(totalmem() / (1024 ** 3))
    const cpuList  = cpus()
    const cpuModel = cpuList[0]?.model?.trim().replace(/\s+/g, ' ') ?? 'Unknown'
    const cpuCores = cpuList.length

    let gpus: { name: string; vramMB: number; dedicated: boolean }[] = []

    if (process.platform === 'win32') {
      try {
        const stdout = await new Promise<string>((resolve) => {
          let out = ''
          const ps = spawn('powershell', [
            '-NoProfile', '-Command',
            'Get-WmiObject -Class Win32_VideoController | Select-Object Name,AdapterRAM | ConvertTo-Json -Compress'
          ])
          ps.stdout.on('data', (d: Buffer) => { out += d.toString() })
          ps.on('close', () => resolve(out.trim()))
          ps.on('error', () => resolve(''))
          setTimeout(() => { ps.kill(); resolve('') }, 6000)
        })
        if (stdout) {
          const raw = JSON.parse(stdout)
          const arr: { Name: string; AdapterRAM: number }[] = Array.isArray(raw) ? raw : [raw]
          gpus = arr.map((g) => {
            const name    = g.Name ?? ''
            const vramMB  = Math.round((g.AdapterRAM ?? 0) / (1024 ** 2))
            const dedicated = vramMB > 1024 && /nvidia|geforce|quadro|radeon\s+rx|radeon\s+pro|radeon\s+vega|intel\s+arc/i.test(name)
            return { name, vramMB, dedicated }
          })
        }
      } catch { /* non-fatal */ }
    }

    cachedSystemInfo = { platform: process.platform as string, ramGB, cpuModel, cpuCores, gpus }
    return cachedSystemInfo
  })

  ipcMain.handle('system:getAppInfo', async () => {
    const root = resolveLibraryRoot()

    const version = app.getVersion()

    const runtime = {
      electron: process.versions.electron ?? 'unknown',
      node:     process.versions.node     ?? 'unknown',
      chrome:   process.versions.chrome   ?? 'unknown'
    }

    const memoryMB = Math.round(process.memoryUsage().rss / (1024 * 1024))

    let dbSize = 0
    try { dbSize = statSync(getDbPath()).size } catch { /* db not created yet */ }

    const ffprobePath = getToolPath(root, 'ffprobe')
    const ytdlpPath   = getToolPath(root, 'yt-dlp')
    const tools = {
      ffprobe: existsSync(ffprobePath),
      ytdlp:   existsSync(ytdlpPath)
    }

    const stats = await getDriveStats(root)
    const driveInfo = stats ? { freeBytes: stats.freeBytes, totalBytes: stats.totalBytes } : null

    return { version, runtime, memoryMB, dbSize, tools, driveInfo }
  })

  // ─── Sync ─────────────────────────────────────────────────────────────────
  ipcMain.handle('sync:getBackupLabel', () => getConfig('backupLabel'))
  ipcMain.handle('sync:setBackupLabel', (_event, label: string) => setConfig('backupLabel', label))
  ipcMain.handle('sync:findDrive', (_event, label: string) => findDriveByLabel(label))
  ipcMain.handle('sync:start', () => {
    const libraryLabel = getConfig('libraryLabel')
    const backupLabel  = getConfig('backupLabel')
    if (!libraryLabel) throw new Error('Library drive label is not configured.')
    if (!backupLabel)  throw new Error('Backup drive label is not configured.')
    const sourceRoot = findDriveByLabel(libraryLabel)
    if (!sourceRoot) throw new Error(`Library drive "${libraryLabel}" not found. Is it plugged in?`)
    const destRoot = findDriveByLabel(backupLabel)
    if (!destRoot) throw new Error(`Backup drive "${backupLabel}" not found. Is it plugged in?`)
    runSync(sourceRoot, destRoot, win)
  })

  // ─── Storage (cold-store sync) ────────────────────────────────────────────

  // Folder-size cache for the Storage page. Persists for the app session; invalidated
  // by transfer operations (Phase 4). Keyed by absolute path.
  const folderSizeCache = new Map<string, number>()

  function dirSize(absPath: string): number {
    const cached = folderSizeCache.get(absPath)
    if (cached !== undefined) return cached
    let total = 0
    try {
      for (const entry of readdirSync(absPath, { withFileTypes: true })) {
        const child = join(absPath, entry.name)
        try {
          if (entry.isDirectory()) {
            total += dirSize(child)
          } else if (entry.isFile()) {
            total += statSync(child).size
          }
        } catch { /* skip unreadable entries */ }
      }
    } catch { /* unreadable dir */ }
    folderSizeCache.set(absPath, total)
    return total
  }

  /** Resolve the root of a drive by side ("vault" or "cold"). null if unavailable. */
  function resolveStorageRoot(side: 'vault' | 'cold'): string | null {
    if (side === 'vault') return resolveLibraryRoot()
    const backupLabel = getConfig('backupLabel')
    if (!backupLabel) return null
    return findDriveByLabel(backupLabel)
  }

  ipcMain.handle('storage:getDrives', async () => {
    const vaultRoot = resolveLibraryRoot()
    const backupLabel = getConfig('backupLabel')
    const coldRoot = backupLabel ? findDriveByLabel(backupLabel) : null

    const [vault, cold] = await Promise.all([
      getDriveStats(vaultRoot),
      coldRoot ? getDriveStats(coldRoot) : Promise.resolve(null)
    ])

    return {
      vault: vault ? { label: getConfig('libraryLabel'), ...vault } : null,
      cold:  cold  ? { label: backupLabel, ...cold }  : null,
      coldConfigured: !!backupLabel
    }
  })

  /**
   * List immediate folder children of `<driveRoot>/media/<relPath>`.
   * relPath is a forward-slash path under media/, '' for the media/ root itself.
   * Sizes are recursive byte sums (cached). Returns null if drive unavailable
   * or the path doesn't exist.
   */
  ipcMain.handle('storage:listFolder', async (
    _event,
    { side, relPath }: { side: 'vault' | 'cold'; relPath: string }
  ) => {
    const root = resolveStorageRoot(side)
    if (!root) return null
    const mediaRoot = join(root, 'media')
    const target = relPath ? join(mediaRoot, ...relPath.split('/').filter(Boolean)) : mediaRoot
    if (!existsSync(target)) return null

    let entries: import('fs').Dirent[]
    try {
      entries = readdirSync(target, { withFileTypes: true })
    } catch { return null }

    const folders = entries
      .filter((e) => e.isDirectory())
      .map((e) => ({
        name: e.name,
        relPath: relPath ? `${relPath}/${e.name}` : e.name,
        size: dirSize(join(target, e.name))
      }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))

    return { root, mediaRoot, relPath, folders }
  })

  ipcMain.handle('storage:checkConflicts', async (
    _event,
    { items, destSide }: { items: { side: TransferSide; relPath: string }[]; destSide: TransferSide }
  ) => {
    const vaultRoot = resolveLibraryRoot()
    const coldRoot = resolveStorageRoot('cold')
    return checkConflicts(items, destSide, vaultRoot, coldRoot)
  })

  ipcMain.handle('storage:runTransfer', async (_event, req: TransferRequest) => {
    const vaultRoot = resolveLibraryRoot()
    const coldRoot = resolveStorageRoot('cold')
    const result = await runTransfer(req, vaultRoot, coldRoot, win)
    // Invalidate folder-size cache for any affected paths — quickest is full clear.
    folderSizeCache.clear()
    return result
  })

  // ─── CBZ Reader ────────────────────────────────────────────────────────────

  // Serve individual pages directly from the in-memory ZIP — no disk writes, no blocking
  protocol.handle('cbz', (request) => {
    try {
      const index = parseInt(new URL(request.url).pathname.replace(/^\//, ''), 10)
      if (!cbzEntries || isNaN(index) || index >= cbzEntries.length) {
        return new Response(null, { status: 404 })
      }
      const entry = cbzEntries[index]
      const ext = entry.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const mime = (ext === 'jpg' || ext === 'jpeg') ? 'image/jpeg' : `image/${ext}`
      return new Response(entry.getData(), { headers: { 'Content-Type': mime, 'Cache-Control': 'no-store' } })
    } catch {
      return new Response(null, { status: 500 })
    }
  })

  // ─── YouTube videos ───────────────────────────────────────────────────────

  ipcMain.handle('youtube:getPlaylists', () => {
    const root = resolveLibraryRoot()
    const youtubeDir = join(root, 'media', 'youtube')
    if (!existsSync(youtubeDir)) return []
    return readdirSync(youtubeDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort()
  })

  ipcMain.handle('youtube:downloadVideo', async (
    _event,
    { urls, playlistName }: { urls: { url: string; title: string }[]; playlistName: string | null }
  ) => {
    const root = resolveLibraryRoot()
    const youtubeDir = join(root, 'media', 'youtube')
    const targetDir = playlistName ? join(youtubeDir, playlistName) : youtubeDir
    if (!existsSync(targetDir)) mkdirSync(targetDir, { recursive: true })

    const ytdlpPath = getToolPath(root, 'yt-dlp')
    const cookiesPath = getCookiesPath(root)
    // yt-dlp tries to write the cookies file back after each run (refreshed tokens).
    // Our drive copy lives in app/ which apply-icon.js marks +hidden, and Windows
    // refuses to atomically replace a hidden file from a non-hidden temp. Solve by
    // copying to OS tmpdir for the duration of this batch.
    let tmpCookiesPath: string | null = null
    if (existsSync(cookiesPath)) {
      tmpCookiesPath = join(tmpdir(), `vault-yt-cookies-${process.pid}-${Date.now()}.txt`)
      // Read+write (not copyFileSync) — copyFileSync preserves the +h attribute
      // on Windows, and yt-dlp's atomic writeback fails when replacing a hidden file.
      writeFileSync(tmpCookiesPath, readFileSync(cookiesPath, 'utf-8'), 'utf-8')
    }
    // YouTube wraps format URLs in obfuscated JS challenges (n-sig, signature).
    // yt-dlp delegates these to a JS runtime — deno is the default. Without it,
    // only thumbnails come back. We bundle deno.exe alongside yt-dlp on the drive.
    const denoPath = getToolPath(root, 'deno')
    const denoArgs = denoPath !== 'deno' ? ['--js-runtimes', `deno:${denoPath}`] : []
    const outTemplate = join(targetDir, '%(title)s.%(ext)s')
    logYtDlp(root, 'video', `start: ${urls.length} video(s), playlist=${playlistName ?? '(none)'}, tool=${ytdlpPath}${ytdlpPath === 'yt-dlp' ? ' (PATH lookup — bundled yt-dlp.exe missing on drive!)' : ''}, cookies=${tmpCookiesPath ? 'available' : 'none'}, deno=${denoArgs.length ? denoPath : 'no'}`)

    const runAttempt = (i: number, url: string, useCookies: boolean): Promise<{ code: number; stderr: string }> => {
      return new Promise((resolve) => {
        const cookiesArgs = useCookies && tmpCookiesPath ? ['--cookies', tmpCookiesPath] : []
        const proc = spawn(ytdlpPath, [
          '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
          '--merge-output-format', 'mp4',
          '--write-thumbnail', '--convert-thumbnails', 'jpg',
          // Cookie-free age-gate workaround: impersonate tv/web_safari clients
          // and accept any age rating. (mweb removed — it demands a GVS PO Token.)
          '--extractor-args', 'youtube:player_client=tv,web_safari',
          '--age-limit', '99',
          ...cookiesArgs,
          ...denoArgs,
          '--newline', '--no-playlist', '--no-update',
          '-o', outTemplate, url
        ])
        let stderrBuf = ''
        proc.stderr.on('data', (chunk: Buffer) => { stderrBuf += chunk.toString() })

        proc.stdout.on('data', (chunk: Buffer) => {
          const text = chunk.toString()
          const m = text.match(/\[download\]\s+([\d.]+)%/)
          if (m) {
            win.webContents.send('download:progress', {
              index: i, total: urls.length, url, status: 'downloading', percent: parseFloat(m[1])
            })
          }
          if (text.includes('[Merger]') || text.includes('[ffmpeg]')) {
            win.webContents.send('download:progress', {
              index: i, total: urls.length, url, status: 'converting', percent: 100
            })
          }
        })

        proc.on('error', (err) => {
          logYtDlp(root, 'video', `spawn error for ${url}: ${String(err)}`)
          resolve({ code: -1, stderr: String(err) })
        })
        proc.on('close', (code) => {
          resolve({ code: code ?? -1, stderr: stderrBuf })
        })
      })
    }

    for (let i = 0; i < urls.length; i++) {
      const { url } = urls[i]
      win.webContents.send('download:progress', { index: i, total: urls.length, url, status: 'downloading', percent: 0 })

      // First pass — no cookies (keeps account fingerprint off most downloads).
      let { code, stderr } = await runAttempt(i, url, false)
      let kind = code === 0 ? undefined : classifyYtDlpError(stderr)

      // Retry with cookies if the failure is one cookies actually fix.
      if (code !== 0 && tmpCookiesPath && (kind === 'age-restricted' || kind === 'bot-check')) {
        logYtDlp(root, 'video', `retrying with cookies (${kind}): ${url}`)
        win.webContents.send('download:progress', { index: i, total: urls.length, url, status: 'downloading', percent: 0 })
        ;({ code, stderr } = await runAttempt(i, url, true))
        kind = code === 0 ? undefined : classifyYtDlpError(stderr)
      }

      if (code === 0) {
        logYtDlp(root, 'video', `ok: ${url}`)
      } else {
        logYtDlp(root, 'video', `exit ${code} for ${url}\n${stderr.trim()}`)
      }
      win.webContents.send('download:progress', {
        index: i, total: urls.length, url,
        status: code === 0 ? 'done' : 'error', percent: 100,
        error: code === 0 ? undefined : stderr.trim().split('\n').slice(-3).join(' | '),
        errorKind: kind
      })
    }

    if (tmpCookiesPath && existsSync(tmpCookiesPath)) {
      try { unlinkSync(tmpCookiesPath) } catch { /* best-effort cleanup */ }
    }

    return { success: true }
  })

  // ─── YouTube cookies ──────────────────────────────────────────────────────

  ipcMain.handle('youtube:getCookieStatus', (): CookieStatus => {
    return readCookieStatus(resolveLibraryRoot())
  })

  ipcMain.handle('youtube:refreshCookies', async (): Promise<CookieStatus> => {
    const root = resolveLibraryRoot()
    // Persistent partition so cookies survive between refresh attempts — user
    // doesn't have to re-sign-in if they cancel and try again.
    const ses = session.fromPartition('persist:yt-auth', { cache: true })
    const authWin = new BrowserWindow({
      width: 520,
      height: 720,
      title: 'Sign in to YouTube — close this window when done',
      autoHideMenuBar: true,
      webPreferences: { session: ses }
    })
    await authWin.loadURL('https://www.youtube.com/')

    await new Promise<void>((resolve) => {
      authWin.once('closed', () => resolve())
    })

    try {
      const all = await ses.cookies.get({})
      const ytCookies = all.filter((c) => {
        const d = (c.domain ?? '').toLowerCase()
        return d.endsWith('youtube.com') || d.endsWith('google.com') || d.endsWith('googlevideo.com')
      })
      writeCookiesFile(root, ytCookies)
      logYtDlp(root, 'cookies', `refreshed: wrote ${ytCookies.length} cookies to ${getCookiesPath(root)}`)
    } catch (err) {
      logYtDlp(root, 'cookies', `refresh failed: ${String(err)}`)
    }
    return readCookieStatus(root)
  })

  ipcMain.handle('manga:openCbz', (_event, filePath: string): string[] => {
    try {
      const zip = new AdmZip(filePath)
      cbzEntries = zip.getEntries()
        .filter(e => !e.isDirectory && IMAGE_RE.test(e.name))
        .sort((a, b) => a.entryName.localeCompare(b.entryName, undefined, { numeric: true }))
      return cbzEntries.map((_, i) => `cbz://p/${i}`)
    } catch (err) {
      console.error('[vault] Failed to open CBZ:', err)
      cbzEntries = null
      return []
    }
  })

  ipcMain.handle('manga:closeCbz', () => {
    cbzEntries = null
  })
}
