import { useEffect, useState } from 'react'
import styles from './AutoplayToggle.module.css'

// The autoplay setting, as a small switch where a binge starts (show and
// YouTube playlist pages) and in Settings > Video Playback. One setting
// ('autoplay' in the drive config, off unless turned on); every switch on
// screen follows a change made in any of them.

const KEY = 'autoplay'
const EVENT = 'vault:autoplay'

export function useAutoplay(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(false)
  useEffect(() => {
    window.api.settings.get(KEY, 'off').then((v) => setOn(v === 'on'))
    const sync = (e: Event): void => setOn((e as CustomEvent<boolean>).detail)
    window.addEventListener(EVENT, sync)
    return () => window.removeEventListener(EVENT, sync)
  }, [])
  const set = (next: boolean): void => {
    setOn(next)
    void window.api.settings.set(KEY, next ? 'on' : 'off')
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }))
  }
  return [on, set]
}

interface Props {
  /** "episode" or "video", for the label. */
  noun: 'episode' | 'video'
  /** Settings shows a longer explanation beside it. */
  detailed?: boolean
}

export default function AutoplayToggle({ noun, detailed }: Props): JSX.Element {
  const [on, set] = useAutoplay()
  return (
    <div className={styles.row}>
      <button
        className={`${styles.switch} ${on ? styles.on : ''}`}
        role="switch"
        aria-checked={on}
        onClick={() => set(!on)}
        title={on ? `The next ${noun} starts by itself` : `The player stops after each ${noun}`}
      >
        <span className={styles.knob} />
      </button>
      <span className={styles.label} onClick={() => set(!on)}>
        Autoplay next {noun}
        {detailed && (
          <span className={styles.hint}>
            When on, the next episode or playlist video starts by itself, with a short countdown over
            the credits where they are marked. When off, the player still offers a Next button.
          </span>
        )}
      </span>
    </div>
  )
}
