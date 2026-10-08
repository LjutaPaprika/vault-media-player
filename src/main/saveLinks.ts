import { existsSync, readFileSync, lstatSync, readlinkSync, mkdirSync, symlinkSync } from 'fs'
import { join, dirname } from 'path'
import { execFileSync } from 'child_process'
import { app } from 'electron'
import { MAC_WINE_PREFIX, MAC_WINE_USER } from './winePrefix'

/**
 * Some games hardcode their save location to the host machine rather than the
 * folder they run from — Unreal writes to AppData\Local\<Game>, Unity to
 * AppData\LocalLow, the Steam-emu layer to AppData\Roaming\GSE Saves, and so
 * on. On a drive meant to be fully self-contained that's a hole: the media
 * travels, the progress doesn't.
 *
 * This recreates those host paths as directory junctions pointing at the drive,
 * so the game writes where it always did and the bytes land on the Vault.
 * Junctions (mklink /J) are used rather than symlinks because they need no
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
 * On Windows these are directory junctions via `mklink /J` (no admin needed).
 * On macOS the game runs under Wine and the locations are mapped into the
 * prefix; links there are POSIX symlinks via `symlinkSync`.
 */

/** Where Windows games put saves. The manifest may name only these. */
const LOCATIONS = ['Documents', 'LocalAppData', 'RoamingAppData', 'LocalLow', 'PublicDocuments'] as const
type Location = typeof LOCATIONS[number]

interface SaveLink {
  name: string
  location: Location   // one of LOCATIONS
  path: string         // folder inside it, e.g. "My Games/LIVEALIVE"
  drive: string        // relative to the drive root
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
  }
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

/** Junction targets come back in assorted shapes; compare them insensitively. */
function samePath(a: string, b: string): boolean {
  const norm = (s: string): string =>
    s.replace(/^\\\\\?\\/, '').replace(/[\\/]+$/, '').toLowerCase()
  return norm(a) === norm(b)
}

function ensureOne(driveRoot: string, link: SaveLink): void {
  const resolved = hostPathFor(link)
  if ('error' in resolved) {
    console.warn(`[savelinks] ${link.name}: ${resolved.error} — skipped`)
    return
  }
  const hostPath = resolved.path
  const target = join(driveRoot, ...link.drive.split(/[\\/]+/))

  // Nothing on the drive to point at — a manifest entry for a game whose data
  // was never migrated. Silently skip; creating a link to a missing folder would
  // make the game fail to save rather than fall back to the host.
  if (!existsSync(target)) return

  // lstat, not existsSync: a junction whose drive is unplugged still exists as a
  // link but fails an exists() check, and mklink would then refuse the path.
  let stat: ReturnType<typeof lstatSync> | null = null
  try { stat = lstatSync(hostPath) } catch { /* nothing at this path */ }

  if (stat) {
    if (stat.isSymbolicLink()) {
      let current = ''
      try { current = readlinkSync(hostPath) } catch { /* unreadable link */ }
      if (samePath(current, target)) return  // already correct — nothing to do
      console.warn(`[savelinks] ${link.name}: already linked elsewhere (${current}) — leaving it alone`)
      return
    }
    // A real directory. Never replace it: on someone else's PC that folder holds
    // their save data, and junctioning over it would hide it without warning.
    console.warn(`[savelinks] ${link.name}: a real folder exists at ${hostPath} — not touching it`)
    return
  }

  try {
    mkdirSync(dirname(hostPath), { recursive: true })
    if (process.platform === 'darwin') {
      // POSIX symlink; the game writes to this path and the bytes land on the drive.
      symlinkSync(target, hostPath)
    } else {
      execFileSync('cmd', ['/c', 'mklink', '/J', hostPath, target], { stdio: 'ignore', windowsHide: true })
    }
    console.log(`[savelinks] linked ${hostPath} -> ${target}`)
  } catch (err) {
    console.warn(`[savelinks] ${link.name}: could not create link —`, err)
  }
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

  const manifestPath = join(driveRoot, 'data', 'save-links.json')
  if (!existsSync(manifestPath)) return

  let links: SaveLink[]
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf-8')) as { links?: SaveLink[] }
    links = Array.isArray(parsed.links) ? parsed.links : []
  } catch (err) {
    console.warn('[savelinks] manifest unreadable —', err)
    return
  }

  for (const link of links) {
    if (!link?.location || !link?.path || !link?.drive) {
      // The old raw-path form ("host": "%LOCALAPPDATA%\\..."), or a broken entry.
      console.warn(`[savelinks] ${link?.name ?? '(unnamed)'}: not in the location/path form — skipped`)
      continue
    }
    try { ensureOne(driveRoot, link) } catch (err) {
      console.warn(`[savelinks] ${link.name}: skipped —`, err)
    }
  }
}
