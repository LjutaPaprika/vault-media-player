import { existsSync, readFileSync, cpSync, readdirSync, rmSync } from 'fs'
import { join, dirname, sep } from 'path'
import { execFileSync } from 'child_process'
import { app } from 'electron'
import { MAC_WINE_PREFIX, MAC_WINE_USER } from './winePrefix'
import { applyLasting, plan, park, unpark, inspect, parkedPath } from './saveLinkCore'
import type { Parkable } from './sessionParking'

/**
 * Some games hardcode their save location to the host machine rather than the
 * folder they run from — Unreal writes to AppData\Local\<Game>, Unity to
 * AppData\LocalLow, the Steam-emu layer to AppData\Roaming\GSE Saves, and so
 * on. On a drive meant to be fully self-contained that's a hole: the media
 * travels, the progress doesn't.
 *
 * This recreates those host paths as directory junctions pointing at the drive,
 * so the game writes where it always did and the bytes land on the Vault.
 * Junctions are used rather than symlinks because they need no
 * administrator rights.
 *
 * The link set lives in <driveRoot>/data/save-links.json rather than in code, so
 * the drive carries its own configuration and adding a game later is a data edit
 * on the drive, not a rebuild and redeploy.
 *
 * Each entry names one of a fixed set of save locations plus a folder inside
 * it, never a raw path. Games only ever save to these few places, and each
 * platform resolves them its own way: Windows asks the system, so a folder
 * moved elsewhere (Documents into OneDrive) is followed; a Mac running the game
 * under Wine maps them into its prefix. An entry naming anything else is
 * rejected rather than guessed at.
 *
 * On Windows these are directory junctions (no admin needed). On macOS the game
 * runs under Wine and the locations are mapped into the prefix; links there are
 * POSIX symlinks. saveLinkCore.ts does the file-system work.
 *
 * A link made while the drive had another letter is re-pointed at the drive as
 * mounted now. A real folder at the host path is this PC's own (it has the game
 * itself, e.g. through Steam): it is never replaced for good, only set aside
 * for the length of a session started from the drive (parkablesForLaunch,
 * sessionParking.ts), so the PC's own copy keeps its own saves.
 *
 * An entry may name its `game` folder (relative to the drive root, like the
 * registry entries); only launches from that folder set its PC copy aside.
 * Entries without one (a crack's player-id folder) serve every game.
 */

/** Where Windows games put saves. The manifest may name only these. */
const LOCATIONS = ['Documents', 'LocalAppData', 'RoamingAppData', 'LocalLow', 'PublicDocuments', 'SavedGames'] as const
type Location = typeof LOCATIONS[number]

interface SaveLink {
  name: string
  location: Location   // one of LOCATIONS
  path: string         // folder inside it, e.g. "My Games/LIVEALIVE"
  drive: string        // relative to the drive root
  game?: string        // the game's folder relative to the drive root; absent = shared by every game
}

/** A Windows location's folder on this PC, as the system reports it. */
function windowsLocation(location: Location): string | undefined {
  const localAppData = process.env.LOCALAPPDATA
  switch (location) {
    // Follows a redirect: with OneDrive backing up Documents, this is
    // %USERPROFILE%\OneDrive\Documents, which is where games then save.
    case 'Documents':       return app.getPath('documents')
    case 'RoamingAppData':  return app.getPath('appData')
    case 'LocalAppData':    return localAppData
    // No environment variable of its own; always the sibling of AppData\Local.
    case 'LocalLow':        return localAppData ? join(dirname(localAppData), 'LocalLow') : undefined
    case 'PublicDocuments': return process.env.PUBLIC ? join(process.env.PUBLIC, 'Documents') : undefined
    case 'SavedGames':      return savedGamesFolder()
  }
}

/**
 * %USERPROFILE%\Saved Games, unless the user has moved it. Electron has no
 * getPath name for it, so read what Explorer reads: a moved folder is recorded
 * under User Shell Folders by its known-folder ID; an unmoved one is not.
 */
let savedGamesCache: { value: string | undefined } | null = null
function savedGamesFolder(): string | undefined {
  // Asked for every SavedGames entry at startup and at each launch; each ask is
  // a process spawn, and spawns stall Vault's main process. The folder doesn't
  // move while Vault runs.
  if (!savedGamesCache) savedGamesCache = { value: lookUpSavedGames() }
  return savedGamesCache.value
}

function lookUpSavedGames(): string | undefined {
  try {
    const out = execFileSync('reg', [
      'query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders',
      '/v', '{4C5C32FF-BB9D-43b0-B5B4-2D72E54EAAA4}'
    ], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] })
    const m = out.match(/REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/m)
    if (m) return m[1].replace(/%([^%]+)%/g, (whole, name: string) => process.env[name] ?? whole)
  } catch { /* not moved: the value is absent and reg exits non-zero */ }
  return process.env.USERPROFILE ? join(process.env.USERPROFILE, 'Saved Games') : undefined
}

/**
 * The matching path inside the Mac Wine prefix. GPTK's fixed user name is
 * `crossover` (see winePrefix.ts), so %USERPROFILE% resolves under
 * `drive_c/users/crossover/`. The Documents folder inside the prefix is itself
 * typically a Wine-created symlink to `~/Documents`, which is fine: the real
 * save still lands on the drive once this link is made.
 */
function macLocation(location: Location): string {
  const user = join(MAC_WINE_PREFIX, 'drive_c', 'users', MAC_WINE_USER)
  switch (location) {
    case 'Documents':       return join(user, 'Documents')
    case 'RoamingAppData':  return join(user, 'AppData', 'Roaming')
    case 'LocalAppData':    return join(user, 'AppData', 'Local')
    case 'LocalLow':        return join(user, 'AppData', 'LocalLow')
    case 'PublicDocuments': return join(MAC_WINE_PREFIX, 'drive_c', 'users', 'Public', 'Documents')
    case 'SavedGames':      return join(user, 'Saved Games')
  }
}

/**
 * The host folder a manifest entry links, or why it cannot be resolved. The
 * path inside the location must stay inside it: no absolute paths, no "..".
 */
export function hostPathFor(link: SaveLink): { path: string } | { error: string } {
  if (!LOCATIONS.includes(link.location)) {
    return { error: `unknown location "${link.location}" (expected one of ${LOCATIONS.join(', ')})` }
  }
  const parts = link.path.split(/[\\/]+/).filter(Boolean)
  if (parts.length === 0 || parts.includes('..') || /^([a-z]:|[\\/])/i.test(link.path)) {
    return { error: `"${link.path}" must be a folder inside ${link.location}` }
  }
  const base = process.platform === 'darwin'
    ? macLocation(link.location)
    : windowsLocation(link.location)
  if (!base) return { error: `${link.location} could not be found on this PC` }
  return { path: join(base, ...parts) }
}

const driveFolder = (driveRoot: string, link: SaveLink): string =>
  join(driveRoot, ...link.drive.split(/[\\/]+/).filter(Boolean))

function ensureOne(driveRoot: string, link: SaveLink): void {
  const resolved = hostPathFor(link)
  if ('error' in resolved) {
    console.warn(`[savelinks] ${link.name}: ${resolved.error} — skipped`)
    return
  }
  const hostPath = resolved.path
  const target = driveFolder(driveRoot, link)
  try {
    const r = applyLasting(hostPath, target, link.drive)
    if (r === 'created') console.log(`[savelinks] linked ${hostPath} -> ${target}`)
    else if (r === 'created-folder') console.log(`[savelinks] linked ${hostPath} -> ${target} (made the drive folder; nothing saved yet)`)
    else if (r === 'skipped-no-target') console.warn(`[savelinks] ${link.name}: ${target} does not exist and was not made — not linked`)
    else if (r === 'repointed') console.log(`[savelinks] ${link.name}: re-pointed at the drive as mounted now (${target})`)
    else if (r === 'left') {
      // A real folder (this PC's own copy of the game: it is only swapped out
      // for the length of a session started from the drive, see
      // parkablesForLaunch) or a link the user made to somewhere else.
      console.log(`[savelinks] ${link.name}: ${hostPath} belongs to this PC — left as it is`)
    }
  } catch (err) {
    console.warn(`[savelinks] ${link.name}: could not create link —`, err)
  }
}

function readLinks(driveRoot: string): SaveLink[] {
  const manifestPath = join(driveRoot, 'data', 'save-links.json')
  if (!existsSync(manifestPath)) return []
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { links?: SaveLink[] }
    const links = Array.isArray(parsed.links) ? parsed.links : []
    return links.filter((link) => {
      if (link?.location && link?.path && link?.drive) return true
      // The old raw-path form ("host": "%LOCALAPPDATA%\\..."), or a broken entry.
      console.warn(`[savelinks] ${link?.name ?? '(unnamed)'}: not in the location/path form — skipped`)
      return false
    })
  } catch (err) {
    console.warn('[savelinks] manifest unreadable —', err)
    return []
  }
}

/** The game folder an entry belongs to, or null for one every game shares (a crack's player id). */
function scopeOf(driveRoot: string, link: SaveLink): string | null {
  if (typeof link.game !== 'string') return null
  const parts = link.game.split(/[\\/]+/).filter(Boolean)
  return parts.length > 0 && !parts.includes('..') ? join(driveRoot, ...parts) : null
}

function inScope(scope: string | null, filePath: string): boolean {
  return scope === null || filePath.toLowerCase().startsWith(scope.toLowerCase() + sep)
}

/**
 * Copies the drive's save folder aside before a session that swaps out a PC's
 * own folder. If the PC's own copy of the game is started (Steam) while the
 * swap is in place, Steam Cloud can download the PC owner's saves over the
 * drive's; this keeps the drive's last state recoverable. Saves are small, and
 * this only happens on a PC that has the game itself. The last five are kept.
 */
function snapshotDriveFolder(driveRoot: string, link: SaveLink, target: string): void {
  const safe = link.name.replace(/[<>:"/\\|?*]+/g, '_')
  const dir = join(driveRoot, 'saves', '_session-backups', safe)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  cpSync(target, join(dir, stamp), { recursive: true })
  const old = readdirSync(dir).sort()
  for (const name of old.slice(0, Math.max(0, old.length - 5))) {
    rmSync(join(dir, name), { recursive: true, force: true })
  }
}

function parkable(driveRoot: string, link: SaveLink, hostPath: string, target: string): Parkable {
  return {
    id: `folder:${hostPath.toLowerCase()}`,
    name: link.name,
    scope: scopeOf(driveRoot, link),
    park: () => {
      try {
        park(hostPath, target)
      } catch (err) {
        const why = err instanceof Error ? err.message : String(err)
        throw new Error(/in use/.test(why)
          ? `This PC has its own ${link.name} saves, and they are in use (${hostPath}). ` +
            `Close the copy of the game installed on this PC (for example in Steam) and try again.`
          : `Could not set this PC's own ${link.name} saves aside for the session: ${why}`)
      }
      // After the swap (so a refused launch makes no backup) and before the
      // game starts (the launch spawns it only once every resource is parked),
      // so this is still the drive's state from before the session.
      try { snapshotDriveFolder(driveRoot, link, target) } catch (err) {
        console.warn(`[savelinks] ${link.name}: could not back up the drive's saves —`, err)
      }
    },
    unpark: () => unpark(hostPath)
  }
}

/**
 * Before a PC game starts from the drive: the save folders it uses that this
 * PC already has as real folders (its own copy of the game). Each is swapped
 * for a link to the drive for the length of the session (sessionParking.ts).
 * Windows only: on the Mac the Wine prefix belongs to Vault alone.
 */
export function parkablesForLaunch(driveRoot: string, filePath: string): Parkable[] {
  if (process.platform !== 'win32') return []
  const out: Parkable[] = []
  for (const link of readLinks(driveRoot)) {
    if (!inScope(scopeOf(driveRoot, link), filePath)) continue
    const resolved = hostPathFor(link)
    if ('error' in resolved) continue
    const target = driveFolder(driveRoot, link)
    // Still set aside from an earlier session that has not been put back yet
    // (its game was running at startup): this launch joins it rather than
    // parking twice.
    if (inspect(parkedPath(resolved.path)).kind === 'folder') {
      out.push(parkable(driveRoot, link, resolved.path, target))
      continue
    }
    if (!existsSync(target)) continue
    if (plan(resolved.path, target, link.drive) === 'host-folder') out.push(parkable(driveRoot, link, resolved.path, target))
  }
  return out
}

/** At startup: folders still set aside from a session Vault never saw end (a crash, a power cut). */
export function parkedLeftovers(driveRoot: string): Parkable[] {
  if (process.platform !== 'win32') return []
  const out: Parkable[] = []
  for (const link of readLinks(driveRoot)) {
    const resolved = hostPathFor(link)
    if ('error' in resolved) continue
    if (inspect(parkedPath(resolved.path)).kind === 'folder') {
      out.push(parkable(driveRoot, link, resolved.path, driveFolder(driveRoot, link)))
    }
  }
  return out
}

/**
 * Reconcile every link in the drive's manifest. Idempotent and best-effort — a
 * failure here must never stop the app starting or a game launching, so each
 * entry is isolated and errors are logged rather than thrown.
 */
export function ensureSaveLinks(driveRoot: string): void {
  if (process.platform !== 'win32' && process.platform !== 'darwin') return
  // On Mac, nothing to link into if the prefix hasn't been built. Vault doesn't
  // build it (Heroic + the user do); until it exists, skip rather than guess.
  if (process.platform === 'darwin' && !existsSync(MAC_WINE_PREFIX)) {
    console.warn(`[savelinks] darwin: Wine prefix not found at ${MAC_WINE_PREFIX} — nothing to link`)
    return
  }

  for (const link of readLinks(driveRoot)) {
    // Still swapped out from a session Vault never saw end: leave it for the
    // startup recovery (parkedLeftovers), which puts the PC's folder back.
    const resolved = hostPathFor(link)
    if (!('error' in resolved) && inspect(parkedPath(resolved.path)).kind === 'folder') continue
    try { ensureOne(driveRoot, link) } catch (err) {
      console.warn(`[savelinks] ${link.name}: skipped —`, err)
    }
  }
}
