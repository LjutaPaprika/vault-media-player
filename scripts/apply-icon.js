#!/usr/bin/env node
// Post-build:
// 1. Move all files from win-unpacked/ up into launcher/ (flatten)
// 2. Embed icon.ico into Vault.exe using rcedit

const { execFileSync } = require('child_process')
const { readdirSync, existsSync, renameSync, rmSync } = require('fs')
const path = require('path')
const os = require('os')

const outputDir   = 'E:\\app'
const unpackedDir = path.join(outputDir, 'win-unpacked')
const icoPath     = path.join(__dirname, '..', 'build', 'icon.ico')

// 1. Flatten win-unpacked/ into app/ (remove stale targets first so rename doesn't conflict)
if (existsSync(unpackedDir)) {
  for (const entry of readdirSync(unpackedDir)) {
    const dest = path.join(outputDir, entry)
    if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
    renameSync(path.join(unpackedDir, entry), dest)
  }
  rmSync(unpackedDir, { recursive: true, force: true })
  console.log('✓ flattened win-unpacked into app/')
}

// 2. Apply icon
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
const rcedit = findRcedit()
if (existsSync(vaultExe)) {
  execFileSync(rcedit, [vaultExe, '--set-icon', icoPath])
  execFileSync(rcedit, [vaultExe,
    '--set-version-string', 'FileDescription', 'Vault',
    '--set-version-string', 'ProductName', 'Vault',
    '--set-version-string', 'InternalName', 'Vault',
    '--set-version-string', 'Comments', 'Vault',
  ])
  console.log(`✓ icon and version info applied: ${vaultExe}`)
}
