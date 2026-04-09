import { useEffect, useState } from 'react'
import { useAppStore } from './store/appStore'
import {
  applyAccentColor, applyColor,
  DEFAULT_ACCENT, DEFAULT_PILL_LAST_WATCHED, DEFAULT_PILL_EXTRA,
  DEFAULT_SIDEBAR_ACTIVE, DEFAULT_EPISODE_BADGE, DEFAULT_MUSIC_PROGRESS
} from './utils/accent'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import MusicPlayerBar from './components/MusicPlayerBar'
import { MusicPlayerProvider } from './context/MusicPlayerContext'
import SetupScreen from './pages/SetupScreen'
import MoviesPage from './pages/MoviesPage'
import TVPage from './pages/TVPage'
import AnimePage from './pages/AnimePage'
import MusicPage from './pages/MusicPage'
import BooksPage from './pages/BooksPage'
import MangaPage from './pages/MangaPage'
import GamesPage from './pages/GamesPage'
import HomePage from './pages/HomePage'
import SettingsPage from './pages/SettingsPage'

const PAGES: Record<string, JSX.Element> = {
  home:     <HomePage />,
  movies:   <MoviesPage />,
  tv:       <TVPage />,
  anime:    <AnimePage />,
  music:    <MusicPage />,
  books:    <BooksPage />,
  manga:    <MangaPage />,
  games:    <GamesPage />,
  settings: <SettingsPage />
}

export default function App(): JSX.Element {
  const { activePage, libraryLabel, setLibrary } = useAppStore()
  const [configLoading, setConfigLoading] = useState(true)

  useEffect(() => {
    const minDelay = new Promise((r) => setTimeout(r, 1000))
    const configFetch = window.api.library.getConfig().then((config) => {
      if (config.label) setLibrary(config.label, config.resolvedPath)
    })
    const colorFetches = Promise.all([
      window.api.settings.get('accentColor',      DEFAULT_ACCENT).then(applyAccentColor),
      window.api.settings.get('pillLastWatched',  DEFAULT_PILL_LAST_WATCHED).then((h) => applyColor('--pill-last-watched', h)),
      window.api.settings.get('pillExtra',        DEFAULT_PILL_EXTRA).then((h) => applyColor('--pill-extra', h)),
      window.api.settings.get('sidebarActive',    DEFAULT_SIDEBAR_ACTIVE).then((h) => applyColor('--sidebar-active', h)),
      window.api.settings.get('episodeBadge',     DEFAULT_EPISODE_BADGE).then((h) => applyColor('--episode-badge', h)),
      window.api.settings.get('musicProgress',    DEFAULT_MUSIC_PROGRESS).then((h) => applyColor('--music-progress', h)),
    ])
    Promise.all([minDelay, configFetch, colorFetches]).then(() => setConfigLoading(false))
  }, [])

  if (configLoading) {
    return (
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        height: '100%', background: 'var(--bg-base)', gap: 20,
        animation: 'fadeIn 0.3s ease'
      }}>
        <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
          <rect width="52" height="52" rx="12" fill="#1c1c21"/>
          <path d="M14 26 L26 14 L38 26 L26 38 Z" fill="#e8b44b" opacity="0.9"/>
          <path d="M26 14 L38 26 L26 38" fill="#e8b44b" opacity="0.4"/>
        </svg>
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          Vault
        </span>
      </div>
    )
  }

  // No label saved yet — first time setup
  if (!libraryLabel) {
    return (
      <div className="app">
        <TitleBar />
        <SetupScreen />
      </div>
    )
  }

  return (
    <MusicPlayerProvider>
      <div className="app">
        <TitleBar />
        <div className="app-body">
          <Sidebar />
          <main className="content">{PAGES[activePage] ?? <HomePage />}</main>
        </div>
        <MusicPlayerBar />
      </div>
    </MusicPlayerProvider>
  )
}
