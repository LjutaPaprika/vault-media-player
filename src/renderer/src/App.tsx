import { useEffect } from 'react'
import { useAppStore } from './store/appStore'
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

  useEffect(() => {
    window.api.library.getConfig().then((config) => {
      if (config.label) {
        setLibrary(config.label, config.resolvedPath)
      }
    })
  }, [])

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
