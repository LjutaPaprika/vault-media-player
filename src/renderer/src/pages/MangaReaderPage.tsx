import { useEffect, useState } from 'react'
import styles from './MangaReaderPage.module.css'

interface Props {
  filePath: string
  title: string
  onBack: () => void
}

export default function MangaReaderPage({ filePath, title, onBack }: Props): JSX.Element {
  const [pages, setPages] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setPages([])
    setError(null)
    window.api.manga.openCbz(filePath)
      .then(setPages)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
    return () => { window.api.manga.closeCbz() }
  }, [filePath])

  return (
    <div className={styles.reader}>
      <div className={styles.header}>
        <button className={styles.back} onClick={onBack}>‹ Back</button>
        <span className={styles.title}>{title}</span>
        {!loading && pages.length > 0 && (
          <span className={styles.pageCount}>{pages.length} pages</span>
        )}
      </div>
      <div className={styles.pages}>
        {loading && <p className={styles.status}>Loading...</p>}
        {error && <p className={styles.status} style={{ color: 'var(--danger)' }}>Failed to open file: {error}</p>}
        {pages.map((src, i) => (
          <img key={i} src={src} alt={`Page ${i + 1}`} className={styles.page} />
        ))}
      </div>
    </div>
  )
}
