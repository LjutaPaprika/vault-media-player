import { spawn } from 'child_process'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs'
import { basename, dirname, extname, join } from 'path'
import { getBindings, toMpvKey, type ControllerBinding } from './controllerBindings'
import { getKeyboardBindings } from './keyboardBindings'
import { buildSkipSegmentLua } from './skipSegmentLua'
import { buildProgressLua } from './playbackProgress'
import { startPlaytimeSession } from './playtime'
import { ensureSaveLinks } from './saveLinks'

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
    .map((b) => `${b.key.padEnd(23)} ${MPV_KEY_COMMANDS[b.action]}`)
    .join('\n')

  const gamepadLines = controllerBindings
    .filter((b) => !b.isLua && b.button !== 'none')
    .map((b) => `${toMpvKey(b.button).padEnd(23)} ${b.command}`)
    .join('\n')

  return `\
# ── Keyboard ────────────────────────────────────────────────────────────────
${keyboardLines}

# ── Gamepad ──────────────────────────────────────────────────────────────────
${gamepadLines}
`
}

function buildLuaScript(
  subtitleButton: string,
  subtitleKey: string,
  controllerBindings: ControllerBinding[]
): string {
  const gamepadBinding = subtitleButton !== 'none'
    ? `mp.add_key_binding('${subtitleButton}', 'sub-english-cycle-gamepad', toggle_english_sub)\n`
    : ''

  // Every gamepad key this config binds, so the focus guard below neutralises
  // exactly those and nothing else.
  const guarded = [
    ...controllerBindings.filter((b) => b.button !== 'none').map((b) => toMpvKey(b.button)),
    ...(subtitleButton !== 'none' ? [subtitleButton] : [])
  ]
  const keyList = [...new Set(guarded)].map((k) => `'${k}'`).join(', ')

  return `\
-- Auto-select English subtitles on file load.
-- Overrides 'j' to toggle only between English and off.
--
-- Anime releases frequently ship multiple English tracks — a "Signs & Songs"
-- track for on-screen text only and a "Full Subtitles" track for dialogue.
-- The first-match approach picked whichever the muxer ordered first, often
-- Signs & Songs. Score each English track by title/flag signals and pick the
-- highest scorer, so Full Subtitles wins when both exist.
local function score_track(title, forced, is_default)
  local score = 100
  local t = (title or ''):lower()
  if t:find('sign') or t:find('song') then score = score - 50 end
  if t:find('full') or t:find('dialog') then score = score + 30 end
  if t:find('commentary') then score = score - 80 end
  if t:find('sdh') or t:find('hearing') then score = score - 20 end
  if forced then score = score - 50 end
  if is_default then score = score + 10 end
  return score
end

local function find_english_sid()
  local count = mp.get_property_number('track-list/count', 0)
  local best_id, best_score = nil, -math.huge
  for i = 0, count - 1 do
    local t = mp.get_property(string.format('track-list/%d/type', i))
    if t == 'sub' then
      local lang  = (mp.get_property(string.format('track-list/%d/lang', i))  or ''):lower()
      local title =  mp.get_property(string.format('track-list/%d/title', i)) or ''
      -- Some tracks lack a lang code but declare English in the title (fansub muxes).
      local is_english = lang:match('^en') or title:lower():find('english')
      if is_english then
        local forced     = mp.get_property_bool(string.format('track-list/%d/forced', i), false)
        local is_default = mp.get_property_bool(string.format('track-list/%d/default', i), false)
        local score      = score_track(title, forced, is_default)
        if score > best_score then
          best_score = score
          best_id    = mp.get_property_number(string.format('track-list/%d/id', i))
        end
      end
    end
  end
  return best_id
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
${gamepadBinding}
-- ── Release the controller while mpv is not the focused window ──────────────
--
-- mpv's gamepad support runs through SDL2, which reads the device at OS level
-- and has no notion of window focus. A player left open behind something else
-- therefore kept acting on the pad while it was driving a game - most visibly
-- D-pad up, which is bound to volume.
--
-- Two mechanisms, because one of them cannot be verified from here: clearing
-- input-gamepad should stop SDL reading at all, but whether mpv tears the
-- reader down at runtime rather than only honouring the option at startup is
-- not something this script can confirm. The forced no-op bindings guarantee
-- the keys do nothing either way, since forced bindings outrank input.conf.
local GUARDED_KEYS = { ${keyList} }
local released = false

local function release_pad()
  if released then return end
  released = true
  mp.set_property('input-gamepad', 'no')
  for _, k in ipairs(GUARDED_KEYS) do
    mp.add_forced_key_binding(k, 'vault-unfocused-' .. k, function() end)
  end
end

local function reclaim_pad()
  if not released then return end
  released = false
  for _, k in ipairs(GUARDED_KEYS) do
    mp.remove_key_binding('vault-unfocused-' .. k)
  end
  mp.set_property('input-gamepad', 'yes')
end

-- focused is nil until a window exists, so act only on an explicit value.
mp.observe_property('focused', 'bool', function(_, focused)
  if focused == false then
    release_pad()
  elseif focused == true then
    reclaim_pad()
  end
end)
`
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
  const subtitleButton = toMpvKey(bindings.find((b) => b.action === 'subtitles')?.button ?? 'GAMEPAD_Y')
  const subtitleKey = kbBindings.find((b) => b.action === 'mpv-subtitles')?.key ?? 'j'
  const skipKey = kbBindings.find((b) => b.action === 'mpv-skip-segment')?.key ?? 's'
  const skipButton = toMpvKey(bindings.find((b) => b.action === 'skip-segment')?.button ?? 'none')

  const configDir = join(dirname(mpvExePath), 'portable_config')
  const configFile = join(configDir, 'mpv.conf')
  mkdirSync(join(configDir, 'scripts'), { recursive: true })
  writeFileSync(configFile, buildMpvConf(hwdec), 'utf-8')
  writeFileSync(join(configDir, 'input.conf'), buildInputConf(bindings), 'utf-8')
  writeFileSync(join(configDir, 'scripts', 'sub-english.lua'), buildLuaScript(subtitleButton, subtitleKey, bindings), 'utf-8')
  writeFileSync(join(configDir, 'scripts', 'skip-segment.lua'), buildSkipSegmentLua(skipKey, skipButton), 'utf-8')
  writeFileSync(join(configDir, 'scripts', 'vault-progress.lua'), buildProgressLua(), 'utf-8')
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
export interface ResumeOptions {
  /** Seconds to start playback at. */
  startSeconds?: number
  /** File for vault-progress.lua to record the playhead in; omit to not track. */
  progressFile?: string
  /**
   * Play several videos back to back in one window (playbackProgress.ts
   * writeQueue). Replaces filePath, startSeconds and progressFile: each
   * queued video carries its own.
   */
  queue?: { playlist: string; details: string; autoplay: boolean }
}

export function openVideo(filePath: string, driveRoot: string, hwdec = 'off', category?: string, resume: ResumeOptions = {}): void {
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
    if (resume.queue) {
      // One window for the whole queue. mpv opens the next file while this
      // one plays, so moving on is a cut, not a reload. With autoplay off it
      // holds at the end of each file, where vault-progress.lua closes it.
      const q = resume.queue
      spawnDetached(mpv, [
        '--fullscreen', configArg, ...langArgs,
        '--prefetch-playlist=yes',
        ...(q.autoplay ? [] : ['--keep-open=always']),
        `--script-opts=vault-queue=${q.details}`,
        `--playlist=${q.playlist}`
      ])
      return
    }
    const resumeArgs = [
      ...(resume.startSeconds && resume.startSeconds > 0 ? [`--start=${resume.startSeconds.toFixed(1)}`] : []),
      ...(resume.progressFile ? [`--script-opts=vault-progress-file=${resume.progressFile}`] : [])
    ]
    spawnDetached(mpv, ['--fullscreen', configArg, ...langArgs, ...resumeArgs, filePath])
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
  // Backstop: startup already reconciles these, but a game launched on a PC
  // where the app was opened before the drive settled would otherwise write its
  // save to the host. Idempotent and cheap - a few lstat calls.
  try { ensureSaveLinks(driveRoot) } catch { /* never block a launch */ }

  if (platform === 'pc') {
    if (process.platform === 'win32') {
      spawnDetached(filePath, [])
      startPlaytimeSession(filePath, basename(filePath))
      return
    }
    if (process.platform === 'darwin') {
      // Launch Windows games through Heroic Games Launcher's bundled Game
      // Porting Toolkit runtime, into the shared "vault" Wine prefix. Heroic
      // itself is not involved at launch — we just reuse the files it ships.
      // The runtime path moves if Heroic updates it, so the error names what
      // to install if we don't find it.
      const home = process.env['HOME'] ?? ''
      const wine = join(home, 'Library/Application Support/heroic/tools/game-porting-toolkit/Game-Porting-Toolkit-latest/Contents/Resources/wine/bin/wine64')
      const prefix = join(home, 'Library/Application Support/heroic/Prefixes/vault')
      if (!existsSync(wine)) {
        throw new Error(
          `Wine runtime not found. Install Heroic Games Launcher (brew install --cask heroic) ` +
          `and ensure the Game Porting Toolkit runtime is downloaded. Expected at ${wine}.`
        )
      }
      if (!existsSync(prefix)) {
        throw new Error(
          `Mac Wine prefix not found at ${prefix}. Set it up (wineboot --init plus vcrun2019) ` +
          `before launching PC games on Mac.`
        )
      }
      // WINEDLLOVERRIDES skips the Mono/Gecko install dialogs that would block
      // headless launches. WINEDEBUG=-all silences Wine's noisy stderr so Vault's
      // own logs stay useful.
      const child = spawn(wine, [filePath], {
        env: { ...process.env, WINEPREFIX: prefix, WINEDLLOVERRIDES: 'mscoree=;mshtml=', WINEDEBUG: '-all' },
        detached: true,
        stdio: 'ignore'
      })
      child.unref()
      // Playtime: pgrep -x cannot see GPTK-launched processes (hidden from the
      // process list by whatever Apple's launcher does), so we hand playtime the
      // wine child's PID instead. Checked with kill(0), which works regardless.
      startPlaytimeSession(filePath, basename(filePath), child.pid)
      return
    }
    throw new Error('PC games are supported on Windows and macOS only.')
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
    const args = ['-rompath', romDir]
    // On macOS, -cfg_directory + -skip_gameinfo together confuse MAME 0.288's
    // SDL build — one eats the game name and MAME falls into its empty menu.
    // Drop -cfg_directory on Mac and let MAME use its default under
    // ~/Library/Application Support/mame.
    if (process.platform !== 'darwin') args.push('-cfg_directory', cfgDir)
    args.push('-skip_gameinfo')
    // The old 'osx' native keyboardprovider was removed when Mac MAME switched
    // to SDL; MAME 0.288 silently drops the next positional arg when it is
    // passed. Letting Mac default to auto works. Windows and Linux keep their
    // explicit values.
    if (process.platform === 'win32') args.push('-keyboardprovider', 'win32')
    else if (process.platform === 'linux') args.push('-keyboardprovider', 'x11')
    args.push(gameName)
    const child = spawn(emulatorExe, args, { stdio: 'ignore' })
    child.unref()
    startPlaytimeSession(filePath, basename(emulatorExe))
    return
  }

  if (platform === 'xbox') {
    // xemu picks up xemu.toml next to xemu.exe; cwd ensures the relative bootrom/flashrom/hdd paths resolve.
    spawnDetached(emulatorExe, ['-dvd_path', filePath])
    startPlaytimeSession(filePath, basename(emulatorExe))
    return
  }

  if (platform === 'ps4') {
    // shadPS4 installs games into <emuDir>/user/games/<TitleID>/. The Vault rom
    // is a marker file whose basename is the title ID (e.g. roms/ps4/Bloodborne/CUSA03173.shadps4).
    // We launch the SDL backend directly with the eboot path so the qtlauncher
    // never opens — that avoids the Qt UI-thread "Not Responding" issue.
    const titleId = basename(filePath, extname(filePath))
    const emuDir = dirname(emulatorExe)
    const ebootPath = join(emuDir, 'user', 'games', titleId, 'eboot.bin')
    if (!existsSync(ebootPath)) {
      throw new Error(`PS4 game ${titleId} is not installed in shadPS4. Expected eboot at ${ebootPath}.`)
    }
    // Pre-launch cleanup: shadPS4 v0.16 keeps writing a pipeline cache archive
    // at user/cache/<TitleID>.zip even with pipelineCacheEnable = false, and
    // then crashes on the next launch with a "read-only archive" assertion
    // when it tries to update it. Delete the stale zip so the next launch
    // starts clean.
    try { rmSync(join(emuDir, 'user', 'cache', `${titleId}.zip`), { force: true }) } catch { /* ignore */ }
    // Skip the start-wrapper spawnDetached because shadPS4 is a console app and
    // `start ""` would create a visible terminal window that persists for the
    // entire gameplay session. windowsHide suppresses that console; the game
    // window (Vulkan-backed, separate from stdout) renders normally.
    // `-f true` forces fullscreen — the config.toml FullscreenMode value isn't
    // reliably respected in v0.16 but the CLI flag is.
    const child = spawn(emulatorExe, ['-g', ebootPath, '-f', 'true'], {
      cwd: emuDir,
      detached: true,
      stdio: 'ignore',
      windowsHide: true
    })
    child.unref()
    startPlaytimeSession(filePath, basename(emulatorExe))
    return
  }

  // Dolphin on Mac needs its user folder on the drive so saves don't land on the
  // host. The folder holds a Mac-specific Config/ and symlinks Wii/ and GC/ into
  // the Windows user dir so NAND and memcards stay shared across OSes.
  // Note: Wii emulation on Apple Silicon currently crashes partway into boot
  // for the games we have (two Dolphin stables tested); the flag still points
  // the user dir at the drive so saves route correctly once that's fixed.
  if ((platform === 'wii' || platform === 'gamecube') && process.platform === 'darwin') {
    const userDir = join(driveRoot, 'emulators', 'dolphin', 'mac-userdir')
    spawnDetached(emulatorExe, ['-u', userDir, filePath])
    startPlaytimeSession(filePath, basename(emulatorExe))
    return
  }

  spawnDetached(emulatorExe, [filePath])
  startPlaytimeSession(filePath, basename(emulatorExe))
}
