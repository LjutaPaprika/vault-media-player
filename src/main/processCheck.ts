import { execFile, execFileSync } from 'child_process'

/**
 * Is anything still running that could be writing to a game's saves?
 *
 * Used before putting a PC's own save folder back after a session (see
 * sessionParking.ts), so it errs on the side of "yes": any error, timeout or
 * unreadable answer counts as running, and the caller simply checks again
 * later.
 *
 * A process counts if its executable lives under one of `folders` (the game's
 * folder on the drive, which catches launchers and the real game exe behind a
 * stub), or if its file name is one of `names` wherever it lives (the PC's own
 * copy of the same game, started from Steam, still using the linked folder).
 * Windows reports no path for an elevated process to a normal one, which the
 * name check covers.
 */
export interface RunningQuery { folders: string[]; names: string[]; exclude?: string[] }

const PS_ARGS = [
  '-NoProfile', '-NonInteractive', '-Command',
  'Get-CimInstance Win32_Process -Property Name,ExecutablePath | ForEach-Object { "$($_.Name)|$($_.ExecutablePath)" }'
]

export function anyMatches(listing: string, q: RunningQuery): boolean {
  const norm = (p: string): string => p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase()
  const folders = q.folders.map((f) => norm(f) + '\\')
  const exclude = (q.exclude ?? []).map((f) => norm(f) + '\\')
  const names = new Set(q.names.map((n) => n.toLowerCase()))
  return listing.split(/\r?\n/).some((line) => {
    const bar = line.indexOf('|')
    if (bar < 0) return false
    const name = line.slice(0, bar).trim().toLowerCase()
    const path = norm(line.slice(bar + 1).trim())
    if (path && exclude.some((x) => path.startsWith(x))) return false
    if (names.has(name)) return true
    return path !== '' && folders.some((f) => path.startsWith(f))
  })
}

export function isRunning(q: RunningQuery): Promise<boolean> {
  if (process.platform !== 'win32') return Promise.resolve(false)
  return new Promise((resolve) => {
    execFile('powershell', PS_ARGS, { windowsHide: true, timeout: 20_000, maxBuffer: 8 * 1024 * 1024 },
      (err, stdout) => resolve(err || !stdout.trim() ? true : anyMatches(stdout, q)))
  })
}

/** The same check, blocking: only for Vault quitting, when nothing async will finish. */
export function isRunningSync(q: RunningQuery): boolean {
  if (process.platform !== 'win32') return false
  try {
    const out = execFileSync('powershell', PS_ARGS, { encoding: 'utf8', windowsHide: true, timeout: 15_000, stdio: ['ignore', 'pipe', 'ignore'] })
    return !out.trim() ? true : anyMatches(out, q)
  } catch {
    return true
  }
}
