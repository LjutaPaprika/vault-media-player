import { nativeImage } from 'electron'
import { normalize } from 'path'
import { existsSync, statSync } from 'fs'
import { cacheKey, cachedKeys, cacheStats, clearFailure, failedKeys, getCached, importCached, knownFailure, pruneCached, putCached, recordFailure } from './cacheDb'
import { dropLegacyThumbnailsAndCompact, getTechInfo, readLegacyThumbnails } from './database'
import { ffmpegUsable, grabEpisodeFrame, isVideoPath } from './episodeFrames'

/**
 * Shelf artwork is downscaled once and cached, because the source files are
 * enormously larger than the cards that display them.
 *
 * A poster card renders at 155 CSS px wide. Measured across this library, 99%
 * of posters are wider than 310px and the largest is 2764px — so painting a
 * shelf pulled 129 MB off the drive to fill roughly 14 MB worth of pixels.
 * That mismatch, not IPC or encoding, is why posters visibly streamed in.
 *
 * 310px is the card width doubled, which covers high-DPI panels; 4K monitors at
 * 150% scaling put the real backing store near 233px.
 */
export const THUMB_WIDTH = 310

/**
 * Widths a caller may request, in device pixels.
 *
 * Surfaces differ far more than a single size can serve: shelf cards are
 * minmax(155px), YouTube 260px and the music grid 360px, and at 150% display
 * scaling a 360px card needs ~540 device pixels. Serving everything at 310
 * left music art upscaled ~1.7x and visibly blurry, while serving everything
 * at 720 cost 66 MB against 18 MB for the same library — most of it wasted on
 * the shelves that only ever needed 310.
 *
 * Requests are clamped to this list rather than honoured freely, so a stray
 * width cannot fill the cache with near-duplicate encodings of every poster.
 */
export const ALLOWED_THUMB_WIDTHS = [310, 520, 640, 720] as const

export function normaliseThumbWidth(raw: number): number {
  if (!Number.isFinite(raw)) return THUMB_WIDTH
  // Round up to the first allowed width that covers the request, so a caller
  // never receives fewer pixels than it asked for.
  return ALLOWED_THUMB_WIDTHS.find((w) => w >= raw) ?? ALLOWED_THUMB_WIDTHS[ALLOWED_THUMB_WIDTHS.length - 1]
}

/** JPEG quality. 82 is the knee of the curve here: visually clean, ~30 KB. */
const THUMB_QUALITY = 82

/**
 * Anything at or below this width is re-encoded but not downscaled — resizing
 * an already-card-sized image costs CPU to save nothing and only loses detail.
 */
const PASSTHROUGH_MARGIN = 40

/**
 * sharp is the primary encoder because Electron's nativeImage cannot decode
 * WebP at all — measured on this library, 0 of 84 WebP posters decoded, while
 * every JPEG and PNG succeeded. Since 84 of 567 posters are WebP, nativeImage
 * alone would leave a seventh of the library loading at full size.
 *
 * It is required lazily and guarded: sharp is a native module that must be
 * unpacked from the asar to load, and if that ever regresses in packaging we
 * want degraded thumbnails rather than an app that cannot render a shelf.
 */
type SharpModule = typeof import('sharp')
let sharpModule: SharpModule | null | undefined

function getSharp(): SharpModule | null {
  if (sharpModule !== undefined) return sharpModule
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    sharpModule = require('sharp') as SharpModule
    sharpModule.cache(false) // shelf artwork is read once; its cache adds nothing
  } catch (e) {
    console.error('[vault] sharp unavailable, falling back to nativeImage (no WebP):', e)
    sharpModule = null
  }
  return sharpModule
}

export interface ThumbResult {
  data: Buffer
  mime: string
  fromCache: boolean
}

/** Encode with nativeImage. Cannot handle WebP; returns null when it can't decode. */
function encodeWithNativeImage(sourcePath: string, targetWidth: number): Buffer | null {
  let img: Electron.NativeImage
  try {
    img = nativeImage.createFromPath(sourcePath)
  } catch {
    return null
  }
  // nativeImage returns an empty image rather than throwing for formats it
  // cannot decode, so this is the real "unsupported or corrupt" branch.
  if (img.isEmpty()) return null

  const { width } = img.getSize()
  const out =
    width > 0 && width <= targetWidth + PASSTHROUGH_MARGIN
      ? img.toJPEG(100)
      : img.resize({ width: targetWidth, quality: 'good' }).toJPEG(THUMB_QUALITY)
  return out.length ? out : null
}

/** Encode with sharp. Handles WebP, AVIF and anything else libvips supports. */
async function encodeWithSharp(sourcePath: string, sharp: SharpModule, targetWidth: number): Promise<Buffer | null> {
  try {
    const pipeline = sharp(sourcePath, { failOn: 'none' })
    const meta = await pipeline.metadata()
    const width = meta.width ?? 0

    return await sharp(sourcePath, { failOn: 'none' })
      // Honour EXIF orientation before resizing, or a rotated source would be
      // measured and cropped along the wrong axis.
      .rotate()
      .resize(
        width > 0 && width <= targetWidth + PASSTHROUGH_MARGIN
          ? undefined
          : { width: targetWidth, withoutEnlargement: true }
      )
      .jpeg({ quality: THUMB_QUALITY, mozjpeg: true })
      .toBuffer()
  } catch {
    return null
  }
}

/**
 * Get a thumbnail for `sourcePath`, generating and caching it on first use.
 *
 * Returns null when the file is missing or no encoder can decode it, which the
 * caller turns into a 404 so the renderer falls back to its placeholder.
 *
 * When a new image cannot be made but an older one is cached, the older one
 * is served: a Mac without ffmpeg shows the stills a Windows machine grabbed
 * instead of empty boxes, whatever it makes of their timestamps.
 */
export async function getOrCreateThumb(
  sourcePath: string,
  requestedWidth: number = THUMB_WIDTH,
  /** Episode stills only: queue behind anything a visible row is waiting for. */
  background = false
): Promise<ThumbResult | null> {
  // thumb:// URLs arrive with forward slashes on Windows ("E:/media/..."),
  // library rows with backslashes. The cache key is spelling-independent
  // (see cacheKey), but the duration lookup below needs the row's spelling.
  sourcePath = normalize(sourcePath)
  const width = normaliseThumbWidth(requestedWidth)
  let mtime: number
  try {
    mtime = Math.floor(statSync(sourcePath).mtimeMs)
  } catch {
    return null
  }

  // No key means the library root is unknown: generate, but cache nothing
  // rather than file it under a path that will not match next time.
  const key = cacheKey(sourcePath)
  const cached = key ? getCached(key, mtime, width) : null
  if (cached?.fresh) return { data: cached.data, mime: 'image/jpeg', fromCache: true }

  let data: Buffer | null
  if (isVideoPath(sourcePath)) {
    // An episode row's still: a frame from the video rather than artwork.
    // A file that already failed, unchanged since, is not grabbed again.
    if (key && knownFailure(key, mtime)) {
      return cached ? { data: cached.data, mime: 'image/jpeg', fromCache: true } : null
    }
    data = await grabEpisodeFrame(sourcePath, getTechInfo(sourcePath)?.duration ?? 0, width, background)
    if (key) {
      if (data) clearFailure(key)
      // Only held against the file when ffmpeg itself works; a missing tool
      // is not the file's fault.
      else if (ffmpegUsable()) recordFailure(key, mtime)
    }
  } else {
    const sharp = getSharp()
    data = sharp
      ? ((await encodeWithSharp(sourcePath, sharp, width)) ?? encodeWithNativeImage(sourcePath, width))
      : encodeWithNativeImage(sourcePath, width)
  }
  if (!data) return cached ? { data: cached.data, mime: 'image/jpeg', fromCache: true } : null

  if (key) putCached(key, mtime, width, data)
  return { data, mime: 'image/jpeg', fromCache: false }
}

/**
 * Pre-generate thumbnails for a list of artwork paths.
 *
 * Called after a scan so shelves are instant on first view rather than encoding
 * as the user scrolls. Yields to the event loop periodically: encoding is
 * CPU-bound, and a tight loop over several hundred images would block the main
 * process for seconds — exactly the stall this change set exists to remove.
 */
export async function warmThumbs(
  paths: string[],
  onProgress?: (done: number, total: number) => void,
  width: number = THUMB_WIDTH
): Promise<{ created: number; cached: number; failed: number }> {
  let created = 0
  let cached = 0
  let failed = 0

  for (let i = 0; i < paths.length; i++) {
    const r = await getOrCreateThumb(paths[i], width)
    if (!r) failed++
    else if (r.fromCache) cached++
    else created++

    if (onProgress && (i % 25 === 0 || i === paths.length - 1)) onProgress(i + 1, paths.length)
    if (i % 5 === 4) await new Promise((resolve) => setImmediate(resolve))
  }

  return { created, cached, failed }
}

/** Episode stills are requested at this width by the show page's rows. */
export const EPISODE_STILL_WIDTH = 310

let fillingStills = false

/**
 * Grabs stills for episodes that have none yet, one at a time in the
 * background, so a show opens with its rows already filled in.
 *
 * Yields to any row on screen (see grabEpisodeFrame's queues) and waits while
 * `isPaused` says a video is playing: ffmpeg reading the library drive while
 * mpv streams from it could make playback stutter. A second call while one is
 * running is ignored.
 *
 * A file that yields no still (damaged, say) is recorded and skipped; the
 * fill carries on past it. It stops only for what would fail every file:
 * ffmpeg not runnable (the macOS player folder ships without one), or the
 * episodes' files no longer being there (the drive went away mid-fill).
 */
const MISSING_FILES_IN_A_ROW = 10

export async function fillEpisodeStills(
  paths: string[],
  isPaused: () => boolean
): Promise<{ created: number; failed: number; stopped: 'no-ffmpeg' | 'files-missing' | null } | null> {
  if (fillingStills || paths.length === 0) return null
  if (!ffmpegUsable()) return { created: 0, failed: 0, stopped: 'no-ffmpeg' }
  fillingStills = true
  let created = 0
  let failed = 0
  let missingInARow = 0
  let stopped: 'files-missing' | null = null
  try {
    for (const p of paths) {
      while (isPaused()) await new Promise((resolve) => setTimeout(resolve, 5000))
      if (!existsSync(p)) {
        if (++missingInARow >= MISSING_FILES_IN_A_ROW) { stopped = 'files-missing'; break }
        continue
      }
      missingInARow = 0
      const r = await getOrCreateThumb(p, EPISODE_STILL_WIDTH, true)
      if (!r) failed++
      else if (!r.fromCache) created++
    }
  } finally {
    fillingStills = false
  }
  return { created, failed, stopped }
}

/**
 * Of these episodes, the ones with no still cached yet and no recorded
 * failure. A failed file that changes (re-downloaded) gets its still the next
 * time its row is shown, since the failure only holds for the old mtime.
 */
export function episodesWithoutStill(paths: string[]): string[] {
  const have = cachedKeys()
  const failed = failedKeys()
  return paths.filter((p) => {
    const key = cacheKey(p)
    return key !== null && !have.has(key) && !failed.has(key)
  })
}

/**
 * Drops cached artwork for anything not in `keepPaths`. Does nothing if the
 * library root is unknown: every key would then look unwanted.
 */
export function pruneArtwork(keepPaths: string[]): number {
  const keep = new Set<string>()
  for (const p of keepPaths) {
    const key = cacheKey(p)
    if (!key) return 0
    keep.add(key)
  }
  return pruneCached(keep)
}

export const artworkStats = cacheStats

/**
 * One-time move of artwork cached inside library.db by builds before cache.db.
 *
 * Copies every entry across, confirms each landed, and only then empties the
 * old table and compacts library.db. Safe to interrupt anywhere: the copy is
 * idempotent and nothing is deleted until it is confirmed, so the next launch
 * simply finishes the job. Returns null when there was nothing to move or the
 * library root is unknown (the move then waits for a launch that knows it).
 */
export function moveLegacyThumbnails(): { moved: number; duplicates: number; bytesBefore: number; bytesAfter: number } | null {
  const legacy = readLegacyThumbnails()
  if (legacy.length === 0) return null
  const rows: { key: string; mtime: number; width: number; data: Buffer }[] = []
  for (const t of legacy) {
    const key = cacheKey(normalize(t.sourcePath))
    if (!key) return null
    rows.push({ key, mtime: t.mtime, width: t.width, data: t.data })
  }
  const moved = importCached(rows)
  const have = cachedKeys()
  if (rows.some((r) => !have.has(r.key))) return null
  const { bytesBefore, bytesAfter } = dropLegacyThumbnailsAndCompact()
  return { moved, duplicates: rows.length - moved, bytesBefore, bytesAfter }
}
