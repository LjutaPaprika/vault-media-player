import { execSync, spawn, spawnSync } from 'child_process'
import { BrowserWindow } from 'electron'
import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

export interface DriveStats {
  path: string
  freeBytes: number
  totalBytes: number
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

export interface SyncProgress {
  status: 'running' | 'done' | 'error'
  message: string
  filescopied?: number
  filesskipped?: number
  filesdeleted?: number
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

export function runSync(
  sourceRoot: string,
  destRoot: string,
  win: BrowserWindow
): void {
  function send(progress: SyncProgress): void {
    if (!win.isDestroyed()) win.webContents.send('sync:progress', progress)
  }

  if (process.platform === 'win32') {
    runRobocopy(sourceRoot, destRoot, send)
  } else {
    runRsync(sourceRoot, destRoot, send)
  }
}

function runRobocopy(
  src: string,
  dest: string,
  send: (p: SyncProgress) => void
): void {
  // /MIR  = mirror (copy new/changed, delete removed)
  // /MT:8 = 8 threads
  // /R:3  = 3 retries on failure
  // /W:5  = 5 second wait between retries
  // /NP   = no percentage progress (cleaner output)
  // /NDL  = no directory list in output
  const child = spawn('robocopy', [src, dest, '/MIR', '/MT:8', '/R:3', '/W:5', '/NP', '/NDL', '/FFT', '/XD', '$RECYCLE.BIN', 'System Volume Information', ...SYSTEM_FOLDERS], {
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let filescopied = 0
  let filesskipped = 0
  let filesdeleted = 0

  child.stdout.setEncoding('utf-8')
  child.stdout.on('data', (chunk: string) => {
    for (const line of chunk.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed) continue

      // Parse robocopy summary lines
      if (/^\s*Files\s*:/.test(trimmed)) {
        const nums = trimmed.match(/\d+/g)?.map(Number) ?? []
        if (nums.length >= 3) {
          filescopied  = nums[1] ?? filescopied
          filesskipped = nums[2] ?? filesskipped
        }
      }
      if (/Deleted/.test(trimmed)) filesdeleted++

      send({ status: 'running', message: trimmed, filescopied, filesskipped, filesdeleted })
    }
  })

  child.on('error', (err) => {
    send({ status: 'error', message: `Failed to launch robocopy: ${err.message}. Is it available on this system?` })
  })

  child.on('close', (code) => {
    // Robocopy exit codes: 0-7 are success/info, 8+ are errors
    if ((code ?? 0) <= 7) {
      send({
        status: 'done',
        message: `Sync complete. ${filescopied} files copied, ${filesskipped} skipped, ${filesdeleted} deleted.`,
        filescopied,
        filesskipped,
        filesdeleted
      })
    } else {
      send({ status: 'error', message: `Robocopy exited with code ${code}. Check that both drives are connected.` })
    }
  })
}

function runRsync(
  src: string,
  dest: string,
  send: (p: SyncProgress) => void
): void {
  // --archive     = preserve permissions, timestamps, symlinks
  // --delete      = remove files from dest that no longer exist in src
  // --info=progress2 = show overall progress
  // --human-readable = human readable sizes
  const excludes = SYSTEM_FOLDERS.flatMap((f) => ['--exclude', `${f}/`])
  const child = spawn('rsync', ['-a', '--delete', '--modify-window=2', '--info=progress2', '--human-readable', ...excludes, `${src}/`, `${dest}/`], {
    stdio: ['ignore', 'pipe', 'pipe']
  })

  child.stdout.setEncoding('utf-8')
  child.stdout.on('data', (chunk: string) => {
    const trimmed = chunk.trim()
    if (trimmed) send({ status: 'running', message: trimmed })
  })

  child.stderr.setEncoding('utf-8')
  child.stderr.on('data', (chunk: string) => {
    const trimmed = chunk.trim()
    if (trimmed) send({ status: 'running', message: trimmed })
  })

  child.on('error', (err) => {
    send({ status: 'error', message: `Failed to launch rsync: ${err.message}. Is rsync installed?` })
  })

  child.on('close', (code) => {
    if (code === 0) {
      send({ status: 'done', message: 'Sync complete.' })
    } else {
      send({ status: 'error', message: `rsync exited with code ${code}. Check that both drives are connected.` })
    }
  })
}
