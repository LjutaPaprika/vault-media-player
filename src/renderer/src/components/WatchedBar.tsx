import styles from './WatchedBar.module.css'

/**
 * Thin bar along the bottom of a video thumbnail or row showing how much of it
 * has been watched. The parent must be position: relative; `className` lets a
 * row inset it.
 */
export default function WatchedBar({ fraction, className }: { fraction: number; className?: string }): JSX.Element {
  // A floor of 3% keeps a video watched for only a moment visibly marked.
  return (
    <div className={`${styles.track} ${className ?? ''}`}>
      <div className={styles.fill} style={{ width: `${Math.max(3, fraction * 100)}%` }} />
    </div>
  )
}
