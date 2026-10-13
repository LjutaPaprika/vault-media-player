// A show's folder and the watchorder.txt in it. Read by the show page (over
// IPC) and by Home, which must list a show's episodes in the same order to
// offer the same one next.

import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import type { WatchOrder } from '../renderer/src/utils/episodeOrder'

/** The show's folder under media/<category>, matched as the scanner names the show. */
export function resolveSeriesDir(root: string, seriesTitle: string, category: string): string | null {
  const categoryDir = join(root, 'media', category)
  const direct = join(categoryDir, seriesTitle)
  if (existsSync(direct)) return direct
  try {
    const match = readdirSync(categoryDir, { withFileTypes: true }).find((d) => {
      if (!d.isDirectory()) return false
      const processed = d.name
        .replace(/\s*\(\d{4}\).*$/, '')
        .replace(/\s*\[.*?\]/g, '')
        .replace(/\./g, ' ')
        .trim()
      return processed === seriesTitle
    })
    return match ? join(categoryDir, match.name) : null
  } catch { return null }
}

/**
 * The show's watchorder.txt: one section per line at the outer indent, with
 * the items to order within it indented beneath. Null when there is none.
 */
export function readWatchOrder(root: string, seriesTitle: string, category: string): WatchOrder | null {
  const seriesDir = resolveSeriesDir(root, seriesTitle, category)
  if (!seriesDir) return null

  const filePath = join(seriesDir, 'watchorder.txt')
  if (!existsSync(filePath)) return null

  const sectionOrder: string[] = []
  const itemOrder: Record<string, string[]> = {}
  let currentSection: string | null = null

  const lines = readFileSync(filePath, 'utf8').split(/\r?\n/).filter((l) => l.trim())

  // Use relative indentation — whatever the minimum indent is counts as the section level
  const minIndent = lines.reduce((min, l) => Math.min(min, l.match(/^(\s*)/)?.[1].length ?? 0), Infinity)

  for (const line of lines) {
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0
    const trimmed = line.trim()
    if (indent === minIndent) {
      currentSection = trimmed
      sectionOrder.push(trimmed)
    } else if (currentSection) {
      ;(itemOrder[currentSection.toLowerCase()] ??= []).push(trimmed)
    }
  }

  return { sectionOrder, itemOrder }
}
