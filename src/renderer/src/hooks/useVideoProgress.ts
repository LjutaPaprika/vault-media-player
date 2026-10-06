import { useEffect, useState } from 'react'

/**
 * Saved positions for these videos, kept current while the page is open: mpv
 * reports every few seconds as it plays and once more when it closes, and the
 * main process signals each report.
 *
 * The app's own readers save without that signal; a page that stays mounted
 * under a reader changes `refreshKey` when the reader closes to read again.
 */
export function useVideoProgress(filePaths: string[], refreshKey = 0): Record<string, VideoProgress> {
  const [progress, setProgress] = useState<Record<string, VideoProgress>>({})
  // Callers build the array fresh each render; key on its contents instead.
  const key = filePaths.join('\n')

  useEffect(() => {
    const paths = key ? key.split('\n') : []
    let live = true
    const load = (): void => {
      if (paths.length === 0) return
      window.api.playback.getProgress(paths).then((p) => { if (live) setProgress(p) })
    }
    load()
    const off = window.api.playback.onProgressChanged(load)
    return () => { live = false; off() }
  }, [key, refreshKey])

  return progress
}
