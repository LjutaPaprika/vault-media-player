#!/usr/bin/env node
/**
 * wha-rename — apply decimal naming convention to Witch Hat Atelier chapters.
 *
 * Dry-run by default. Pass --apply to actually rename/delete.
 *
 * Usage:
 *   node index.js                  # dry-run
 *   node index.js --apply          # execute
 *   node index.js --dir <path>     # override series folder
 */

import { renameSync, unlinkSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const DEFAULT_DIR = 'E:/media/manga/Witch Hat Atelier'
const PREFIX = 'Witch Hat Atelier, Chapter '

const RENAMES = [
  ['5e',  '5.5'],
  ['23e', '23.5'],
  ['35f', '35.6'],
  ['40f', '40.6'],
  ['41i', '41.7'],
  ['42e', '42.5'],
  ['42i', '42.7'],
  ['43i', '43.7'],
  ['51e', '51.5'],
  ['67e', '67.5'],
  ['90e', '90.5'],
  ['92a', '92.1'],
  ['92b', '92.2'],
  ['93a', '93.1'],
  ['93b', '93.2'],
]

const DELETES = ['90a', '90b']

function main() {
  const { values } = parseArgs({
    options: {
      apply: { type: 'boolean', default: false },
      dir:   { type: 'string',  default: DEFAULT_DIR },
    },
  })

  const dir = values.dir
  const apply = values.apply

  if (!existsSync(dir)) {
    console.error(`Directory not found: ${dir}`)
    process.exit(1)
  }

  const existing = new Set(readdirSync(dir))
  const mode = apply ? 'APPLY' : 'DRY-RUN'
  console.log(`[${mode}] ${dir}\n`)

  let renamed = 0, deleted = 0, missing = 0, conflicts = 0

  console.log('── Renames ─────────────────────────────')
  for (const [from, to] of RENAMES) {
    const src = `${PREFIX}${from}.cbz`
    const dst = `${PREFIX}${to}.cbz`

    if (!existing.has(src)) {
      console.log(`  ?  missing source: ${src}`)
      missing++
      continue
    }
    if (existing.has(dst)) {
      console.log(`  !  conflict (dest exists): ${dst}`)
      conflicts++
      continue
    }

    console.log(`  ${src}  →  ${dst}`)
    if (apply) {
      renameSync(join(dir, src), join(dir, dst))
      existing.delete(src)
      existing.add(dst)
    }
    renamed++
  }

  console.log('\n── Deletes ─────────────────────────────')
  for (const tag of DELETES) {
    const f = `${PREFIX}${tag}.cbz`
    if (!existing.has(f)) {
      console.log(`  ?  missing: ${f}`)
      missing++
      continue
    }
    console.log(`  delete ${f}`)
    if (apply) {
      unlinkSync(join(dir, f))
      existing.delete(f)
    }
    deleted++
  }

  console.log('\n────────────────────────────────────────')
  console.log(`Renames: ${renamed}  Deletes: ${deleted}  Missing: ${missing}  Conflicts: ${conflicts}`)
  if (!apply) console.log('\nDry-run only. Re-run with --apply to execute.')
}

main()
