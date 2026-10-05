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
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, watch, writeFileSync } from 'fs'
import { join, relative } from 'path'
import { deleteProgress, getAllProgress, getProgressDir, markOpenedAt, upsertProgress, type ProgressRow } from './database'

/**
 * position: seconds in when mpv last reported. duration: length as mpv
 * measured it, 0 if it never did. finished: playback ran to the end of the
 * file rather than being closed partway. savedAt: unix seconds of the report.
 */
export type VideoProgress = ProgressRow

/** Library-relative, case- and spelling-independent key for a file: the same
 *  book or video under E:/ on Windows and /Volumes/VAULT on a Mac gets the same key. */
export function progressKey(root: string, filePath: string): string {
  const rel = relative(root, filePath).replace(/\\/g, '/').normalize('NFC').toLowerCase()
  return createHash('sha1').update(rel).digest('hex')
}

/** The file mpv should report this video's position to, creating the folder. */
export function progressFileFor(root: string, filePath: string): string {
  const dir = getProgressDir()
  mkdirSync(dir, { recursive: true })
  return join(dir, `${progressKey(root, filePath)}.json`)
}

/** A report, and the video's path when it came from a queue. */
function parseReport(text: string): (VideoProgress & { path?: string }) | null {
  try {
    const p = JSON.parse(text)
    if (typeof p.position !== 'number' || !isFinite(p.position)) return null
    return {
      position: Math.max(0, p.position),
      duration: typeof p.duration === 'number' && isFinite(p.duration) ? p.duration : 0,
      finished: p.finished === true,
      savedAt: typeof p.savedAt === 'number' ? p.savedAt : 0,
      ...(typeof p.path === 'string' && p.path ? { path: p.path } : {})
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
      if (report) {
        const { path, ...progress } = report
        upsertProgress(name.slice(0, -'.json'.length), progress)
        // A queued video was started by mpv, not by the app, so this is the
        // first the app hears of it being watched. Stamped with the report's
        // own time, so when one episode's last report and the next one's
        // first arrive together, the later episode is the last watched.
        if (path && !progress.finished && progress.savedAt > 0) markOpenedAt(path, progress.savedAt)
      }
      // An unparseable report is removed too: it cannot become readable later,
      // and mpv's next write replaces it with a good one.
      if (readFileSync(file, 'utf-8') === text) unlinkSync(file)
    } catch {
      /* mid-write, or already gone: the next pass picks it up */
    }
  }
}

/**
 * Records a reading position reported by the app's own readers (no mpv
 * involved). Same table as video positions: for a comic or manga chapter
 * `position` is the page index and `duration` the page count; for a book,
 * `position` is the chapter index plus the fraction scrolled through it and
 * `duration` the chapter count.
 */
export function saveProgress(root: string, filePath: string, p: VideoProgress): void {
  upsertProgress(progressKey(root, filePath), p)
}

/** Forgets a video's position, e.g. when it is marked unwatched. */
export function clearProgress(root: string, filePath: string): void {
  ingestProgressReports()
  deleteProgress(progressKey(root, filePath))
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

// ─── Queues: several videos in one mpv window ───────────────────────────────

export interface QueueEntry {
  filePath: string
  title: string
  /** Seconds to start at (a resume point); 0 for the beginning. */
  startSeconds: number
}

/** Where queue files live: beside the reports, in a folder ingest never reads. */
function queueDir(): string {
  return join(getProgressDir(), 'queues')
}

// A queue file outlives its mpv only if mpv was killed; a binge running this
// long is not plausible, so older ones are leftovers.
const STALE_QUEUE_MS = 2 * 24 * 60 * 60 * 1000

/**
 * Writes what mpv needs to play `entries` back to back: an .m3u8 playlist
 * (mpv's --playlist) and a JSON details file the Lua scripts read, with each
 * video's report file, start point and title. Returns both paths. Both go on
 * the library drive, like the reports, never on the host machine.
 */
export function writeQueue(
  root: string,
  entries: QueueEntry[],
  opts: { autoplay: boolean; category?: string }
): { playlist: string; details: string } {
  const dir = queueDir()
  mkdirSync(dir, { recursive: true })
  try {
    for (const name of readdirSync(dir)) {
      const file = join(dir, name)
      if (Date.now() - statSync(file).mtimeMs > STALE_QUEUE_MS) unlinkSync(file)
    }
  } catch { /* best effort */ }

  const id = `queue-${Date.now()}`
  const playlist = join(dir, `${id}.m3u8`)
  const details = join(dir, `${id}.json`)
  writeFileSync(playlist, '#EXTM3U\n' + entries.map((e) => e.filePath).join('\n') + '\n', 'utf-8')
  writeFileSync(details, JSON.stringify({
    autoplay: opts.autoplay,
    category: opts.category ?? null,
    playlist,
    entries: entries.map((e) => ({
      path: e.filePath,
      title: e.title,
      start: e.startSeconds > 0 ? e.startSeconds : 0,
      progressFile: progressFileFor(root, e.filePath),
    })),
  }), 'utf-8')
  return { playlist, details }
}

/**
 * The mpv side. Inert unless the app passes --script-opts with either
 * vault-progress-file=<path> (one video) or vault-queue=<details json> (a
 * queue), so mpv started any other way (music, or by hand) is untouched.
 *
 * In a queue each video has its own report file, its own start point
 * (applied the first time it loads, through mpv's file-local options), and
 * its reports carry its path so the app can mark it watched. With autoplay
 * off the app also passes --keep-open=always: mpv then stops at the end of
 * each file instead of moving on, and this script records it and quits.
 */
export function buildProgressLua(): string {
  return `\
local utils = require 'mp.utils'

local single = mp.get_opt('vault-progress-file')
local queue_path = mp.get_opt('vault-queue')
if (not single or single == '') and (not queue_path or queue_path == '') then return end

local queue = nil
if queue_path and queue_path ~= '' then
  local f = io.open(queue_path, 'r')
  if f then
    queue = utils.parse_json(f:read('*a'))
    f:close()
  end
  if not queue or not queue.entries then return end
end

local out = single
local entry_path = nil
local position, duration = nil, 0
local finished = false
local ready = false
local last_write = -1e9
local started = {}

local function current_entry()
  if not queue then return nil end
  local pos = mp.get_property_number('playlist-pos', -1)
  return queue.entries[pos + 1]
end

local function write()
  if not position or not out then return end
  local tmp = out .. '.tmp'
  local f = io.open(tmp, 'w')
  if not f then return end
  local report = { position = position, duration = duration or 0, finished = finished, savedAt = os.time() }
  if entry_path then report.path = entry_path end
  f:write(utils.format_json(report))
  f:close()
  -- Windows will not rename over an existing file.
  os.remove(out)
  os.rename(tmp, out)
end

-- Each queued video reports to its own file, starting from a clean slate, so
-- the first seconds of one can never be recorded over another's position.
mp.register_event('start-file', function()
  if not queue then return end
  local e = current_entry()
  out = e and e.progressFile or nil
  entry_path = e and e.path or nil
  position, duration, finished, ready = nil, 0, false, false
  last_write = -1e9
end)

-- A queued video's resume point, the first time it loads. Not on later
-- visits (going back with Previous), where the saved point is out of date.
if queue then
  mp.add_hook('on_load', 50, function()
    local pos = mp.get_property_number('playlist-pos', -1)
    local e = queue.entries[pos + 1]
    if e and not started[pos] then
      started[pos] = true
      if e.start and e.start > 0 then
        mp.set_property('file-local-options/start', tostring(e.start))
      end
    end
  end)
end

-- Ignore the playhead until the initial load (and any start seek) settles,
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

-- Next Episode leaves before the end; it still counts as finished.
mp.register_script_message('vault-finished', function()
  if not ready then return end
  finished = true
  write()
end)

-- Autoplay off: mpv holds at the end of the file (keep-open=always); record
-- it and close, as a single video always has.
if queue and not queue.autoplay then
  mp.observe_property('eof-reached', 'bool', function(_, eof)
    if not eof or not ready then return end
    finished = true
    if duration and duration > 0 then position = duration end
    write()
    mp.command('quit')
  end)
end

mp.register_event('end-file', function(e)
  if not ready then return end
  if e.reason == 'eof' then
    finished = true
    if duration and duration > 0 then position = duration end
  end
  write()
end)

-- The queue's files are only needed while this mpv runs.
if queue then
  mp.register_event('shutdown', function()
    if queue.playlist then os.remove(queue.playlist) end
    os.remove(queue_path)
  end)
end
`
}
