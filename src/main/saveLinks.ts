import { existsSync, readFileSync, lstatSync, readlinkSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { execFileSync } from 'child_process'

/**
 * Some games hardcode their save location to the host machine rather than the
 * folder they run from — Unreal writes to %LOCALAPPDATA%\<Game>, the Steam-emu
 * layer to %APPDATA%\GSE Saves, and so on. On a drive meant to be fully
 * self-contained that's a hole: the media travels, the progress doesn't.
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
 * Windows-only. The macOS equivalents live under ~/Library/Application Support
 * with per-app layouts that haven't been mapped, and a half-correct link there
 * would be worse than none — so this no-ops rather than guessing.
 */

interface SaveLink {
  name: string
  host: string    // may contain %APPDATA% / %LOCALAPPDATA%
  drive: string   // relative to the drive root
}

/** Expand %VAR% against the environment, leaving unknown names untouched. */
function expandEnv(p: string): string {
  return p.replace(/%([^%]+)%/g, (whole, name: string) => process.env[name] ?? whole)
}

/** Junction targets come back in assorted shapes; compare them insensitively. */
function samePath(a: string, b: string): boolean {
  const norm = (s: string): string =>
    s.replace(/^\\\\\?\\/, '').replace(/[\\/]+$/, '').toLowerCase()
  return norm(a) === norm(b)
}

function ensureOne(driveRoot: string, link: SaveLink): void {
  const hostPath = expandEnv(link.host)
  const target = join(driveRoot, link.drive)

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
    execFileSync('cmd', ['/c', 'mklink', '/J', hostPath, target], { stdio: 'ignore', windowsHide: true })
    console.log(`[savelinks] linked ${hostPath} -> ${target}`)
  } catch (err) {
    console.warn(`[savelinks] ${link.name}: could not create junction —`, err)
  }
}

/**
 * Reconcile every link in the drive's manifest. Idempotent and best-effort — a
 * failure here must never stop the app starting or a game launching, so each
 * entry is isolated and errors are logged rather than thrown.
 */
export function ensureSaveLinks(driveRoot: string): void {
  if (process.platform !== 'win32') return

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
    if (!link?.host || !link?.drive) continue
    try { ensureOne(driveRoot, link) } catch (err) {
      console.warn(`[savelinks] ${link.name ?? link.host}: skipped —`, err)
    }
  }
}
