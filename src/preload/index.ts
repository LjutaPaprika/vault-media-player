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
    getItems: (category: string) => ipcRenderer.invoke('library:getItems', category),
    getItem: (id: number) => ipcRenderer.invoke('library:getItem', id),
    readImage: (filePath: string) => ipcRenderer.invoke('library:readImage', filePath),
    getExtras: (seriesTitle: string) => ipcRenderer.invoke('library:getExtras', seriesTitle)
  },

  // Playback
  playback: {
    openVideo: (filePath: string) => ipcRenderer.invoke('playback:openVideo', filePath),
    openAudio: (filePath: string) => ipcRenderer.invoke('playback:openAudio', filePath),
    launchGame: (gamePath: string, platform: string) =>
      ipcRenderer.invoke('playback:launchGame', gamePath, platform)
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

  // Platform info
  platform: process.platform
})
