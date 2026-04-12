#!/usr/bin/env node
// electron-builder afterPack hook — clears the hidden/system attribute
// that electron-builder sets on the win-unpacked output directory.

const { spawnSync } = require('child_process')

exports.default = async ({ appOutDir }) => {
  if (process.platform !== 'win32') return
  spawnSync('attrib', ['-h', '-s', appOutDir], { shell: true })
}
