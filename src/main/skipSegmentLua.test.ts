import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { spawnSync } from 'child_process'
import { buildSkipSegmentLua } from './skipSegmentLua'

// The skip button's segment detection runs inside mpv, so these tests run the
// real thing: the generated skip-segment.lua in the drive's own mpv, on small
// MKVs given the chapter layouts found on the drive. ffmpeg (from the same
// folder, or PATH) makes the files. Without both, the tests are skipped: on a
// machine with the drive plugged in, set VAULT_DRIVE if it is not found.

const exe = process.platform === 'win32' ? '.exe' : ''
const folder = process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'mac' : 'linux'

function driveRoots(): string[] {
  if (process.env.VAULT_DRIVE) return [process.env.VAULT_DRIVE]
  if (process.platform === 'win32') return 'DEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((l) => `${l}:\\`)
  if (process.platform === 'darwin') {
    try { return readdirSync('/Volumes').map((v) => join('/Volumes', v)) } catch { return [] }
  }
  return []
}

function findTools(): { mpv: string; ffmpeg: string } | null {
  for (const root of driveRoots()) {
    const dir = join(root, 'players', 'mpv', folder)
    const mpv = join(dir, `mpv${exe}`)
    if (!existsSync(mpv)) continue
    const local = join(dir, `ffmpeg${exe}`)
    if (existsSync(local)) return { mpv, ffmpeg: local }
    if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0) return { mpv, ffmpeg: 'ffmpeg' }
  }
  return null
}

const tools = findTools()
const skip = tools ? false : 'needs the drive\'s mpv and an ffmpeg (set VAULT_DRIVE)'
const DURATION = 1440
let dir = ''
let base = ''
let script = ''

before(() => {
  if (!tools) return
  dir = mkdtempSync(join(tmpdir(), 'vault-skipseg-test-'))
  base = join(dir, 'base.mkv')
  const r = spawnSync(tools.ffmpeg, [
    '-v', 'error', '-f', 'lavfi', '-i', `color=c=black:s=16x16:r=1:d=${DURATION}`,
    '-c:v', 'ffv1', base
  ], { timeout: 60_000 })
  assert.equal(r.status, 0, `ffmpeg base: ${r.stderr}`)
  script = join(dir, 'skip-segment.lua')
  writeFileSync(script, buildSkipSegmentLua('s', 'none'), 'utf-8')
})

after(() => {
  if (dir) rmSync(dir, { recursive: true, force: true })
})

/** Chapters as [startSeconds, title]; each runs to the next (the last to the end). */
function segmentsFor(name: string, chapters: [number, string][]): { op: string; ed: string } {
  const meta = [';FFMETADATA1']
  chapters.forEach(([start, title], i) => {
    const end = i + 1 < chapters.length ? chapters[i + 1][0] : DURATION
    meta.push('[CHAPTER]', 'TIMEBASE=1/1000', `START=${start * 1000}`, `END=${end * 1000}`, `title=${title}`)
  })
  const metaFile = join(dir, `${name}.txt`)
  const file = join(dir, `${name}.mkv`)
  writeFileSync(metaFile, meta.join('\n') + '\n', 'utf-8')
  const mux = spawnSync(tools!.ffmpeg, [
    '-v', 'error', '-i', base, '-i', metaFile, '-map', '0', '-map_metadata', '1', '-map_chapters', '1', '-c', 'copy', file
  ], { timeout: 60_000 })
  assert.equal(mux.status, 0, `ffmpeg mux: ${mux.stderr}`)

  const play = spawnSync(tools!.mpv, [
    '--no-config', '--vo=null', '--ao=null', '--frames=1', `--script=${script}`,
    '--msg-level=all=no,skip_segment=v', file
  ], { timeout: 60_000, encoding: 'utf-8' })
  const out = `${play.stdout}\n${play.stderr}`
  const m = /segments: op=(\S+) ed=(\S+)/.exec(out)
  assert.ok(m, `no segments line from mpv:\n${out}`)
  return { op: m[1], ed: m[2] }
}

test('an "Opening" chapter is the OP', { skip }, () => {
  const s = segmentsFor('opening', [[0, 'Prologue'], [99, 'Opening'], [179, 'Episode'], [1334, 'Credits Start'], [1429, 'Credits End']])
  assert.equal(s.op, '99.0-179.0')
  assert.equal(s.ed, '1334.0-1429.0')
})

test('streaming markers: an "Intro" between two story chapters is the OP (Smoking Behind the Supermarket)', { skip }, () => {
  const s = segmentsFor('smoking', [[0, 'Episode'], [99, 'Intro'], [179, 'Episode'], [1334, 'Credits'], [1429, 'Episode']])
  assert.equal(s.op, '99.0-179.0')
  assert.equal(s.ed, '1334.0-1429.0')
})

test('"Scene 1 | Recap | Scene 3 | Intro" layouts find the Intro (Undead Unluck)', { skip }, () => {
  const s = segmentsFor('undead', [[0, 'Scene 1'], [5, 'Recap'], [64, 'Scene 3'], [158, 'Intro'], [248, 'Scene 5'], [1317, 'Credits']])
  assert.equal(s.op, '158.0-248.0')
})

test('an "Intro" that is the first chapter stays a cold open, whatever its length', { skip }, () => {
  assert.equal(segmentsFor('coldopen-long', [[0, 'Intro'], [298, 'Part A'], [803, 'Part B'], [1330, 'ED']]).op, '-')
  assert.equal(segmentsFor('coldopen-90', [[0, 'Intro'], [90, 'Part A'], [700, 'Part B'], [1330, 'ED']]).op, '-')
})

test('an "Intro" too short or too long for an OP is left alone', { skip }, () => {
  // Andor's title card, and a long pre-credits stretch.
  assert.equal(segmentsFor('intro-short', [[0, 'Recap'], [100, 'Intro'], [123, 'Scene 2'], [1300, 'Credits']]).op, '-')
  assert.equal(segmentsFor('intro-long', [[0, 'Part 01'], [12, 'Intro'], [393, 'Part A'], [1270, 'Credits']]).op, '-')
})

test('a real "Opening" chapter wins over an "Intro"', { skip }, () => {
  const s = segmentsFor('both', [[0, 'Episode'], [60, 'Intro'], [150, 'Opening'], [240, 'Part A'], [1330, 'Ending']])
  assert.equal(s.op, '150.0-240.0')
})
