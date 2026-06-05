#!/usr/bin/env node
/**
 * anime-fix — clean up Trigun anime entry.
 *
 * Dry-run by default. Pass --apply to execute.
 *
 * Operations:
 *   - Rename 26 TV episodes: strip "[Anime Time] " prefix, add S01EXX
 *   - Rename "NCOP & NCED" folder to "Openings & Endings" (extras-recognized)
 *   - Rename the 2 OP/ED files inside that folder with NCOP/NCED prefixes
 *   - Move "Trigun - Badlands Rumble" folder from anime/ to movies/
 */

import { renameSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join, extname } from 'node:path'
import { parseArgs } from 'node:util'

const ANIME = 'E:/media/anime'
const MOVIES = 'E:/media/movies'

function buildOps() {
  const ops = []
  const trigunDir = `${ANIME}/Trigun`

  // 1. TV episodes — match files at series root
  for (const f of readdirSync(trigunDir)) {
    if (extname(f).toLowerCase() !== '.mkv') continue
    const m = f.match(/^\[Anime Time\] Trigun - (\d{3}) - (.+)\.mkv$/)
    if (!m) continue
    const epNum = String(parseInt(m[1], 10)).padStart(2, '0')
    const title = m[2]
    ops.push({
      kind: 'rename',
      src: `${trigunDir}/${f}`,
      dst: `${trigunDir}/S01E${epNum} - ${title}.mkv`,
    })
  }

  // 2. Rename files inside NCOP & NCED folder FIRST (before parent rename)
  const ncOld = `${trigunDir}/NCOP & NCED`
  ops.push({
    kind: 'rename',
    src: `${ncOld}/[Anime Time] Trigun - 001 - H.T. [Creditless Opening].mkv`,
    dst: `${ncOld}/NCOP - H.T..mkv`,
  })
  ops.push({
    kind: 'rename',
    src: `${ncOld}/[Anime Time] Trigun - 002 - The Wind Blows To The Future [Creditless Ending].mkv`,
    dst: `${ncOld}/NCED - The Wind Blows To The Future.mkv`,
  })

  // 3. THEN rename the folder
  ops.push({
    kind: 'rename',
    src: ncOld,
    dst: `${trigunDir}/Openings & Endings`,
    isFolder: true,
  })

  // 4. Rename Badlands Rumble file FIRST (still inside old anime/ path)
  const brOld = `${trigunDir}/Trigun - Badlands Rumble`
  ops.push({
    kind: 'rename',
    src: `${brOld}/[Anime Time] Trigun - Badlands Rumble.mkv`,
    dst: `${brOld}/Badlands Rumble.mkv`,
  })

  // 5. THEN move the folder to movies/
  ops.push({
    kind: 'rename',
    src: brOld,
    dst: `${MOVIES}/Trigun - Badlands Rumble`,
    isFolder: true,
  })

  return ops
}

function main() {
  const { values } = parseArgs({
    options: { apply: { type: 'boolean', default: false } },
  })
  const apply = values.apply

  console.log(`[${apply ? 'APPLY' : 'DRY-RUN'}] anime-fix\n`)

  const ops = buildOps()
  let ok = 0, missing = 0, conflict = 0

  for (const op of ops) {
    if (!existsSync(op.src)) {
      console.log(`  ?  missing: ${op.src}`)
      missing++
      continue
    }
    if (existsSync(op.dst) && op.src !== op.dst) {
      console.log(`  !  conflict: ${op.dst} already exists`)
      conflict++
      continue
    }
    const shortSrc = op.src.split('/').pop()
    const shortDst = op.dst.replace('E:/media/', '').replace(/.*\//, m => m.length > 40 ? '…/' + m.slice(-40) : m)
    console.log(`  ${shortSrc}  →  ${op.dst.replace('E:/media/', '')}`)
    if (apply) renameSync(op.src, op.dst)
    ok++
  }

  console.log(`\n──────────────────────────────────────────────────`)
  console.log(`Ops: ${ok}  Missing: ${missing}  Conflicts: ${conflict}`)
  if (!apply) console.log('\nDry-run only. Re-run with --apply to execute.')
}

main()
