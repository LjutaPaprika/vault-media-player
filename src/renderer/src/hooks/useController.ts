import { useCallback, useEffect, useRef, type MutableRefObject } from 'react'

export type ControllerButton =
  | 'up' | 'down' | 'left' | 'right'   // D-pad / left stick
  | 'confirm'                            // A / Cross
  | 'back'                               // B / Circle
  | 'menu'                               // Start / Options

// Standard gamepad button indices (Xbox layout)
const BUTTON_MAP: Record<number, ControllerButton> = {
  0:  'confirm',  // A
  1:  'back',     // B
  9:  'menu',     // Start
  12: 'up',       // D-pad up
  13: 'down',     // D-pad down
  14: 'left',     // D-pad left
  15: 'right'     // D-pad right
}

// Left stick axis thresholds
const STICK_THRESHOLD = 0.5

interface Options {
  onButton: (btn: ControllerButton) => void
  /** How often to poll in ms (default 100) */
  pollInterval?: number
  /** Set false to pause handling without unmounting */
  enabled?: boolean
}

/**
 * Polls the Gamepad API and fires onButton for each newly pressed input.
 * Uses a stable ref for the callback so the interval never restarts on re-render.
 * Returns a resetState function that clears the previous-position tracking,
 * which callers should invoke whenever focus changes to a new component.
 */
function snapshotGamepad(
  prevButtons: MutableRefObject<boolean[]>,
  prevStick: MutableRefObject<{ x: number; y: number }>
): void {
  const gp = navigator.getGamepads()[0]
  if (gp) {
    gp.buttons.forEach((btn, idx) => { prevButtons.current[idx] = btn.pressed })
    prevStick.current = { x: gp.axes[0] ?? 0, y: gp.axes[1] ?? 0 }
  } else {
    prevButtons.current = []
    prevStick.current = { x: 0, y: 0 }
  }
}

export function useController({ onButton, pollInterval = 100, enabled = true }: Options): { resetState: () => void } {
  const prevButtons = useRef<boolean[]>([])
  const prevStick = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const onButtonRef = useRef(onButton)
  // Keep ref current on every render so closures are never stale
  useEffect(() => { onButtonRef.current = onButton })

  // Warm-start on mount: pre-seed held buttons so they don't re-fire immediately
  useEffect(() => { snapshotGamepad(prevButtons, prevStick) }, [])

  const resetState = useCallback(() => {
    snapshotGamepad(prevButtons, prevStick)
  }, [])

  useEffect(() => {
    if (!enabled) return

    const interval = setInterval(() => {
      const gamepads = navigator.getGamepads()
      const gp = gamepads[0]
      if (!gp) return

      // ── Buttons ──────────────────────────────────────────────────────────
      gp.buttons.forEach((btn, idx) => {
        const mapped = BUTTON_MAP[idx]
        if (!mapped) return
        const wasPressed = prevButtons.current[idx] ?? false
        const isPressed = btn.pressed
        if (isPressed && !wasPressed) onButtonRef.current(mapped)
        prevButtons.current[idx] = isPressed
      })

      // ── Left stick (axes 0 = X, 1 = Y) ───────────────────────────────────
      const ax = gp.axes[0] ?? 0
      const ay = gp.axes[1] ?? 0
      const prev = prevStick.current

      if (ax >  STICK_THRESHOLD && prev.x <= STICK_THRESHOLD) onButtonRef.current('right')
      if (ax < -STICK_THRESHOLD && prev.x >= -STICK_THRESHOLD) onButtonRef.current('left')
      if (ay >  STICK_THRESHOLD && prev.y <= STICK_THRESHOLD) onButtonRef.current('down')
      if (ay < -STICK_THRESHOLD && prev.y >= -STICK_THRESHOLD) onButtonRef.current('up')

      prevStick.current = { x: ax, y: ay }
    }, pollInterval)

    return () => clearInterval(interval)
  }, [pollInterval, enabled]) // onButton intentionally omitted — handled via ref

  return { resetState }
}
