import { isAbsolute, relative } from 'path'

/**
 * The watchlist's key for a series folder: its path inside the library, with
 * forward slashes, NFC and lower case ("media/manga/kagurabachi"). Readable on
 * purpose, unlike progressKey's hash, so the table can be checked by eye. The
 * same folder gets the same key under E:\ or F:\ on Windows and /Volumes/VAULT
 * on a Mac, so a watched series stays watched wherever the drive is plugged in.
 * null for a folder outside the library (or the root itself).
 */
export function watchKey(root: string, folder: string): string | null {
  const unify = (p: string): string => p.replace(/\\/g, '/')
  const rel = relative(unify(root), unify(folder))
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
  return unify(rel).replace(/\/+$/, '').normalize('NFC').toLowerCase()
}
