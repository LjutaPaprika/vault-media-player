import { app, BrowserWindow, shell, protocol } from 'electron'
import { join } from 'path'
import { createReadStream, statSync, existsSync } from 'fs'
import { Readable } from 'stream'

// Must be called before app.whenReady()
protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { stream: true, bypassCSP: true, supportFetchAPI: true } },
  { scheme: 'cbz',   privileges: { bypassCSP: true, supportFetchAPI: true } }
])
import { registerIpcHandlers } from './ipc'
import { closeDb } from './database'

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

app.whenReady().then(() => {
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
      return new Response(webStream, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Length': String(size),
          'Accept-Ranges': 'bytes'
        }
      })
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
