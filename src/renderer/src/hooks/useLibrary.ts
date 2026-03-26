import { useState, useEffect } from 'react'

export function useLibrary(category: string): {
  items: MediaItem[]
  loading: boolean
  error: string | null
  reload: () => void
} {
  const [items, setItems] = useState<MediaItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    window.api.library
      .getItems(category)
      .then((data) => {
        if (!cancelled) setItems(data)
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [category, tick])

  return { items, loading, error, reload: () => setTick((t) => t + 1) }
}
