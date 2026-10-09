import { execFile, execFileSync, execSync, spawn, spawnSync } from 'child_process'
import { BrowserWindow } from 'electron'
import { existsSync, readdirSync, statSync, statfsSync, promises as fsp } from 'fs'
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
    // Asked of the filesystem directly. The sidebar refreshes this every
    // minute, and the PowerShell query it replaces took ~1.7 s and started a
    // process, which on its own stalls the main process.
    try {
      const s = await fsp.statfs(rootPath)
      return { path: rootPath, freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize }
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

/**
 * Windows drive-label lookup.
 *
 * The label comes from `vol`, which means starting a cmd.exe. On this PC
 * every process start stalls the main process (~50 ms of it is synchronous
 * even through the async API, ~200 ms end to end with real-time antivirus),
 * and the sidebar asks for the cold-store drive every minute. Asking all 26
 * letters each time froze the app for over 5 s whenever that drive was
 * unplugged.
 *
 * So only mounted letters are asked (an exists check costs nothing), and each
 * answer is remembered per volume. A volume is its letter plus its size: if a
 * different drive turns up on the same letter, the size differs and it is
 * asked again. Steady state is no processes at all.
 */
const volCache = new Map<string, string>()  // "E|8001526169600" -> vol output

function mountedVolumes(): { letter: string; key: string }[] {
  const volumes: { letter: string; key: string }[] = []
  for (let c = 65; c <= 90; c++) {
    const letter = String.fromCharCode(c)
    if (!existsSync(`${letter}:\\`)) continue
    let size = 0
    try { const s = statfsSync(`${letter}:\\`); size = s.blocks * s.bsize } catch { /* not ready */ }
    volumes.push({ letter, key: `${letter}|${size}` })
  }
  return volumes
}

function volOutputMatches(out: string, label: string): boolean {
  return out.toLowerCase().includes(label.toLowerCase())
}

/**
 * Find the drive root whose volume label matches the given label.
 *
 * Can block the main process while it asks new drives, so it is for one-off
 * lookups such as startup. Anything called repeatedly, or from an IPC handler,
 * should use findDriveByLabelAsync.
 */
export function findDriveByLabel(label: string): string | null {
  if (process.platform === 'win32') {
    for (const { letter, key } of mountedVolumes()) {
      let out = volCache.get(key)
      if (out === undefined) {
        try {
          // vol needs "E:", not "E:\"
          out = execFileSync('cmd.exe', ['/c', 'vol', `${letter}:`], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true })
          volCache.set(key, out)
        } catch { continue /* not ready (an empty card reader, say); ask again next time */ }
      }
      if (volOutputMatches(out, label)) return `${letter}:\\`
    }
    return null
  }
  return findMountByLabel(label)
}

/**
 * findDriveByLabel without blocking on the answer: new drives are asked in
 * parallel, and the first matching letter in A-Z order wins, as before.
 */
export async function findDriveByLabelAsync(label: string): Promise<string | null> {
  if (process.platform !== 'win32') return findMountByLabel(label)
  const volumes = mountedVolumes()
  const outputs = await Promise.all(volumes.map(({ letter, key }) => {
    const cached = volCache.get(key)
    if (cached !== undefined) return Promise.resolve<string | null>(cached)
    return new Promise<string | null>((resolve) => {
      execFile('cmd.exe', ['/c', 'vol', `${letter}:`], { encoding: 'utf-8', windowsHide: true, timeout: 10_000 }, (err, out) => {
        if (err) { resolve(null); return }
        volCache.set(key, out)
        resolve(out)
      })
    })
  }))
  const i = outputs.findIndex((out) => out !== null && volOutputMatches(out, label))
  return i === -1 ? null : `${volumes[i].letter}:\\`
}

function findMountByLabel(label: string): string | null {
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

/**
 * Folders that belong to the app rather than the media library, and are never
 * synced to cold storage. `players` is bundled tooling (mpv, ffmpeg, yt-dlp,
 * deno) — re-downloadable, and large enough that copying it wastes the cold
 * drive's space.
 *
 * Deliberately NOT extended to `saves`: game save data is the least replaceable
 * thing on the drive, so it must keep reaching cold storage. Anything added
 * here stops being backed up, on both the robocopy and rsync paths.
 */
const SYNC_EXCLUDED_FOLDERS = ['players']

/**
 * Folders hidden from Explorer so browsing the drive shows media, not plumbing.
 * A superset of the sync exclusions — `saves` and `_save-backups` hold live save
 * data and its dated snapshots, which should stay out of sight but must still be
 * backed up, which is why hiding and sync-exclusion are separate lists.
 *
 * The hidden attribute lives in the volume's directory entry, so setting it once
 * mostly sticks. Listing a folder here is what makes it *stay* hidden: startup
 * re-applies the attribute, so a folder recreated by a rebuild, or copied by a
 * tool that drops attributes, is re-hidden on the next launch rather than
 * silently reappearing in the drive root.
 *
 * `data` holds library.db and save-links.json, `temp` is scratch space, and
 * `_source_archives` holds the original game installers — all plumbing, none of
 * it content, and none of it meant to be browsed.
 */
const HIDDEN_FOLDERS = ['players', 'saves', '_save-backups', 'data', 'temp', '_source_archives', '_app-backups']

/**
 * Loose files at the drive root that are plumbing rather than content.
 * `setup-saves.cmd` recreates the save junctions on a PC that has never seen
 * the drive; the app does that itself at startup, so the script is a fallback
 * and doesn't need to sit in plain view. Hidden files still run normally.
 */
// Loose helper files at the drive root. The vault-state exports are dated, so
// they are matched by prefix rather than listed one by one.
const HIDDEN_FILES = ['setup-saves.cmd']
const HIDDEN_FILE_PREFIXES = ['_vault-state-']

/**
 * OS-generated files that shouldn't propagate between drives.
 * `.DS_Store` and `._*` are macOS Finder metadata; `Thumbs.db` and `desktop.ini`
 * are Windows Explorer. Without excludes, the drive accumulates the other OS's
 * crumbs every time it's swapped between machines.
 */
const SYSTEM_FILE_GLOBS = ['.DS_Store', '._*', 'Thumbs.db', 'desktop.ini']

/**
 * Mark the drive's plumbing — app folders and loose helper files — as hidden so
 * browsing the drive shows media, not machinery. Windows-only; the attribute
 * doesn't travel with the files, so this re-applies on whichever PC runs it.
 */
export function hideSystemPaths(driveRoot: string): void {
  if (process.platform !== 'win32') return
  const named = [...HIDDEN_FOLDERS, ...HIDDEN_FILES]
  // Dated exports (_vault-state-2026-08-21.json and friends) cannot be listed
  // by name, so match them by prefix at the drive root.
  let prefixed: string[] = []
  try {
    prefixed = readdirSync(driveRoot).filter((n) =>
      HIDDEN_FILE_PREFIXES.some((pre) => n.startsWith(pre))
    )
  } catch { /* root unreadable - nothing to hide */ }

  for (const name of [...named, ...prefixed]) {
    const fullPath = join(driveRoot, name)
    if (existsSync(fullPath)) {
      try {
        execSync(`attrib +h "${fullPath}"`, { stdio: 'ignore' })
      } catch { /* may already be hidden, or locked by another process */ }
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
      // /R:3 /W:5 — retry 3 times, 5s between
      // /NP /NDL — quieter output
      // /FFT     — FAT file-time tolerance
      // (no /MIR, no /PURGE — additive only)
      // (no /MT — single-threaded on purpose: /MT:N on exFAT volumes has
      //  triggered EXFAT_FILE_SYSTEM 0x12C BSODs because exfat.sys serializes
      //  hard and several worker threads racing the same volume corrupts its
      //  internal state. Both Vault and the cold drive are exFAT for
      //  Windows/Mac portability, so we can't opt out of the filesystem.)
      //
      // chcp 65001 forces the child's console output code page to UTF-8 so
      // robocopy's stdout doesn't mangle non-ASCII filenames (e.g. "Rôti")
      // when Node reads the stream as UTF-8. The actual file operations are
      // already encoding-clean since robocopy talks to NTFS via Win32 APIs —
      // this only fixes how filenames render in our stdout pipe.
      const args = [
        sourceRoot, destRoot, '/E', '/R:3', '/W:5', '/NP', '/NDL', '/FFT',
        '/XD', '$RECYCLE.BIN', 'System Volume Information', ...SYNC_EXCLUDED_FOLDERS,
        '/XF', ...SYSTEM_FILE_GLOBS
      ]
      // Double any trailing backslashes before wrapping in quotes. CommandLineToArgvW
      // treats `\"` as an escaped quote, so an arg like `E:\` would become `"E:\"` and
      // get parsed as `E:` plus a stray quote that eats the next arg. Doubling makes
      // `"E:\\"` parse cleanly as `E:\`.
      const quoted = args.map((a) => `"${a.replace(/"/g, '""').replace(/\\+$/, (m) => m + m)}"`).join(' ')
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
    const folderExcludes = SYNC_EXCLUDED_FOLDERS.flatMap((f) => ['--exclude', `${f}/`])
    const fileExcludes   = SYSTEM_FILE_GLOBS.flatMap((g) => ['--exclude', g])
    const child = spawn('rsync', ['-a', '--modify-window=2', ...folderExcludes, ...fileExcludes, `${sourceRoot}/`, `${destRoot}/`], { stdio: ['ignore', 'pipe', 'pipe'] })

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

