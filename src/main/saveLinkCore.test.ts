import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync, openSync, closeSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import {
  inspect, plan, applyLasting, park, unpark, parkedPath, makeLink, removeLink, isSameDriveFolderElsewhere, samePath
} from './saveLinkCore'

// Real folders and real junctions in a temp directory: what matters here is
// how Windows behaves, so nothing is faked.
let root: string
let driveA: string       // the drive on its first visit (say F:)
let driveB: string       // the same drive back with another letter (say G:)
let host: string         // the game's save folder on the PC
const REL = 'saves/Game'

const save = (dir: string, name = 'save.dat'): string => readFileSync(join(dir, name), 'utf8')

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vault-savelink-test-'))
  driveA = join(root, 'driveA')
  driveB = join(root, 'driveB')
  for (const d of [driveA, driveB]) {
    mkdirSync(join(d, 'saves', 'Game'), { recursive: true })
  }
  writeFileSync(join(driveA, 'saves', 'Game', 'save.dat'), 'drive A save')
  writeFileSync(join(driveB, 'saves', 'Game', 'save.dat'), 'drive B save')
  host = join(root, 'AppData', 'Local', 'Game')
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

const target = (drive: string): string => join(drive, 'saves', 'Game')

// ── lasting links ────────────────────────────────────────────────────────────

test('a free host path becomes a link, and writes through it land on the drive', () => {
  assert.equal(applyLasting(host, target(driveA), REL), 'created')
  assert.equal(inspect(host).kind, 'link')
  writeFileSync(join(host, 'new.dat'), 'written by the game')
  assert.equal(save(target(driveA), 'new.dat'), 'written by the game')
})

test('an existing correct link is left as it is', () => {
  makeLink(target(driveA), host)
  assert.equal(applyLasting(host, target(driveA), REL), 'linked')
})

test('a link left from an old drive letter is re-pointed at the drive as mounted now', () => {
  makeLink(target(driveA), host)
  assert.equal(plan(host, target(driveB), REL), 'repoint')
  assert.equal(applyLasting(host, target(driveB), REL), 'repointed')
  assert.equal(save(host), 'drive B save')
  // The old target is untouched.
  assert.equal(save(target(driveA)), 'drive A save')
})

test('a link left from an old letter is re-pointed even when that letter is gone', () => {
  makeLink(target(driveA), host)
  rmSync(driveA, { recursive: true, force: true })   // drive A no longer mounted
  assert.equal(applyLasting(host, target(driveB), REL), 'repointed')
  assert.equal(save(host), 'drive B save')
})

test('a link to somewhere unrelated is never touched', () => {
  const elsewhere = join(root, 'someone-elses', 'folder')
  mkdirSync(elsewhere, { recursive: true })
  makeLink(elsewhere, host)
  assert.equal(applyLasting(host, target(driveB), REL), 'left')
  assert.ok(samePath(inspect(host).kind === 'link' ? (inspect(host) as { target: string }).target : '', elsewhere))
})

test('a link to a folder that merely ends in the same name is not ours', () => {
  // "other/saves/Game" ends with "saves/Game" only by coincidence at the folder level;
  // "mysaves/Game" must not match "saves/Game".
  assert.equal(isSameDriveFolderElsewhere('X:\\mysaves\\Game', 'E:\\saves\\Game', REL), false)
  assert.equal(isSameDriveFolderElsewhere('F:\\saves\\Game\\', 'E:\\saves\\Game', REL), true)
  assert.equal(isSameDriveFolderElsewhere('\\\\?\\F:\\saves\\game', 'E:\\saves\\Game', REL), true)
  assert.equal(isSameDriveFolderElsewhere('E:\\saves\\Game', 'E:\\saves\\Game', REL), false)
})

test("the PC's own folder is never replaced by a lasting link", () => {
  mkdirSync(host, { recursive: true })
  writeFileSync(join(host, 'save.dat'), 'steam save')
  assert.equal(applyLasting(host, target(driveA), REL), 'left')
  assert.equal(inspect(host).kind, 'folder')
  assert.equal(save(host), 'steam save')
})

test('no link is made to a drive folder that does not exist', () => {
  rmSync(target(driveA), { recursive: true })
  assert.equal(applyLasting(host, target(driveA), REL), 'skipped-no-target')
  assert.equal(inspect(host).kind, 'missing')
})

test('removing a link never deletes what it points at', () => {
  makeLink(target(driveA), host)
  removeLink(host)
  assert.equal(inspect(host).kind, 'missing')
  assert.equal(save(target(driveA)), 'drive A save')
})

test('removeLink refuses to remove a real folder', () => {
  mkdirSync(host, { recursive: true })
  assert.throws(() => removeLink(host), /not a link/)
  assert.ok(existsSync(host))
})

// ── parking: the PC has the game itself ──────────────────────────────────────

function steamFolder(): void {
  mkdirSync(host, { recursive: true })
  writeFileSync(join(host, 'save.dat'), 'steam save')
}

test("a session parks the PC's folder and the game sees the drive's saves", () => {
  steamFolder()
  park(host, target(driveA))
  assert.equal(save(host), 'drive A save')
  assert.equal(save(parkedPath(host)), 'steam save')
})

test("after the session the PC's folder is back exactly as it was, and the drive keeps the session's saves", () => {
  steamFolder()
  park(host, target(driveA))
  writeFileSync(join(host, 'save.dat'), 'progress made from the drive')
  assert.equal(unpark(host), 'restored')
  assert.equal(inspect(host).kind, 'folder')
  assert.equal(save(host), 'steam save')
  assert.equal(existsSync(parkedPath(host)), false)
  assert.equal(save(target(driveA)), 'progress made from the drive')
})

test('unpark works with the drive unplugged (a dangling link)', () => {
  steamFolder()
  park(host, target(driveA))
  rmSync(driveA, { recursive: true, force: true })
  assert.equal(unpark(host), 'restored')
  assert.equal(save(host), 'steam save')
})

test('a folder in use is not parked, and is left exactly as it was', () => {
  steamFolder()
  const fd = openSync(join(host, 'save.dat'), 'r+')
  try {
    assert.throws(() => park(host, target(driveA)), /in use/)
  } finally {
    closeSync(fd)
  }
  assert.equal(inspect(host).kind, 'folder')
  assert.equal(save(host), 'steam save')
  assert.equal(existsSync(parkedPath(host)), false)
})

test('park refuses when a copy from an earlier session is still parked', () => {
  steamFolder()
  mkdirSync(parkedPath(host))
  assert.throws(() => park(host, target(driveA)), /earlier session/)
  assert.equal(save(host), 'steam save')
})

test("if the PC's own copy made a new folder meanwhile, unpark keeps both and reports a conflict", () => {
  steamFolder()
  park(host, target(driveA))
  removeLink(host)
  mkdirSync(host)
  writeFileSync(join(host, 'save.dat'), 'new steam save')
  assert.equal(unpark(host), 'conflict')
  assert.equal(save(host), 'new steam save')
  assert.equal(save(parkedPath(host)), 'steam save')
})

test('unpark with nothing parked does nothing', () => {
  makeLink(target(driveA), host)
  assert.equal(unpark(host), 'nothing-parked')
  assert.equal(inspect(host).kind, 'link')
})
