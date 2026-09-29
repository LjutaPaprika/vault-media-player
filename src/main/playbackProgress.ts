// Resume positions for videos played in mpv.
//
// The app launches mpv detached and never hears from it again, so the player
// reports back through the filesystem: a Lua script (buildProgressLua) writes
// the playhead to a small JSON file every few seconds and once more when the
// file ends. The app folds each report into the playback_progress table and
// deletes the file, so at most the videos playing right now have one on disk.
// Leaving them in place would cost a 2 MB cluster per video ever played on
// the exFAT library drive.
//
// Report files are named by a hash of the video's path relative to the
// library root, and the table is keyed the same way. Relative so positions
// survive the drive coming up under a different letter or on another OS;
// hashed so the name is a fixed, safe string — it travels to mpv inside
// --script-opts, where a comma in a video title would split the option.

import { createHash } from 'crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, watch } from 'fs'
import { join, relative } from 'path'
import { getAllProgress, getProgressDir, upsertProgress, type ProgressRow } from './database'

/**
 * position: seconds in when mpv last reported. duration: length as mpv
 * measured it, 0 if it never did. finished: playback ran to the end of the
 * file rather than being closed partway. savedAt: unix seconds of the report.
 */
export type VideoProgress = ProgressRow

function progressKey(root: string, filePath: string): string {
  const rel = relative(root, filePath).replace(/\\/g, '/').normalize('NFC').toLowerCase()
  return createHash('sha1').update(rel).digest('hex')
}

/** The file mpv should report this video's position to, creating the folder. */
export function progressFileFor(root: string, filePath: string): string {
  const dir = getProgressDir()
  mkdirSync(dir, { recursive: true })
  return join(dir, `${progressKey(root, filePath)}.json`)
}

function parseReport(text: string): VideoProgress | null {
  try {
    const p = JSON.parse(text)
    if (typeof p.position !== 'number' || !isFinite(p.position)) return null
    return {
      position: Math.max(0, p.position),
      duration: typeof p.duration === 'number' && isFinite(p.duration) ? p.duration : 0,
      finished: p.finished === true,
      savedAt: typeof p.savedAt === 'number' ? p.savedAt : 0
    }
  } catch {
    return null
  }
}

// A temp file mpv never renamed into place: it crashed or was killed mid-write.
const STALE_TEMP_MS = 60 * 60 * 1000

/**
 * Moves every pending report into the database and deletes it.
 *
 * mpv may write again while this runs. A report is only deleted if it still
 * holds what was just stored, so the one case that can lose anything is mpv
 * replacing the file in the instant between that check and the delete — at
 * worst one 5-second update, which the next report supersedes.
 */
export function ingestProgressReports(): void {
  const dir = getProgressDir()
  if (!existsSync(dir)) return
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return
  }
  for (const name of names) {
    const file = join(dir, name)
    try {
      if (name.endsWith('.tmp')) {
        if (Date.now() - statSync(file).mtimeMs > STALE_TEMP_MS) unlinkSync(file)
        continue
      }
      if (!name.endsWith('.json')) continue
      const text = readFileSync(file, 'utf-8')
      const report = parseReport(text)
      if (report) upsertProgress(name.slice(0, -'.json'.length), report)
      // An unparseable report is removed too: it cannot become readable later,
      // and mpv's next write replaces it with a good one.
      if (readFileSync(file, 'utf-8') === text) unlinkSync(file)
    } catch {
      /* mid-write, or already gone: the next pass picks it up */
    }
  }
}

/** Saved positions for whichever of these videos have one, keyed by file path. */
export function readProgress(root: string, filePaths: string[]): Record<string, VideoProgress> {
  ingestProgressReports()
  const all = getAllProgress()
  const out: Record<string, VideoProgress> = {}
  for (const filePath of filePaths) {
    const p = all.get(progressKey(root, filePath))
    if (p) out[filePath] = p
  }
  return out
}

/**
 * Folds reports into the database shortly after mpv writes them, then calls
 * onChange so an open page can refresh without waiting to be revisited. The
 * app gets no signal when mpv closes (it is launched detached), and window
 * focus does not reliably return to the app when it does, so the report
 * folder itself is the signal.
 *
 * Each write is a temp-file write, delete and rename — several events in a
 * burst — and ingesting deletes files too; all of it is coalesced into one
 * call. Returns a function that stops watching. If the folder goes away
 * (drive unplugged), onError is called and the caller can start again later.
 */
export function watchProgress(onChange: () => void, onError: () => void): () => void {
  const dir = getProgressDir()
  mkdirSync(dir, { recursive: true })
  let timer: NodeJS.Timeout | null = null
  const watcher = watch(dir, (_event, name) => {
    if (name && !String(name).endsWith('.json')) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      // Deleting ingested files fires events of its own; only a pass that
      // actually found a report is worth telling the page about.
      let found = false
      try {
        found = readdirSync(dir).some((n) => n.endsWith('.json'))
        if (found) ingestProgressReports()
      } catch {
        /* folder gone; the error handler below deals with the watcher */
      }
      if (found) onChange()
    }, 250)
  })
  watcher.on('error', () => {
    watcher.close()
    onError()
  })
  return () => {
    if (timer) clearTimeout(timer)
    watcher.close()
  }
}

/**
 * The mpv side. Inert unless the app passes
 * --script-opts=vault-progress-file=<path>, so videos launched without it
 * (everything outside the YouTube page, for now) are untouched.
 */
export function buildProgressLua(): string {
  return `\
local out = mp.get_opt('vault-progress-file')
if not out or out == '' then return end

local position, duration = nil, 0
local finished = false
local ready = false
local last_write = -1e9

local function write()
  if not position then return end
  local tmp = out .. '.tmp'
  local f = io.open(tmp, 'w')
  if not f then return end
  f:write(string.format('{"position":%.3f,"duration":%.3f,"finished":%s,"savedAt":%d}',
    position, duration or 0, finished and 'true' or 'false', os.time()))
  f:close()
  -- Windows will not rename over an existing file.
  os.remove(out)
  os.rename(tmp, out)
end

-- Ignore the playhead until the initial load (and any --start seek) settles,
-- or a quick close would record 0 over a real position.
mp.register_event('playback-restart', function() ready = true end)

mp.observe_property('duration', 'number', function(_, d)
  if d then duration = d end
end)

mp.observe_property('time-pos', 'number', function(_, t)
  if not ready or not t then return end
  position = t
  if mp.get_time() - last_write >= 5 then
    last_write = mp.get_time()
    write()
  end
end)

mp.register_event('end-file', function(e)
  if not ready then return end
  if e.reason == 'eof' then
    finished = true
    if duration and duration > 0 then position = duration end
  end
  write()
end)
`
}
