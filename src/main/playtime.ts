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
// Time is saved as it is played, once a minute, rather than only when the
// session ends. A session held only in memory was lost whole when Vault quit
// right after the game (fixed in 1.30.2 by saving on quit) and still was when
// the PC crashed mid-game; now at most the last minute is. It also means the
// Games page can show the new total as soon as the game is first missed,
// ~10 s after it closes, while the session itself still waits out the full
// absence below before it ends.

import { exec } from 'child_process'
import { EventEmitter } from 'events'
import { addPlaySeconds } from './database'

/**
 * Events for the rest of the app. ipc.ts bridges both to `playtime:updated`
 * on the renderer, which refetches playtime from the database.
 *
 * - 'saved': time was written while the session goes on — the game was just
 *   missed for the first time (it has probably closed). Fires at most once per
 *   absence, so the Games page updates promptly without refreshing every minute.
 * - 'session-ended': the game has been gone long enough that the session is
 *   over. Fires once per session; the registry-settings save waits for this.
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
// How often time is written while the game runs. Each write is one small
// database update on the drive; once a minute keeps that negligible while
// limiting what a crash can lose to a minute.
const SAVE_EVERY_MS = 60_000
// Checks run every 10 s, plus up to 5 s for the process query. A gap far
// longer than that means the PC was asleep or hibernating (timers don't run
// while it is), and the time across it isn't play.
const SLEEP_GAP_MS = 45_000

interface Session {
  startedAt: number
  /** Last check that found the game running; startedAt until the first one. */
  lastSeenAt: number
  /** When the last check ran, to tell a sleep from a normal interval. */
  lastCheckAt: number
  /** Play counted so far, in ms: time it was seen running, less any sleep. */
  playedMs: number
  /** Whole seconds of `playedMs` already written to the database. */
  savedSeconds: number
  lastSaveAt: number
  /** The current absence has already been reported with a 'saved' event. */
  missReported: boolean
  timer: NodeJS.Timeout
  watchExe: string
  watchPid?: number    // when set, polled with kill(0) instead of pgrep -x
}

const activeSessions = new Map<string, Session>()

// kill(pid, 0) returns without sending a signal: throws ESRCH if the pid is
// gone, EPERM if the pid exists but is owned by someone else. Either way, if
// it does not throw, the process is alive. Used for Mac PC-game launches,
// where GPTK runs the game in a way `pgrep -x` cannot see.
function isPidAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true } catch { return false }
}

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
 * Writes the time played since the last save. Only the difference is ever
 * added, so saving often never counts a second twice. A failed write (the
 * drive unplugged mid-game) keeps the time for the next attempt.
 */
function persist(filePath: string, s: Session): number {
  const total = Math.min(MAX_SESSION_SECONDS, Math.floor(s.playedMs / 1000))
  const add = total - s.savedSeconds
  if (add <= 0) return 0
  try {
    addPlaySeconds(filePath, add)
    s.savedSeconds = total
    s.lastSaveAt = Date.now()
    return add
  } catch (err) {
    console.warn(`[playtime] could not save ${add}s for ${filePath}; will retry —`, err)
    return 0
  }
}

/**
 * Ends a session and records whatever hasn't been saved yet. Time counts only
 * up to the last check that found the game, so the minute spent confirming it
 * had closed (or the moments since the last check, when Vault quits) are never
 * added.
 */
function finishSession(filePath: string, reason: 'exit' | 'cap' | 'quit'): void {
  const session = activeSessions.get(filePath)
  if (!session) return
  activeSessions.delete(filePath)
  clearTimeout(session.timer)
  persist(filePath, session)
  console.log(`[playtime] session ended (${reason}): ${session.savedSeconds}s in all for ${filePath}`)
  // Notify subscribers (bridged to renderer by ipc.ts). Emit even when
  // nothing was played so the renderer knows the session ended in case it
  // wants to clear any "currently playing" UI in future.
  playtimeEvents.emit('session-ended', { filePath, secondsAdded: session.savedSeconds })
}

/**
 * Start tracking a play session for `filePath`, watching for a process whose
 * basename is `watchExe`. Idempotent — a re-launch while a session is in
 * flight is a no-op so we don't reset the clock or double-count.
 */
export function startPlaytimeSession(filePath: string, watchExe: string, watchPid?: number): void {
  if (activeSessions.has(filePath)) return

  const startedAt = Date.now()
  activeSessions.set(filePath, {
    startedAt,
    lastSeenAt: startedAt,
    lastCheckAt: startedAt,
    playedMs: 0,
    savedSeconds: 0,
    lastSaveAt: startedAt,
    missReported: false,
    timer: setTimeout(check, LAUNCH_GRACE_MS),
    watchExe,
    watchPid,
  })

  async function check(): Promise<void> {
    const cur = activeSessions.get(filePath)
    if (!cur) return  // finished elsewhere (Vault quitting)

    const alive = cur.watchPid !== undefined
      ? isPidAlive(cur.watchPid)
      : await isProcessRunning(cur.watchExe)
    // The session may have been saved by a quit while the query was running.
    if (activeSessions.get(filePath) !== cur) return

    const now = Date.now()
    const slept = now - cur.lastCheckAt > SLEEP_GAP_MS
    if (alive) {
      // Count from the last sighting, which also takes in a brief absence the
      // game came back from. Across a sleep, count only up to the check
      // before it: the hours the PC was off are not play.
      cur.playedMs += (slept ? cur.lastCheckAt : now) - cur.lastSeenAt
      cur.lastSeenAt = now
      cur.missReported = false
    }
    cur.lastCheckAt = now

    if (cur.playedMs >= MAX_SESSION_SECONDS * 1000) {
      finishSession(filePath, 'cap')
      return
    }

    if (alive) {
      if (now - cur.lastSaveAt >= SAVE_EVERY_MS) persist(filePath, cur)
    } else {
      if (!cur.missReported) {
        // Probably closed: save now so the Games page can show the new total
        // straight away, rather than after the full absence below.
        cur.missReported = true
        const added = persist(filePath, cur)
        // Even with nothing new to add (the minute's save fell on the last
        // check), the page hasn't been told about the earlier saves yet.
        if (cur.savedSeconds > 0) playtimeEvents.emit('saved', { filePath, secondsAdded: added })
      }
      // Waking from a sleep with the game gone: the absence started before
      // the sleep, so it may already be long enough.
      if (now - cur.lastSeenAt >= ABSENCE_TO_END_MS) {
        finishSession(filePath, 'exit')
        return
      }
    }

    cur.timer = setTimeout(check, POLL_INTERVAL_MS)
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
