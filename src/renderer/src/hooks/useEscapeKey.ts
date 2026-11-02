import { useEffect, useRef } from 'react'

/**
 * Calls handler when Escape is pressed, taking priority over the App-level back navigation.
 * With enabled false the key is left alone, so a modal open over the page
 * gets it instead (listeners in the same phase run in the order they were
 * added, and the page's was added first).
 */
export function useEscapeKey(handler: () => void, enabled = true): void {
  const ref = useRef(handler)
  ref.current = handler
  const enabledRef = useRef(enabled)
  enabledRef.current = enabled
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape' && enabledRef.current) {
        e.stopImmediatePropagation()
        ref.current()
      }
    }
    // Capture phase so this fires before App.tsx's window bubbling listener
    window.addEventListener('keydown', onKeyDown, { capture: true })
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [])
}
