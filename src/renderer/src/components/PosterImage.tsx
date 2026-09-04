import { memo, useState } from 'react'
import styles from './MediaGrid.module.css'

interface Props {
  filePath: string
  title: string
  /**
   * Width to request, in device pixels — roughly twice the CSS width the art is
   * displayed at, to cover high-DPI panels. Defaults to the shelf card size.
   * Surfaces showing art larger than a shelf card MUST pass their own value or
   * the thumbnail is upscaled and looks blurry. Clamped server-side to a small
   * set of allowed widths.
   */
  width?: number
}

/**
 * Build a custom-protocol URL for a local file.
 *
 * Each path segment is encoded separately rather than running encodeURI over
 * the whole string: encodeURI leaves # ? and & intact, so a poster named
 * "Hits #1.jpg" would truncate at the fragment and 404. Splitting on both
 * separators first keeps the slashes as separators while escaping everything
 * else, including the fullwidth characters (：｜) this library uses in place of
 * the ones Windows forbids in filenames.
 */
function protocolUrl(scheme: string, filePath: string, width?: number): string {
  // thumb:// carries the requested width in the host position; media:// has no
  // host. Both then take the file path, encoded segment by segment.
  const host = scheme === 'thumb' && width ? String(width) : ''
  return `${scheme}://${host}/` + filePath.split(/[/\\]/).map(encodeURIComponent).join('/')
}

/**
 * Renders shelf artwork from a downscaled, cached thumbnail.
 *
 * Two earlier shapes of this component were both wrong in instructive ways:
 *
 * 1. Reading each poster in the main process, base64-encoding it, and handing
 *    the renderer a data URI. 243 of those held ~125 MB of live JS strings, and
 *    the synchronous reads blocked the main process for 72 ms at a stretch.
 *
 * 2. Pointing <img> straight at the full-size file over media://. That fixed
 *    both of the above, but posters still visibly streamed in, because the
 *    files are far larger than the cards: 99% are wider than 310px, the largest
 *    is 2764px, and a shelf pulled 79.7 MB off the drive to paint cards 155 CSS
 *    px wide.
 *
 * thumb:// serves a 310px JPEG generated once and cached in the database —
 * about 6 MB for the whole movies shelf instead of 79.7 MB, 12.7x less to read.
 *
 * Deliberately no loading="lazy". It reduces work further, but a shelf then
 * fills in placeholder-first as you scroll, which reads as the app being slow
 * even while it does less.
 */
const PosterImage = memo(function PosterImage({ filePath, title, width = 310 }: Props): JSX.Element {
  // Remember WHICH path failed, not merely that one did: if a rescan swaps the
  // artwork for this item, the new path deserves a fresh attempt rather than
  // inheriting the old one's failure.
  const [failedPath, setFailedPath] = useState<string | null>(null)
  // A thumbnail can fail while the source is perfectly fine — an image format
  // nativeImage cannot decode, for instance. Falling back to the full file
  // keeps the shelf correct at the cost of one large read, rather than showing
  // a placeholder for artwork that exists.
  // Tracked per path, like failedPath above, so a rescan that swaps artwork
  // gets a fresh thumbnail attempt instead of inheriting the fallback.
  const [fullPath, setFullPath] = useState<string | null>(null)

  if (failedPath === filePath) {
    return <div className={styles.placeholder}>{title.charAt(0)}</div>
  }
  const useFull = fullPath === filePath

  return (
    <img
      src={protocolUrl(useFull ? 'media' : 'thumb', filePath, width)}
      alt={title}
      draggable={false}
      decoding="async"
      onError={() => (useFull ? setFailedPath(filePath) : setFullPath(filePath))}
    />
  )
})

export default PosterImage
