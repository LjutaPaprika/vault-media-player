import { existsSync, readFileSync, writeFileSync, renameSync, rmSync, mkdirSync } from 'fs'
import { join, dirname, sep } from 'path'
import { hostname } from 'os'
import { execFileSync } from 'child_process'
import { playtimeEvents } from './playtime'

/**
 * Some games keep settings in the Windows registry rather than in files: Unity
 * PlayerPrefs (Rain World's key bindings, Star Ocean's display options) live
 * under HKCU\Software\<company>\<product>. A save link cannot redirect a
 * registry key, so those settings would stay on whichever PC they were made on.
 *
 * Instead the key is carried on the drive as a .reg file:
 *   - after each play session of the game, the key is exported to the drive;
 *   - before a launch, the drive copy is imported, unless this PC wrote it.
 *
 * "Unless this PC wrote it" is what makes the drive copy safe to trust. A
 * sidecar next to the .reg records which computer exported it. If it was this
 * one, this PC's registry is at least as new (newer, if a session's export was
 * missed), so nothing is imported. If another computer wrote it, its settings
 * are the latest and are imported. A PC that has never had the game simply
 * gets them.
 *
 * Entries live in the `registry` list of <driveRoot>/data/save-links.json:
 *   { "name": "Rain World", "key": "Software\\Videocult\\Rain World",
 *     "game": "games/pc/Rain World", "drive": "saves/_registry/Rain World.reg" }
 * `game` is the game's folder on the drive; a session of any executable inside
 * it triggers the export. Only keys under HKCU\Software are accepted.
 *
 * Windows only for now. The Mac runs these games under Wine, which has its own
 * registry; the same .reg files can be imported there with `wine reg import`.
 */

interface RegistryEntry {
  name: string
  key: string     // under HKCU, e.g. "Software\\Videocult\\Rain World"
  game: string    // game folder, relative to the drive root
  drive: string   // .reg file, relative to the drive root
}

interface Stamp { host: string; platform: string; at: string }

/** A path relative to the drive root that stays inside it. */
function insideDrive(rel: unknown): string[] | null {
  if (typeof rel !== 'string' || /^([a-z]:|[\\/])/i.test(rel)) return null
  const parts = rel.split(/[\\/]+/).filter(Boolean)
  return parts.length > 0 && !parts.includes('..') ? parts : null
}

function validEntry(e: Partial<RegistryEntry>): e is RegistryEntry {
  return typeof e?.name === 'string'
    && typeof e.key === 'string' && /^Software\\[^\\]/i.test(e.key) && !e.key.split('\\').includes('..')
    && insideDrive(e.game) !== null
    && insideDrive(e.drive) !== null && /\.reg$/i.test(e.drive as string)
}

function readEntries(driveRoot: string): RegistryEntry[] {
  const manifestPath = join(driveRoot, 'data', 'save-links.json')
  if (!existsSync(manifestPath)) return []
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { registry?: Partial<RegistryEntry>[] }
    const entries = Array.isArray(parsed.registry) ? parsed.registry : []
    return entries.filter((e): e is RegistryEntry => {
      if (validEntry(e)) return true
      console.warn(`[registry] ${e?.name ?? '(unnamed)'}: not a valid registry entry — skipped`)
      return false
    })
  } catch (err) {
    console.warn('[registry] manifest unreadable —', err)
    return []
  }
}

/** Entries whose game folder holds the launched file. */
function entriesFor(driveRoot: string, filePath: string): RegistryEntry[] {
  const file = filePath.toLowerCase()
  return readEntries(driveRoot).filter((e) => {
    const folder = join(driveRoot, ...insideDrive(e.game)!).toLowerCase()
    return file.startsWith(folder + sep)
  })
}

const regFile = (driveRoot: string, e: RegistryEntry): string => join(driveRoot, ...insideDrive(e.drive)!)
const stampFile = (reg: string): string => reg + '.json'

function readStamp(reg: string): Stamp | null {
  try { return JSON.parse(readFileSync(stampFile(reg), 'utf-8')) as Stamp } catch { return null }
}

const thisHost = (): Stamp => ({ host: hostname(), platform: process.platform, at: new Date().toISOString() })

/**
 * A .reg file can write anywhere it names, so before importing one, check that
 * every key in it is the entry's own key or below it. reg export writes UTF-16.
 */
function regStaysInKey(reg: string, key: string): boolean {
  const buf = readFileSync(reg)
  const text = buf[0] === 0xff && buf[1] === 0xfe ? buf.toString('utf16le') : buf.toString('utf-8')
  const root = `HKEY_CURRENT_USER\\${key}`.toLowerCase()
  const headers = text.split(/\r?\n/).filter((l) => l.startsWith('['))
  return headers.length > 0 && headers.every((h) => {
    const k = h.replace(/^\[-?/, '').replace(/\]\s*$/, '').toLowerCase()
    return k === root || k.startsWith(root + '\\')
  })
}

/**
 * Before a launch: bring in settings another computer saved to the drive.
 * Synchronous on purpose, so the game reads them on its first start. Never
 * throws; a failure leaves the PC's own settings as they were.
 */
export function restoreRegistrySettings(driveRoot: string, filePath: string): void {
  if (process.platform !== 'win32') return
  for (const e of entriesFor(driveRoot, filePath)) {
    const reg = regFile(driveRoot, e)
    if (!existsSync(reg)) continue
    const stamp = readStamp(reg)
    const me = thisHost()
    if (stamp && stamp.host === me.host && stamp.platform === me.platform) continue  // this PC wrote it
    try {
      if (!regStaysInKey(reg, e.key)) {
        console.warn(`[registry] ${e.name}: ${reg} writes outside HKCU\\${e.key} — not imported`)
        continue
      }
      execFileSync('reg', ['import', reg], { stdio: 'ignore', windowsHide: true })
      console.log(`[registry] ${e.name}: imported settings saved by ${stamp?.host ?? 'an unknown computer'}`)
    } catch (err) {
      console.warn(`[registry] ${e.name}: could not import ${reg} —`, err)
    }
  }
}

/**
 * After a session: copy the game's key to the drive. Written to a temporary
 * file first, so an export that fails part-way never replaces the good copy.
 * Synchronous because a session can end as Vault quits, and an export left
 * running then would be lost.
 */
export function saveRegistrySettings(driveRoot: string, filePath: string): void {
  if (process.platform !== 'win32') return
  for (const e of entriesFor(driveRoot, filePath)) {
    const reg = regFile(driveRoot, e)
    const tmp = reg + '.tmp'
    try {
      mkdirSync(dirname(reg), { recursive: true })
      execFileSync('reg', ['export', `HKCU\\${e.key}`, tmp, '/y'], { stdio: 'ignore', windowsHide: true })
      renameSync(tmp, reg)
      writeFileSync(stampFile(reg), JSON.stringify(thisHost(), null, 2))
      console.log(`[registry] ${e.name}: settings saved to the drive`)
    } catch {
      // Most often the key does not exist yet: the game has not saved any settings.
      rmSync(tmp, { force: true })
    }
  }
}

const watching = new Set<string>()

/** Save the game's settings to the drive once the session started for it ends. */
export function saveRegistrySettingsAfterSession(driveRoot: string, filePath: string): void {
  if (process.platform !== 'win32' || watching.has(filePath)) return
  if (entriesFor(driveRoot, filePath).length === 0) return
  watching.add(filePath)
  const onEnd = (payload: { filePath: string }): void => {
    if (payload.filePath !== filePath) return
    playtimeEvents.off('session-ended', onEnd)
    watching.delete(filePath)
    try { saveRegistrySettings(driveRoot, filePath) } catch (err) {
      console.warn('[registry] could not save settings —', err)
    }
  }
  playtimeEvents.on('session-ended', onEnd)
}
