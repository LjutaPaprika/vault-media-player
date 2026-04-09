import { app } from 'electron'
import { mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { findDriveRoot } from './database'

export interface KeyboardBinding {
  action: string
  label: string
  context: 'mpv' | 'music'
  // MPV context: stored in MPV key format (e.g. 'RIGHT', 'SHIFT+RIGHT', 'j')
  // Music context: stored as Web KeyboardEvent.key (e.g. 'ArrowRight', ' ')
  key: string
}

export const DEFAULT_KEYBOARD_BINDINGS: KeyboardBinding[] = [
  { action: 'mpv-seek-fwd-10', label: 'Seek forward 10s',         context: 'mpv',   key: 'RIGHT'       },
  { action: 'mpv-seek-bwd-10', label: 'Seek backward 10s',        context: 'mpv',   key: 'LEFT'        },
  { action: 'mpv-seek-fwd-3',  label: 'Seek forward 3s',          context: 'mpv',   key: 'SHIFT+RIGHT' },
  { action: 'mpv-seek-bwd-3',  label: 'Seek backward 3s',         context: 'mpv',   key: 'SHIFT+LEFT'  },
  { action: 'mpv-subtitles',   label: 'Toggle English subtitles', context: 'mpv',   key: 'j'           },
  { action: 'music-play-pause',label: 'Play / Pause',             context: 'music', key: ' '           },
  { action: 'music-seek-fwd',  label: 'Seek forward 10s',         context: 'music', key: 'ArrowRight'  },
  { action: 'music-seek-bwd',  label: 'Seek backward 10s',        context: 'music', key: 'ArrowLeft'   },
]

function bindingsPath(): string {
  const driveRoot = findDriveRoot()
  if (driveRoot) {
    const dir = join(driveRoot, 'app')
    mkdirSync(dir, { recursive: true })
    return join(dir, 'keyboardBindings.json')
  }
  return join(app.getPath('userData'), 'keyboardBindings.json')
}

export function getKeyboardBindings(): KeyboardBinding[] {
  try {
    const raw = JSON.parse(readFileSync(bindingsPath(), 'utf-8')) as KeyboardBinding[]
    // Merge with defaults so newly added actions appear automatically
    return DEFAULT_KEYBOARD_BINDINGS.map((def) => raw.find((b) => b.action === def.action) ?? def)
  } catch {
    return [...DEFAULT_KEYBOARD_BINDINGS]
  }
}

export function setKeyboardBindings(bindings: KeyboardBinding[]): void {
  writeFileSync(bindingsPath(), JSON.stringify(bindings))
}

export function resetKeyboardBindings(): KeyboardBinding[] {
  const defaults = [...DEFAULT_KEYBOARD_BINDINGS]
  writeFileSync(bindingsPath(), JSON.stringify(defaults))
  return defaults
}
