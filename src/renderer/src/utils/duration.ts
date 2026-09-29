/**
 * Duration formatting shared by the YouTube shelf and playlist view.
 */

/** Video-length overlay, as on a thumbnail: "4:07", "12:03", "1:02:45". */
export function formatClock(sec: number): string {
  const s = Math.floor(sec % 60).toString().padStart(2, '0')
  const totalMin = Math.floor(sec / 60)
  if (sec >= 3600) {
    const h = Math.floor(sec / 3600)
    const m = (totalMin % 60).toString().padStart(2, '0')
    return `${h}:${m}:${s}`
  }
  return `${totalMin}:${s}`
}

/** Total running time, as in "2h 14m", "43m" or "<1m". */
export function formatRuntime(sec: number): string {
  const totalMin = Math.floor(sec / 60)
  if (totalMin < 1) return '<1m'
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}m`
  return m === 0 ? `${h}h` : `${h}h ${m}m`
}
