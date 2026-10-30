import { existsSync, readFileSync, writeFileSync, renameSync, rmSync, mkdirSync } from 'fs'
import { join, dirname, sep } from 'path'
import { hostname } from 'os'
import { execFileSync } from 'child_process'
import type { Parkable } from './sessionParking'

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
 * A PC that has the game itself (Steam) already has the key with its owner's
 * settings. Importing over it would replace them for good, so that key is set
 * aside for the session instead (registryParkablesForLaunch, see
 * sessionParking.ts): copied to `<key>.vault-host`, the drive's settings
 * imported, and afterwards the session's settings saved to the drive and the
 * owner's key put back. A key counts as the PC's own unless this PC exported
 * the drive copy (the stamp) or Vault created it here by importing into a PC
 * that had none (recorded in Vault's per-PC data folder).
 *
 * Windows only for now. The Mac runs these games under Wine, which has its own
 * registry; the same .reg files can be imported there with `wine reg import`.
 */

/** reg.exe behind an interface, so the rules above can be tested without touching the registry. */
export interface RegOps {
  exists(key: string): boolean
  copy(from: string, to: string): void
  remove(key: string): void
  importFile(file: string): void
  exportKey(key: string, file: string): void
}

const run = (args: string[]): void => { execFileSync('reg', args, { stdio: 'ignore', windowsHide: true }) }

export const realRegOps: RegOps = {
  exists: (key) => { try { run(['query', `HKCU\\${key}`]); return true } catch { return false } },
  copy: (from, to) => run(['copy', `HKCU\\${from}`, `HKCU\\${to}`, '/s', '/f']),
  remove: (key) => run(['delete', `HKCU\\${key}`, '/f']),
  importFile: (file) => run(['import', file]),
  exportKey: (key, file) => run(['export', `HKCU\\${key}`, file, '/y'])
}

export const PARKED_KEY_SUFFIX = '.vault-host'
const parkedKey = (key: string): string => key + PARKED_KEY_SUFFIX

/**
 * Keys Vault created on this PC by importing the drive's settings where there
 * were none. Kept in Vault's own per-PC folder, because the question is about
 * this PC. Losing the file only means a key is treated as the PC's own: parked
 * for the session rather than replaced, the safe direction.
 */
let stateDir: string | null = null
export function setRegistryStateDir(dir: string): void { stateDir = dir }

const CREATED = 'registry-keys-from-vault.json'
/**
 * Keys set aside right now. Recorded before the copy is made, so a crash at any
 * point leaves a trace, and startup finds leftovers by reading this file rather
 * than querying the registry for every entry (each query is a process spawn,
 * and spawns stall Vault).
 */
const SET_ASIDE = 'registry-keys-set-aside.json'

function readList(name: string): Set<string> {
  if (!stateDir) return new Set()
  try { return new Set((JSON.parse(readFileSync(join(stateDir, name), 'utf-8')) as string[]).map((k) => k.toLowerCase())) } catch { return new Set() }
}

function updateList(name: string, key: string, present: boolean): void {
  if (!stateDir) return
  const set = readList(name)
  if (present) set.add(key.toLowerCase())
  else set.delete(key.toLowerCase())
  try {
    mkdirSync(stateDir, { recursive: true })
    writeFileSync(join(stateDir, name), JSON.stringify([...set].sort(), null, 2))
  } catch (err) {
    console.warn(`[registry] could not update ${name} —`, err)
  }
}

const readManaged = (): Set<string> => readList(CREATED)
const addManaged = (key: string): void => updateList(CREATED, key, true)

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
export function restoreRegistrySettings(driveRoot: string, filePath: string, ops: RegOps = realRegOps): void {
  if (process.platform !== 'win32' && ops === realRegOps) return
  for (const e of entriesFor(driveRoot, filePath)) {
    const reg = regFile(driveRoot, e)
    if (!existsSync(reg)) continue
    const stamp = readStamp(reg)
    if (writtenHere(stamp)) continue  // this PC wrote it
    try {
      if (!regStaysInKey(reg, e.key)) {
        console.warn(`[registry] ${e.name}: ${reg} writes outside HKCU\\${e.key} — not imported`)
        continue
      }
      // A key that did not exist, with nothing of the PC's own set aside, is
      // Vault's creation: remember that, so a later visit doesn't mistake it
      // for the PC's own settings.
      const created = !readList(SET_ASIDE).has(e.key.toLowerCase()) && !ops.exists(e.key)
      ops.importFile(reg)
      if (created) addManaged(e.key)
      console.log(`[registry] ${e.name}: imported settings saved by ${stamp?.host ?? 'an unknown computer'}`)
    } catch (err) {
      console.warn(`[registry] ${e.name}: could not import ${reg} —`, err)
    }
  }
}

function writtenHere(stamp: Stamp | null): boolean {
  const me = thisHost()
  return !!stamp && stamp.host === me.host && stamp.platform === me.platform
}

/** The PC's own settings: a key that exists, that Vault neither exported from here nor created here. */
function isPcOwn(driveRoot: string, e: RegistryEntry, ops: RegOps): boolean {
  if (!ops.exists(e.key)) return false
  if (writtenHere(readStamp(regFile(driveRoot, e)))) return false
  return !readManaged().has(e.key.toLowerCase())
}

function regParkable(driveRoot: string, e: RegistryEntry, ops: RegOps): Parkable {
  const aside = parkedKey(e.key)
  return {
    id: `reg:${e.key.toLowerCase()}`,
    name: e.name,
    scope: join(driveRoot, ...insideDrive(e.game)!),
    park: () => {
      updateList(SET_ASIDE, e.key, true)
      try {
        ops.copy(e.key, aside)
        if (!ops.exists(aside)) throw new Error('the copy did not appear')
        ops.remove(e.key)
      } catch (err) {
        // The owner's key is still in place; only a partial copy may exist.
        if (ops.exists(e.key) && ops.exists(aside)) ops.remove(aside)
        if (!ops.exists(aside)) updateList(SET_ASIDE, e.key, false)
        throw new Error(`Could not set this PC's own ${e.name} settings aside for the session: ${err instanceof Error ? err.message : err}`)
      }
    },
    unpark: () => {
      if (!ops.exists(aside)) {
        updateList(SET_ASIDE, e.key, false)
        return 'nothing-parked'
      }
      // The session's settings belong to the drive: save them before the PC's own come back.
      exportEntry(driveRoot, e, ops)
      if (ops.exists(e.key)) ops.remove(e.key)
      ops.copy(aside, e.key)
      ops.remove(aside)
      updateList(SET_ASIDE, e.key, false)
      return 'restored'
    }
  }
}

/**
 * Before a PC game starts from the drive: the registry keys it uses that this
 * PC already has as its own. Each is set aside for the session.
 */
export function registryParkablesForLaunch(driveRoot: string, filePath: string, ops: RegOps = realRegOps): Parkable[] {
  if (process.platform !== 'win32' && ops === realRegOps) return []
  const setAside = readList(SET_ASIDE)
  return entriesFor(driveRoot, filePath)
    .filter((e) => setAside.has(e.key.toLowerCase()) || isPcOwn(driveRoot, e, ops))
    .map((e) => regParkable(driveRoot, e, ops))
}

/**
 * At startup: keys still set aside from a session Vault never saw end. Only
 * keys recorded as set aside are checked in the registry; normally none are.
 */
export function registryParkedLeftovers(driveRoot: string, ops: RegOps = realRegOps): Parkable[] {
  if (process.platform !== 'win32' && ops === realRegOps) return []
  const setAside = readList(SET_ASIDE)
  if (setAside.size === 0) return []
  return readEntries(driveRoot)
    .filter((e) => setAside.has(e.key.toLowerCase()))
    .map((e) => regParkable(driveRoot, e, ops))
}

/**
 * After a session: copy the game's key to the drive. Written to a temporary
 * file first, so an export that fails part-way never replaces the good copy.
 * Synchronous because a session can end as Vault quits, and an export left
 * running then would be lost.
 */
export function saveRegistrySettings(driveRoot: string, filePath: string, ops: RegOps = realRegOps): void {
  if (process.platform !== 'win32' && ops === realRegOps) return
  for (const e of entriesFor(driveRoot, filePath)) exportEntry(driveRoot, e, ops)
}

function exportEntry(driveRoot: string, e: RegistryEntry, ops: RegOps): void {
  const reg = regFile(driveRoot, e)
  const tmp = reg + '.tmp'
  try {
    mkdirSync(dirname(reg), { recursive: true })
    ops.exportKey(e.key, tmp)
    renameSync(tmp, reg)
    writeFileSync(stampFile(reg), JSON.stringify(thisHost(), null, 2))
    console.log(`[registry] ${e.name}: settings saved to the drive`)
  } catch {
    // Most often the key does not exist yet: the game has not saved any settings.
    rmSync(tmp, { force: true })
  }
}
