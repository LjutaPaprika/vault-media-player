import { getConfig, setConfig } from './database'

export interface ControllerBinding {
  action: string   // stable unique ID
  label: string    // display label
  command: string  // MPV command, or 'toggle-subs' for the Lua subtitle action
  button: string   // MPV input key name e.g. 'GAMEPAD_A', or 'none'
  isLua: boolean   // true = handled via Lua binding, not input.conf line
}

export const DEFAULT_BINDINGS: ControllerBinding[] = [
  { action: 'pause',        label: 'Pause / Resume',           command: 'pause',            button: 'GAMEPAD_A',             isLua: false },
  { action: 'quit',         label: 'Quit Player',              command: 'quit',             button: 'GAMEPAD_B',             isLua: false },
  { action: 'audio',        label: 'Cycle Audio Track',        command: 'cycle audio',      button: 'GAMEPAD_X',             isLua: false },
  { action: 'subtitles',    label: 'Toggle Subtitles',         command: 'toggle-subs',      button: 'GAMEPAD_Y',             isLua: true  },
  { action: 'fullscreen',   label: 'Toggle Fullscreen',        command: 'cycle fullscreen', button: 'GAMEPAD_START',         isLua: false },
  { action: 'seek-back-10', label: 'Seek Back 10s',           command: 'seek -10',         button: 'GAMEPAD_LEFTSHOULDER',  isLua: false },
  { action: 'seek-fwd-10',  label: 'Seek Forward 10s',        command: 'seek 10',          button: 'GAMEPAD_RIGHTSHOULDER', isLua: false },
  { action: 'seek-back-30', label: 'Seek Back 30s',           command: 'seek -30',         button: 'GAMEPAD_LEFTTRIGGER',   isLua: false },
  { action: 'seek-fwd-30',  label: 'Seek Forward 30s',        command: 'seek 30',          button: 'GAMEPAD_RIGHTTRIGGER',  isLua: false },
  { action: 'vol-up',       label: 'Volume Up',                command: 'add volume 5',     button: 'GAMEPAD_DPAD_UP',       isLua: false },
  { action: 'vol-down',     label: 'Volume Down',              command: 'add volume -5',    button: 'GAMEPAD_DPAD_DOWN',     isLua: false },
  { action: 'dpad-left',    label: 'D-pad Seek Back',          command: 'seek -10',        button: 'GAMEPAD_DPAD_LEFT',     isLua: false },
  { action: 'dpad-right',   label: 'D-pad Seek Forward',       command: 'seek 10',         button: 'GAMEPAD_DPAD_RIGHT',    isLua: false },
  { action: 'seek-back-5',  label: 'Seek Back 5s (Stick)',     command: 'seek -5',         button: 'GAMEPAD_LSTICK_LEFT',   isLua: false },
  { action: 'seek-fwd-5',   label: 'Seek Forward 5s (Stick)', command: 'seek 5',           button: 'GAMEPAD_LSTICK_RIGHT',  isLua: false },
]

const CONFIG_KEY = 'controllerBindings'

export function getBindings(): ControllerBinding[] {
  const stored = getConfig(CONFIG_KEY)
  if (!stored) return [...DEFAULT_BINDINGS]
  try {
    const parsed = JSON.parse(stored) as ControllerBinding[]
    // Preserve any new defaults not yet in stored data (forward-compat)
    const storedMap = new Map(parsed.map((b) => [b.action, b]))
    return DEFAULT_BINDINGS.map((def) => storedMap.get(def.action) ?? def)
  } catch {
    return [...DEFAULT_BINDINGS]
  }
}

export function setBindings(bindings: ControllerBinding[]): void {
  setConfig(CONFIG_KEY, JSON.stringify(bindings))
}

export function resetBindings(): ControllerBinding[] {
  setConfig(CONFIG_KEY, JSON.stringify(DEFAULT_BINDINGS))
  return [...DEFAULT_BINDINGS]
}
