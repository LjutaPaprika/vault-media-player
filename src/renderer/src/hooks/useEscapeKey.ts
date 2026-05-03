import { useEffect, useRef } from 'react'

/** Calls handler when Escape is pressed, taking priority over the App-level back navigation. */
export function useEscapeKey(handler: () => void): void {
  const ref = useRef(handler)
  ref.current = handler
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.stopImmediatePropagation()
        ref.current()
      }
    }
    // Capture phase so this fires before App.tsx's window bubbling listener
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [])
}
