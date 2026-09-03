import { memo, useEffect, useState } from 'react'
import styles from './MediaGrid.module.css'

interface Props {
  filePath: string
  title: string
}

const PosterImage = memo(function PosterImage({ filePath, title }: Props): JSX.Element {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    // A shelf can swap items under us (filter change, navigation) before the
    // read resolves. Without this guard the late reply calls setSrc on an
    // unmounted component, or worse, paints the previous item's poster onto
    // the new one.
    let live = true
    setSrc(null)
    window.api.library.readImage(filePath).then((data) => {
      if (live) setSrc(data)
    })
    return () => { live = false }
  }, [filePath])

  return src
    ? <img src={src} alt={title} draggable={false} loading="lazy" decoding="async" />
    : <div className={styles.placeholder}>{title.charAt(0)}</div>
})

export default PosterImage
