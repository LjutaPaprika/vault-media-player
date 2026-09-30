// Still frames for episode rows, grabbed from the video itself with the
// ffmpeg bundled beside mpv on the library drive.
//
// Windows Explorer's own video thumbnails were the other candidate, but they
// live in a per-PC cache on the system drive (so not on the vault, and not on
// a Mac), exist for MKV only with a shell extension installed, and are an
// arbitrary frame anyway. Grabbing our own costs ~0.3 s per episode and is
// cached with the rest of the artwork in the thumbnails table.

import { spawn } from 'child_process'
import { nativeImage } from 'electron'

const VIDEO_EXT = /\.(mkv|mp4|m4v|avi|mov|webm)$/i

export function isVideoPath(filePath: string): boolean {
  return VIDEO_EXT.test(filePath)
}

let resolveFfmpeg: () => string = () => 'ffmpeg'

/** Tells the grabber where ffmpeg is; the library root is only known in ipc.ts. */
export function setFfmpegResolver(fn: () => string): void {
  resolveFfmpeg = fn
}

// Where to look, as fractions of the running time. A fifth of the way in is
// past an anime opening and a TV cold open, and early enough not to give away
// the episode's turn; later points are only tried if that frame is unusable.
const CANDIDATES = [0.2, 0.3, 0.42, 0.55]
// Without a known length, fixed points past a typical opening.
const FALLBACK_SECONDS = [300, 420, 540]

// Mean luma (0-255) and spread below which a frame is a fade, a black
// transition or a flat title card rather than a picture.
const MIN_BRIGHTNESS = 38
const MIN_SPREAD = 14

const GRAB_TIMEOUT_MS = 20_000

function grabAt(file: string, seconds: number, width: number): Promise<Buffer | null> {
  return new Promise((resolve) => {
    // -ss before -i seeks by the keyframe index, and -skip_frame nokey then
    // takes that keyframe instead of decoding forward to the exact second; any
    // frame near the point will do for a still. One decoder thread, and no
    // audio or subtitle streams opened: grabs run several at a time, so
    // per-process overhead matters more than single-grab latency. Measured on
    // this library: median 184 ms against 238 ms for a plain seek.
    const ff = spawn(resolveFfmpeg(), [
      '-v', 'error', '-threads', '1', '-skip_frame', 'nokey', '-ss', seconds.toFixed(1), '-i', file,
      '-an', '-sn', '-dn', '-frames:v', '1', '-vf', `scale=${width}:-2:flags=fast_bilinear`, '-q:v', '4',
      '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1'
    ], { windowsHide: true })
    const chunks: Buffer[] = []
    const timer = setTimeout(() => ff.kill(), GRAB_TIMEOUT_MS)
    ff.stdout.on('data', (c: Buffer) => chunks.push(c))
    ff.on('error', () => { clearTimeout(timer); resolve(null) })
    ff.on('close', () => {
      clearTimeout(timer)
      const data = Buffer.concat(chunks)
      resolve(data.length > 0 ? data : null)
    })
  })
}

/** Mean and standard deviation of luma over a small downscale of the frame. */
function measure(jpeg: Buffer): { mean: number; spread: number } {
  const img = nativeImage.createFromBuffer(jpeg).resize({ width: 32 })
  const px = img.toBitmap() // BGRA
  const lumas: number[] = []
  for (let i = 0; i + 2 < px.length; i += 4) lumas.push(0.114 * px[i] + 0.587 * px[i + 1] + 0.299 * px[i + 2])
  if (lumas.length === 0) return { mean: 0, spread: 0 }
  const mean = lumas.reduce((a, b) => a + b, 0) / lumas.length
  const spread = Math.sqrt(lumas.reduce((a, b) => a + (b - mean) ** 2, 0) / lumas.length)
  return { mean, spread }
}

async function grabBestFrame(file: string, durationSec: number, width: number): Promise<Buffer | null> {
  const times = durationSec > 60 ? CANDIDATES.map((f) => f * durationSec) : FALLBACK_SECONDS
  let best: { data: Buffer; score: number } | null = null
  for (const t of times) {
    const data = await grabAt(file, t, width)
    if (!data) continue
    const { mean, spread } = measure(data)
    if (mean >= MIN_BRIGHTNESS && spread >= MIN_SPREAD) return data
    // Keep the least-bad frame in case every candidate is dark.
    const score = mean + spread
    if (!best || score > best.score) best = { data, score }
  }
  return best?.data ?? null
}

// Two queues. Rows on screen run up to four grabs at once (measured: six
// grabs take 421 ms four at a time against 564 ms two at a time). Background
// filling takes a single slot, and only when no row is waiting, so it never
// delays what the viewer is looking at. Both run in arrival order, which for
// rows is the order they scroll into view.
const MAX_CONCURRENT = 4
let running = 0
const onScreen: (() => void)[] = []
const background: (() => void)[] = []
const inFlight = new Map<string, { promise: Promise<Buffer | null>; promote: () => void }>()

function pump(): void {
  while (running < MAX_CONCURRENT && onScreen.length > 0) onScreen.shift()!()
  if (running === 0 && background.length > 0) background.shift()!()
}

function runQueued<T>(task: () => Promise<T>, isBackground: boolean): { promise: Promise<T>; promote: () => void } {
  let start: () => void = () => {}
  const promise = new Promise<T>((resolve, reject) => {
    start = (): void => {
      running++
      task().then(resolve, reject).finally(() => {
        running--
        pump()
      })
    }
    ;(isBackground ? background : onScreen).push(start)
    pump()
  })
  // Moves a background grab that has not started yet to the on-screen queue.
  const promote = (): void => {
    const i = background.indexOf(start)
    if (i === -1) return
    background.splice(i, 1)
    onScreen.push(start)
    pump()
  }
  return { promise, promote }
}

/**
 * A representative still from the video, or null if ffmpeg could not produce
 * one. A row asking for a frame the background fill already has queued or
 * running shares that grab, moved ahead of the background queue if it has
 * not started, rather than starting another.
 */
export function grabEpisodeFrame(file: string, durationSec: number, width: number, isBackground = false): Promise<Buffer | null> {
  const key = `${width}|${file}`
  const pending = inFlight.get(key)
  if (pending) {
    if (!isBackground) pending.promote()
    return pending.promise
  }
  const job = runQueued(() => grabBestFrame(file, durationSec, width), isBackground)
  const promise = job.promise.finally(() => inFlight.delete(key))
  inFlight.set(key, { promise, promote: job.promote })
  return promise
}
