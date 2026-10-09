#!/usr/bin/env node
// Pulls static ffmpeg binaries used by the Mac DMG's episode-still grabber.
// Runs before `electron-builder --mac` so a fresh clone can build Mac DMGs
// without a manual download step. The files are gitignored to keep the repo
// small.
//
// arm64 — osxexperts.net, built with Apple's clang against static deps
// x64   — evermeet.cx, the long-standing Mac static-ffmpeg host

const { mkdirSync, existsSync, chmodSync, readdirSync, statSync, unlinkSync, rmSync } = require('fs')
const { join } = require('path')
const { spawnSync } = require('child_process')

const SOURCES = [
  { arch: 'arm64', url: 'https://www.osxexperts.net/ffmpeg9arm.zip', zip: 'ffmpeg-arm.zip' },
  { arch: 'x64',   url: 'https://evermeet.cx/ffmpeg/getrelease/zip', zip: 'ffmpeg-x64.zip' },
]

const ROOT = join(__dirname, '..', 'resources')

function run(cmd, args, opts) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`)
}

for (const { arch, url, zip } of SOURCES) {
  const dir = join(ROOT, `mac-${arch}`)
  const out = join(dir, 'ffmpeg')
  if (existsSync(out)) {
    console.log(`[fetch-mac-ffmpeg] ${arch}: already present`)
    continue
  }
  mkdirSync(dir, { recursive: true })
  const zipPath = join(dir, zip)
  console.log(`[fetch-mac-ffmpeg] ${arch}: downloading ${url}`)
  run('curl', ['-sL', url, '-o', zipPath])
  console.log(`[fetch-mac-ffmpeg] ${arch}: extracting`)
  run('unzip', ['-o', '-d', dir, zipPath])
  // Both zips drop a bare `ffmpeg` at the root; osxexperts also adds __MACOSX.
  unlinkSync(zipPath)
  rmSync(join(dir, '__MACOSX'), { recursive: true, force: true })
  if (!existsSync(out)) {
    // Some archives nest the binary; find it.
    const found = readdirSync(dir).find((n) => statSync(join(dir, n)).isFile() && n.toLowerCase().startsWith('ffmpeg'))
    if (!found) throw new Error(`${arch}: ffmpeg not found after unzip`)
    if (found !== 'ffmpeg') run('mv', [join(dir, found), out])
  }
  chmodSync(out, 0o755)
  // Strip quarantine so the bundled binary runs on a fresh macOS install.
  spawnSync('xattr', ['-c', out], { stdio: 'ignore' })
  console.log(`[fetch-mac-ffmpeg] ${arch}: ready at ${out}`)
}
