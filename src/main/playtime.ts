// Playtime tracking for launched games.
//
// We can't use child.on('exit') because launchGame() shell-wraps as `start ""`
// on Windows (to dodge exFAT EACCES and give the game foreground focus). That
// makes the direct child cmd.exe, which returns in ~50ms — long before the
// game closes. So we poll the OS process list every 10s and stop when the
// game's exe disappears.
//
// The polling target is a process basename ('P5R.exe', 'shadPS4.exe', ...).
// For PC games it's the game exe; for emulator-launched ROMs it's the
// emulator's exe — one launch = one process = one session.

import { exec } from 'child_process'
import { EventEmitter } from 'events'
import { addPlaySeconds } from './database'

/**
 * Fires when a play session ends, so the renderer can patch its cached view
 * of the games list without waiting for a manual refresh. ipc.ts bridges this
 * to `playtime:updated` on the active window's webContents.
 */
export const playtimeEvents = new EventEmitter()

const POLL_INTERVAL_MS = 10_000
const MAX_SESSION_SECONDS = 12 * 3600
// Grace before first poll — the launched process needs a moment to appear
// in the OS process list, especially with the shell-wrap trampoline.
const LAUNCH_GRACE_MS = 5_000
// Consecutive misses required before ending a session — one is not enough
// because tasklist/pgrep occasionally returns empty on the frame the game
// transitions windows or the OS is under load.
const MISSES_TO_END = 2

interface Session {
  startedAt: number
  lastSeenAt: number
  timer: NodeJS.Timeout
  misses: number
  watchExe: string
}

const activeSessions = new Map<string, Session>()

function isProcessRunning(name: string): Promise<boolean> {
  return new Promise((resolve) => {
    const cmd = process.platform === 'win32'
      ? `tasklist /FI "IMAGENAME eq ${name}" /NH /FO CSV`
      // pgrep -x matches exact process basename; safe against arg-injection
      // because we already only pass a basename computed from a config path.
      : `pgrep -x ${JSON.stringify(name)}`
    exec(cmd, { windowsHide: true, timeout: 5000 }, (err, stdout) => {
      if (process.platform === 'win32') {
        // tasklist prints "INFO: No tasks..." to stderr and empty stdout when
        // nothing matches; when it matches, the exe name appears in the CSV row.
        resolve(!err && stdout.toLowerCase().includes(name.toLowerCase()))
      } else {
        resolve(!err && stdout.trim().length > 0)
      }
    })
  })
}

/**
 * Start tracking a play session for `filePath`, watching for a process whose
 * basename is `watchExe`. Idempotent — a re-launch while a session is in
 * flight is a no-op so we don't reset the clock or double-count.
 */
export function startPlaytimeSession(filePath: string, watchExe: string): void {
  if (activeSessions.has(filePath)) return

  const startedAt = Date.now()
  const session: Session = {
    startedAt,
    lastSeenAt: startedAt,
    timer: setTimeout(check, LAUNCH_GRACE_MS),
    misses: 0,
    watchExe,
  }
  activeSessions.set(filePath, session)

  async function check(): Promise<void> {
    const cur = activeSessions.get(filePath)
    if (!cur) return  // finished elsewhere

    const elapsedSec = Math.floor((Date.now() - cur.startedAt) / 1000)
    if (elapsedSec >= MAX_SESSION_SECONDS) {
      finish(MAX_SESSION_SECONDS, 'cap')
      return
    }

    const running = await isProcessRunning(cur.watchExe)
    if (running) {
      cur.lastSeenAt = Date.now()
      cur.misses = 0
    } else {
      cur.misses++
      if (cur.misses >= MISSES_TO_END) {
        // Attribute time only up to the last confirmed sighting so we don't
        // count the poll window during which the game was actually closed.
        const seconds = Math.max(0, Math.floor((cur.lastSeenAt - cur.startedAt) / 1000))
        finish(seconds, 'exit')
        return
      }
    }

    cur.timer = setTimeout(check, POLL_INTERVAL_MS)
  }

  function finish(seconds: number, reason: 'exit' | 'cap'): void {
    activeSessions.delete(filePath)
    if (seconds > 0) addPlaySeconds(filePath, seconds)
    console.log(`[playtime] session ended (${reason}): +${seconds}s for ${filePath}`)
    // Notify subscribers (bridged to renderer by ipc.ts). Emit even when
    // seconds=0 so the renderer knows the session ended in case it wants
    // to clear any "currently playing" UI in future.
    playtimeEvents.emit('session-ended', { filePath, secondsAdded: seconds })
  }
}
