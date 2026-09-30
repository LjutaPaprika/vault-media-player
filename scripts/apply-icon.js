#!/usr/bin/env node
// Post-build:
// 1. Move all files from win-unpacked/ up into app/ (flatten)
// 2. Delete electron-builder build artifacts (not needed at runtime)
// 3. Embed icon.ico and version info into Vault.exe using rcedit
// 4. Unhide app/ folder, hide everything inside except Vault.exe

const { execFileSync, spawnSync } = require('child_process')
const { readdirSync, existsSync, renameSync, rmSync } = require('fs')
const path = require('path')
const os = require('os')

// Overridable so the flatten can be exercised against a scratch folder.
const outputDir   = process.env.VAULT_APP_DIR || 'E:\\app'
const unpackedDir = path.join(outputDir, 'win-unpacked')
const icoPath     = path.join(__dirname, '..', 'build', 'icon.ico')

// Build artifacts written by electron-builder that serve no runtime purpose
const BUILD_ARTIFACTS = new Set(['builder-debug.yml', 'builder-effective-config.yaml'])

// 1. Flatten win-unpacked/ into app/, all or nothing.
//
// Each item being replaced is renamed aside first, not deleted. Deleting went
// file by file and stopped at the first locked one, which once left
// app\resources holding the old app.asar but no app.asar.unpacked (the native
// modules): the app then failed at launch, windowless, until redeployed.
// Renaming a folder fails outright on Windows while anything inside is open,
// so a lock is found before anything is lost; every step taken is then undone
// and app/ stays exactly as it was. Old copies go only once all of the new
// build is in place.
if (existsSync(unpackedDir)) {
  const ASIDE = '.pre-deploy'
  const done = []
  try {
    for (const entry of readdirSync(unpackedDir)) {
      const dest = path.join(outputDir, entry)
      const aside = dest + ASIDE
      if (existsSync(aside)) rmSync(aside, { recursive: true, force: true }) // left by an earlier run
      const hadOld = existsSync(dest)
      if (hadOld) renameSync(dest, aside)
      try {
        renameSync(path.join(unpackedDir, entry), dest)
      } catch (err) {
        if (hadOld) renameSync(aside, dest)
        throw err
      }
      done.push({ entry, hadOld })
    }
  } catch (err) {
    for (const { entry, hadOld } of done.reverse()) {
      const dest = path.join(outputDir, entry)
      renameSync(dest, path.join(unpackedDir, entry))
      if (hadOld) renameSync(dest + ASIDE, dest)
    }
    console.error(`✗ flatten aborted, app/ left unchanged (${err.code || err.message})`)
    console.error('  Something has a file in app/ open: the app itself, or VS Code. Close it, then rerun: node scripts/apply-icon.js')
    process.exit(1)
  }
  const stuck = []
  for (const { entry, hadOld } of done) {
    if (!hadOld) continue
    try { rmSync(path.join(outputDir, entry + ASIDE), { recursive: true, force: true }) } catch { stuck.push(entry + ASIDE) }
  }
  rmSync(unpackedDir, { recursive: true, force: true })
  console.log('✓ flattened win-unpacked into app/')
  if (stuck.length) console.warn(`  old copies still locked, safe to delete later: ${stuck.join(', ')}`)
}

// 2. Delete build artifacts
for (const artifact of BUILD_ARTIFACTS) {
  const p = path.join(outputDir, artifact)
  if (existsSync(p)) rmSync(p, { force: true })
}
console.log('✓ build artifacts removed')

// 3. Apply icon and version info
function findRcedit() {
  const cacheBase = path.join(os.homedir(), 'AppData', 'Local', 'electron-builder', 'Cache', 'winCodeSign')
  if (!existsSync(cacheBase)) throw new Error('electron-builder winCodeSign cache not found')
  const dirs = readdirSync(cacheBase).sort().reverse()
  for (const dir of dirs) {
    const rcedit = path.join(cacheBase, dir, 'rcedit-x64.exe')
    if (existsSync(rcedit)) return rcedit
  }
  throw new Error('rcedit-x64.exe not found in electron-builder cache')
}

const vaultExe = path.join(outputDir, 'Vault.exe')
if (existsSync(vaultExe)) {
  const rcedit = findRcedit()
  execFileSync(rcedit, [vaultExe, '--set-icon', icoPath])
  execFileSync(rcedit, [vaultExe,
    '--set-version-string', 'FileDescription', 'Vault',
    '--set-version-string', 'ProductName', 'Vault',
    '--set-version-string', 'InternalName', 'Vault',
    '--set-version-string', 'Comments', 'Vault',
  ])
  console.log(`✓ icon and version info applied: ${vaultExe}`)
}

// 4. Unhide app/ folder itself, hide all contents except Vault.exe
spawnSync('attrib', ['-h', '-s', outputDir], { shell: true })
for (const entry of readdirSync(outputDir)) {
  if (entry === 'Vault.exe' || entry === 'Vault-arm64.dmg' || entry === 'Vault-x64.dmg') continue
  spawnSync('attrib', ['+h', path.join(outputDir, entry)], { shell: true })
}
console.log('✓ app/ visible, internals hidden')
