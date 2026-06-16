/**
 * Derive the archive target — a path relative to the drive's `media/` folder —
 * from an absolute media file path on the vault.
 *
 * For series-based categories (tv/anime/manga/comics/youtube) we archive the
 * top-level series folder, since chapters/episodes belong together. For
 * standalone categories (movies/music/books/games) the archive target is the
 * file's immediate parent folder.
 */
const SERIES_CATEGORIES = new Set(['tv', 'anime', 'manga', 'comics', 'youtube'])

export function deriveArchiveRelPath(absFilePath: string, category: string): string | null {
  // Normalize separators
  const norm = absFilePath.replace(/\\/g, '/')
  // Find the "media/" segment marker
  const idx = norm.toLowerCase().indexOf('/media/')
  if (idx < 0) return null
  const tail = norm.slice(idx + '/media/'.length) // e.g. 'tv/Naruto/Season 01/Episode 1.mkv'
  const segments = tail.split('/').filter(Boolean)
  if (segments.length < 2) return null

  if (SERIES_CATEGORIES.has(category)) {
    // <category>/<series>  → e.g. 'tv/Naruto'
    return `${segments[0]}/${segments[1]}`
  }
  // <category>/<...>/<file>  → drop the file, keep the rest
  // For movies/music/books/games we go up one level from the file.
  return segments.slice(0, -1).join('/')
}

export function archiveDisplayName(relPath: string): string {
  const parts = relPath.split('/')
  return parts[parts.length - 1] || relPath
}
