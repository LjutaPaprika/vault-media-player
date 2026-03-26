import { execSync, spawn } from 'child_process'
import { BrowserWindow } from 'electron'
import { existsSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

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

const SYSTEM_FOLDERS = ['players', 'launcher']

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
  const child = spawn('robocopy', [src, dest, '/MIR', '/MT:8', '/R:3', '/W:5', '/NP', '/NDL'], {
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
  const child = spawn('rsync', ['-a', '--delete', '--info=progress2', '--human-readable', `${src}/`, `${dest}/`], {
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

  child.on('close', (code) => {
    if (code === 0) {
      send({ status: 'done', message: 'Sync complete.' })
    } else {
      send({ status: 'error', message: `rsync exited with code ${code}. Check that both drives are connected.` })
    }
  })
}
