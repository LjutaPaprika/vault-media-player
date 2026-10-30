import { existsSync, lstatSync, readlinkSync, mkdirSync, symlinkSync, renameSync, rmdirSync, unlinkSync } from 'fs'
import { dirname } from 'path'

/**
 * The file-system half of save links, kept free of Electron so it can be tested
 * against real folders. saveLinks.ts decides which host path and drive folder
 * belong together; this module works out what is at the host path now and
 * changes it.
 *
 * Two kinds of link:
 *
 * - Lasting: the host path is free, so it becomes a link to the drive and
 *   stays one. The game writes to the drive whether or not Vault started it.
 *
 * - For one session ("parked"): the host path is a real folder, typically
 *   because this PC has the game installed itself (Steam). That folder belongs
 *   to the PC, so it is renamed aside to `<folder>.vault-host` while a game
 *   started from the drive runs, a link takes its place, and afterwards the
 *   link is removed and the folder renamed back. Played from the PC's own
 *   install, the game finds its own saves; played from the drive, it finds the
 *   drive's. The rename is on the same volume, so it is instant, and it fails
 *   while the game holds a file in the folder open (EPERM), which is the "in
 *   use" signal the launch reports.
 *
 * Measured on Windows 11 (Node 20): a junction needs no admin rights, its
 * parent folder must already exist, readlink returns the target with a trailing
 * backslash, and removing a junction (rmdir or unlink) never touches the files
 * it points at.
 */

export const PARK_SUFFIX = '.vault-host'

export type HostState =
  | { kind: 'missing' }
  | { kind: 'link'; target: string }
  | { kind: 'folder' }
  | { kind: 'file' }

/** What is at a host path. lstat, not exists: a link whose drive is unplugged still exists. */
export function inspect(hostPath: string): HostState {
  let st: ReturnType<typeof lstatSync>
  try { st = lstatSync(hostPath) } catch { return { kind: 'missing' } }
  if (st.isSymbolicLink()) {
    let target = ''
    try { target = readlinkSync(hostPath) } catch { /* unreadable link */ }
    return { kind: 'link', target }
  }
  return st.isDirectory() ? { kind: 'folder' } : { kind: 'file' }
}

/** Link targets come back in assorted shapes (\\?\ prefix, trailing slash, case); compare them loosely. */
export function normPath(p: string): string {
  return p.replace(/^\\\\\?\\/, '').replace(/[\\/]+/g, '/').replace(/\/+$/, '').toLowerCase()
}

export function samePath(a: string, b: string): boolean {
  return normPath(a) === normPath(b)
}

/**
 * A link made on an earlier visit when the drive had another letter (or mount
 * point): it points at the same folder of the drive, under a different root.
 * `driveRel` is the drive folder relative to the drive root, e.g.
 * "saves/Constance". Only an exact tail match counts, so a link the user made
 * to somewhere else entirely is never mistaken for one of ours.
 */
export function isSameDriveFolderElsewhere(linkTarget: string, target: string, driveRel: string): boolean {
  const t = normPath(linkTarget)
  const rel = normPath(driveRel).replace(/^\//, '')
  return rel.length > 0 && !samePath(linkTarget, target) && t.endsWith('/' + rel)
}

export type Plan =
  | 'linked'      // already a link to the drive folder
  | 'create'      // nothing there: make a lasting link
  | 'repoint'     // a link to the same drive folder under an old drive letter
  | 'other-link'  // a link somewhere else: not ours, leave it
  | 'host-folder' // a real folder: the PC's own data, only ever parked for a session
  | 'blocked'     // a file where a folder should be

export function plan(hostPath: string, target: string, driveRel: string): Plan {
  const s = inspect(hostPath)
  switch (s.kind) {
    case 'missing': return 'create'
    case 'folder':  return 'host-folder'
    case 'file':    return 'blocked'
    case 'link':
      if (samePath(s.target, target)) return 'linked'
      return isSameDriveFolderElsewhere(s.target, target, driveRel) ? 'repoint' : 'other-link'
  }
}

/** Junctions on Windows (no admin needed); plain directory symlinks elsewhere. */
export function makeLink(target: string, hostPath: string): void {
  mkdirSync(dirname(hostPath), { recursive: true })
  symlinkSync(target, hostPath, process.platform === 'win32' ? 'junction' : 'dir')
}

/** Removes a link and only a link. Throws if the path is anything else. */
export function removeLink(hostPath: string): void {
  if (inspect(hostPath).kind !== 'link') throw new Error(`${hostPath} is not a link`)
  // rmdir removes a Windows junction itself; unlink is how a POSIX symlink goes.
  try { rmdirSync(hostPath) } catch { unlinkSync(hostPath) }
}

export type Applied = 'linked' | 'created' | 'repointed' | 'left' | 'skipped-no-target'

/**
 * Lasting links: create one where the host path is free and re-point one left
 * from an old drive letter. Real folders and other links are left alone.
 */
export function applyLasting(hostPath: string, target: string, driveRel: string): Applied {
  // Nothing on the drive to point at (an entry whose data was never moved
  // there): a link to a missing folder would make the game fail to save.
  if (!existsSync(target)) return 'skipped-no-target'
  switch (plan(hostPath, target, driveRel)) {
    case 'linked': return 'linked'
    case 'create':
      makeLink(target, hostPath)
      return 'created'
    case 'repoint':
      removeLink(hostPath)
      makeLink(target, hostPath)
      return 'repointed'
    default:
      return 'left'
  }
}

export const parkedPath = (hostPath: string): string => hostPath + PARK_SUFFIX

/**
 * Set the PC's own folder aside and link the drive's in its place, for one
 * session. Throws a readable error (and leaves the folder as it was) if the
 * folder is in use or a previous session's copy is still parked.
 */
export function park(hostPath: string, target: string): void {
  const aside = parkedPath(hostPath)
  if (inspect(hostPath).kind !== 'folder') throw new Error(`${hostPath} is not a folder`)
  if (inspect(aside).kind !== 'missing') {
    throw new Error(`${aside} already exists from an earlier session`)
  }
  if (!existsSync(target)) throw new Error(`${target} does not exist`)
  try {
    renameSync(hostPath, aside)
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    throw new Error(code === 'EPERM' || code === 'EBUSY' || code === 'EACCES'
      ? `${hostPath} is in use`
      : `${hostPath} could not be moved aside (${code ?? err})`)
  }
  try {
    makeLink(target, hostPath)
  } catch (err) {
    renameSync(aside, hostPath)  // put it back exactly as it was
    throw err
  }
}

export type Unparked = 'restored' | 'nothing-parked' | 'conflict'

/**
 * End a session's link: remove the link and rename the PC's folder back.
 * If something other than a link now sits at the host path (the PC's own copy
 * of the game ran meanwhile and made a fresh folder), both are kept and
 * 'conflict' is returned; nothing is ever deleted here.
 */
export function unpark(hostPath: string): Unparked {
  const aside = parkedPath(hostPath)
  if (inspect(aside).kind !== 'folder') return 'nothing-parked'
  const now = inspect(hostPath)
  if (now.kind === 'link') removeLink(hostPath)
  else if (now.kind !== 'missing') return 'conflict'
  renameSync(aside, hostPath)
  return 'restored'
}
