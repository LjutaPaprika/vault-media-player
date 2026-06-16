import { create } from 'zustand'

type TransferKind = 'copy' | 'move' | 'delete' | 'sync'

interface TransferState {
  active: boolean
  action: TransferKind | null
  destSide: 'vault' | 'cold' | null
  progress: StorageTransferProgress | null
  terminalAt: number | null  // when the overlay should hide after completion
  errors: { relPath: string; error: string }[]
  skipped: number
  begin: (action: TransferKind, destSide: 'vault' | 'cold' | null) => void
  update: (p: StorageTransferProgress) => void
  finish: (result: { errors: { relPath: string; error: string }[]; skipped: number }) => void
  dismiss: () => void
}

export const useTransferStore = create<TransferState>((set) => ({
  active: false,
  action: null,
  destSide: null,
  progress: null,
  terminalAt: null,
  errors: [],
  skipped: 0,
  begin: (action, destSide) => set({
    active: true,
    action,
    destSide,
    progress: { phase: 'starting', itemIndex: 0, itemTotal: 0 },
    terminalAt: null,
    errors: [],
    skipped: 0
  }),
  update: (p) => set({ progress: p }),
  finish: (result) => set({
    terminalAt: Date.now(),
    errors: result.errors,
    skipped: result.skipped
  }),
  dismiss: () => set({ active: false, action: null, destSide: null, progress: null, terminalAt: null, errors: [], skipped: 0 })
}))
