// Runs the *.test.ts files under src with Node's built-in test runner.
// esbuild (already installed for the build) compiles each one to out/tests
// first, so testing needs no extra dependencies.
import { build } from 'esbuild'
import { readdirSync, rmSync } from 'fs'
import { join, relative } from 'path'
import { spawnSync } from 'child_process'

const root = new URL('..', import.meta.url).pathname.replace(/^\/([a-z]:)/i, '$1')
const outdir = join(root, 'out', 'tests')

function findTests(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name)
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : findTests(p)
    return e.name.endsWith('.test.ts') ? [p] : []
  })
}

const only = process.argv.slice(2)
const entries = findTests(join(root, 'src')).filter((f) => only.length === 0 || only.some((o) => f.includes(o)))
if (entries.length === 0) {
  console.error('no test files found')
  process.exit(1)
}

rmSync(outdir, { recursive: true, force: true })
await build({
  entryPoints: entries,
  outdir,
  outbase: join(root, 'src'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  outExtension: { '.js': '.cjs' },
  // Tests must not need Electron; a module that pulls it in is not unit-testable.
  external: ['electron', 'better-sqlite3', 'sharp'],
  logLevel: 'warning'
})

const compiled = entries.map((f) => join(outdir, relative(join(root, 'src'), f)).replace(/\.ts$/, '.cjs'))
const r = spawnSync(process.execPath, ['--test', ...compiled], { stdio: 'inherit' })
process.exit(r.status ?? 1)
