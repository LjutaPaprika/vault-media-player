// Resume positions for videos played in mpv.
//
// The app launches mpv detached and never hears from it again, so the player
// reports back through the filesystem: a Lua script (buildProgressLua) writes
// the playhead to a small JSON file every few seconds and once more when the
// file ends. The app reads those files back when it wants to offer a resume.
//
// One file per video, named by a hash of the video's path relative to the
// library root. Relative so the positions survive the drive coming up under a
// different letter or on another OS; hashed so the name is a fixed, safe
// string — it travels to mpv inside --script-opts, where a comma in a video
// title would split the option.

import { createHash } from 'crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, watch } from 'fs'
import { join, relative } from 'path'
import { getProgressDir } from './database'

export interface VideoProgress {
  /** Seconds into the video when mpv last reported. */
  position: number
  /** Length as mpv measured it; 0 if it never reported one. */
  duration: number
  /** Playback ran to the end of the file rather than being closed partway. */
  finished: boolean
  /** Unix seconds of the last write. */
  savedAt: number
}

function progressKey(root: string, filePath: string): string {
  const rel = relative(root, filePath).replace(/\\/g, '/').normalize('NFC').toLowerCase()
  return createHash('sha1').update(rel).digest('hex')
}

/** The file mpv should write this video's position to, creating the folder. */
export function progressFileFor(root: string, filePath: string): string {
  const dir = getProgressDir()
  mkdirSync(dir, { recursive: true })
  return join(dir, `${progressKey(root, filePath)}.json`)
}

/** Saved positions for whichever of these videos have one, keyed by file path. */
export function readProgress(root: string, filePaths: string[]): Record<string, VideoProgress> {
  const dir = getProgressDir()
  const out: Record<string, VideoProgress> = {}
  if (!existsSync(dir)) return out
  let saved: Set<string>
  try {
    saved = new Set(readdirSync(dir))
  } catch {
    return out
  }
  for (const filePath of filePaths) {
    const name = `${progressKey(root, filePath)}.json`
    if (!saved.has(name)) continue
    try {
      const p = JSON.parse(readFileSync(join(dir, name), 'utf-8'))
      if (typeof p.position !== 'number' || !isFinite(p.position)) continue
      out[filePath] = {
        position: Math.max(0, p.position),
        duration: typeof p.duration === 'number' && isFinite(p.duration) ? p.duration : 0,
        finished: p.finished === true,
        savedAt: typeof p.savedAt === 'number' ? p.savedAt : 0
      }
    } catch {
      /* half-written or corrupt: treat as no position rather than fail the page */
    }
  }
  return out
}

/**
 * Calls onChange shortly after mpv writes any position, so an open page can
 * refresh without waiting to be revisited. The app gets no signal when mpv
 * closes (it is launched detached), and window focus does not reliably return
 * to the app when it does, so the progress folder itself is the signal.
 *
 * Each write is a temp-file write, delete and rename, several events in a
 * burst; they are coalesced into one call. Returns a function that stops
 * watching. If the folder goes away (drive unplugged), onError is called and
 * the caller can start again later.
 */
export function watchProgress(onChange: () => void, onError: () => void): () => void {
  const dir = getProgressDir()
  mkdirSync(dir, { recursive: true })
  let timer: NodeJS.Timeout | null = null
  const watcher = watch(dir, (_event, name) => {
    if (name && !String(name).endsWith('.json')) return
    if (timer) clearTimeout(timer)
    timer = setTimeout(onChange, 250)
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
