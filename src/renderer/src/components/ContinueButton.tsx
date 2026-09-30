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
  /**
   * Reading rather than watching: "Read" in place of "Play", and the place
   * left off shown in this unit ("page 12 of 40", or "chapter 3 of 20" for a
   * book) rather than as a time.
   */
  readingUnit?: 'page' | 'chapter'
}

const READING_LABEL: Record<ContinueTarget<unknown>['label'], string> = {
  'Play': 'Read',
  'Continue': 'Continue',
  'Resume': 'Resume',
  'Next': 'Next',
  'Play again': 'Read again'
}

/** A series' Continue button: what it will play, and from where. */
export default function ContinueButton({ target, title, onClick, focused, buttonRef, readingUnit }: Props): JSX.Element {
  const label = readingUnit ? READING_LABEL[target.label] : target.label
  let at: string | null = null
  if (target.leftOffAt !== null) {
    at = readingUnit
      ? ` at ${readingUnit} ${Math.floor(target.leftOffAt) + 1}${target.leftOffOf ? ` of ${target.leftOffOf}` : ''}`
      : ` from ${formatClock(target.leftOffAt)}`
  }
  return (
    <button ref={buttonRef} className={`${styles.button} ${focused ? styles.focused : ''}`} onClick={onClick}>
      <svg viewBox="0 0 24 24" fill="currentColor" className={styles.icon}>
        <path d="M8 5v14l11-7z"/>
      </svg>
      <span className={styles.text}>
        <span className={styles.label}>
          {label}
          {at && <span className={styles.at}>{at}</span>}
        </span>
        <span className={styles.title}>{title}</span>
      </span>
    </button>
  )
}
