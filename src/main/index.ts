import { app, BrowserWindow, dialog, shell, protocol } from 'electron'
import { join, dirname } from 'path'
import { createReadStream, statSync, existsSync } from 'fs'
import { Readable } from 'stream'
import { spawnSync } from 'child_process'

// Skip Chromium's GPU disk cache; it tries to relocate at startup and fails with
// "Access is denied" on Windows when AV or a stale instance holds the directory.
app.commandLine.appendSwitch('disable-gpu-disk-cache')

// Must be called before app.whenReady()
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { stream: true, bypassCSP: true, supportFetchAPI: true } },
  { scheme: 'cbz',   privileges: { bypassCSP: true, supportFetchAPI: true } },
  { scheme: 'thumb', privileges: { bypassCSP: true, supportFetchAPI: true } }
])
import { registerIpcHandlers, reconcileDriveRoot } from './ipc'
import { closeDb, probeDrive } from './database'
import { ensureSaveLinks } from './saveLinks'
import { hideSystemPaths } from './sync'
import { getOrCreateThumb } from './thumbnails'

if (app.isPackaged && process.platform === 'win32') {
  spawnSync('attrib', ['-h', '-s', dirname(app.getPath('exe'))], { shell: true })
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: '#0f0f0f',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true
    }
  })

  registerIpcHandlers(win)

  // Open external links in the OS browser, not in the app
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

/**
 * Startup guard: refuse to boot without the Vault drive. Before this existed,
 * a missing drive silently fell back to app.getPath('userData'), which wrote a
 * phantom library.db (and later stranded WAL/SHM files) into
 *   ~/Library/Application Support/Vault (macOS)
 *   %APPDATA%\Vault (Windows)
 * On the next launch SQLite would try to recover a WAL against a nonexistent
 * main DB and hang the app on the loading spinner.
 *
 * The two failure modes get distinct guidance: "not-found" means the drive
 * isn't plugged in; "permission-denied" (macOS) means TCC revoked the
 * Removable Volumes grant, which decays after OS updates or long sleep.
 */
function guardVaultDrive(): boolean {
  const probe = probeDrive()
  if (probe.ok) return true

  const isMac = process.platform === 'darwin'
  const message = probe.reason === 'permission-denied'
    ? 'Vault cannot read your removable volumes.'
    : 'Vault drive not detected.'
  const detail = probe.reason === 'permission-denied'
    ? (isMac
        ? 'macOS revoked Vault\'s Removable Volumes permission.\n\n' +
          'Open System Settings → Privacy & Security → Files and Folders, ' +
          'expand "Vault", enable "Removable Volumes", then relaunch Vault.'
        : 'The app does not have permission to read the mount root. Grant read access and relaunch.')
    : 'Plug in the Vault drive and relaunch. Vault stores its library on the drive and cannot run without it.'

  dialog.showErrorBox(message, detail)
  return false
}

app.whenReady().then(() => {
  if (!guardVaultDrive()) { app.quit(); return }

  // The drive may be mounted somewhere new since the last run — a different
  // letter, or the other OS entirely. Rewrite stored paths to match before the
  // window exists, so the first render already resolves posters and media
  // instead of showing a coverless library until someone runs a scan.
  try { reconcileDriveRoot() } catch (e) { console.error('[vault] drive-root reconcile failed:', e) }

  // Games that hardcode their save path to the host machine need that path
  // recreated as a junction onto the drive — otherwise a fresh PC silently
  // starts writing progress to C:\ again. Best-effort: never block startup.
  try {
    const probe = probeDrive()
    if (probe.ok && probe.root) {
      ensureSaveLinks(probe.root)
      // Also here, not just on scan: the hidden attribute doesn't travel with
      // the files, so a drive opened on a new PC shows its plumbing at the root
      // until something re-applies it.
      hideSystemPaths(probe.root)
    }
  } catch (e) { console.error('[vault] drive setup failed:', e) }

  // Serve downscaled shelf artwork via thumb://. Separate from media:// because
  // the two want opposite things: media:// streams whole files with Range
  // support for seeking, while a thumbnail is a small complete buffer that
  // wants aggressive caching and no range machinery at all.
  //
  // Generation happens on first request and is cached in the database, so this
  // is a DB read in the steady state.
  protocol.handle('thumb', async (request) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url).pathname)
      const filePath = process.platform === 'win32' ? pathname.slice(1) : pathname

      const thumb = await getOrCreateThumb(filePath)
      // 404 rather than an error page: the renderer's onError swaps in the
      // title-letter placeholder, which is the right look for missing artwork.
      if (!thumb) return new Response(null, { status: 404 })

      return new Response(thumb.data, {
        status: 200,
        headers: {
          'Content-Type': thumb.mime,
          'Content-Length': String(thumb.data.length),
          // Keyed on source mtime in the DB, so a stale entry cannot outlive
          // its poster; this only tells Chromium it need not re-ask each paint.
          'Cache-Control': 'private, max-age=86400'
        }
      })
    } catch {
      return new Response(null, { status: 500 })
    }
  })

  // Serve local media files via media:// with proper Range/206 support so seeking works.
  protocol.handle('media', (request) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url).pathname)
      // On Windows, pathname starts with /E:/... — strip the leading slash
      const filePath = process.platform === 'win32' ? pathname.slice(1) : pathname

      if (!existsSync(filePath)) return new Response(null, { status: 404 })

      const { size } = statSync(filePath)
      const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
      const mime: Record<string, string> = {
        mp3: 'audio/mpeg', flac: 'audio/flac', m4a: 'audio/mp4',
        aac: 'audio/aac', ogg: 'audio/ogg', wav: 'audio/wav',
        opus: 'audio/ogg', wma: 'audio/x-ms-wma',
        mp4: 'video/mp4', mkv: 'video/x-matroska', avi: 'video/x-msvideo',
        mov: 'video/quicktime', webm: 'video/webm',
        pdf: 'application/pdf',
        jpg: 'image/jpeg', jpeg: 'image/jpeg',
        png: 'image/png', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp'
      }
      const contentType = mime[ext] ?? 'application/octet-stream'

      const rangeHeader = request.headers.get('Range')
      if (rangeHeader) {
        const m = rangeHeader.match(/bytes=(\d*)-(\d*)/)
        const start = m?.[1] ? parseInt(m[1], 10) : 0
        const end   = m?.[2] ? parseInt(m[2], 10) : size - 1
        const chunkSize = end - start + 1
        const webStream = Readable.toWeb(createReadStream(filePath, { start, end })) as ReadableStream
        return new Response(webStream, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Range': `bytes ${start}-${end}/${size}`,
            'Content-Length': String(chunkSize),
            'Accept-Ranges': 'bytes'
          }
        })
      }

      const webStream = Readable.toWeb(createReadStream(filePath)) as ReadableStream
      const headers: Record<string, string> = {
        'Content-Type': contentType,
        'Content-Length': String(size),
        'Accept-Ranges': 'bytes'
      }
      // Posters are fetched by <img> and re-requested every time a shelf is
      // revisited. Telling Chromium it may reuse them keeps scrolling back to
      // the top from hitting the drive again. Scoped to images so audio and
      // video keep their existing streaming behaviour untouched.
      if (contentType.startsWith('image/')) headers['Cache-Control'] = 'private, max-age=3600'
      return new Response(webStream, { status: 200, headers })
    } catch {
      return new Response(null, { status: 500 })
    }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  closeDb()
})
