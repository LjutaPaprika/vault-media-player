import { contextBridge, ipcRenderer } from 'electron'

// Expose a typed API to the renderer via window.api
contextBridge.exposeInMainWorld('api', {
  // Window controls
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close')
  },

  // Library
  library: {
    getConfig: () => ipcRenderer.invoke('library:getConfig'),
    setLabel: (label: string) => ipcRenderer.invoke('library:setLabel', label),
    findDrive: (label: string) => ipcRenderer.invoke('library:findDrive', label),
    scan: () => ipcRenderer.invoke('library:scan'),
    forceScan: () => ipcRenderer.invoke('library:forceScan'),
    getAlbumTracks: (firstTrackPath: string) => ipcRenderer.invoke('library:getAlbumTracks', firstTrackPath),
    getStats: () => ipcRenderer.invoke('library:getStats'),
    getItems: (category: string) => ipcRenderer.invoke('library:getItems', category),
    getItem: (id: number) => ipcRenderer.invoke('library:getItem', id),
    readImage: (filePath: string) => ipcRenderer.invoke('library:readImage', filePath),
    getExtras: (seriesTitle: string) => ipcRenderer.invoke('library:getExtras', seriesTitle),
    getTechInfo:     (filePath: string) => ipcRenderer.invoke('library:getTechInfo', filePath),
    getDurations:    (category: string) => ipcRenderer.invoke('library:getDurations', category),
    getEpubInfo:     (filePath: string) => ipcRenderer.invoke('library:getEpubInfo', filePath),
    readEpubChapter: (filePath: string, chapterHref: string) => ipcRenderer.invoke('library:readEpubChapter', filePath, chapterHref),
    getWatchOrder: (seriesTitle: string, category: string) => ipcRenderer.invoke('library:getWatchOrder', seriesTitle, category),
    getWatchGuide: (seriesTitle: string, category: string) => ipcRenderer.invoke('library:getWatchGuide', seriesTitle, category),
    markOpened: (filePath: string) => ipcRenderer.invoke('library:markOpened', filePath),
    setWatched: (filePath: string, watched: boolean) => ipcRenderer.invoke('library:setWatched', filePath, watched),
    setGenre: (filePath: string, genre: string | null) => ipcRenderer.invoke('library:setGenre', filePath, genre),
    getMusicAlbums: () => ipcRenderer.invoke('library:getMusicAlbums'),
    downloadYouTube: (args: { urls: { url: string; title: string }[]; albumPath: string; artist?: string }) =>
      ipcRenderer.invoke('library:downloadYouTube', args),
    downloadYouTubePlaylist: (args: { url: string; albumPath: string; artist?: string }) =>
      ipcRenderer.invoke('library:downloadYouTubePlaylist', args),
    onDownloadProgress: (cb: (progress: DownloadProgress) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: DownloadProgress): void => cb(progress)
      ipcRenderer.on('download:progress', handler)
      return () => ipcRenderer.removeListener('download:progress', handler)
    }
  },

  // Favourites
  playlist: {
    getFavourites: (): Promise<string[]> => ipcRenderer.invoke('playlist:getFavourites'),
    setFavourite: (albumPath: string, isFav: boolean): Promise<void> => ipcRenderer.invoke('playlist:setFavourite', albumPath, isFav)
  },

  // Playback
  playback: {
    openFile:  (filePath: string) => ipcRenderer.invoke('playback:openFile', filePath),
    openVideo: (filePath: string, category?: string) => ipcRenderer.invoke('playback:openVideo', filePath, category),
    openAudio: (filePath: string) => ipcRenderer.invoke('playback:openAudio', filePath),
    launchGame: (gamePath: string, platform: string) =>
      ipcRenderer.invoke('playback:launchGame', gamePath, platform),
    onMusicPause: (cb: () => void) => {
      ipcRenderer.on('music:pause', cb)
      return () => ipcRenderer.removeListener('music:pause', cb)
    }
  },

  // Controller bindings
  controller: {
    getBindings: () => ipcRenderer.invoke('controller:getBindings'),
    setBindings: (bindings: unknown[]) => ipcRenderer.invoke('controller:setBindings', bindings),
    resetBindings: () => ipcRenderer.invoke('controller:resetBindings')
  },

  // Keyboard bindings
  keyboard: {
    getBindings: () => ipcRenderer.invoke('keyboard:getBindings'),
    setBindings: (bindings: unknown[]) => ipcRenderer.invoke('keyboard:setBindings', bindings),
    resetBindings: () => ipcRenderer.invoke('keyboard:resetBindings')
  },

  // Sync
  sync: {
    getBackupLabel: () => ipcRenderer.invoke('sync:getBackupLabel'),
    setBackupLabel: (label: string) => ipcRenderer.invoke('sync:setBackupLabel', label),
    findDrive: (label: string) => ipcRenderer.invoke('sync:findDrive', label),
    start: () => ipcRenderer.invoke('sync:start'),
    onProgress: (cb: (progress: SyncProgress) => void) => {
      ipcRenderer.on('sync:progress', (_event, progress) => cb(progress))
      return () => ipcRenderer.removeAllListeners('sync:progress')
    }
  },

  // Storage (cold-store sync)
  storage: {
    getDrives: () => ipcRenderer.invoke('storage:getDrives'),
    listFolder: (side: 'vault' | 'cold', relPath: string) =>
      ipcRenderer.invoke('storage:listFolder', { side, relPath }),
    checkConflicts: (items: { side: 'vault' | 'cold'; relPath: string }[], destSide: 'vault' | 'cold') =>
      ipcRenderer.invoke('storage:checkConflicts', { items, destSide }),
    runTransfer: (req: unknown) => ipcRenderer.invoke('storage:runTransfer', req),
    onProgress: (cb: (p: StorageTransferProgress) => void) => {
      const listener = (_e: unknown, p: StorageTransferProgress): void => cb(p)
      ipcRenderer.on('storage:progress', listener)
      return () => ipcRenderer.removeListener('storage:progress', listener)
    }
  },

  // App settings
  settings: {
    get: (key: string, fallback: string) => ipcRenderer.invoke('settings:get', key, fallback),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value),
    setSync: (key: string, value: string) => ipcRenderer.sendSync('settings:set-sync', key, value)
  },

  // YouTube videos
  youtube: {
    getPlaylists: (): Promise<string[]> => ipcRenderer.invoke('youtube:getPlaylists'),
    downloadVideo: (args: { urls: { url: string; title: string }[]; playlistName: string | null }) =>
      ipcRenderer.invoke('youtube:downloadVideo', args),
    getCookieStatus: () => ipcRenderer.invoke('youtube:getCookieStatus'),
    refreshCookies:  () => ipcRenderer.invoke('youtube:refreshCookies')
  },

  // CBZ reader
  manga: {
    openCbz: (filePath: string) => ipcRenderer.invoke('manga:openCbz', filePath),
    closeCbz: () => ipcRenderer.invoke('manga:closeCbz')
  },

  // System info
  system: {
    getInfo:    () => ipcRenderer.invoke('system:getInfo'),
    getAppInfo: () => ipcRenderer.invoke('system:getAppInfo')
  },

  // Platform info
  platform: process.platform
})
