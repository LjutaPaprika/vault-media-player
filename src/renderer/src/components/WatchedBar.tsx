import styles from './WatchedBar.module.css'

/**
 * Thin bar along the bottom of a video thumbnail showing how much of it has
 * been watched. The parent must be position: relative.
 */
export default function WatchedBar({ fraction }: { fraction: number }): JSX.Element {
  // A floor of 3% keeps a video watched for only a moment visibly marked.
  return (
    <div className={styles.track}>
      <div className={styles.fill} style={{ width: `${Math.max(3, fraction * 100)}%` }} />
    </div>
  )
}
