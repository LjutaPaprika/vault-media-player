import { create } from 'zustand'

interface Show {
  id: string
  name: string
  emoji: string
  baseCost: number
  baseRate: number
  count: number
  unlockAt: number
}

interface ClickUpgrade {
  id: string
  name: string
  cost: number
  purchased: boolean
}

interface IdleGameState {
  files: number
  lifetimeFiles: number
  prestigeCount: number
  shows: Show[]
  clickUpgrades: ClickUpgrade[]
  open: boolean

  tick: () => void
  click: () => void
  buyShow: (id: string) => void
  buyUpgrade: (id: string) => void
  prestige: () => void
  toggleOpen: () => void
}

const BASE_SHOWS: Omit<Show, 'count'>[] = [
  { id: 'fansub',   name: 'Fansub Group',     emoji: '🗂️', baseCost: 15,         baseRate: 0.1,     unlockAt: 0         },
  { id: 'webrip',   name: 'Webrip Pack',       emoji: '📦', baseCost: 120,        baseRate: 0.5,     unlockAt: 15        },
  { id: 'seasonal', name: 'Seasonal Haul',     emoji: '📺', baseCost: 600,        baseRate: 3,       unlockAt: 100       },
  { id: 'bluray',   name: 'Blu-Ray Rip',       emoji: '💿', baseCost: 3_000,      baseRate: 15,      unlockAt: 600       },
  { id: 'complete', name: 'Complete Series',   emoji: '📼', baseCost: 18_000,     baseRate: 90,      unlockAt: 3_000     },
  { id: 'hdmovie',  name: 'HD Movie Pack',     emoji: '🎬', baseCost: 100_000,    baseRate: 500,     unlockAt: 18_000    },
  { id: '4kremux',  name: '4K Remux',          emoji: '✨', baseCost: 600_000,    baseRate: 3_000,   unlockAt: 100_000   },
  { id: 'studio',   name: 'Studio Deal',       emoji: '🏢', baseCost: 4_000_000,  baseRate: 20_000,  unlockAt: 600_000   },
  { id: 'archive',  name: 'Streaming Archive', emoji: '☁️', baseCost: 30_000_000, baseRate: 150_000, unlockAt: 4_000_000 },
  { id: 'vault',    name: 'The Vault',         emoji: '🔐', baseCost: 250_000_000,baseRate:1_250_000, unlockAt: 30_000_000},
]

const BASE_UPGRADES: Omit<ClickUpgrade, 'purchased'>[] = [
  { id: 'u1', name: 'Better Indexer',   cost: 100       },
  { id: 'u2', name: 'Power Browse',     cost: 1_000     },
  { id: 'u3', name: 'Binge Mode',       cost: 15_000    },
  { id: 'u4', name: 'Marathon Session', cost: 200_000   },
  { id: 'u5', name: 'Vault Protocol',   cost: 3_000_000 },
]

const SAVE_KEY = 'idleGame'
const SAVE_DEBOUNCE_MS = 30_000

function showCost(show: Show): number {
  return Math.ceil(show.baseCost * Math.pow(1.15, show.count))
}

function prestigeMultiplier(count: number): number {
  return Math.pow(2, count)
}

function baseClickPower(upgrades: ClickUpgrade[]): number {
  return Math.pow(2, upgrades.filter((u) => u.purchased).length)
}

export { showCost, prestigeMultiplier, baseClickPower }
export type { Show, ClickUpgrade }

export const useIdleGameStore = create<IdleGameState>((set) => ({
  files: 0,
  lifetimeFiles: 0,
  prestigeCount: 0,
  shows: BASE_SHOWS.map((s) => ({ ...s, count: 0 })),
  clickUpgrades: BASE_UPGRADES.map((u) => ({ ...u, purchased: false })),
  open: false,

  tick: () =>
    set((s) => {
      const mult = prestigeMultiplier(s.prestigeCount)
      const rate = s.shows.reduce((sum, sh) => sum + sh.count * sh.baseRate, 0)
      const earned = rate * mult
      return { files: s.files + earned, lifetimeFiles: s.lifetimeFiles + earned }
    }),

  click: () =>
    set((s) => {
      const mult = prestigeMultiplier(s.prestigeCount)
      const power = baseClickPower(s.clickUpgrades) * mult
      return { files: s.files + power, lifetimeFiles: s.lifetimeFiles + power }
    }),

  buyShow: (id) =>
    set((s) => {
      const show = s.shows.find((sh) => sh.id === id)
      if (!show) return {}
      const cost = showCost(show)
      if (s.files < cost) return {}
      return {
        files: s.files - cost,
        shows: s.shows.map((sh) => (sh.id === id ? { ...sh, count: sh.count + 1 } : sh)),
      }
    }),

  buyUpgrade: (id) =>
    set((s) => {
      const upgrade = s.clickUpgrades.find((u) => u.id === id)
      if (!upgrade || upgrade.purchased || s.files < upgrade.cost) return {}
      return {
        files: s.files - upgrade.cost,
        clickUpgrades: s.clickUpgrades.map((u) => (u.id === id ? { ...u, purchased: true } : u)),
      }
    }),

  prestige: () =>
    set((s) => {
      if (s.lifetimeFiles < 1_000_000_000) return {}
      return {
        files: 0,
        lifetimeFiles: 0,
        prestigeCount: s.prestigeCount + 1,
        shows: BASE_SHOWS.map((sh) => ({ ...sh, count: 0 })),
        clickUpgrades: BASE_UPGRADES.map((u) => ({ ...u, purchased: false })),
      }
    }),

  toggleOpen: () => set((s) => ({ open: !s.open })),
}))

// ── Persistence ────────────────────────────────────────────────────────────────

const SAVE_INTERVAL_MS = SAVE_DEBOUNCE_MS

let saveTimer: ReturnType<typeof setTimeout> | null = null
let lastSave = 0
let saveReady = false

function buildSaveData(): string {
  const s = useIdleGameStore.getState()
  return JSON.stringify({
    v: 1,
    files: s.files,
    lifetimeFiles: s.lifetimeFiles,
    prestigeCount: s.prestigeCount,
    shows: Object.fromEntries(s.shows.map((sh) => [sh.id, sh.count])),
    upgrades: s.clickUpgrades.filter((u) => u.purchased).map((u) => u.id),
    open: s.open,
  })
}

function scheduleSave(): void {
  if (!saveReady) return
  const now = Date.now()
  const sinceLastSave = now - lastSave
  if (sinceLastSave >= SAVE_INTERVAL_MS) {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
    lastSave = now
    window.api.settings.set(SAVE_KEY, buildSaveData()).catch(() => {})
  } else if (!saveTimer) {
    saveTimer = setTimeout(() => {
      saveTimer = null
      lastSave = Date.now()
      window.api.settings.set(SAVE_KEY, buildSaveData()).catch(() => {})
    }, SAVE_INTERVAL_MS - sinceLastSave)
  }
}

export async function initGameSave(): Promise<void> {
  try {
    const raw = await window.api.settings.get(SAVE_KEY, '')
    if (raw) {
      const data = JSON.parse(raw) as {
        v: number
        files?: number
        lifetimeFiles?: number
        prestigeCount?: number
        shows?: Record<string, number>
        upgrades?: string[]
        open?: boolean
      }
      if (data.v === 1) {
        useIdleGameStore.setState({
          files:          data.files         ?? 0,
          lifetimeFiles:  data.lifetimeFiles  ?? 0,
          prestigeCount:  data.prestigeCount  ?? 0,
          shows:          BASE_SHOWS.map((sh) => ({ ...sh, count: data.shows?.[sh.id] ?? 0 })),
          clickUpgrades:  BASE_UPGRADES.map((u)  => ({ ...u, purchased: (data.upgrades ?? []).includes(u.id) })),
          open:           data.open          ?? false,
        })
      }
    }
  } catch { /* corrupt save — start fresh */ }

  saveReady = true
  useIdleGameStore.subscribe(scheduleSave)
  window.addEventListener('beforeunload', () => {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null }
    window.api.settings.setSync(SAVE_KEY, buildSaveData())
  })
}
