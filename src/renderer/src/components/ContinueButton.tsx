import type { Ref } from 'react'
import { formatClock } from '../utils/duration'
import type { ContinueTarget } from '../utils/resume'
import styles from './ContinueButton.module.css'

interface Props {
  target: ContinueTarget<unknown>
  /** The video's name as the page shows it. */
  title: string
  onClick: () => void
  /** Controller highlight. */
  focused?: boolean
  buttonRef?: Ref<HTMLButtonElement>
}

/** A series' Continue button: what it will play, and from where. */
export default function ContinueButton({ target, title, onClick, focused, buttonRef }: Props): JSX.Element {
  return (
    <button ref={buttonRef} className={`${styles.button} ${focused ? styles.focused : ''}`} onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="currentColor" className={styles.icon}>
        <path d="M8 5v14l11-7z"/>
      </svg>
      <span className={styles.text}>
        <span className={styles.label}>
          {target.label}
          {target.leftOffAt !== null && <span className={styles.at}> from {formatClock(target.leftOffAt)}</span>}
        </span>
        <span className={styles.title}>{title}</span>
      </span>
    </button>
  )
}
