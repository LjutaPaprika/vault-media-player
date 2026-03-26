import { useAppStore } from '../store/appStore'
import styles from './TitleBar.module.css'

export default function TitleBar(): JSX.Element {
  const { activePage } = useAppStore()

  return (
    <div className={styles.titlebar}>
      <div className={styles.drag} />
      <span className={styles.title}>
        {activePage === 'home' ? 'Media Player' : activePage.charAt(0).toUpperCase() + activePage.slice(1)}
      </span>
      <div className={styles.controls}>
        <button
          className={styles.btn}
          onClick={() => window.api.window.minimize()}
          aria-label="Minimize"
        >
          &#8722;
        </button>
        <button
          className={styles.btn}
          onClick={() => window.api.window.maximize()}
          aria-label="Maximize"
        >
          &#9633;
        </button>
        <button
          className={`${styles.btn} ${styles.close}`}
          onClick={() => window.api.window.close()}
          aria-label="Close"
        >
          &#10005;
        </button>
      </div>
    </div>
  )
}
