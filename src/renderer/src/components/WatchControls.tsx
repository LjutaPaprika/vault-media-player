import styles from './WatchControls.module.css'

/** "\u21bb Check for new chapters", or the progress while a check runs. */
export function CheckButton({ label, checking, onClick, disabled }: {
  label: string
  checking: { done: number; total: number } | null
  onClick: () => void
  disabled?: boolean
}): JSX.Element {
  return (
    <button className={styles.check} onClick={onClick} disabled={!!checking || disabled}>
      {checking ? `Checking ${checking.done} of ${checking.total}\u2026` : `\u21bb ${label}`}
    </button>
  )
}
