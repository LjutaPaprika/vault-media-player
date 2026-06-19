import { execSync, spawn, spawnSync } from 'child_process'
import { BrowserWindow } from 'electron'
import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

export interface DriveStats {
  path: string
  freeBytes: number
  totalBytes: number
}

/**
 * Probe whether `rsync` is on PATH. Required for additive sync on macOS/Linux.
 * Windows uses robocopy which is built into the OS, so this always returns true.
 * Cached after first call — `rsync` install state doesn't change at runtime.
 */
let rsyncAvailableCache: boolean | null = null
export function isRsyncAvailable(): boolean {
  if (process.platform === 'win32') return true
  if (rsyncAvailableCache !== null) return rsyncAvailableCache
  const r = spawnSync('rsync', ['--version'], { stdio: 'ignore' })
  rsyncAvailableCache = r.status === 0
  return rsyncAvailableCache
}

/** Read free/total bytes for the drive that contains the given path. */
export async function getDriveStats(rootPath: string): Promise<DriveStats | null> {
  if (process.platform === 'win32') {
    if (rootPath.length < 2) return null
    const driveLetter = rootPath.charAt(0)
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
    if (!stdout) return null
    try {
      const data = JSON.parse(stdout) as { FreeSpace: number; Size: number }
      return { path: rootPath, freeBytes: data.FreeSpace, totalBytes: data.Size }
    } catch { return null }
  }

  // macOS / Linux: `df -k <path>`
  try {
    const dfOut = spawnSync('df', ['-k', rootPath], { encoding: 'utf-8' }).stdout ?? ''
    const lines = dfOut.trim().split('\n')
    if (lines.length < 2) return null
    const parts = lines[1].trim().split(/\s+/)
    const totalKB = parseInt(parts[1], 10)
    const freeKB  = parseInt(parts[3], 10)
    if (isNaN(totalKB) || isNaN(freeKB)) return null
    return { path: rootPath, freeBytes: freeKB * 1024, totalBytes: totalKB * 1024 }
  } catch { return null }
}

/** Find the drive root whose volume label matches the given label. */
export function findDriveByLabel(label: string): string | null {
  if (process.platform === 'win32') {
    // On Windows, scan drive letters A-Z
    for (let c = 65; c <= 90; c++) {
      const letter = String.fromCharCode(c)
      const drive = `${letter}:\\`
      try {
        // Use vol command to read label (vol needs "E:" not "E:\")
        const { execSync } = require('child_process') as typeof import('child_process')
        const out = execSync(`cmd.exe /c vol ${letter}:`, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
        if (out.toLowerCase().includes(label.toLowerCase())) return drive
      } catch {
        // Drive doesn't exist or isn't ready
      }
    }
    return null
  }

  // macOS / Linux: check /Volumes or /mnt
  const mountRoots = process.platform === 'darwin' ? ['/Volumes'] : ['/mnt', '/media', '/run/media']
  for (const root of mountRoots) {
    try {
      for (const entry of readdirSync(root)) {
        if (entry.toLowerCase() === label.toLowerCase()) {
          return `${root}/${entry}`
        }
      }
    } catch { /* mount root doesn't exist */ }
  }
  return null
}

/** Folders on the vault drive that belong to the app, not the media library. Never synced to cold storage. */
const SYSTEM_FOLDERS = ['players']

/** Mark non-media folders on the drive as hidden so Explorer doesn't show them. Windows-only. */
export function hideSystemFolders(driveRoot: string): void {
  if (process.platform !== 'win32') return
  for (const folder of SYSTEM_FOLDERS) {
    const fullPath = join(driveRoot, folder)
    if (existsSync(fullPath)) {
      try {
        execSync(`attrib +h "${fullPath}"`, { stdio: 'ignore' })
      } catch { /* folder may already be hidden */ }
    }
  }
}

/**
 * Additive sync — copies items that exist on the source but are missing on the
 * destination. Unlike runSync (legacy /MIR), this does NOT delete orphans on
 * the destination — items archived off the source must persist on the cold
 * drive even when no longer on the source.
 *
 * Emits storage:progress events so the new TransferIndicator can display it.
 */
export function runAdditiveSync(
  sourceRoot: string,
  destRoot: string,
  win: BrowserWindow
): Promise<{ success: boolean; copied: number; skipped: number; message?: string }> {
  return new Promise((resolve) => {
    const send = (phase: 'starting' | 'copying' | 'done' | 'error', counters: { copied?: number; skipped?: number; message?: string } = {}): void => {
      if (win.isDestroyed()) return
      win.webContents.send('storage:progress', {
        phase,
        itemIndex: phase === 'done' || phase === 'error' ? 1 : 0,
        itemTotal: 0,
        bytesDone: counters.copied,
        message: counters.message
      })
    }

    send('starting')

    let copied = 0
    let skipped = 0

    if (process.platform === 'win32') {
      // /E       — include subdirectories (including empty)
      // /MT:8    — 8 worker threads
      // /R:3 /W:5 — retry 3 times, 5s between
      // /NP /NDL — quieter output
      // /FFT     — FAT file-time tolerance
      // (no /MIR, no /PURGE — additive only)
      //
      // chcp 65001 forces the child's console output code page to UTF-8 so
      // robocopy's stdout doesn't mangle non-ASCII filenames (e.g. "Rôti")
      // when Node reads the stream as UTF-8. The actual file operations are
      // already encoding-clean since robocopy talks to NTFS via Win32 APIs —
      // this only fixes how filenames render in our stdout pipe.
      const args = [
        sourceRoot, destRoot, '/E', '/MT:8', '/R:3', '/W:5', '/NP', '/NDL', '/FFT',
        '/XD', '$RECYCLE.BIN', 'System Volume Information', ...SYSTEM_FOLDERS
      ]
      const quoted = args.map((a) => `"${a.replace(/"/g, '""')}"`).join(' ')
      const child = spawn(`chcp 65001 >nul && robocopy ${quoted}`, {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: true,
        windowsHide: true
      })

      let started = false
      child.stdout.setEncoding('utf-8')
      child.stdout.on('data', (chunk: string) => {
        if (!started) { send('copying'); started = true }
        for (const line of chunk.split('\n')) {
          const m = line.match(/^\s*Files\s*:\s*\d+\s+(\d+)\s+(\d+)/)
          if (m) {
            copied  = parseInt(m[1], 10) || copied
            skipped = parseInt(m[2], 10) || skipped
          }
        }
      })

      child.on('error', (err) => {
        send('error', { message: `Failed to launch robocopy: ${err.message}` })
        resolve({ success: false, copied, skipped, message: err.message })
      })

      child.on('close', (code) => {
        if ((code ?? 0) <= 7) {
          send('done', { copied, skipped, message: `${copied} new file(s), ${skipped} already in sync` })
          resolve({ success: true, copied, skipped })
        } else {
          send('error', { message: `robocopy exited with code ${code}` })
          resolve({ success: false, copied, skipped, message: `exit ${code}` })
        }
      })
      return
    }

    // macOS / Linux — rsync, no --delete.
    // Avoid --info=progress2 / --human-readable: macOS's built-in /usr/bin/rsync is
    // openrsync (2.6.9-compat) and rejects those flags. -a + --modify-window is the
    // common subset that works on both openrsync and GNU rsync.
    const excludes = SYSTEM_FOLDERS.flatMap((f) => ['--exclude', `${f}/`])
    const child = spawn('rsync', ['-a', '--modify-window=2', ...excludes, `${sourceRoot}/`, `${destRoot}/`], { stdio: ['ignore', 'pipe', 'pipe'] })

    // Without progress flags rsync is silent on stdout, so flip to 'copying' immediately.
    send('copying')
    child.stdout.setEncoding('utf-8')
    child.stdout.on('data', () => { /* drain */ })

    child.on('error', (err) => {
      send('error', { message: `Failed to launch rsync: ${err.message}` })
      resolve({ success: false, copied, skipped, message: err.message })
    })

    child.on('close', (code) => {
      if (code === 0) {
        send('done', { message: 'Sync complete' })
        resolve({ success: true, copied, skipped })
      } else {
        send('error', { message: `rsync exited with code ${code}` })
        resolve({ success: false, copied, skipped, message: `exit ${code}` })
      }
    })
  })
}

