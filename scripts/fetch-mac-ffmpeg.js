#!/usr/bin/env node
// Pulls static ffmpeg binaries used by the Mac DMG's episode-still grabber.
// Runs before `electron-builder --mac` so a fresh clone can build Mac DMGs
// without a manual download step. The binaries end up inside the .app and the
// one that ships to other machines (user's sister), so each download is pinned
// by SHA-256 and verified before anything is executed.
//
// The script is strict:
//   - The zip hash is checked before unzipping.
//   - The extracted binary hash is checked before it is chmod/xattr'd.
//   - A local binary that is already in place is also verified; a stale or
//     replaced file fails the build loudly rather than silently going out.
//   - curl runs with -fsSL so an HTTP error fails here instead of in unzip.
//
// Updating a pinned version: change URL + both hashes together. Rebuild and
// confirm the shipped binary's hash matches what you intended.
//
// arm64 — osxexperts.net builds (unversioned URL, pinned by hash)
// x64   — evermeet.cx (per-version URL and hash)

const { mkdirSync, existsSync, chmodSync, readdirSync, statSync, unlinkSync, rmSync, readFileSync } = require('fs')
const { createHash } = require('crypto')
const { join } = require('path')
const { spawnSync } = require('child_process')

// Pinned to the ffmpeg 9.0 build currently on resources/mac-${arch}/ffmpeg.
// SHAs taken from the exact files shipped in 1.30.6; see MAC-GAMING-HANDOFF.md.
const SOURCES = [
  {
    arch:    'arm64',
    url:     'https://www.osxexperts.net/ffmpeg9arm.zip',
    zip:     'ffmpeg-arm.zip',
    zipSha:  'd0c06c5c68ce48af3143b262f7a9118a7c9f67de1e237fcc24ffb14df9c67af9',
    binSha:  '591260c945d0eef150e3bf82b0ef988bd36a9cecc18ff05d6679617159f0a95e',
  },
  {
    arch:    'x64',
    url:     'https://evermeet.cx/ffmpeg/ffmpeg-9.0.2.zip',
    zip:     'ffmpeg-x64.zip',
    zipSha:  '4acc0be580f9b2788029eb7bd4d645ff87968911b0a62aeeb3940d42d54558d5',
    binSha:  'a45b462cf91ed89148ae218c4577e30896485d7a6792c3673bcf5f823fa01b63',
  },
]

const ROOT = join(__dirname, '..', 'resources')

function sha256(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed`)
}

function fail(path, label, want, got) {
  try { unlinkSync(path) } catch { /* ignore */ }
  throw new Error(`[fetch-mac-ffmpeg] ${label} hash mismatch\n  expected ${want}\n  got      ${got}\n  removed ${path}`)
}

for (const { arch, url, zip, zipSha, binSha } of SOURCES) {
  const dir = join(ROOT, `mac-${arch}`)
  const out = join(dir, 'ffmpeg')

  if (existsSync(out)) {
    const got = sha256(out)
    if (got !== binSha) fail(out, `${arch}: local ffmpeg`, binSha, got)
    console.log(`[fetch-mac-ffmpeg] ${arch}: already present and verified`)
    continue
  }

  mkdirSync(dir, { recursive: true })
  const zipPath = join(dir, zip)
  console.log(`[fetch-mac-ffmpeg] ${arch}: downloading ${url}`)
  run('curl', ['-fsSL', url, '-o', zipPath])

  const gotZip = sha256(zipPath)
  if (gotZip !== zipSha) fail(zipPath, `${arch}: zip`, zipSha, gotZip)

  console.log(`[fetch-mac-ffmpeg] ${arch}: extracting`)
  run('unzip', ['-o', '-d', dir, zipPath])
  unlinkSync(zipPath)
  rmSync(join(dir, '__MACOSX'), { recursive: true, force: true })

  if (!existsSync(out)) {
    // Some archives nest the binary; find it.
    const found = readdirSync(dir).find((n) => statSync(join(dir, n)).isFile() && n.toLowerCase().startsWith('ffmpeg'))
    if (!found) throw new Error(`${arch}: ffmpeg not found after unzip`)
    if (found !== 'ffmpeg') run('mv', [join(dir, found), out])
  }

  const gotBin = sha256(out)
  if (gotBin !== binSha) fail(out, `${arch}: extracted ffmpeg`, binSha, gotBin)

  chmodSync(out, 0o755)
  console.log(`[fetch-mac-ffmpeg] ${arch}: ready at ${out}`)
}
