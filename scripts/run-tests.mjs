// Runs the *.test.ts files under src with Node's built-in test runner, inside
// Electron's Node (see the spawn below).
// esbuild (already installed for the build) compiles each one to out/tests
// first, so testing needs no extra dependencies.
import { build } from 'esbuild'
import { readdirSync, rmSync } from 'fs'
import { join, relative } from 'path'
import { spawnSync } from 'child_process'
import { createRequire } from 'module'

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
// Run under Electron's own Node (ELECTRON_RUN_AS_NODE), not the system one:
// better-sqlite3 is rebuilt for Electron's ABI and will not load anywhere
// else, and the cache tests open real databases with it. This is also the
// runtime the main process actually ships on.
// Output is piped and relayed: electron.exe is a Windows GUI-subsystem binary
// and does not reliably write to an inherited console.
const electronBin = createRequire(import.meta.url)('electron')
const r = spawnSync(electronBin, ['--test', ...compiled], {
  stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  maxBuffer: 64 * 1024 * 1024
})
if (r.error) {
  console.error('could not start Electron to run the tests:', r.error.message)
  process.exit(1)
}
process.stdout.write(r.stdout)
process.stderr.write(r.stderr)
process.exit(r.status ?? 1)
