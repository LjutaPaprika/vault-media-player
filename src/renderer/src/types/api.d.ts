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
      getItems: (category: string) => Promise<MediaItem[]>
      getItem: (id: number) => Promise<MediaItem | null>
      readImage: (filePath: string) => Promise<string | null>
      getExtras: (seriesTitle: string) => Promise<MediaItem[]>
      getAlbumTracks: (firstTrackPath: string) => Promise<{ path: string; title: string; trackNumber: number }[]>
    }
    playback: {
      openVideo: (filePath: string) => Promise<void>
      openAudio: (filePath: string) => Promise<void>
      launchGame: (gamePath: string, platform: string) => Promise<void>
    }
    sync: {
      getBackupLabel: () => Promise<string | null>
      setBackupLabel: (label: string) => Promise<void>
      findDrive: (label: string) => Promise<string | null>
      start: () => Promise<void>
      onProgress: (cb: (progress: SyncProgress) => void) => () => void
    }
    platform: NodeJS.Platform
  }
}
