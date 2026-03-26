import styles from './PageShell.module.css'

interface Props {
  title: string
  children: React.ReactNode
  actions?: React.ReactNode
  searchValue?: string
  onSearch?: (query: string) => void
}

export default function PageShell({ title, children, actions, searchValue, onSearch }: Props): JSX.Element {
  return (
    <div className={styles.shell}>
      <div className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        <div className={styles.actions}>
          {onSearch !== undefined && (
            <div className={styles.searchWrap}>
              <span className={styles.searchIcon}>⌕</span>
              <input
                className={styles.searchInput}
                type="text"
                placeholder="Search…"
                value={searchValue ?? ''}
                onChange={(e) => onSearch(e.target.value)}
              />
              {searchValue && (
                <button className={styles.searchClear} onClick={() => onSearch('')}>✕</button>
              )}
            </div>
          )}
          {actions}
        </div>
      </div>
      <div className={styles.body}>{children}</div>
    </div>
  )
}
