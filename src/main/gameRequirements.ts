import { readFileSync } from 'fs'
import { basename, dirname, join } from 'path'

/**
 * A PC game's minimum specs, kept in its own game.json on the drive under
 * "requirements". They come from the game's store page (the publisher's own
 * "Minimum" list) and are written there when the game is set up, so they
 * travel with the game folder and read the same on every host. They're read
 * when the launch modal opens, not by the scanner, so an edit shows up without
 * a rescan.
 *
 *   "requirements": {
 *     "source": "https://store.steampowered.com/app/2420110",
 *     "checked": "2026-10-15",
 *     "cpu": "Intel Core i3-8100 / AMD Ryzen 3 1300X",
 *     "cpuThreads": 4,
 *     "avx2": false,
 *     "ramGB": 16,
 *     "gpu": "NVIDIA GeForce GTX 1650 4GB / AMD Radeon RX 5500 XT 4GB",
 *     "vramGB": 4
 *   }
 *
 * cpuThreads is the thread count of the weaker CPU the store lists. vramGB 0
 * means integrated graphics are enough. avx2 is set only where the publisher
 * documents it.
 */
export interface GameRequirements {
  source: string | null
  checked: string | null
  cpu: string | null
  cpuThreads: number | null
  avx2: boolean
  ramGB: number | null
  gpu: string | null
  vramGB: number | null
}

/** The games/pc/<game> folder an executable belongs to, however deep the exe sits. */
function pcGameDir(exePath: string): string | null {
  let dir = dirname(exePath)
  for (;;) {
    const parent = dirname(dir)
    if (parent === dir) return null
    if (basename(parent).toLowerCase() === 'pc' && basename(dirname(parent)).toLowerCase() === 'games') return dir
    dir = parent
  }
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null)
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null)

export function readGameRequirements(exePath: string): GameRequirements | null {
  const gameDir = pcGameDir(exePath)
  if (!gameDir) return null
  let meta: Record<string, unknown>
  try { meta = JSON.parse(readFileSync(join(gameDir, 'game.json'), 'utf-8')) } catch { return null }
  const r = meta.requirements
  if (!r || typeof r !== 'object') return null
  const req = r as Record<string, unknown>
  return {
    source:     str(req.source),
    checked:    str(req.checked),
    cpu:        str(req.cpu),
    cpuThreads: num(req.cpuThreads),
    avx2:       req.avx2 === true,
    ramGB:      num(req.ramGB),
    gpu:        str(req.gpu),
    vramGB:     num(req.vramGB)
  }
}
