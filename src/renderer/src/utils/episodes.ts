/**
 * Naming an episode the way the scanner recorded it. The scanner reads every
 * naming scheme on the drive ("S01E05", "Show_-_05_(…)", "01. Title", a
 * sub-series' "§Label§E05") into the episode's description; this turns that
 * back into a season, number and title. Shared by a show's page and Home, so
 * the two always name an episode alike.
 */

/** What an episode is parsed from: a library item, or Home's reference to one. */
export interface EpisodeSource {
  id: number
  title: string
  description: string | null
  filePath: string
}

export interface ParsedEpisode {
  id: number
  season: number
  episode: number
  badge: string
  title: string
  filePath: string
  subLabel?: string
}

function stableSeasonHash(name: string): number {
  let h = 5381
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) & 0x7fffffff
  return 100 + (h % 900)
}

/** An episode as the Continue button names it: "S01E03 · Title". */
export function episodeLabel(ep: ParsedEpisode): string {
  return [ep.subLabel, ep.badge, ep.title].filter(Boolean).join(' · ')
}

/** Just which episode: "S01E05", "Cognitive Computing · E01", else its title. */
export function episodeCode(ep: ParsedEpisode): string {
  return ep.badge ? [ep.subLabel, ep.badge].filter(Boolean).join(' · ') : ep.title
}

export function parseEpisode(item: EpisodeSource): ParsedEpisode {
  // Sub-series: "§Label§Exx", "§Label§Exx · Title", or "§Label§Plain Title" (no episode number)
  const subMatch = item.description?.match(/^§([^§]+)§(?:(E\d+)(?:\s*·\s*(.+))?|(.+))$/i)
  if (subMatch) {
    const [, subLabel, eCode, rawTitle, plainTitle] = subMatch
    if (eCode) {
      const ep = parseInt(eCode.slice(1), 10)
      return {
        id: item.id,
        season: stableSeasonHash(subLabel),
        episode: ep,
        badge: `E${String(ep).padStart(2, '0')}`,
        title: rawTitle ?? `Episode ${ep}`,
        filePath: item.filePath,
        subLabel
      }
    }
    return {
      id: item.id,
      season: stableSeasonHash(subLabel),
      episode: 0,
      badge: '',
      title: plainTitle,
      filePath: item.filePath,
      subLabel
    }
  }
  // Multi-episode range with title: "S01E01-02 · Title"
  const fullRange = item.description?.match(/^(S(\d+)E(\d+)-(\d+))\s*·\s*(.+)$/)
  if (fullRange) {
    return {
      id: item.id,
      season: parseInt(fullRange[2], 10),
      episode: parseInt(fullRange[3], 10),
      badge: fullRange[1],
      title: fullRange[5],
      filePath: item.filePath
    }
  }
  // Multi-episode range without title: "S01E01-02"
  const badgeRange = item.description?.match(/^(S(\d+)E(\d+)-(\d+))$/)
  if (badgeRange) {
    return {
      id: item.id,
      season: parseInt(badgeRange[2], 10),
      episode: parseInt(badgeRange[3], 10),
      badge: badgeRange[1],
      title: `Episodes ${parseInt(badgeRange[3], 10)}-${parseInt(badgeRange[4], 10)}`,
      filePath: item.filePath
    }
  }
  // Full format: "S01E01 · Title"
  const full = item.description?.match(/^(S(\d+)E(\d+))\s*·\s*(.+)$/)
  if (full) {
    return {
      id: item.id,
      season: parseInt(full[2], 10),
      episode: parseInt(full[3], 10),
      badge: full[1],
      title: full[4],
      filePath: item.filePath
    }
  }
  // Badge-only format: "S01E01" (no title in filename)
  const badge = item.description?.match(/^(S(\d+)E(\d+))$/)
  if (badge) {
    return {
      id: item.id,
      season: parseInt(badge[2], 10),
      episode: parseInt(badge[3], 10),
      badge: badge[1],
      title: `Episode ${parseInt(badge[3], 10)}`,
      filePath: item.filePath
    }
  }
  return { id: item.id, season: 0, episode: 0, badge: '', title: item.description ?? item.title, filePath: item.filePath }
}
