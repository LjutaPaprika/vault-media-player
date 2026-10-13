/**
 * The order a show's episodes are listed in: seasons by number, then the
 * sub-series sections ("S1 Specials", "Movies"), each by episode, unless the
 * show's watchorder.txt says otherwise. Shared by the show's page and Home,
 * so the episode Home offers next is the row below on the page.
 */

import type { ParsedEpisode } from './episodes'

/** A show's watchorder.txt: its sections in order, and any items ordered within one. */
export interface WatchOrder {
  sectionOrder: string[]
  /** Keyed by lowercased section label. */
  itemOrder: Record<string, string[]>
}

/** The sub-series label of each section that has one. */
export function subLabelsOf(parsed: ParsedEpisode[]): Map<number, string> {
  const m = new Map<number, string>()
  for (const ep of parsed) {
    if (ep.subLabel && !m.has(ep.season)) m.set(ep.season, ep.subLabel)
  }
  return m
}

export function sectionLabel(seasonNum: number, subLabels: Map<number, string>): string {
  return subLabels.get(seasonNum) ?? (seasonNum === 0 ? 'Movies / Specials' : `Season ${seasonNum}`)
}

/** Sections in the order the page shows them, each with its episodes in order. */
export function orderSeasons(parsed: ParsedEpisode[], watchOrder: WatchOrder | null): [number, ParsedEpisode[]][] {
  const seasons = new Map<number, ParsedEpisode[]>()
  const bySeason = [...parsed].sort((a, b) => a.season !== b.season ? a.season - b.season : a.episode - b.episode)
  for (const ep of bySeason) {
    if (!seasons.has(ep.season)) seasons.set(ep.season, [])
    seasons.get(ep.season)!.push(ep)
  }
  const subLabels = subLabelsOf(parsed)

  // Default: sort each section by episode number, then file path as tiebreaker
  let entries = Array.from(seasons.entries()).map(([seasonNum, eps]) => [
    seasonNum,
    [...eps].sort((a, b) =>
      a.episode !== b.episode ? a.episode - b.episode : a.filePath.localeCompare(b.filePath)
    ),
  ] as [number, ParsedEpisode[]])

  if (watchOrder) {
    // Order sections
    entries = entries.sort(([a], [b]) => {
      const ai = watchOrder.sectionOrder.findIndex((l) => l.toLowerCase() === sectionLabel(a, subLabels).toLowerCase())
      const bi = watchOrder.sectionOrder.findIndex((l) => l.toLowerCase() === sectionLabel(b, subLabels).toLowerCase())
      return (ai === -1 ? Infinity : ai) - (bi === -1 ? Infinity : bi)
    })

    // Order items within sections that have explicit item lists
    entries = entries.map(([seasonNum, eps]) => {
      const order = watchOrder.itemOrder[sectionLabel(seasonNum, subLabels).toLowerCase()]
      if (!order?.length) return [seasonNum, eps] as [number, ParsedEpisode[]]
      const sorted = [...eps].sort((a, b) => {
        const ai = order.findIndex((t) => t.toLowerCase() === a.title.toLowerCase())
        const bi = order.findIndex((t) => t.toLowerCase() === b.title.toLowerCase())
        if (ai === -1 && bi === -1) return 0
        if (ai === -1) return 1
        if (bi === -1) return -1
        return ai - bi
      })
      return [seasonNum, sorted] as [number, ParsedEpisode[]]
    })
  }

  return entries
}
