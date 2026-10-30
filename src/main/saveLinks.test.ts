import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { ensureSaveLinks, parkablesForLaunch, parkedLeftovers } from './saveLinks'
import { inspect, parkedPath, makeLink } from './saveLinkCore'

// End to end through the manifest, with LocalAppData pointed at a temp folder
// standing in for a PC, and a temp folder standing in for the drive.

let root: string
let drive: string
let localAppData: string
let savedEnv: string | undefined

const BPM_EXE = (): string => join(drive, 'games', 'pc', 'BPM', 'WindowsNoEditor', 'BPMGame.exe')
const OTHER_EXE = (): string => join(drive, 'games', 'pc', 'Constance', 'CONSTANCE.exe')
const host = (name: string): string => join(localAppData, name)

function manifest(links: object[]): void {
  writeFileSync(join(drive, 'data', 'save-links.json'), JSON.stringify({ links, registry: [] }))
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vault-savelinks-test-'))
  drive = join(root, 'VAULT')
  localAppData = join(root, 'PC', 'AppData', 'Local')
  mkdirSync(localAppData, { recursive: true })
  mkdirSync(join(drive, 'data'), { recursive: true })
  for (const d of ['BPM', 'DOGE']) {
    mkdirSync(join(drive, 'saves', d), { recursive: true })
    writeFileSync(join(drive, 'saves', d, 'save.dat'), `drive ${d}`)
  }
  savedEnv = process.env.LOCALAPPDATA
  process.env.LOCALAPPDATA = localAppData
  manifest([
    { name: 'BPM', location: 'LocalAppData', path: 'BPM', drive: 'saves/BPM', game: 'games/pc/BPM' },
    { name: 'DOGE games', location: 'LocalAppData', path: 'DOGE', drive: 'saves/DOGE' }   // shared: no game
  ])
})

afterEach(() => {
  process.env.LOCALAPPDATA = savedEnv
  rmSync(root, { recursive: true, force: true })
})

test('on a PC that has never seen the drive, every save folder becomes a lasting link', () => {
  ensureSaveLinks(drive)
  assert.equal(readFileSync(join(host('BPM'), 'save.dat'), 'utf8'), 'drive BPM')
  assert.equal(readFileSync(join(host('DOGE'), 'save.dat'), 'utf8'), 'drive DOGE')
  assert.deepEqual(parkablesForLaunch(drive, BPM_EXE()), [])
})

test('links from a visit when the drive had another letter are re-pointed at startup', () => {
  const oldDrive = join(root, 'OLD-LETTER')
  mkdirSync(join(oldDrive, 'saves', 'BPM'), { recursive: true })
  makeLink(join(oldDrive, 'saves', 'BPM'), host('BPM'))
  rmSync(oldDrive, { recursive: true })       // that letter is now something else, or nothing
  ensureSaveLinks(drive)
  assert.equal(readFileSync(join(host('BPM'), 'save.dat'), 'utf8'), 'drive BPM')
})

test("a PC with its own copy keeps its folder; only that game's launch sets it aside", () => {
  mkdirSync(host('BPM'))
  writeFileSync(join(host('BPM'), 'save.dat'), 'steam BPM')
  ensureSaveLinks(drive)
  assert.equal(inspect(host('BPM')).kind, 'folder')
  assert.equal(readFileSync(join(host('BPM'), 'save.dat'), 'utf8'), 'steam BPM')

  assert.deepEqual(parkablesForLaunch(drive, OTHER_EXE()).map((r) => r.name), [])
  assert.deepEqual(parkablesForLaunch(drive, BPM_EXE()).map((r) => r.name), ['BPM'])
})

test('a shared folder the PC has its own of is set aside for any game launched', () => {
  mkdirSync(host('DOGE'))
  assert.deepEqual(parkablesForLaunch(drive, OTHER_EXE()).map((r) => r.name), ['DOGE games'])
})

test('a full session: set aside, play from the drive, put back; the drive is backed up first', () => {
  mkdirSync(host('BPM'))
  writeFileSync(join(host('BPM'), 'save.dat'), 'steam BPM')
  const [res] = parkablesForLaunch(drive, BPM_EXE())
  res.park()
  assert.equal(readFileSync(join(host('BPM'), 'save.dat'), 'utf8'), 'drive BPM')
  const backups = readdirSync(join(drive, 'saves', '_session-backups', 'BPM'))
  assert.equal(backups.length, 1)
  assert.equal(readFileSync(join(drive, 'saves', '_session-backups', 'BPM', backups[0], 'save.dat'), 'utf8'), 'drive BPM')

  writeFileSync(join(host('BPM'), 'save.dat'), 'progress from the drive')
  assert.equal(res.unpark(), 'restored')
  assert.equal(readFileSync(join(host('BPM'), 'save.dat'), 'utf8'), 'steam BPM')
  assert.equal(readFileSync(join(drive, 'saves', 'BPM', 'save.dat'), 'utf8'), 'progress from the drive')
})

test('only the last five backups are kept', async () => {
  mkdirSync(host('BPM'))
  for (let i = 0; i < 7; i++) {
    const [res] = parkablesForLaunch(drive, BPM_EXE())
    res.park()
    res.unpark()
    await new Promise((r) => setTimeout(r, 5))   // distinct timestamps
  }
  assert.equal(readdirSync(join(drive, 'saves', '_session-backups', 'BPM')).length, 5)
})

test("the in-use error is written for the user and names the PC's own copy", () => {
  mkdirSync(host('BPM'))
  writeFileSync(join(host('BPM'), 'save.dat'), 'steam BPM')
  const fs = require('fs') as typeof import('fs')
  const fd = fs.openSync(join(host('BPM'), 'save.dat'), 'r+')
  try {
    const [res] = parkablesForLaunch(drive, BPM_EXE())
    assert.throws(() => res.park(), /This PC has its own BPM saves, and they are in use.*Close the copy of the game installed on this PC/)
  } finally {
    fs.closeSync(fd)
  }
  assert.equal(inspect(host('BPM')).kind, 'folder')
  // A refused launch makes no backup (found in the rehearsal: it used to).
  assert.equal(existsSync(join(drive, 'saves', '_session-backups', 'BPM')), false)
})

test('after a crash the set-aside folder is found, startup leaves it alone, and recovery puts it back', () => {
  mkdirSync(host('BPM'))
  writeFileSync(join(host('BPM'), 'save.dat'), 'steam BPM')
  parkablesForLaunch(drive, BPM_EXE())[0].park()
  // Vault crashes here. On the next start:
  ensureSaveLinks(drive)                                   // must not "fix" the session link
  assert.equal(inspect(host('BPM')).kind, 'link')
  const left = parkedLeftovers(drive)
  assert.deepEqual(left.map((r) => r.name), ['BPM'])
  // A launch before recovery has run joins the leftover instead of failing.
  assert.deepEqual(parkablesForLaunch(drive, BPM_EXE()).map((r) => r.id), [left[0].id])
  assert.equal(left[0].unpark(), 'restored')
  assert.equal(readFileSync(join(host('BPM'), 'save.dat'), 'utf8'), 'steam BPM')
  assert.equal(existsSync(parkedPath(host('BPM'))), false)
})
