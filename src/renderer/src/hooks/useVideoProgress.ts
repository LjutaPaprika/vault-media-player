import { useEffect, useState } from 'react'

/**
 * Saved positions for these videos, kept current while the page is open: mpv
 * reports every few seconds as it plays and once more when it closes, and the
 * main process signals each report.
 */
export function useVideoProgress(filePaths: string[]): Record<string, VideoProgress> {
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
  }, [key])

  return progress
}
