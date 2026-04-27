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
    getEpubInfo:     (filePath: string) => ipcRenderer.invoke('library:getEpubInfo', filePath),
    readEpubChapter: (filePath: string, chapterHref: string) => ipcRenderer.invoke('library:readEpubChapter', filePath, chapterHref),
    getWatchOrder: (seriesTitle: string, category: string) => ipcRenderer.invoke('library:getWatchOrder', seriesTitle, category),
    getWatchGuide: (seriesTitle: string, category: string) => ipcRenderer.invoke('library:getWatchGuide', seriesTitle, category),
    markOpened: (filePath: string) => ipcRenderer.invoke('library:markOpened', filePath),
    getMusicAlbums: () => ipcRenderer.invoke('library:getMusicAlbums'),
    downloadYouTube: (args: { urls: { url: string; title: string }[]; albumPath: string; artist?: string }) =>
      ipcRenderer.invoke('library:downloadYouTube', args),
    onDownloadProgress: (cb: (progress: DownloadProgress) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, progress: DownloadProgress): void => cb(progress)
      ipcRenderer.on('download:progress', handler)
      return () => ipcRenderer.removeListener('download:progress', handler)
    }
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

  // App settings
  settings: {
    get: (key: string, fallback: string) => ipcRenderer.invoke('settings:get', key, fallback),
    set: (key: string, value: string) => ipcRenderer.invoke('settings:set', key, value)
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

  // Embedded mpv player
  mpv: {
    launch: (filePath: string, category?: string) =>
      ipcRenderer.invoke('mpv:launch', filePath, category),
    command: (cmd: unknown[]) => ipcRenderer.invoke('mpv:command', cmd),
    quit: () => ipcRenderer.invoke('mpv:quit'),

    onTimePos: (cb: (t: number) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, v: number): void => cb(v)
      ipcRenderer.on('mpv:timePos', handler)
      return () => ipcRenderer.removeListener('mpv:timePos', handler)
    },
    onPause: (cb: (paused: boolean) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, v: boolean): void => cb(v)
      ipcRenderer.on('mpv:pause', handler)
      return () => ipcRenderer.removeListener('mpv:pause', handler)
    },
    onDuration: (cb: (d: number) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, v: number): void => cb(v)
      ipcRenderer.on('mpv:duration', handler)
      return () => ipcRenderer.removeListener('mpv:duration', handler)
    },
    onTrackList: (cb: (tracks: MpvTrack[]) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, v: MpvTrack[]): void => cb(v)
      ipcRenderer.on('mpv:trackList', handler)
      return () => ipcRenderer.removeListener('mpv:trackList', handler)
    },
    onEnded: (cb: () => void) => {
      const handler = (): void => cb()
      ipcRenderer.on('mpv:ended', handler)
      return () => ipcRenderer.removeListener('mpv:ended', handler)
    }
  },

  // Platform info
  platform: process.platform
})
