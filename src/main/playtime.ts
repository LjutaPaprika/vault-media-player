// Playtime tracking for launched games.
//
// We can't use child.on('exit') because launchGame() shell-wraps as `start ""`
// on Windows (to dodge exFAT EACCES and give the game foreground focus). That
// makes the direct child cmd.exe, which returns in ~50ms — long before the
// game closes. So we poll the OS process list every 10s and stop when the
// game's exe has been gone for a while.
//
// The polling target is a process basename ('P5R.exe', 'shadPS4.exe', ...).
// For PC games it's the game exe; for emulator-launched ROMs it's the
// emulator's exe — one launch = one process = one session.
//
// A session is only ever held in memory, so it is saved when it ends and also
// when Vault quits: closing Vault right after the game used to throw away the
// whole session, because it was only written once the game had been missed
// twice, 10-20 s after it closed.

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
// How long the game must stay out of the process list before the session is
// over. A miss or two is not enough: tasklist/pgrep occasionally comes back
// empty under load, and some games restart themselves (a launcher that
// relaunches, a re-exec to apply display settings). Seen again within this
// window, the session simply carries on.
const ABSENCE_TO_END_MS = 60_000

interface Session {
  startedAt: number
  lastSeenAt: number   // last poll that found the game; startedAt until then
  timer: NodeJS.Timeout
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
 * Ends a session and records it. Time counts only up to the last poll that
 * found the game, so the minute spent confirming it had closed (or the moments
 * since the last poll, when Vault quits) are never added.
 */
function finishSession(filePath: string, reason: 'exit' | 'cap' | 'quit'): void {
  const session = activeSessions.get(filePath)
  if (!session) return
  activeSessions.delete(filePath)
  clearTimeout(session.timer)
  const seconds = reason === 'cap'
    ? MAX_SESSION_SECONDS
    : Math.max(0, Math.floor((session.lastSeenAt - session.startedAt) / 1000))
  if (seconds > 0) addPlaySeconds(filePath, seconds)
  console.log(`[playtime] session ended (${reason}): +${seconds}s for ${filePath}`)
  // Notify subscribers (bridged to renderer by ipc.ts). Emit even when
  // seconds=0 so the renderer knows the session ended in case it wants
  // to clear any "currently playing" UI in future.
  playtimeEvents.emit('session-ended', { filePath, secondsAdded: seconds })
}

/**
 * Start tracking a play session for `filePath`, watching for a process whose
 * basename is `watchExe`. Idempotent — a re-launch while a session is in
 * flight is a no-op so we don't reset the clock or double-count.
 */
export function startPlaytimeSession(filePath: string, watchExe: string): void {
  if (activeSessions.has(filePath)) return

  const startedAt = Date.now()
  activeSessions.set(filePath, {
    startedAt,
    lastSeenAt: startedAt,
    timer: setTimeout(check, LAUNCH_GRACE_MS),
    watchExe,
  })

  async function check(): Promise<void> {
    const cur = activeSessions.get(filePath)
    if (!cur) return  // finished elsewhere (Vault quitting)

    if (Date.now() - cur.startedAt >= MAX_SESSION_SECONDS * 1000) {
      finishSession(filePath, 'cap')
      return
    }

    if (await isProcessRunning(cur.watchExe)) {
      cur.lastSeenAt = Date.now()
    } else if (Date.now() - cur.lastSeenAt >= ABSENCE_TO_END_MS) {
      finishSession(filePath, 'exit')
      return
    }

    // The session may have been saved by a quit while the poll was running.
    if (activeSessions.get(filePath) === cur) cur.timer = setTimeout(check, POLL_INTERVAL_MS)
  }
}

/**
 * Saves every session still in progress. Called as Vault quits, before the
 * database closes: a game closed moments earlier, or one still running, keeps
 * the time it was seen to be played. A game left running after this is not
 * tracked further.
 */
export function flushPlaytimeSessions(): void {
  for (const filePath of [...activeSessions.keys()]) {
    try { finishSession(filePath, 'quit') } catch (err) {
      console.warn(`[playtime] could not save session for ${filePath} —`, err)
    }
  }
}
