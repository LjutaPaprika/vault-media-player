import { useEffect, useRef, useCallback } from 'react'
import { useAppStore, type Page } from '../store/appStore'
import { useController, type ControllerButton } from '../hooks/useController'
import styles from './Sidebar.module.css'

const NAV_ITEMS: { id: Page; label: string; icon: string }[] = [
  { id: 'home',     label: 'Home',     icon: '🏠' },
  { id: 'movies',   label: 'Movies',   icon: '🎬' },
  { id: 'tv',       label: 'TV Shows', icon: '📺' },
  { id: 'anime',    label: 'Anime',    icon: '⛩️' },
  { id: 'music',    label: 'Music',    icon: '🎵' },
  { id: 'books',    label: 'Books',    icon: '📚' },
  { id: 'manga',    label: 'Manga',    icon: '🗂️' },
  { id: 'games',    label: 'Games',    icon: '🎮' },
  { id: 'settings', label: 'Settings', icon: '⚙️' }
]

export default function Sidebar(): JSX.Element {
  const { activePage, setActivePage, focusZone, setFocusZone } = useAppStore()
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])
  const isFocused = focusZone === 'sidebar'

  function navigate(dir: 'up' | 'down'): void {
    const idx = NAV_ITEMS.findIndex((n) => n.id === activePage)
    const next = dir === 'up' ? idx - 1 : idx + 1
    if (next >= 0 && next < NAV_ITEMS.length) {
      setActivePage(NAV_ITEMS[next].id)
      itemRefs.current[next]?.focus()
    }
  }

  function enterContent(): void {
    setFocusZone('content')
  }

  // Keyboard: only handle input when sidebar owns focus
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent): void {
      if (!isFocused) return
      if (e.key === 'ArrowUp')                              navigate('up')
      if (e.key === 'ArrowDown')                            navigate('down')
      if (e.key === 'ArrowRight' || e.key === 'Enter')      enterContent()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [activePage, isFocused])

  // Controller: only handle input when sidebar owns focus
  const handleButton = useCallback((btn: ControllerButton) => {
    if (!isFocused) return
    if (btn === 'up')                      navigate('up')
    if (btn === 'down')                    navigate('down')
    if (btn === 'right' || btn === 'confirm') enterContent()
  }, [activePage, isFocused])

  useController({ onButton: handleButton })

  return (
    <nav
      className={`${styles.sidebar} ${isFocused ? styles.focused : ''}`}
      onClick={() => setFocusZone('sidebar')}
    >
      <div className={styles.logo}>
        <div className={styles.logoIcon}>V</div>
        <span className={styles.logoText}>VAULT</span>
      </div>
      <ul className={styles.nav}>
        {NAV_ITEMS.map((item, i) => (
          <li key={item.id}>
            <button
              ref={(el) => (itemRefs.current[i] = el)}
              className={`${styles.navItem} ${activePage === item.id ? styles.active : ''}`}
              onClick={(e) => {
                e.stopPropagation()
                setActivePage(item.id)
                setFocusZone('sidebar')
              }}
              tabIndex={isFocused ? 0 : -1}
            >
              <span className={styles.icon}>{item.icon}</span>
              <span className={styles.label}>{item.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
