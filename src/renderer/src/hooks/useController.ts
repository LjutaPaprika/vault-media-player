import { useEffect, useRef } from 'react'

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
 * Works alongside keyboard navigation — the two systems don't conflict.
 */
export function useController({ onButton, pollInterval = 100, enabled = true }: Options): void {
  const prevButtons = useRef<boolean[]>([])
  const prevStick = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  useEffect(() => {
    if (!enabled) return

    const interval = setInterval(() => {
      const gamepads = navigator.getGamepads()
      const gp = gamepads[0] // Use first connected controller
      if (!gp) return

      // ── Buttons ──────────────────────────────────────────────────────────
      gp.buttons.forEach((btn, idx) => {
        const mapped = BUTTON_MAP[idx]
        if (!mapped) return
        const wasPressed = prevButtons.current[idx] ?? false
        const isPressed = btn.pressed
        if (isPressed && !wasPressed) {
          onButton(mapped)
        }
        prevButtons.current[idx] = isPressed
      })

      // ── Left stick (axes 0 = X, 1 = Y) ───────────────────────────────────
      const ax = gp.axes[0] ?? 0
      const ay = gp.axes[1] ?? 0
      const prev = prevStick.current

      if (ax >  STICK_THRESHOLD && prev.x <= STICK_THRESHOLD) onButton('right')
      if (ax < -STICK_THRESHOLD && prev.x >= -STICK_THRESHOLD) onButton('left')
      if (ay >  STICK_THRESHOLD && prev.y <= STICK_THRESHOLD) onButton('down')
      if (ay < -STICK_THRESHOLD && prev.y >= -STICK_THRESHOLD) onButton('up')

      prevStick.current = { x: ax, y: ay }
    }, pollInterval)

    return () => clearInterval(interval)
  }, [onButton, pollInterval, enabled])
}
