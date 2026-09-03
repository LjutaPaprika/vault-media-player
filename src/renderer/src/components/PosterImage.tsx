import { memo, useState } from 'react'
import styles from './MediaGrid.module.css'

interface Props {
  filePath: string
  title: string
}

/**
 * Build a media:// URL for a local file.
 *
 * Each path segment is encoded separately rather than running encodeURI over
 * the whole string: encodeURI leaves # ? and & intact, so a poster named
 * "Hits #1.jpg" would truncate at the fragment and 404. Splitting on both
 * separators first keeps the slashes as separators while escaping everything
 * else, including the fullwidth characters (：｜) used in place of the ones
 * Windows forbids in filenames.
 */
function mediaUrl(filePath: string): string {
  const segments = filePath.split(/[/\\]/)
  return 'media:///' + segments.map(encodeURIComponent).join('/')
}

/**
 * Renders a poster straight from disk via the media:// protocol.
 *
 * Deliberately does NOT round-trip through IPC. The previous version read each
 * poster in the main process, base64-encoded it, and handed the renderer a data
 * URI — 243 of those on the movies page came to ~128 MB of JavaScript strings
 * held live, which is what drove the GC pauses that froze scrolling.
 *
 * Letting Chromium fetch the file itself means:
 *   - no base64, a third of which was pure encoding overhead
 *   - no IPC traffic and no main-process work at all
 *   - loading="lazy" genuinely defers offscreen posters, so a shelf loads only
 *     what is on screen instead of all 243 up front
 *   - decoded bitmaps live in Chromium's image cache, which evicts under memory
 *     pressure by itself, rather than in the JS heap where nothing reclaims them
 */
const PosterImage = memo(function PosterImage({ filePath, title }: Props): JSX.Element {
  // Remember WHICH path failed, not merely that one did: if a rescan swaps the
  // artwork for this item, the new path deserves a fresh attempt rather than
  // inheriting the old one's failure.
  const [failedPath, setFailedPath] = useState<string | null>(null)

  if (failedPath === filePath) {
    return <div className={styles.placeholder}>{title.charAt(0)}</div>
  }

  return (
    <img
      src={mediaUrl(filePath)}
      alt={title}
      draggable={false}
      loading="lazy"
      decoding="async"
      onError={() => setFailedPath(filePath)}
    />
  )
})

export default PosterImage
