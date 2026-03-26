import { memo, useEffect, useState } from 'react'
import styles from './MediaGrid.module.css'

interface Props {
  filePath: string
  title: string
}

const PosterImage = memo(function PosterImage({ filePath, title }: Props): JSX.Element {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    window.api.library.readImage(filePath).then(setSrc)
  }, [filePath])
  return src
    ? <img src={src} alt={title} draggable={false} />
    : <div className={styles.placeholder}>{title.charAt(0)}</div>
})

export default PosterImage
