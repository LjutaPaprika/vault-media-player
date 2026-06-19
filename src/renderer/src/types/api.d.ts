// Type declarations for the API exposed by the preload script via contextBridge

// MediaCard is used by MediaGrid — a display-ready subset of MediaItem
interface MediaCard {
  id: number
  title: string
  year?: number | null
  posterPath?: string | null
  filePath?: string
  platform?: string | null
  genre?: string | null
  subtitle?: string
}

interface LibraryConfig {
  label: string | null        // volume label stored in DB, e.g. "VAULT"
  resolvedPath: string | null // actual path resolved at runtime, e.g. "E:\" or null if not found
}

interface StorageTransferProgress {
  phase: 'starting' | 'copying' | 'verifying' | 'deleting' | 'done' | 'error' | 'skipped'
  itemIndex: number
  itemTotal: number
  itemName?: string
  bytesDone?: number
  bytesTotal?: number
  message?: string
}

interface StorageTransferRequest {
  action: 'copy' | 'move' | 'delete'
  items: { side: 'vault' | 'cold'; relPath: string }[]
  destSide?: 'vault' | 'cold'
  conflictPolicy: 'skip' | 'replace'
}

interface StorageTransferResult {
  success: boolean
  errors: { relPath: string; error: string }[]
  skipped: number
}

interface DownloadProgress {
  index: number
  total: number
  url: string
  status: 'downloading' | 'converting' | 'done' | 'error'
  percent: number
  error?: string
  errorKind?: 'age-restricted' | 'bot-check' | 'unavailable' | 'other'
}

interface YouTubeCookieStatus {
  exists: boolean
  path: string
  expiresAt: number | null
  daysRemaining: number | null
  refreshedAt: number | null
}

interface WatchOrderData {
  sectionOrder: string[]
  itemOrder: Record<string, string[]>
}

interface MusicAlbum {
  name: string
  path: string
}

interface MusicAlbumsResult {
  musicDir: string
  albums: MusicAlbum[]
}

interface KeyboardBinding {
  action: string
  label: string
  context: 'mpv' | 'music'
  key: string
}

interface ControllerBinding {
  action: string
  label: string
  command: string
  button: string
  isLua: boolean
}

interface AudioTrack {
  lang: string
  codec: string
  channels: number
}

interface MediaTechInfo {
  duration: number
  fileSize: number
  videoCodec: string
  width: number
  height: number
  audioTracks: AudioTrack[]
  subtitleTracks: { lang: string }[]
}

interface MediaItem {
  id: number
  title: string
  year: number | null
  category: string
  filePath: string
  posterPath: string | null
  description: string | null
  genre: string | null
  platform: string | null
  executable: string | null
  lastOpenedAt: number | null
}

interface GpuInfo {
  name: string
  vramMB: number
  dedicated: boolean
}

interface SystemInfo {
  platform: string
  ramGB: number
  cpuModel: string
  cpuCores: number
  gpus: GpuInfo[]
}

interface StorageStats {
  total: number
  byCategory: Record<string, number>
  musicTrackCount: number
  mangaSeriesCount: number
  computedAt: number
  extrasBytesByParent?: Record<string, number>
}

interface LibraryStats {
  counts: Record<string, number>
  seriesCounts: Record<string, number>
  platforms: { platform: string; count: number }[]
  recentlyOpened: { title: string; category: string; filePath: string; lastOpenedAt: number }[]
  total: number
  extrasByParent: Record<string, number>
  extrasBytesByParent: Record<string, number> | null
  storage: StorageStats | null
}

interface AppInfo {
  version: string
  runtime: { electron: string; node: string; chrome: string }
  memoryMB: number
  dbSize: number
  tools: { ffprobe: boolean; ytdlp: boolean }
  driveInfo: { freeBytes: number; totalBytes: number } | null
}

interface Window {
  api: {
    window: {
      minimize: () => Promise<void>
      maximize: () => Promise<void>
      close: () => Promise<void>
    }
    library: {
      getConfig: () => Promise<LibraryConfig>
      setLabel: (label: string) => Promise<void>
      findDrive: (label: string) => Promise<string | null>
      scan: () => Promise<{ count: number }>
      forceScan: () => Promise<{ count: number }>
      getStats: () => Promise<LibraryStats>
      getItems: (category: string) => Promise<MediaItem[]>
      getItem: (id: number) => Promise<MediaItem | null>
      readImage: (filePath: string) => Promise<string | null>
      getExtras: (seriesTitle: string) => Promise<MediaItem[]>
      getAlbumTracks: (firstTrackPath: string) => Promise<{ path: string; title: string; artist?: string; trackNumber: number; duration: number; artPath: string | null }[]>
      getTechInfo:     (filePath: string) => Promise<MediaTechInfo | null>
      getDurations:    (category: string) => Promise<Record<string, number>>
      getEpubInfo:     (filePath: string) => Promise<{ title: string; author: string; chapters: { id: string; title: string; href: string }[]; coverDataUrl: string | null }>
      readEpubChapter: (filePath: string, chapterHref: string) => Promise<string>
      getWatchOrder: (seriesTitle: string, category: string) => Promise<WatchOrderData | null>
      getWatchGuide: (seriesTitle: string, category: string) => Promise<string[] | null>
      markOpened: (filePath: string) => Promise<void>
      setWatched: (filePath: string, watched: boolean) => Promise<void>
      setGenre: (filePath: string, genre: string | null) => Promise<void>
      getMusicAlbums: () => Promise<MusicAlbumsResult>
      downloadYouTube: (args: { urls: { url: string; title: string; artist?: string }[]; albumPath: string; artist?: string }) => Promise<{ success: boolean }>
      downloadYouTubePlaylist: (args: { url: string; albumPath: string; artist?: string }) => Promise<{ success: boolean }>
      onDownloadProgress: (cb: (progress: DownloadProgress) => void) => () => void
    }
    playlist: {
      getFavourites: () => Promise<string[]>
      setFavourite: (albumPath: string, isFav: boolean) => Promise<void>
    }
    controller: {
      getBindings: () => Promise<ControllerBinding[]>
      setBindings: (bindings: ControllerBinding[]) => Promise<void>
      resetBindings: () => Promise<ControllerBinding[]>
    }
    keyboard: {
      getBindings: () => Promise<KeyboardBinding[]>
      setBindings: (bindings: KeyboardBinding[]) => Promise<void>
      resetBindings: () => Promise<KeyboardBinding[]>
    }
    playback: {
      openFile:     (filePath: string) => Promise<void>
      openVideo:    (filePath: string, category?: string) => Promise<void>
      openAudio:    (filePath: string) => Promise<void>
      launchGame:   (gamePath: string, platform: string) => Promise<void>
      onMusicPause: (cb: () => void) => () => void
    }
    sync: {
      getBackupLabel: () => Promise<string | null>
      setBackupLabel: (label: string) => Promise<void>
      findDrive: (label: string) => Promise<string | null>
    }
    storage: {
      getDrives: () => Promise<{
        vault: { label: string | null; path: string; freeBytes: number; totalBytes: number } | null
        cold:  { label: string | null; path: string; freeBytes: number; totalBytes: number } | null
        coldConfigured: boolean
        rsyncAvailable: boolean
      }>
      listFolder: (side: 'vault' | 'cold', relPath: string) => Promise<{
        root: string
        mediaRoot: string
        relPath: string
        folders: { name: string; relPath: string; size: number }[]
      } | null>
      checkConflicts: (items: { side: 'vault' | 'cold'; relPath: string }[], destSide: 'vault' | 'cold') =>
        Promise<{ relPath: string; exists: boolean }[]>
      runTransfer: (req: StorageTransferRequest) => Promise<StorageTransferResult>
      getFolderSize: (side: 'vault' | 'cold', relPath: string) => Promise<{ bytes: number } | null>
      syncNewItems: () => Promise<{ success: boolean; copied: number; skipped: number; message?: string }>
      onProgress: (cb: (p: StorageTransferProgress) => void) => () => void
    }
    settings: {
      get: (key: string, fallback: string) => Promise<string>
      set: (key: string, value: string) => Promise<void>
      setSync: (key: string, value: string) => void
    }
    youtube: {
      getPlaylists: () => Promise<string[]>
      downloadVideo: (args: { urls: { url: string; title: string }[]; playlistName: string | null }) => Promise<{ success: boolean }>
      getCookieStatus: () => Promise<YouTubeCookieStatus>
      refreshCookies:  () => Promise<YouTubeCookieStatus>
    }
    manga: {
      openCbz: (filePath: string) => Promise<string[]>
      closeCbz: () => Promise<void>
    }
    system: {
      getInfo:    () => Promise<SystemInfo>
      getAppInfo: () => Promise<AppInfo>
    }
    platform: NodeJS.Platform
  }
}
