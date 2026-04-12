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

interface SyncProgress {
  status: 'running' | 'done' | 'error'
  message: string
  filescopied?: number
  filesskipped?: number
  filesdeleted?: number
}

interface DownloadProgress {
  index: number
  total: number
  url: string
  status: 'downloading' | 'converting' | 'done' | 'error'
  percent: number
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
}

interface LibraryStats {
  counts: Record<string, number>
  seriesCounts: Record<string, number>
  platforms: { platform: string; count: number }[]
  recentlyOpened: { title: string; category: string; filePath: string; lastOpenedAt: number }[]
  total: number
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
      getEpubInfo:     (filePath: string) => Promise<{ title: string; author: string; chapters: { id: string; title: string; href: string }[]; coverDataUrl: string | null }>
      readEpubChapter: (filePath: string, chapterHref: string) => Promise<string>
      getWatchOrder: (seriesTitle: string, category: string) => Promise<WatchOrderData | null>
      markOpened: (filePath: string) => Promise<void>
      getMusicAlbums: () => Promise<MusicAlbumsResult>
      downloadYouTube: (args: { urls: { url: string; title: string; artist?: string }[]; albumPath: string; artist?: string }) => Promise<{ success: boolean }>
      onDownloadProgress: (cb: (progress: DownloadProgress) => void) => () => void
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
      start: () => Promise<void>
      onProgress: (cb: (progress: SyncProgress) => void) => () => void
    }
    settings: {
      get: (key: string, fallback: string) => Promise<string>
      set: (key: string, value: string) => Promise<void>
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
