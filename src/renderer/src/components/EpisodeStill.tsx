import { memo, useState } from 'react'
import { protocolUrl } from '../utils/mediaUrl'
import styles from './EpisodeStill.module.css'

/**
 * A frame from the episode itself, for its row. The main process grabs it with
 * ffmpeg the first time it is asked for and caches it with the other artwork.
 *
 * Unlike shelf posters this loads lazily: a long series (Gintama has 371
 * episodes) would otherwise queue a grab for every row on first open, and the
 * rows in view would wait behind the ones that are not.
 */
const EpisodeStill = memo(function EpisodeStill({ filePath }: { filePath: string }): JSX.Element {
  const [failed, setFailed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  if (failed) return <div className={styles.placeholder} />
  return (
    <img
      className={`${styles.still} ${loaded ? styles.loaded : ''}`}
      // 310 is the smallest cached width, and double the 128px row thumb.
      src={protocolUrl('thumb', filePath, 310)}
      alt=""
      loading="lazy"
      decoding="async"
      draggable={false}
      onLoad={() => setLoaded(true)}
      onError={() => setFailed(true)}
    />
  )
})

export default EpisodeStill
