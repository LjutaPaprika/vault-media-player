/**
 * Where a YouTube download goes, shared by the YouTube page (videos) and the
 * Music page (tracks), and by the main process, which checks a playlist name
 * again before making a folder of it. Pure, so it is unit-tested.
 *
 * A playlist is a folder: media/youtube/<name> or media/music/<name>.
 */

export type PlaylistTarget =
  | { kind: 'none' }                      // YouTube only: a loose video
  | { kind: 'existing'; name: string }
  | { kind: 'new'; name: string }

export type NameCheck =
  | { ok: true; name: string }
  /** The name is one the drive already has, ignoring case: use that one. */
  | { ok: false; existing: string }
  | { ok: false; error: string }

// Characters Windows (and the drive's exFAT) refuse in a folder name, and the
// path separators, which would make a subfolder instead.
const BAD_CHARS = /[\\/:*?"<>|\u0000-\u001f]/
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(\..*)?$/i
const MAX_LENGTH = 100

/** Whether `raw` can name a new playlist folder next to `existing`. */
export function checkPlaylistName(raw: string, existing: readonly string[]): NameCheck {
  const name = raw.replace(/\s+/g, ' ').trim()
  if (!name) return { ok: false, error: 'Enter a name for the playlist.' }
  if (BAD_CHARS.test(name)) return { ok: false, error: 'A playlist name can\'t contain \\ / : * ? " < > |' }
  if (name === '.' || name === '..' || name.endsWith('.')) return { ok: false, error: 'A playlist name can\'t end with a full stop.' }
  if (RESERVED.test(name)) return { ok: false, error: `Windows reserves the name “${name}”. Try another.` }
  if (name.length > MAX_LENGTH) return { ok: false, error: `Keep the name under ${MAX_LENGTH} characters.` }
  const match = existing.find((e) => e.toLowerCase() === name.toLowerCase())
  if (match) return { ok: false, existing: match }
  return { ok: true, name }
}

/**
 * The number the next track added to a music playlist gets: one past the
 * highest leading number among its files ("17 - Song.mp3"), or 1 if none has one.
 */
export function nextTrackNumber(fileNames: readonly string[]): number {
  let next = 1
  for (const f of fileNames) {
    const m = f.match(/^(\d+)/)
    if (m) next = Math.max(next, parseInt(m[1], 10) + 1)
  }
  return next
}

/**
 * yt-dlp's track-number field for a whole YouTube playlist added to a music
 * playlist that already holds tracks, so the new ones continue its numbering
 * instead of starting again at 01. Uses yt-dlp's template arithmetic.
 */
export function playlistIndexField(firstNumber: number): string {
  const offset = Math.max(0, firstNumber - 1)
  return offset === 0 ? '%(playlist_index)02d' : `%(playlist_index+${offset})02d`
}

function plural(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}

export interface DestinationInput {
  target: PlaylistTarget
  /** 'video' on the YouTube page, 'track' on the Music page. */
  noun: 'video' | 'track'
  /** How many links are queued; null for a whole YouTube playlist. */
  count: number | null
  /** Items already in the chosen existing playlist. */
  existingCount?: number
  /** Music only: the number the first added track will get. */
  firstNumber?: number
}

/** One plain sentence saying what pressing the button will do. */
export function describeDestination({ target, noun, count, existingCount, firstNumber }: DestinationInput): string {
  // Nothing queued yet still gets a sentence, so the choice reads the same
  // before and after the first link goes in.
  const what = count === null ? `Every ${noun} in the YouTube playlist`
    : count === 0 ? `The ${noun}s you add`
    : plural(count, noun)
  if (target.kind === 'none') {
    return `${what} will be saved on ${count === 1 ? 'its' : 'their'} own, outside any playlist.`
  }
  if (target.kind === 'new') {
    const name = target.name.replace(/\s+/g, ' ').trim()
    return name
      ? `${what} will be saved in a new playlist, “${name}”.`
      : `${what} will be saved in a new playlist.`
  }
  const has = existingCount !== undefined ? ` (${plural(existingCount, noun)} now)` : ''
  if (noun === 'track' && firstNumber !== undefined) {
    const numbering = count === null || count === 0
      ? `, numbered from ${firstNumber}`
      : count === 1
        ? ` as track ${firstNumber}`
        : ` as tracks ${firstNumber}–${firstNumber + count - 1}`
    return `${what} will be added to ${target.name}${has}${numbering}.`
  }
  return `${what} will be added to ${target.name}${has}.`
}
