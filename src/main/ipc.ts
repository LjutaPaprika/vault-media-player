import { ipcMain, BrowserWindow } from 'electron'
import { readFileSync, existsSync, readdirSync } from 'fs'
import { extname, dirname, join, basename } from 'path'
import { getConfig, setConfig, getItems, getItem, getExtras, clearStoredFileTimes } from './database'
import { scanLibrary } from './scanner'
import { openVideo, openAudio, launchGame } from './launcher'
import { findDriveByLabel, hideSystemFolders, runSync } from './sync'

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
  })

  ipcMain.handle('library:findDrive', (_event, label: string) => findDriveByLabel(label))

  // ─── Library scan ─────────────────────────────────────────────────────────
  ipcMain.handle('library:scan', () => {
    const label = getConfig('libraryLabel')
    if (!label) throw new Error('Library drive label is not configured.')
    const root = findDriveByLabel(label)
    if (!root) throw new Error(`Library drive "${label}" not found. Is it plugged in?`)
    hideSystemFolders(root)
    const count = scanLibrary(root)
    return { count }
  })

  ipcMain.handle('library:forceScan', () => {
    const label = getConfig('libraryLabel')
    if (!label) throw new Error('Library drive label is not configured.')
    const root = findDriveByLabel(label)
    if (!root) throw new Error(`Library drive "${label}" not found. Is it plugged in?`)
    hideSystemFolders(root)
    clearStoredFileTimes()
    const count = scanLibrary(root)
    return { count }
  })

  // ─── Library queries ──────────────────────────────────────────────────────
  ipcMain.handle('library:getAlbumTracks', (_event, firstTrackPath: string) => {
    const AUDIO_EXTS = new Set(['.mp3', '.flac', '.m4a', '.aac', '.ogg', '.wav', '.opus', '.wma'])
    const dir = dirname(firstTrackPath)
    if (!existsSync(dir)) return []
    return readdirSync(dir)
      .filter((f) => AUDIO_EXTS.has(extname(f).toLowerCase()))
      .sort()
      .map((f) => {
        const base = basename(f, extname(f))
        const match = base.match(/^(\d+)[.\s\-]+(.+)$/)
        return {
          path: join(dir, f),
          trackNumber: match ? parseInt(match[1], 10) : 0,
          title: match ? match[2].trim() : base
        }
      })
  })

  ipcMain.handle('library:getItems',  (_event, category: string) => getItems(category))
  ipcMain.handle('library:getItem',   (_event, id: number) => getItem(id))
  ipcMain.handle('library:getExtras', (_event, seriesTitle: string) => getExtras(seriesTitle))

  // ─── Image loading ────────────────────────────────────────────────────────
  ipcMain.handle('library:readImage', (_event, filePath: string) => {
    if (!filePath || !existsSync(filePath)) return null
    const ext = extname(filePath).toLowerCase().replace('.', '')
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    const data = readFileSync(filePath).toString('base64')
    return `data:${mime};base64,${data}`
  })

  // ─── Playback ─────────────────────────────────────────────────────────────
  // Drive root is resolved fresh on each call so it stays correct if the drive
  // is replugged mid-session. Falls back to cwd in dev.
  function resolveLibraryRoot(): string {
    const label = getConfig('libraryLabel')
    const root = label ? findDriveByLabel(label) : null
    return root ?? process.cwd()
  }

  ipcMain.handle('playback:openVideo', (_event, filePath: string) =>
    openVideo(filePath, resolveLibraryRoot())
  )
  ipcMain.handle('playback:openAudio', (_event, filePath: string) =>
    openAudio(filePath, resolveLibraryRoot())
  )
  ipcMain.handle('playback:launchGame', (_event, filePath: string, platform: string) =>
    launchGame(filePath, platform, resolveLibraryRoot())
  )

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
}
