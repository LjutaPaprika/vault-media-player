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

const outputDir   = 'E:\\app'
const unpackedDir = path.join(outputDir, 'win-unpacked')
const icoPath     = path.join(__dirname, '..', 'build', 'icon.ico')

// Build artifacts written by electron-builder that serve no runtime purpose
const BUILD_ARTIFACTS = new Set(['builder-debug.yml', 'builder-effective-config.yaml'])

// 1. Flatten win-unpacked/ into app/
if (existsSync(unpackedDir)) {
  for (const entry of readdirSync(unpackedDir)) {
    const dest = path.join(outputDir, entry)
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
    renameSync(path.join(unpackedDir, entry), dest)
  }
  rmSync(unpackedDir, { recursive: true, force: true })
  console.log('✓ flattened win-unpacked into app/')
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
