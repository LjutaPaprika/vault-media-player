import { useState, useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import PageShell from '../components/PageShell'
import styles from './SettingsPage.module.css'
import {
  applyAccentColor, applyColor, ACCENT_PRESETS,
  DEFAULT_ACCENT, DEFAULT_PILL_LAST_WATCHED, DEFAULT_PILL_EXTRA,
  DEFAULT_SIDEBAR_ACTIVE, DEFAULT_EPISODE_BADGE, DEFAULT_MUSIC_PROGRESS
} from '../utils/accent'

function DriveField({
  title,
  description,
  initialLabel,
  onSave,
  onDetect
}: {
  title: string
  description: string
  initialLabel: string
  onSave: (label: string) => Promise<void>
  onDetect: (label: string) => Promise<string | null>
}): JSX.Element {
  const [label, setLabel] = useState(initialLabel)
  const [saved, setSaved] = useState(false)
  const [detected, setDetected] = useState<string | null | undefined>(undefined)

  async function handleSave(): Promise<void> {
    const trimmed = label.trim()
    if (!trimmed) return
    await onSave(trimmed)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    const path = await onDetect(trimmed)
    setDetected(path)
  }

  async function handleDetect(): Promise<void> {
    const trimmed = label.trim()
    if (!trimmed) return
    const path = await onDetect(trimmed)
    setDetected(path)
  }

  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <p className={styles.sectionDesc}>{description}</p>
      <div className={styles.row}>
        <input
          className={styles.input}
          type="text"
          value={label}
          onChange={(e) => { setLabel(e.target.value); setDetected(undefined); setSaved(false) }}
          placeholder="e.g. VAULT"
          spellCheck={false}
        />
        <button className={styles.btn} onClick={handleSave}>{saved ? 'Saved' : 'Save'}</button>
        <button className={styles.btnSecondary} onClick={handleDetect}>Detect</button>
      </div>
      {detected !== undefined && (
        <p className={detected ? styles.statusOk : styles.statusError}>
          {detected ? `Found at ${detected}` : `Drive not found — is it plugged in?`}
        </p>
      )}
    </section>
  )
}

// ─── Keyboard binding editor ──────────────────────────────────────────────────

function webEventToMpvKey(e: KeyboardEvent): string {
  const MPV_NAMES: Record<string, string> = {
    ArrowRight: 'RIGHT', ArrowLeft: 'LEFT', ArrowUp: 'UP', ArrowDown: 'DOWN',
    ' ': 'SPACE', Enter: 'ENTER', Escape: 'ESC', Backspace: 'BS', Tab: 'TAB',
  }
  const base = MPV_NAMES[e.key] ?? e.key
  if (e.shiftKey) return `SHIFT+${base}`
  if (e.ctrlKey)  return `CTRL+${base}`
  return base
}

function keyBadges(binding: KeyboardBinding): string[] {
  const key = binding.key
  if (binding.context === 'mpv') {
    return key.split('+').map((k) => {
      if (k === 'RIGHT') return '→'
      if (k === 'LEFT')  return '←'
      if (k === 'UP')    return '↑'
      if (k === 'DOWN')  return '↓'
      if (k === 'SPACE') return 'Space'
      if (k === 'ENTER') return 'Enter'
      if (k === 'ESC')   return 'Esc'
      if (k === 'SHIFT') return 'Shift'
      if (k === 'CTRL')  return 'Ctrl'
      return k.length === 1 ? k.toUpperCase() : k
    })
  }
  if (key === ' ')           return ['Space']
  if (key === 'ArrowRight')  return ['→']
  if (key === 'ArrowLeft')   return ['←']
  if (key === 'ArrowUp')     return ['↑']
  if (key === 'ArrowDown')   return ['↓']
  return [key.length === 1 ? key.toUpperCase() : key]
}

function KeyboardBindings(): JSX.Element {
  const [bindings, setBindings] = useState<KeyboardBinding[] | null>(null)
  const [listening, setListening] = useState<string | null>(null)

  useEffect(() => {
    window.api.keyboard.getBindings().then(setBindings)
  }, [])

  useEffect(() => {
    if (!listening) return
    function onKey(e: KeyboardEvent): void {
      if (['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) return
      e.preventDefault()
      if (e.key === 'Escape') { setListening(null); return }
      const binding = bindings?.find((b) => b.action === listening)
      if (!binding) { setListening(null); return }
      const newKey = binding.context === 'mpv' ? webEventToMpvKey(e) : e.key
      setBindings((prev) => {
        if (!prev) return prev
        const updated = prev.map((b) => b.action === listening ? { ...b, key: newKey } : b)
        window.api.keyboard.setBindings(updated)
        return updated
      })
      setListening(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [listening, bindings])

  function handleReset(): void {
    window.api.keyboard.resetBindings().then(setBindings)
  }

  if (!bindings) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>

  const mpvBindings   = bindings.filter((b) => b.context === 'mpv')
  const musicBindings = bindings.filter((b) => b.context === 'music')

  function renderGroup(group: KeyboardBinding[], groupLabel: string): JSX.Element {
    return (
      <>
        <tr><td colSpan={3} className={styles.shortcutGroup}>{groupLabel}</td></tr>
        {group.map((b) => (
          <tr key={b.action} className={listening === b.action ? styles.listeningRow : ''}>
            <td className={styles.bindingAction}>{b.label}</td>
            <td className={styles.bindingButtonCell}>
              {listening === b.action
                ? <span className={styles.listeningPrompt}>Press a key…</span>
                : <div className={styles.shortcutKeys}>
                    {keyBadges(b).map((badge, i) => (
                      <kbd key={i} className={styles.keyBadge}>{badge}</kbd>
                    ))}
                  </div>
              }
            </td>
            <td className={styles.bindingRebindCell}>
              <button
                className={styles.btnSecondary}
                onClick={() => setListening(listening === b.action ? null : b.action)}
              >
                {listening === b.action ? 'Cancel' : 'Rebind'}
              </button>
            </td>
          </tr>
        ))}
      </>
    )
  }

  return (
    <div>
      <table className={styles.bindingTable}>
        <thead>
          <tr>
            <th>Action</th>
            <th>Key</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {renderGroup(mpvBindings, 'Video / Audio (MPV)')}
          {renderGroup(musicBindings, 'Music Player')}
        </tbody>
      </table>
      <button className={styles.btnReset} onClick={handleReset}>Reset to defaults</button>
    </div>
  )
}

// ─── Controller binding editor ────────────────────────────────────────────────

// Maps Web Gamepad API button index → MPV key name
const BUTTON_TO_MPV: Record<number, string> = {
  0: 'GAMEPAD_A',           1: 'GAMEPAD_B',
  2: 'GAMEPAD_X',           3: 'GAMEPAD_Y',
  4: 'GAMEPAD_LEFTSHOULDER', 5: 'GAMEPAD_RIGHTSHOULDER',
  6: 'GAMEPAD_LEFTTRIGGER',  7: 'GAMEPAD_RIGHTTRIGGER',
  8: 'GAMEPAD_BACK',         9: 'GAMEPAD_START',
  10: 'GAMEPAD_LEFTSTICK',  11: 'GAMEPAD_RIGHTSTICK',
  12: 'GAMEPAD_DPAD_UP',    13: 'GAMEPAD_DPAD_DOWN',
  14: 'GAMEPAD_DPAD_LEFT',  15: 'GAMEPAD_DPAD_RIGHT',
}

// Axis index, positive direction, MPV key name
const AXIS_TO_MPV: [number, number, string][] = [
  [0, -1, 'GAMEPAD_LSTICK_LEFT'],  [0, 1, 'GAMEPAD_LSTICK_RIGHT'],
  [1, -1, 'GAMEPAD_LSTICK_UP'],    [1, 1, 'GAMEPAD_LSTICK_DOWN'],
  [2, -1, 'GAMEPAD_RSTICK_LEFT'],  [2, 1, 'GAMEPAD_RSTICK_RIGHT'],
  [3, -1, 'GAMEPAD_RSTICK_UP'],    [3, 1, 'GAMEPAD_RSTICK_DOWN'],
]

const BUTTON_LABEL: Record<string, string> = {
  GAMEPAD_A: 'A',                  GAMEPAD_B: 'B',
  GAMEPAD_X: 'X',                  GAMEPAD_Y: 'Y',
  GAMEPAD_START: 'Start',          GAMEPAD_BACK: 'Back',
  GAMEPAD_LEFTSHOULDER: 'LB',      GAMEPAD_RIGHTSHOULDER: 'RB',
  GAMEPAD_LEFTTRIGGER: 'LT',       GAMEPAD_RIGHTTRIGGER: 'RT',
  GAMEPAD_DPAD_UP: 'D↑',          GAMEPAD_DPAD_DOWN: 'D↓',
  GAMEPAD_DPAD_LEFT: 'D←',        GAMEPAD_DPAD_RIGHT: 'D→',
  GAMEPAD_LSTICK_LEFT: 'LS←',     GAMEPAD_LSTICK_RIGHT: 'LS→',
  GAMEPAD_LSTICK_UP: 'LS↑',       GAMEPAD_LSTICK_DOWN: 'LS↓',
  GAMEPAD_RSTICK_LEFT: 'RS←',     GAMEPAD_RSTICK_RIGHT: 'RS→',
  GAMEPAD_RSTICK_UP: 'RS↑',       GAMEPAD_RSTICK_DOWN: 'RS↓',
  GAMEPAD_LEFTSTICK: 'L3',         GAMEPAD_RIGHTSTICK: 'R3',
  none: '—',
}

function detectInput(): string | null {
  const gp = navigator.getGamepads()[0]
  if (!gp) return null
  for (let i = 0; i < gp.buttons.length; i++) {
    if (gp.buttons[i].pressed && BUTTON_TO_MPV[i]) return BUTTON_TO_MPV[i]
  }
  for (const [axis, dir, key] of AXIS_TO_MPV) {
    const v = gp.axes[axis] ?? 0
    if (dir === -1 && v < -0.7) return key
    if (dir ===  1 && v >  0.7) return key
  }
  return null
}

function ControllerBindings(): JSX.Element {
  const [bindings, setBindings] = useState<ControllerBinding[] | null>(null)
  const [listening, setListening] = useState<string | null>(null)

  useEffect(() => {
    window.api.controller.getBindings().then(setBindings)
  }, [])

  // Gamepad capture loop — active only while listening for a rebind
  useEffect(() => {
    if (!listening) return
    let initDone = false
    let prevInput: string | null = null

    const interval = setInterval(() => {
      const detected = detectInput()
      if (!initDone) {
        prevInput = detected  // Snapshot held state so we don't re-fire it
        initDone = true
        return
      }
      if (detected !== null && detected !== prevInput) {
        setBindings((prev) => {
          if (!prev) return prev
          const updated = prev.map((b) => b.action === listening ? { ...b, button: detected } : b)
          window.api.controller.setBindings(updated)
          return updated
        })
        setListening(null)
      } else if (detected === null) {
        prevInput = null
      }
    }, 50)

    return () => clearInterval(interval)
  }, [listening])

  function handleReset(): void {
    window.api.controller.resetBindings().then(setBindings)
  }

  if (!bindings) return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Loading…</p>

  return (
    <div>
      <table className={styles.bindingTable}>
        <thead>
          <tr>
            <th>Action</th>
            <th>Button</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {bindings.map((b) => (
            <tr key={b.action} className={listening === b.action ? styles.listeningRow : ''}>
              <td className={styles.bindingAction}>{b.label}</td>
              <td className={styles.bindingButtonCell}>
                {listening === b.action
                  ? <span className={styles.listeningPrompt}>Press a button…</span>
                  : <kbd className={styles.keyBadge}>{BUTTON_LABEL[b.button] ?? b.button}</kbd>
                }
              </td>
              <td className={styles.bindingRebindCell}>
                <button
                  className={styles.btnSecondary}
                  onClick={() => setListening(listening === b.action ? null : b.action)}
                >
                  {listening === b.action ? 'Cancel' : 'Rebind'}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button className={styles.btnReset} onClick={handleReset}>
        Reset to defaults
      </button>
    </div>
  )
}


function ColorSetting({ label, settingsKey, cssVar, defaultColor, applyFn }: {
  label: string
  settingsKey: string
  cssVar: string
  defaultColor: string
  applyFn?: (hex: string) => void
}): JSX.Element {
  const [current, setCurrent] = useState(defaultColor)

  useEffect(() => {
    window.api.settings.get(settingsKey, defaultColor).then(setCurrent)
  }, [])

  function apply(hex: string): void {
    setCurrent(hex)
    if (applyFn) applyFn(hex)
    else applyColor(cssVar, hex)
    window.api.settings.set(settingsKey, hex)
  }

  return (
    <div className={styles.colorRow}>
      <span className={styles.colorRowLabel}>{label}</span>
      <div className={styles.swatches}>
        {ACCENT_PRESETS.map((hex) => (
          <button
            key={hex}
            className={`${styles.swatch} ${current.toLowerCase() === hex.toLowerCase() ? styles.swatchActive : ''}`}
            style={{ background: hex }}
            onClick={() => apply(hex)}
            title={hex}
          />
        ))}
        <label className={styles.colorInputLabel} title="Custom colour">
          <input
            type="color"
            value={current}
            onChange={(e) => apply(e.target.value)}
          />
        </label>
      </div>
    </div>
  )
}

function HwdecSelector(): JSX.Element {
  const [value, setValue] = useState('off')

  useEffect(() => {
    window.api.settings.get('hwdec', 'off').then(setValue)
  }, [])

  function handleChange(e: React.ChangeEvent<HTMLSelectElement>): void {
    setValue(e.target.value)
    window.api.settings.set('hwdec', e.target.value)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <select className={styles.select} value={value} onChange={handleChange}>
        <option value="off">Off — software decoding (safest)</option>
        <option value="auto-safe">Auto-safe — GPU if stable codec</option>
        <option value="auto">Auto — GPU for all codecs</option>
      </select>
      <p className={styles.selectHint}>
        Takes effect on the next video you open. If video looks corrupted, switch back to Off.
      </p>
    </div>
  )
}

export default function SettingsPage(): JSX.Element {
  const { libraryLabel, libraryPath, setLibrary } = useAppStore()

  const [backupLabelInit, setBackupLabelInit] = useState('')

  // Sync state
  const [syncing, setSyncing] = useState(false)
  const [syncLines, setSyncLines] = useState<SyncProgress[]>([])
  const logRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    window.api.sync.getBackupLabel().then((label) => {
      if (label) setBackupLabelInit(label)
    })
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [syncLines])

  async function saveLibraryLabel(label: string): Promise<void> {
    await window.api.library.setLabel(label)
    const path = await window.api.library.findDrive(label)
    setLibrary(label, path)
  }

  async function startSync(): Promise<void> {
    setSyncing(true)
    setSyncLines([])

    const cleanup = window.api.sync.onProgress((progress) => {
      setSyncLines((prev) => [...prev, progress])
      if (progress.status === 'done' || progress.status === 'error') {
        setSyncing(false)
        cleanup()
      }
    })

    try {
      await window.api.sync.start()
    } catch (err) {
      setSyncLines([{ status: 'error', message: (err as Error).message }])
      setSyncing(false)
      cleanup()
    }
  }

  const lastLine = syncLines[syncLines.length - 1]

  return (
    <PageShell title="Settings">
      <div className={styles.sections}>

        <DriveField
          title="Media Drive"
          description="The volume label of your main SSD. Set this label on your drive once and the app will find it on any computer."
          initialLabel={libraryLabel ?? ''}
          onSave={saveLibraryLabel}
          onDetect={(label) => window.api.library.findDrive(label)}
        />

        <DriveField
          title="Backup Drive"
          description="The volume label of your backup HDD. Set this label on the HDD once and the app will find it when plugged in."
          initialLabel={backupLabelInit}
          onSave={(label) => window.api.sync.setBackupLabel(label)}
          onDetect={(label) => window.api.sync.findDrive(label)}
        />

        {/* Sync */}
        <section className={`${styles.section} ${styles.sectionFull}`}>
          <h2 className={styles.sectionTitle}>Sync to Backup</h2>
          <p className={styles.sectionDesc}>
            Mirrors your media drive to the backup HDD. New and changed files are copied.
            Files you have deleted from the main drive are also removed from the backup.
            Both drives must be plugged in.
          </p>
          {libraryPath && (
            <p className={styles.statusOk}>Main drive: {libraryPath}</p>
          )}
          {!libraryPath && libraryLabel && (
            <p className={styles.statusError}>Main drive "{libraryLabel}" not detected — plug it in first.</p>
          )}
          <button
            className={styles.syncBtn}
            onClick={startSync}
            disabled={syncing || !backupLabelInit.trim()}
          >
            {syncing ? 'Syncing...' : 'Start Sync'}
          </button>
          {!backupLabelInit.trim() && (
            <p className={styles.statusError}>Configure a backup drive label above first.</p>
          )}
          {syncLines.length > 0 && (
            <div className={styles.log} ref={logRef}>
              {syncLines.map((line, i) => (
                <div
                  key={i}
                  className={
                    line.status === 'error' ? styles.logError :
                    line.status === 'done'  ? styles.logDone  :
                    styles.logLine
                  }
                >
                  {line.message}
                </div>
              ))}
            </div>
          )}
          {lastLine?.status === 'done' && (
            <div className={styles.summary}>
              <span>{lastLine.filescopied ?? 0} copied</span>
              <span>{lastLine.filesskipped ?? 0} skipped</span>
              <span>{lastLine.filesdeleted ?? 0} deleted</span>
            </div>
          )}
        </section>

        {/* Colours */}
        <section className={`${styles.section} ${styles.sectionFull}`}>
          <h2 className={styles.sectionTitle}>Colours</h2>
          <p className={styles.sectionDesc}>Customise the colour of individual interface elements. Each setting has 8 presets or a custom colour picker.</p>
          <div className={styles.colorGrid}>
            <ColorSetting label="Accent" settingsKey="accentColor" cssVar="--accent" defaultColor={DEFAULT_ACCENT} applyFn={applyAccentColor} />
            <ColorSetting label="Last Watched / Read pill" settingsKey="pillLastWatched" cssVar="--pill-last-watched" defaultColor={DEFAULT_PILL_LAST_WATCHED} />
            <ColorSetting label="Extras pill" settingsKey="pillExtra" cssVar="--pill-extra" defaultColor={DEFAULT_PILL_EXTRA} />
            <ColorSetting label="Sidebar active item" settingsKey="sidebarActive" cssVar="--sidebar-active" defaultColor={DEFAULT_SIDEBAR_ACTIVE} />
            <ColorSetting label="Episode badge" settingsKey="episodeBadge" cssVar="--episode-badge" defaultColor={DEFAULT_EPISODE_BADGE} />
            <ColorSetting label="Music progress bar" settingsKey="musicProgress" cssVar="--music-progress" defaultColor={DEFAULT_MUSIC_PROGRESS} />
          </div>
        </section>

        {/* Left column: Keyboard Shortcuts + Hardware Decoding stacked */}
        <div className={styles.columnStack}>
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Keyboard Shortcuts</h2>
            <p className={styles.sectionDesc}>Keyboard bindings active during video/audio playback and in the music player. Click Rebind, then press the key you want to assign. Press Escape to cancel.</p>
            <KeyboardBindings />
          </section>

          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Hardware Decoding</h2>
            <p className={styles.sectionDesc}>Offload video decoding to your GPU. Reduces CPU usage for high-bitrate or 4K content.</p>
            <HwdecSelector />
          </section>
        </div>

        {/* Right column: Controller Bindings */}
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Controller Bindings</h2>
          <p className={styles.sectionDesc}>Customize which gamepad buttons control MPV during playback. Click Rebind, then press the button you want to assign.</p>
          <ControllerBindings />
        </section>


      </div>
    </PageShell>
  )
}
