import { spawn } from 'child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { basename, dirname, extname, join } from 'path'
import { getBindings, type ControllerBinding } from './controllerBindings'
import { getKeyboardBindings } from './keyboardBindings'
import { buildSkipSegmentLua } from './skipSegmentLua'

// ─── Emulator map ─────────────────────────────────────────────────────────────

const PLATFORM_EMULATOR: Record<string, string> = {
  n64:      'simple64',
  gamecube: 'dolphin',
  wii:      'dolphin',
  xbox:     'xemu',
  xbox360:  'xenia',
  ps4:      'shadps4',
  gba:      'mgba',
  nds:      'melonds',
  snes:     'snes9x',
  gb:       'mgba',
  gbc:      'mgba',
  mame:     'mame'
}

function platformFolder(): string {
  if (process.platform === 'win32') return 'windows'
  if (process.platform === 'darwin') return 'mac'
  return 'linux'
}

const EMULATOR_SUBDIR: Partial<Record<string, string>> = {
  dolphin: 'Dolphin-x64',
}

// Mac emulators distribute as `.app` bundles; the real binary lives inside.
// Map<emulator-name, path-within-emulators/<name>/mac/>. Same pattern as mpv
// (see getMpvPath). If an emulator isn't listed here, falls back to the
// raw-binary layout used by Linux.
const MAC_EMULATOR_BUNDLE: Partial<Record<string, string>> = {
  mgba:     'mGBA.app/Contents/MacOS/mGBA',
  dolphin:  'Dolphin.app/Contents/MacOS/Dolphin',
  melonds:  'melonDS.app/Contents/MacOS/melonDS',
  snes9x:   'Snes9x.app/Contents/MacOS/Snes9x',
  simple64: 'simple64.app/Contents/MacOS/simple64',
  shadps4:  'shadps4.app/Contents/MacOS/shadps4',
  xemu:     'xemu.app/Contents/MacOS/xemu',
  // MAME is a true CLI on macOS (Homebrew or self-build) — falls through to raw binary.
}

function getEmulatorPath(driveRoot: string, name: string): string {
  const base = join(driveRoot, 'emulators', name, platformFolder())

  if (process.platform === 'darwin') {
    const bundlePath = MAC_EMULATOR_BUNDLE[name]
    if (bundlePath) return join(base, bundlePath)
    return join(base, name) // CLI emulator (mame)
  }

  const ext = process.platform === 'win32' ? '.exe' : ''
  const sub = EMULATOR_SUBDIR[name]
  const exeName = name === 'dolphin' ? 'Dolphin' : name
  return sub ? join(base, sub, `${exeName}${ext}`) : join(base, `${name}${ext}`)
}

// ─── MPV config builders ──────────────────────────────────────────────────────

function buildMpvConf(hwdec: string): string {
  return `\
# Player config
osd-font-size=32
osd-border-size=1.5
osd-bar-w=95
osd-bar-h=2
# Replace mpv's built-in OSC with uosc (vendored under scripts/uosc/).
# Without this, both bars try to render and you get a double UI.
osc=no
# Enable SDL2 gamepad input
input-gamepad=yes
# Hardware decoding
hwdec=${hwdec}
`
}

const MPV_KEY_COMMANDS: Record<string, string> = {
  'mpv-seek-fwd-10': 'seek 10',
  'mpv-seek-bwd-10': 'seek -10',
  'mpv-seek-fwd-3':  'seek 3',
  'mpv-seek-bwd-3':  'seek -3',
}

function buildInputConf(controllerBindings: ControllerBinding[]): string {
  const kbBindings = getKeyboardBindings()
  const keyboardLines = kbBindings
    .filter((b) => b.context === 'mpv' && MPV_KEY_COMMANDS[b.action])
    .map((b) => `${b.key.padEnd(24)}${MPV_KEY_COMMANDS[b.action]}`)
    .join('\n')

  const gamepadLines = controllerBindings
    .filter((b) => !b.isLua && b.button !== 'none')
    .map((b) => `${b.button.padEnd(24)}${b.command}`)
    .join('\n')

  return `\
# ── Keyboard ────────────────────────────────────────────────────────────────
${keyboardLines}

# ── Gamepad ──────────────────────────────────────────────────────────────────
${gamepadLines}
`
}

function buildLuaScript(subtitleButton: string, subtitleKey: string): string {
  const gamepadBinding = subtitleButton !== 'none'
    ? `mp.add_key_binding('${subtitleButton}', 'sub-english-cycle-gamepad', toggle_english_sub)\n`
    : ''

  return `\
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

local function toggle_english_sub()
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
end

mp.add_key_binding('${subtitleKey}', 'sub-english-cycle', toggle_english_sub)
${gamepadBinding}`
}

function getMpvPath(driveRoot: string): string {
  if (process.platform === 'darwin') {
    return join(driveRoot, 'players', 'mpv', 'mac', 'mpv.app', 'Contents', 'MacOS', 'mpv')
  }
  const ext = process.platform === 'win32' ? '.exe' : ''
  return join(driveRoot, 'players', 'mpv', platformFolder(), `mpv${ext}`)
}

// Returns a path to a bundled tool, falling back to the bare command name (PATH lookup).
export function getToolPath(driveRoot: string, toolName: string): string {
  const ext = process.platform === 'win32' ? '.exe' : ''
  const bundled = join(driveRoot, 'players', 'mpv', platformFolder(), `${toolName}${ext}`)
  return existsSync(bundled) ? bundled : toolName
}

function ensureMpvConfig(mpvExePath: string, hwdec: string): string {
  const bindings = getBindings()
  const kbBindings = getKeyboardBindings()
  const subtitleButton = bindings.find((b) => b.action === 'subtitles')?.button ?? 'GAMEPAD_Y'
  const subtitleKey = kbBindings.find((b) => b.action === 'mpv-subtitles')?.key ?? 'j'
  const skipKey = kbBindings.find((b) => b.action === 'mpv-skip-segment')?.key ?? 's'
  const skipButton = bindings.find((b) => b.action === 'skip-segment')?.button ?? 'none'

  const configDir = join(dirname(mpvExePath), 'portable_config')
  const configFile = join(configDir, 'mpv.conf')
  mkdirSync(join(configDir, 'scripts'), { recursive: true })
  writeFileSync(configFile, buildMpvConf(hwdec), 'utf-8')
  writeFileSync(join(configDir, 'input.conf'), buildInputConf(bindings), 'utf-8')
  writeFileSync(join(configDir, 'scripts', 'sub-english.lua'), buildLuaScript(subtitleButton, subtitleKey), 'utf-8')
  writeFileSync(join(configDir, 'scripts', 'skip-segment.lua'), buildSkipSegmentLua(skipKey, skipButton), 'utf-8')
  // Remove legacy skip-intro.lua so its 'C' button doesn't appear alongside ours.
  rmSync(join(configDir, 'scripts', 'skip-intro.lua'), { force: true })
  return configFile
}

// ─── Spawn helpers ────────────────────────────────────────────────────────────

function spawnDetached(exe: string, args: string[]): void {
  const opts = {
    cwd: dirname(exe),
    detached: true,
    stdio: 'ignore' as const
  }
  if (process.platform === 'win32') {
    // Shell-wrap to dodge EACCES from CreateProcess on exFAT removable drives.
    // `start ""` hands foreground rights to the spawned process; without it,
    // mpv/emulators come up behind whatever else has focus.
    const quoted = [exe, ...args].map(a => `"${a}"`).join(' ')
    const child = spawn(`start "" ${quoted}`, [], { ...opts, shell: true })
    child.unref()
  } else {
    const child = spawn(exe, args, opts)
    child.unref()
  }
}

export function openWithSystem(filePath: string): void {
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

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * driveRoot is the resolved path to the VAULT drive (e.g. "E:\").
 * It is resolved in ipc.ts via findDriveByLabel so launcher.ts has
 * no dependency on the database or drive detection logic.
 */
export function openVideo(filePath: string, driveRoot: string, hwdec = 'off', category?: string): void {
  const mpv = getMpvPath(driveRoot)
  if (existsSync(mpv)) {
    const configFile = ensureMpvConfig(mpv, hwdec)
    const configDir = dirname(configFile)
    const langArgs = category === 'anime'
      ? ['--alang=ja,jpn,jp', '--slang=en,eng']
      : []
    // Windows mpv auto-discovers portable_config next to mpv.exe, so --include is enough.
    // Mac/Linux builds don't have that convention — point mpv at the config dir explicitly
    // so input.conf and scripts/ load.
    const configArg = process.platform === 'win32'
      ? `--include=${configFile}`
      : `--config-dir=${configDir}`
    spawnDetached(mpv, ['--fullscreen', configArg, ...langArgs, filePath])
  } else {
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
    if (process.platform !== 'win32') {
      throw new Error('PC games are Windows-only and cannot be launched on this OS.')
    }
    spawnDetached(filePath, [])
    return
  }

  const emulatorName = PLATFORM_EMULATOR[platform]
  if (!emulatorName) {
    throw new Error(`No emulator configured for platform: ${platform}`)
  }

  // Xenia (Xbox 360) is Windows-only — no Mac/Linux build exists
  if (platform === 'xbox360' && process.platform !== 'win32') {
    throw new Error('Xbox 360 emulation via Xenia is only supported on Windows.')
  }

  const emulatorExe = getEmulatorPath(driveRoot, emulatorName)
  if (!existsSync(emulatorExe)) {
    throw new Error(
      `Emulator not found at ${emulatorExe}. ` +
      `On this OS (${process.platform}), ${platform} games may not be supported.`
    )
  }

  if (platform === 'mame') {
    const romDir   = dirname(filePath)
    const gameName = basename(filePath, extname(filePath))
    // Don't use detached mode for MAME — it needs foreground focus for input to work
    const mameDir = dirname(emulatorExe)
    const cfgDir  = join(mameDir, 'cfg')
    const mameKeyboard = process.platform === 'win32' ? 'win32' : process.platform === 'darwin' ? 'osx' : 'x11'
    const child = spawn(emulatorExe, ['-rompath', romDir, '-cfg_directory', cfgDir, '-skip_gameinfo', '-keyboardprovider', mameKeyboard, gameName], {
      stdio: 'ignore'
    })
    child.unref()
    return
  }

  if (platform === 'xbox') {
    // xemu picks up xemu.toml next to xemu.exe; cwd ensures the relative bootrom/flashrom/hdd paths resolve.
    spawnDetached(emulatorExe, ['-dvd_path', filePath])
    return
  }

  spawnDetached(emulatorExe, [filePath])
}
