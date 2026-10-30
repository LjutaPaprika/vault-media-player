import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SessionParking, type Parkable, type ParkingDeps, type Waiting } from './sessionParking'
import { anyMatches } from './processCheck'

// The timing rules, with fake resources and a fake process list.

interface FakeRes extends Parkable { events: string[] }

function res(id: string, scope: string | null = 'E:\\games\\pc\\Game', failPark = false): FakeRes {
  const events: string[] = []
  return {
    id, name: id, scope, events,
    park: () => { if (failPark) throw new Error(`${id} is in use`); events.push('park') },
    unpark: () => { events.push('unpark'); return 'restored' }
  }
}

function setup(running: () => boolean = () => false) {
  const timers: (() => void)[] = []
  const asked: Waiting[] = []
  const deps: ParkingDeps = {
    stillRunning: async (w) => { asked.push(w); return running() },
    stillRunningSync: (w) => { asked.push(w); return running() },
    driveFolders: () => ['E:\\games', 'E:\\emulators'],
    retryMs: 30_000,
    setTimer: (fn) => { timers.push(fn) },
    log: () => {}
  }
  const p = new SessionParking(deps)
  const fireTimers = async (): Promise<void> => {
    const due = timers.splice(0)
    for (const t of due) t()
    await settle()
  }
  return { p, asked, timers, fireTimers }
}

const settle = (): Promise<void> => new Promise((r) => setImmediate(r))

test('a resource is parked at launch and put back when the session ends and nothing runs', async () => {
  const { p } = setup()
  const r = res('save')
  p.begin('game.exe-session', 'Game.exe', [r])
  assert.deepEqual(r.events, ['park'])
  p.end('game.exe-session')
  await settle()
  assert.deepEqual(r.events, ['park', 'unpark'])
  assert.equal(p.isHeld('save'), false)
})

test('a shared resource is put back only after the last of its sessions ends', async () => {
  const { p } = setup()
  const shared = res('crack-id', null)
  p.begin('A', 'A.exe', [shared])
  p.begin('B', 'B.exe', [res('crack-id', null)])   // same id: held, not parked twice
  assert.deepEqual(shared.events, ['park'])
  p.end('A')
  await settle()
  assert.deepEqual(shared.events, ['park'])
  p.end('B')
  await settle()
  assert.deepEqual(shared.events, ['park', 'unpark'])
})

test('while anything is still running it waits, then puts back once it has stopped', async () => {
  let running = true
  const { p, fireTimers, timers } = setup(() => running)
  const r = res('save')
  p.begin('S', 'Game.exe', [r])
  p.end('S')
  await settle()
  assert.deepEqual(r.events, ['park'])
  assert.equal(timers.length, 1)
  await fireTimers()                     // still running: checks again later
  assert.deepEqual(r.events, ['park'])
  running = false
  await fireTimers()
  assert.deepEqual(r.events, ['park', 'unpark'])
})

test("it waits on the game's own folder and on every exe name the sessions used", async () => {
  const { p, asked } = setup()
  p.begin('S', 'BPMGame.exe', [res('save', 'E:\\games\\pc\\BPM')])
  p.end('S')
  await settle()
  assert.deepEqual(asked[0], { folders: ['E:\\games\\pc\\BPM'], names: ['BPMGame.exe'] })
})

test('a shared resource waits on everything started from the drive', async () => {
  const { p, asked } = setup()
  p.begin('S', 'A.exe', [res('crack-id', null)])
  p.end('S')
  await settle()
  assert.deepEqual(asked[0].folders, ['E:\\games', 'E:\\emulators'])
})

test('a failed park undoes the ones already parked by that launch, and throws', () => {
  const { p } = setup()
  const ok = res('first')
  const bad = res('second', 'E:\\games\\pc\\Game', true)
  assert.throws(() => p.begin('S', 'Game.exe', [ok, bad]), /in use/)
  assert.deepEqual(ok.events, ['park', 'unpark'])
  assert.equal(p.isHeld('first'), false)
})

test('a new session taking the resource while the release check runs keeps it parked', async () => {
  let release!: (v: boolean) => void
  const timers: (() => void)[] = []
  const p = new SessionParking({
    stillRunning: () => new Promise((r) => { release = r }),
    stillRunningSync: () => false,
    driveFolders: () => [], retryMs: 1, setTimer: (f) => timers.push(f), log: () => {}
  })
  const r = res('save')
  p.begin('S1', 'Game.exe', [r])
  p.end('S1')
  p.begin('S2', 'Game.exe', [r])        // relaunched before the check answered
  release(false)
  await settle()
  assert.deepEqual(r.events, ['park'])
  assert.equal(p.isHeld('save'), true)
})

test('something found parked at startup is put back once nothing runs', async () => {
  const { p } = setup()
  const r = res('leftover')
  p.adopt(r)
  await settle()
  assert.deepEqual(r.events, ['unpark'])
})

test('quitting puts back what is free and leaves what is still running for the next start', () => {
  const { p } = setup(() => false)
  const free = res('free')
  p.begin('S', 'Game.exe', [free])
  p.releaseAllOnQuit()
  assert.deepEqual(free.events, ['park', 'unpark'])

  const busy = setup(() => true)
  const r = res('busy')
  busy.p.begin('S', 'Game.exe', [r])
  busy.p.releaseAllOnQuit()
  assert.deepEqual(r.events, ['park'])
})

test('a failing process check counts as still running', async () => {
  const timers: (() => void)[] = []
  const p = new SessionParking({
    stillRunning: async () => { throw new Error('powershell missing') },
    stillRunningSync: () => { throw new Error('powershell missing') },
    driveFolders: () => [], retryMs: 1, setTimer: (f) => timers.push(f), log: () => {}
  })
  const r = res('save')
  p.begin('S', 'Game.exe', [r])
  p.end('S')
  await settle()
  assert.deepEqual(r.events, ['park'])
  assert.equal(timers.length, 1)
})

// ── process listing ──────────────────────────────────────────────────────────

const LISTING = [
  'System Idle Process|',
  'Vault.exe|E:\\app\\Vault.exe',
  'BPMGame-Win64-Shipping.exe|E:\\games\\pc\\BPM - Bullets Per Minute\\WindowsNoEditor\\BPM\\Binaries\\Win64\\BPMGame-Win64-Shipping.exe',
  'steam.exe|C:\\Program Files (x86)\\Steam\\steam.exe',
  'CONSTANCE.exe|D:\\SteamLibrary\\steamapps\\common\\Constance\\CONSTANCE.exe',
  'elevated.exe|'
].join('\r\n')

test('a process inside the game folder counts, even when it is not the exe that was launched', () => {
  assert.equal(anyMatches(LISTING, { folders: ['E:\\games\\pc\\BPM - Bullets Per Minute'], names: ['BPMGame.exe'] }), true)
})

test("the PC's own copy of the game, running from Steam, counts by its exe name", () => {
  assert.equal(anyMatches(LISTING, { folders: ['E:\\games\\pc\\Constance'], names: ['CONSTANCE.exe'] }), true)
})

test('nothing from the game running means free; Vault itself is never counted', () => {
  assert.equal(anyMatches(LISTING, { folders: ['E:\\games\\pc\\Rain World'], names: ['RainWorld.exe'] }), false)
  assert.equal(anyMatches(LISTING, { folders: ['E:\\'], names: [], exclude: ['E:\\app'] }), true)   // BPM is under E:\
  assert.equal(anyMatches('Vault.exe|E:\\app\\Vault.exe', { folders: ['E:\\'], names: [], exclude: ['E:\\app'] }), false)
})

test('a folder prefix only matches whole folder names', () => {
  assert.equal(anyMatches('x.exe|E:\\games\\pc\\BPM2\\x.exe', { folders: ['E:\\games\\pc\\BPM'], names: [] }), false)
  assert.equal(anyMatches('x.exe|e:/games/pc/bpm/x.exe', { folders: ['E:\\games\\pc\\BPM\\'], names: [] }), true)
})
