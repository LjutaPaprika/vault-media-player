import { create } from 'zustand'

interface DriveStat {
  label: string | null
  path: string
  freeBytes: number
  totalBytes: number
}

interface StorageStatsState {
  vault: DriveStat | null
  cold:  DriveStat | null
  coldConfigured: boolean
  rsyncAvailable: boolean
  lastFetchedAt: number
  refresh: () => Promise<void>
}

export const useStorageStatsStore = create<StorageStatsState>((set) => ({
  vault: null,
  cold:  null,
  coldConfigured: false,
  rsyncAvailable: true,
  lastFetchedAt: 0,
  refresh: async () => {
    const r = await window.api.storage.getDrives()
    set({
      vault: r.vault,
      cold:  r.cold,
      coldConfigured: r.coldConfigured,
      rsyncAvailable: r.rsyncAvailable,
      lastFetchedAt: Date.now()
    })
  }
}))
