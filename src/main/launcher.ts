import { spawn } from 'child_process'
import { existsSync, mkdirSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'

// ─── Emulator map ─────────────────────────────────────────────────────────────

const PLATFORM_EMULATOR: Record<string, string> = {
  n64:      'simple64',
  gamecube: 'dolphin',
  wii:      'dolphin',
  xbox360:  'xenia',
  ps4:      'shadps4',
  gba:      'mgba',
  nds:      'melonds',
  snes:     'snes9x',
  gb:       'mgba',
  gbc:      'mgba'
}

function platformFolder(): string {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'mac'
  return 'linux'
}

function getEmulatorPath(driveRoot: string, name: string): string {
  const ext = process.platform === 'win32' ? '.exe' : ''
  return join(driveRoot, 'emulators', name, platformFolder(), `${name}${ext}`)
}

const MPV_CONF = `\
# Player config
osd-font-size=32
osd-border-size=1.5
osd-bar-w=95
osd-bar-h=2
`

function getMpvPath(driveRoot: string): string {
  const ext = process.platform === 'win32' ? '.exe' : ''
  return join(driveRoot, 'players', 'mpv', platformFolder(), `mpv${ext}`)
}

const SUB_ENGLISH_LUA = `\
-- Auto-select English subtitles on file load.
-- Overrides 'j' to toggle only between English and off.
local function find_english_sid()
  local count = mp.get_property_number('track-list/count', 0)
  for i = 0, count - 1 do
    local t = mp.get_property(string.format('track-list/%d/type', i))
    if t == 'sub' then
      local lang = mp.get_property(string.format('track-list/%d/lang', i)) or ''
      if lang:lower():match('^en') then
        return mp.get_property_number(string.format('track-list/%d/id', i))
      end
    end
  end
  return nil
end

mp.register_event('file-loaded', function()
  local sid = find_english_sid()
  if sid then
    mp.set_property('sid', tostring(sid))
  else
    mp.set_property('sid', 'no')
  end
end)

mp.add_key_binding('j', 'sub-english-cycle', function()
  local current = mp.get_property('sid')
  if current == 'no' then
    local sid = find_english_sid()
    if sid then
      mp.set_property('sid', tostring(sid))
      mp.osd_message('Subtitles: English')
    else
      mp.osd_message('No English subtitles available')
    end
  else
    mp.set_property('sid', 'no')
    mp.osd_message('Subtitles: Off')
  end
end)
`

const INPUT_CONF = `\
# Seek 10 seconds back/forward with arrow keys
RIGHT seek 10
LEFT  seek -10
# Shift+arrow for finer 3-second seeks
SHIFT+RIGHT seek 3
SHIFT+LEFT  seek -3
`

function ensureMpvConfig(mpvExePath: string): string {
  const configDir = join(dirname(mpvExePath), 'portable_config')
  const configFile = join(configDir, 'mpv.conf')
  mkdirSync(join(configDir, 'scripts'), { recursive: true })
  writeFileSync(configFile, MPV_CONF, 'utf-8')
  writeFileSync(join(configDir, 'input.conf'), INPUT_CONF, 'utf-8')
  writeFileSync(join(configDir, 'scripts', 'sub-english.lua'), SUB_ENGLISH_LUA, 'utf-8')
  return configFile
}

function spawnDetached(exe: string, args: string[]): void {
  const child = spawn(exe, args, {
    detached: true,
    stdio: 'ignore'
  })
  child.unref()
}

/**
 * driveRoot is the resolved path to the VAULT drive (e.g. "E:\").
 * It is resolved in ipc.ts via findDriveByLabel so launcher.ts has
 * no dependency on the database or drive detection logic.
 */
export function openVideo(filePath: string, driveRoot: string): void {
  const mpv = getMpvPath(driveRoot)
  console.log('[launcher] driveRoot:', driveRoot)
  console.log('[launcher] mpv path:', mpv)
  console.log('[launcher] mpv exists:', existsSync(mpv))
  if (existsSync(mpv)) {
    const configFile = ensureMpvConfig(mpv)
    console.log('[launcher] config written to:', configFile)
    spawnDetached(mpv, ['--fullscreen', `--include=${configFile}`, filePath])
  } else {
    console.log('[launcher] mpv not found, falling back to system default')
    openWithSystem(filePath)
  }
}

export function openAudio(filePath: string, driveRoot: string): void {
  const mpv = getMpvPath(driveRoot)
  if (existsSync(mpv)) {
    spawnDetached(mpv, [filePath])
  } else {
    openWithSystem(filePath)
  }
}

export function launchGame(filePath: string, platform: string, driveRoot: string): void {
  if (platform === 'pc') {
    spawnDetached(filePath, [])
    return
  }

  const emulatorName = PLATFORM_EMULATOR[platform]
  if (!emulatorName) {
    throw new Error(`No emulator configured for platform: ${platform}`)
  }

  const emulatorExe = getEmulatorPath(driveRoot, emulatorName)
  if (!existsSync(emulatorExe)) {
    throw new Error(
      `Emulator not found at ${emulatorExe}. ` +
      `On this OS (${process.platform}), ${platform} games may not be supported.`
    )
  }

  spawnDetached(emulatorExe, [filePath])
}

function openWithSystem(filePath: string): void {
  const cmd =
    process.platform === 'win32' ? 'start' :
    process.platform === 'darwin' ? 'open' :
    'xdg-open'

  const child = spawn(cmd, [filePath], {
    shell: true,
    detached: true,
    stdio: 'ignore'
  })
  child.unref()
}
