import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs'
import { join } from 'path'
import { tmpdir, hostname } from 'os'
import {
  restoreRegistrySettings, saveRegistrySettings, registryParkablesForLaunch, registryParkedLeftovers,
  setRegistryStateDir, PARKED_KEY_SUFFIX, type RegOps
} from './registrySettings'

// The registry is an in-memory map (key -> settings text); the drive is a real
// temp folder, so the .reg files and their sidecars are exercised for real.

const KEY = 'Software\\bluebackpack\\CONSTANCE'
let root: string
let drive: string
let state: string
let game: string
let reg: Map<string, string>
let ops: RegOps

const regText = (settings: string): string =>
  `Windows Registry Editor Version 5.00\r\n\r\n[HKEY_CURRENT_USER\\${KEY}]\r\n"settings"="${settings}"\r\n`
const settingsIn = (text: string): string => /"settings"="([^"]*)"/.exec(text)?.[1] ?? ''

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vault-registry-test-'))
  drive = join(root, 'drive')
  state = join(root, 'vault-userdata')
  game = join(drive, 'games', 'pc', 'Constance', 'CONSTANCE.exe')
  mkdirSync(join(drive, 'data'), { recursive: true })
  mkdirSync(join(drive, 'saves', '_registry'), { recursive: true })
  writeFileSync(join(drive, 'data', 'save-links.json'), JSON.stringify({
    links: [],
    registry: [{ name: 'Constance', key: KEY, game: 'games/pc/Constance', drive: 'saves/_registry/Constance.reg' }]
  }))
  setRegistryStateDir(state)
  reg = new Map()
  const k = (s: string): string => s.toLowerCase()
  ops = {
    exists: (key) => reg.has(k(key)),
    copy: (from, to) => { if (!reg.has(k(from))) throw new Error('no such key'); reg.set(k(to), reg.get(k(from))!) },
    remove: (key) => { reg.delete(k(key)) },
    importFile: (file) => { reg.set(k(KEY), settingsIn(readFileSync(file, 'utf8'))) },
    exportKey: (key, file) => {
      if (!reg.has(k(key))) throw new Error('no such key')
      writeFileSync(file, regText(reg.get(k(key))!))
    }
  }
})

afterEach(() => rmSync(root, { recursive: true, force: true }))

const driveReg = (): string => join(drive, 'saves', '_registry', 'Constance.reg')
function driveCopy(settings: string, by: string): void {
  writeFileSync(driveReg(), regText(settings))
  writeFileSync(driveReg() + '.json', JSON.stringify({ host: by, platform: process.platform, at: 'x' }))
}
const live = (): string | undefined => reg.get(KEY.toLowerCase())
const parked = (): string | undefined => reg.get((KEY + PARKED_KEY_SUFFIX).toLowerCase())

test('a PC without the game gets the drive settings, and Vault remembers it created the key', () => {
  driveCopy('drive settings', 'HOME-PC')
  assert.deepEqual(registryParkablesForLaunch(drive, game, ops), [])
  restoreRegistrySettings(drive, game, ops)
  assert.equal(live(), 'drive settings')
  assert.deepEqual(JSON.parse(readFileSync(join(state, 'registry-keys-from-vault.json'), 'utf8')), [KEY.toLowerCase()])
})

test('on a later visit that key is Vault-made, not the PC owner\'s, so nothing is set aside', () => {
  driveCopy('drive settings', 'HOME-PC')
  restoreRegistrySettings(drive, game, ops)           // first visit
  driveCopy('newer drive settings', 'HOME-PC')
  assert.deepEqual(registryParkablesForLaunch(drive, game, ops), [])
  restoreRegistrySettings(drive, game, ops)
  assert.equal(live(), 'newer drive settings')
})

test('on the PC that wrote the drive copy, its own key is not set aside and not overwritten', () => {
  reg.set(KEY.toLowerCase(), 'home settings')
  driveCopy('home settings (exported)', hostname())
  assert.deepEqual(registryParkablesForLaunch(drive, game, ops), [])
  restoreRegistrySettings(drive, game, ops)
  assert.equal(live(), 'home settings')
})

test("a PC with its own copy of the game: the owner's key is set aside, the drive's used, then the owner's put back", () => {
  reg.set(KEY.toLowerCase(), 'steam owner settings')
  driveCopy('drive settings', 'HOME-PC')

  const res = registryParkablesForLaunch(drive, game, ops)
  assert.equal(res.length, 1)
  res[0].park()
  assert.equal(parked(), 'steam owner settings')
  assert.equal(live(), undefined)

  restoreRegistrySettings(drive, game, ops)
  assert.equal(live(), 'drive settings')
  // The import into a set-aside key is not recorded as Vault-made.
  assert.equal(existsSync(join(state, 'registry-keys-from-vault.json')), false)

  reg.set(KEY.toLowerCase(), 'changed while playing from the drive')
  assert.equal(res[0].unpark(), 'restored')
  assert.equal(live(), 'steam owner settings')
  assert.equal(parked(), undefined)
  assert.equal(settingsIn(readFileSync(driveReg(), 'utf8')), 'changed while playing from the drive')
})

test('a drive game that never had settings still leaves the owner\'s settings untouched', () => {
  reg.set(KEY.toLowerCase(), 'steam owner settings')    // no .reg on the drive yet
  const [res] = registryParkablesForLaunch(drive, game, ops)
  res.park()
  reg.set(KEY.toLowerCase(), 'defaults the game wrote')
  res.unpark()
  assert.equal(live(), 'steam owner settings')
  assert.equal(settingsIn(readFileSync(driveReg(), 'utf8')), 'defaults the game wrote')
})

test('a key left set aside by a crash is found at startup and put back, saving the session to the drive', () => {
  reg.set(KEY.toLowerCase(), 'steam owner settings')
  registryParkablesForLaunch(drive, game, ops)[0].park()
  reg.set(KEY.toLowerCase(), 'session settings')
  // Vault crashes here. On the next start:
  const left = registryParkedLeftovers(drive, ops)
  assert.equal(left.length, 1)
  assert.equal(left[0].unpark(), 'restored')
  assert.equal(live(), 'steam owner settings')
  assert.equal(settingsIn(readFileSync(driveReg(), 'utf8')), 'session settings')
  assert.deepEqual(registryParkedLeftovers(drive, ops), [])
})

test('startup asks the registry nothing when nothing is set aside', () => {
  let asked = 0
  const counting: RegOps = { ...ops, exists: (k) => { asked++; return ops.exists(k) } }
  assert.deepEqual(registryParkedLeftovers(drive, counting), [])
  assert.equal(asked, 0)
})

test('a launch while a key is still set aside joins it rather than setting it aside again', () => {
  reg.set(KEY.toLowerCase(), 'steam owner settings')
  registryParkablesForLaunch(drive, game, ops)[0].park()
  restoreRegistrySettings(drive, game, ops)
  const res = registryParkablesForLaunch(drive, game, ops)
  assert.equal(res.length, 1)
  assert.equal(res[0].id, `reg:${KEY.toLowerCase()}`)
})

test('if setting aside fails, the owner\'s key is left exactly where it was, with nothing recorded', () => {
  reg.set(KEY.toLowerCase(), 'steam owner settings')
  const broken: RegOps = { ...ops, copy: () => { throw new Error('access denied') } }
  const [res] = registryParkablesForLaunch(drive, game, broken)
  assert.throws(() => res.park(), /set this PC's own Constance settings aside/)
  assert.equal(live(), 'steam owner settings')
  assert.equal(parked(), undefined)
  assert.deepEqual(registryParkedLeftovers(drive, ops), [])
})

test('if the copy is made but removing the original fails, the copy is cleaned up', () => {
  reg.set(KEY.toLowerCase(), 'steam owner settings')
  const broken: RegOps = { ...ops, remove: (k) => { if (k === KEY) throw new Error('access denied'); ops.remove(k) } }
  const [res] = registryParkablesForLaunch(drive, game, broken)
  assert.throws(() => res.park(), /aside/)
  assert.equal(live(), 'steam owner settings')
  assert.equal(parked(), undefined)
})

test('session settings are saved to the drive with this PC named in the sidecar', () => {
  reg.set(KEY.toLowerCase(), 'played settings')
  saveRegistrySettings(drive, game, ops)
  assert.equal(settingsIn(readFileSync(driveReg(), 'utf8')), 'played settings')
  assert.equal(JSON.parse(readFileSync(driveReg() + '.json', 'utf8')).host, hostname())
})

test('only the launched game\'s entries are considered', () => {
  reg.set(KEY.toLowerCase(), 'steam owner settings')
  const other = join(drive, 'games', 'pc', 'Rain World', 'RainWorld.exe')
  assert.deepEqual(registryParkablesForLaunch(drive, other, ops), [])
})
