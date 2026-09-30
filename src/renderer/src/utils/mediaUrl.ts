/**
 * URLs for the app's custom protocols (see main/index.ts), built in one place.
 *
 * Each path segment is encoded separately rather than running encodeURI over
 * the whole string: encodeURI leaves # ? and & intact, so a file named
 * "Hits #1.jpg" — or the track "... September 7th at 15#33 - fancy.mp3" —
 * would truncate at the fragment and 404. Splitting on both separators first
 * keeps the slashes as separators while escaping everything else, including
 * the fullwidth characters (：｜) this library uses in place of the ones
 * Windows forbids in filenames.
 */
export function protocolUrl(scheme: 'media' | 'thumb', filePath: string, width?: number): string {
  // thumb:// carries the requested width in the host position; media:// has no
  // host. Both then take the file path, encoded segment by segment.
  const host = scheme === 'thumb' && width ? String(width) : ''
  return `${scheme}://${host}/` + filePath.split(/[/\\]/).map(encodeURIComponent).join('/')
}

/** A local file, streamed whole (with seeking) over media://. */
export function mediaUrl(filePath: string): string {
  return protocolUrl('media', filePath)
}
