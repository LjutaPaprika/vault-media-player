import { nativeImage } from 'electron'
import { statSync } from 'fs'
import { getThumb, putThumb } from './database'

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

/** JPEG quality. 82 is the knee of the curve here: visually clean, ~30 KB. */
const THUMB_QUALITY = 82

/**
 * Anything at or below this width is re-encoded but not downscaled — resizing
 * an already-card-sized image costs CPU to save nothing and only loses detail.
 */
const PASSTHROUGH_WIDTH = THUMB_WIDTH + 40

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
function encodeWithNativeImage(sourcePath: string): Buffer | null {
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
    width > 0 && width <= PASSTHROUGH_WIDTH
      ? img.toJPEG(100)
      : img.resize({ width: THUMB_WIDTH, quality: 'good' }).toJPEG(THUMB_QUALITY)
  return out.length ? out : null
}

/** Encode with sharp. Handles WebP, AVIF and anything else libvips supports. */
async function encodeWithSharp(sourcePath: string, sharp: SharpModule): Promise<Buffer | null> {
  try {
    const pipeline = sharp(sourcePath, { failOn: 'none' })
    const meta = await pipeline.metadata()
    const width = meta.width ?? 0

    return await sharp(sourcePath, { failOn: 'none' })
      // Honour EXIF orientation before resizing, or a rotated source would be
      // measured and cropped along the wrong axis.
      .rotate()
      .resize(
        width > 0 && width <= PASSTHROUGH_WIDTH
          ? undefined
          : { width: THUMB_WIDTH, withoutEnlargement: true }
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
 */
export async function getOrCreateThumb(sourcePath: string): Promise<ThumbResult | null> {
  let mtime: number
  try {
    mtime = Math.floor(statSync(sourcePath).mtimeMs)
  } catch {
    return null
  }

  const cached = getThumb(sourcePath, mtime, THUMB_WIDTH)
  if (cached) return { data: cached.data, mime: 'image/jpeg', fromCache: true }

  const sharp = getSharp()
  const data = sharp
    ? ((await encodeWithSharp(sourcePath, sharp)) ?? encodeWithNativeImage(sourcePath))
    : encodeWithNativeImage(sourcePath)
  if (!data) return null

  putThumb(sourcePath, mtime, THUMB_WIDTH, data)
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
  onProgress?: (done: number, total: number) => void
): Promise<{ created: number; cached: number; failed: number }> {
  let created = 0
  let cached = 0
  let failed = 0

  for (let i = 0; i < paths.length; i++) {
    const r = await getOrCreateThumb(paths[i])
    if (!r) failed++
    else if (r.fromCache) cached++
    else created++

    if (onProgress && (i % 25 === 0 || i === paths.length - 1)) onProgress(i + 1, paths.length)
    if (i % 5 === 4) await new Promise((resolve) => setImmediate(resolve))
  }

  return { created, cached, failed }
}
