import { app, ipcMain, BrowserWindow, shell, protocol } from 'electron'
import { readFileSync, existsSync, statSync, readdirSync, writeFileSync, mkdirSync } from 'fs'
import { extname, dirname, join, basename } from 'path'
import { spawn, spawnSync } from 'child_process'
import { cpus, totalmem } from 'os'
import AdmZip from 'adm-zip'

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.wav', '.opus', '.wma'])

// In-memory CBZ state — populated by manga:openCbz, served by the cbz:// protocol
const IMAGE_RE = /\.(jpe?g|png|webp|gif|bmp)$/i
let cbzEntries: AdmZip.IZipEntry[] | null = null
import { getConfig, setConfig, getItems, getItem, getExtras, clearStoredFileTimes, getTechInfo, setLastOpened, getStats, getDbPath, rerootPaths, getFavourites, setFavourite } from './database'
import { getEpubInfo, readEpubChapter } from './epubReader'
import { scanLibrary, findPoster } from './scanner'
import { openVideo, openAudio, launchGame, getToolPath, openWithSystem } from './launcher'
import { findDriveByLabel, hideSystemFolders, runSync } from './sync'
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
    const { updated } = scanLibrary(root, getToolPath(root, 'ffprobe'))
    return { count: updated }
  })

  ipcMain.handle('library:forceScan', () => {
    const label = getConfig('libraryLabel')
    if (!label) throw new Error('Library drive label is not configured.')
    const root = resolveRootForScan(label)
    hideSystemFolders(root)
    clearStoredFileTimes()
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
  ipcMain.handle('library:getEpubInfo',     (_event, filePath: string) => getEpubInfo(filePath))
  ipcMain.handle('library:readEpubChapter', (_event, filePath: string, chapterHref: string) => readEpubChapter(filePath, chapterHref))

  // ─── Last opened tracking ─────────────────────────────────────────────────
  ipcMain.handle('library:markOpened', (_event, filePath: string) => setLastOpened(filePath))

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

    const ytdlpPath = getToolPath(resolveLibraryRoot(), 'yt-dlp')

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

        proc.on('error', () => {
          win.webContents.send('download:progress', {
            index: i, total: urls.length, url, status: 'error', percent: 0
          })
          resolve()
        })

        proc.on('close', (code) => {
          win.webContents.send('download:progress', {
            index: i, total: urls.length, url, status: code === 0 ? 'done' : 'error', percent: 100
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

    const ytdlpPath = getToolPath(resolveLibraryRoot(), 'yt-dlp')
    const outTemplate = join(albumPath, '%(playlist_index)02d - %(title)s.%(ext)s')

    let currentItem = -1  // -1 = no track started yet
    let totalItems = 0
    let lineBuffer = ''

    await new Promise<void>((resolve) => {
      const proc = spawn(ytdlpPath, [
        '-x', '--audio-format', 'mp3', '--audio-quality', '0',
        '--yes-playlist', '--newline', '--no-update',
        '-o', outTemplate, url
      ])

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

      proc.on('error', () => {
        win.webContents.send('download:progress', {
          index: Math.max(currentItem, 0), total: Math.max(totalItems, 1), url, status: 'error', percent: 0
        })
        resolve()
      })
      proc.on('close', (code) => {
        // Mark the final track done (or errored)
        if (currentItem >= 0) {
          win.webContents.send('download:progress', {
            index: currentItem, total: Math.max(totalItems, 1), url,
            status: code === 0 ? 'done' : 'error', percent: 100
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

    let driveInfo: { freeBytes: number; totalBytes: number } | null = null
    if (process.platform === 'win32' && root.length >= 2) {
      const driveLetter = root.charAt(0)
      try {
        const stdout = await new Promise<string>((resolve) => {
          let out = ''
          const ps = spawn('powershell', [
            '-NoProfile', '-Command',
            `Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='${driveLetter}:'" | Select-Object FreeSpace,Size | ConvertTo-Json -Compress`
          ])
          ps.stdout.on('data', (d: Buffer) => { out += d.toString() })
          ps.on('close', () => resolve(out.trim()))
          ps.on('error', () => resolve(''))
          setTimeout(() => { try { ps.kill() } catch { /* ignore */ } resolve('') }, 5000)
        })
        if (stdout) {
          const data = JSON.parse(stdout) as { FreeSpace: number; Size: number }
          driveInfo = { freeBytes: data.FreeSpace, totalBytes: data.Size }
        }
      } catch { /* non-fatal */ }
    } else if (process.platform !== 'win32') {
      // macOS / Linux: use `df -k <path>` — output columns are:
      // Filesystem  1K-blocks  Used  Available  Capacity  Mounted on  (macOS)
      // Filesystem  1K-blocks  Used  Available  Use%      Mounted on  (Linux)
      try {
        const dfOut = spawnSync('df', ['-k', root], { encoding: 'utf-8' }).stdout ?? ''
        const lines = dfOut.trim().split('\n')
        if (lines.length >= 2) {
          const parts = lines[1].trim().split(/\s+/)
          const totalKB = parseInt(parts[1], 10)
          const freeKB  = parseInt(parts[3], 10)
          if (!isNaN(totalKB) && !isNaN(freeKB)) {
            driveInfo = { freeBytes: freeKB * 1024, totalBytes: totalKB * 1024 }
          }
        }
      } catch { /* non-fatal */ }
    }

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
    const outTemplate = join(targetDir, '%(title)s.%(ext)s')

    for (let i = 0; i < urls.length; i++) {
      const { url } = urls[i]
      win.webContents.send('download:progress', { index: i, total: urls.length, url, status: 'downloading', percent: 0 })

      await new Promise<void>((resolve) => {
        const proc = spawn(ytdlpPath, [
          '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
          '--merge-output-format', 'mp4',
          '--write-thumbnail', '--convert-thumbnails', 'jpg',
          '--newline', '--no-playlist', '--no-update',
          '-o', outTemplate, url
        ])

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

        proc.on('error', () => {
          win.webContents.send('download:progress', { index: i, total: urls.length, url, status: 'error', percent: 0 })
          resolve()
        })
        proc.on('close', (code) => {
          win.webContents.send('download:progress', {
            index: i, total: urls.length, url, status: code === 0 ? 'done' : 'error', percent: 100
          })
          resolve()
        })
      })
    }

    return { success: true }
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
