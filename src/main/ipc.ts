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
import { getConfig, setConfig, getItems, getItem, getExtras, clearStoredFileTimes, getTechInfo, setLastOpened, getStats, getDbPath, rerootPaths } from './database'
import { getEpubInfo, readEpubChapter } from './epubReader'
import { scanLibrary, findPoster } from './scanner'
import { openVideo, openAudio, launchGame, getToolPath, openWithSystem } from './launcher'
import { findDriveByLabel, hideSystemFolders, runSync } from './sync'
import { getBindings, setBindings, resetBindings, type ControllerBinding } from './controllerBindings'
import { getKeyboardBindings, setKeyboardBindings, resetKeyboardBindings, type KeyboardBinding } from './keyboardBindings'

/** Async, non-blocking ffprobe — reads only the duration from a file's format metadata. */
function probeFileDuration(filePath: string, ffprobePath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn(ffprobePath, [
      '-v', 'quiet', '-print_format', 'json', '-show_format', filePath
    ], { windowsHide: true })
    let stdout = ''
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.on('close', (code) => {
      if (code !== 0 || !stdout) { resolve(0); return }
      try {
        const data = JSON.parse(stdout) as { format?: { duration?: string } }
        resolve(parseFloat(data.format?.duration ?? '0') || 0)
      } catch { resolve(0) }
    })
    proc.on('error', () => resolve(0))
  })
}

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

    // Duration cache — stored inside album.json under a "durations" key
    const albumJsonPath = join(dir, 'album.json')
    let albumData: Record<string, unknown> = {}
    try { albumData = JSON.parse(readFileSync(albumJsonPath, 'utf8')) } catch { /* no file yet */ }
    let cache: Record<string, number> = (albumData.durations as Record<string, number>) ?? {}

    let ffprobePath: string | null = null  // resolved lazily — avoids drive scan on cache hits
    let cacheUpdated = false

    const tracks: { path: string; trackNumber: number; title: string; artist?: string; duration: number; artPath: string | null }[] = []
    for (const f of audioFiles) {
      const fullPath = join(dir, f)
      const base = basename(f, extname(f))
      const match = base.match(/^(\d+)[.\s\-]+(.+)$/)
      let duration = cache[f]
      if (duration === undefined) {
        if (!ffprobePath) ffprobePath = getToolPath(resolveLibraryRoot(), 'ffprobe')
        duration = await probeFileDuration(fullPath, ffprobePath)  // non-blocking
        cache[f] = duration
        cacheUpdated = true
      }
      const rawTitle = match ? match[2].trim() : base
      const lastDash = rawTitle.lastIndexOf(' - ')
      const title = lastDash >= 0 ? rawTitle.slice(0, lastDash).trim() : rawTitle
      const artist = lastDash >= 0 ? rawTitle.slice(lastDash + 3).trim() : undefined
      tracks.push({
        path: fullPath,
        trackNumber: match ? parseInt(match[1], 10) : 0,
        title,
        artist,
        duration,
        artPath
      })
    }

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

  // ─── Watch order ──────────────────────────────────────────────────────────
  ipcMain.handle('library:getWatchOrder', (_event, seriesTitle: string, category: string) => {
    const root = resolveLibraryRoot()
    const categoryDir = join(root, 'media', category)

    // seriesTitle is the processed name (year stripped). The actual folder may still have
    // a year suffix like "(2018)", so try the direct path first then scan for a match.
    let seriesDir = join(categoryDir, seriesTitle)
    if (!existsSync(seriesDir)) {
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
        if (!match) return null
        seriesDir = join(categoryDir, match.name)
      } catch { return null }
    }

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
