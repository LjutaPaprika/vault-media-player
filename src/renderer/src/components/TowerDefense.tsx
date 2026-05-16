import { useEffect, useRef, useState } from 'react'
import styles from './TowerDefense.module.css'

const CANVAS_W = 640, CANVAS_H = 480
const CELL = 32
const COLS = CANVAS_W / CELL, ROWS = CANVAS_H / CELL

type MapKey = 'zigzag' | 'spiral' | 'gauntlet' | 'straight' | 'lbend' | 'cross' | 'switchback' | 'fork' | 'pinch'
type DiffKey = 'easy' | 'normal' | 'hard'

interface MapDef {
  name: string
  difficulty: DiffKey
  path: [number, number][]
}

const MAPS: Record<MapKey, MapDef> = {
  straight: {
    name: 'Straight',
    difficulty: 'easy',
    path: [
      [0,4],[1,4],[2,4],[3,5],[4,5],[5,5],[6,6],[7,6],[8,6],[9,7],[10,7],[11,7],[12,8],[13,8],[14,8],[15,9],[16,9],[17,9],[18,10],[19,10]
    ]
  },
  lbend: {
    name: 'L-Bend',
    difficulty: 'easy',
    path: [
      [0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[8,3],[9,3],[10,3],[11,3],[12,3],
      [12,4],[12,5],[12,6],[12,7],[12,8],[12,9],[12,10],[12,11],
      [13,11],[14,11],[15,11],[16,11],[17,11],[18,11],[19,11]
    ]
  },
  zigzag: {
    name: 'Zigzag',
    difficulty: 'easy',
    path: [
      [0,7],[1,7],[2,7],[3,7],[4,7],[4,6],[4,5],[4,4],[5,4],[6,4],[7,4],[8,4],[8,5],[8,6],[8,7],[8,8],[8,9],[9,9],[10,9],[11,9],[11,8],[11,7],[11,6],[12,6],[13,6],[14,6],[15,6],[15,7],[15,8],[15,9],[15,10],[16,10],[17,10],[18,10],[19,10]
    ]
  },
  spiral: {
    name: 'Spiral',
    difficulty: 'normal',
    path: [
      [0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],[11,1],[12,1],[13,1],[14,1],[15,1],[16,1],[17,1],[18,1],
      [18,2],[18,3],[18,4],[18,5],[18,6],[18,7],[18,8],[18,9],[18,10],[18,11],[18,12],
      [17,12],[16,12],[15,12],[14,12],[13,12],[12,12],[11,12],[10,12],[9,12],[8,12],[7,12],[6,12],[5,12],[4,12],[3,12],
      [3,11],[3,10],[3,9],[3,8],[3,7],[3,6],[3,5],[3,4],
      [4,4],[5,4],[6,4],[7,4],[8,4],[9,4],[10,4],[11,4],[12,4],[13,4],[14,4],[15,4],
      [15,5],[15,6],[15,7],[15,8],[15,9],
      [14,9],[13,9],[12,9],[11,9],[10,9],[9,9],[8,9],[7,9],[6,9],
      [6,8],[6,7],
      [7,7],[8,7],[9,7],[10,7],[11,7],[12,7]
    ]
  },
  cross: {
    name: 'Crossroads',
    difficulty: 'normal',
    // Path crosses itself at (14,7) — visited going down then again going right at the exit.
    path: [
      [0,4],[1,4],[2,4],[3,4],[4,4],[5,4],[6,4],[7,4],[8,4],[9,4],[10,4],[11,4],[12,4],[13,4],[14,4],
      [14,5],[14,6],[14,7],[14,8],[14,9],[14,10],
      [13,10],[12,10],[11,10],[10,10],[9,10],[8,10],[7,10],[6,10],[5,10],[4,10],
      [4,9],[4,8],[4,7],
      [5,7],[6,7],[7,7],[8,7],[9,7],[10,7],[11,7],[12,7],[13,7],[14,7],[15,7],[16,7],[17,7],[18,7],[19,7]
    ]
  },
  switchback: {
    name: 'Switchback',
    difficulty: 'normal',
    path: [
      [0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[7,1],[8,1],[9,1],[10,1],[11,1],[12,1],[13,1],[14,1],[15,1],[16,1],[17,1],
      [17,2],[17,3],[17,4],
      [16,4],[15,4],[14,4],[13,4],[12,4],[11,4],[10,4],[9,4],[8,4],[7,4],[6,4],[5,4],[4,4],[3,4],[2,4],
      [2,5],[2,6],[2,7],
      [3,7],[4,7],[5,7],[6,7],[7,7],[8,7],[9,7],[10,7],[11,7],[12,7],[13,7],[14,7],[15,7],[16,7],[17,7],
      [17,8],[17,9],[17,10],
      [16,10],[15,10],[14,10],[13,10],[12,10],[11,10],[10,10],[9,10],[8,10],[7,10],[6,10],[5,10],[4,10],[3,10],[2,10],
      [2,11],[2,12],[2,13],
      [3,13],[4,13],[5,13],[6,13],[7,13],[8,13],[9,13],[10,13],[11,13],[12,13],[13,13],[14,13],[15,13],[16,13],[17,13],[18,13],[19,13]
    ]
  },
  gauntlet: {
    name: 'Gauntlet',
    difficulty: 'hard',
    path: [
      [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],
      [5,3],[5,4],[5,5],
      [6,5],[7,5],[8,5],[9,5],
      [9,4],[9,3],[9,2],
      [10,2],[11,2],[12,2],[13,2],
      [13,3],[13,4],[13,5],[13,6],[13,7],[13,8],
      [12,8],[11,8],[10,8],[9,8],[8,8],[7,8],[6,8],[5,8],[4,8],[3,8],[2,8],
      [2,9],[2,10],[2,11],
      [3,11],[4,11],[5,11],[6,11],[7,11],[8,11],[9,11],[10,11],[11,11],[12,11],[13,11],[14,11],[15,11],[16,11],[17,11],[18,11],[19,11]
    ]
  },
  fork: {
    name: 'Fork',
    difficulty: 'hard',
    // Visual fork: path Y-splits at (9,7) - branching mechanics deferred to a later pass; for now a single canonical path.
    path: [
      [0,3],[1,3],[2,3],[3,3],[4,3],[5,3],[6,3],[7,3],[8,3],[9,3],
      [9,4],[9,5],[9,6],[9,7],
      [10,7],[11,7],[12,7],[13,7],[14,7],[15,7],[16,7],[17,7],[18,7],[19,7]
    ]
  },
  pinch: {
    name: 'Pinch',
    difficulty: 'hard',
    path: [
      [0,7],[1,7],[2,7],[3,7],[4,7],[5,7],
      [5,6],[5,5],[5,4],[5,3],[5,2],
      [6,2],[7,2],[8,2],
      [8,3],[8,4],[8,5],[8,6],[8,7],[8,8],[8,9],[8,10],[8,11],[8,12],
      [9,12],[10,12],[11,12],
      [11,11],[11,10],[11,9],[11,8],[11,7],[11,6],[11,5],[11,4],[11,3],[11,2],
      [12,2],[13,2],[14,2],[15,2],[16,2],[17,2],[18,2],[19,2]
    ]
  }
}

const MAPS_BY_DIFF: Record<DiffKey, MapKey[]> = {
  easy:   ['straight', 'lbend', 'zigzag'],
  normal: ['spiral', 'cross', 'switchback'],
  hard:   ['gauntlet', 'fork', 'pinch']
}

const DIFFICULTY: Record<DiffKey, { hpMult: number; speedMult: number; goldMult: number; livesMod: number; label: string; color: string }> = {
  easy:   { hpMult: 0.75, speedMult: 0.85, goldMult: 1.25, livesMod:  +5, label: 'EASY',   color: '#4ade80' },
  normal: { hpMult: 1.0,  speedMult: 1.0,  goldMult: 1.0,  livesMod:   0, label: 'NORMAL', color: '#22d3ee' },
  hard:   { hpMult: 1.3,  speedMult: 1.15, goldMult: 0.85, livesMod:  -5, label: 'HARD',   color: '#ef4444' }
}

const SAVE_VERSION = 3
const slotKey = (m: MapKey, d: DiffKey): string => `tdSave_${m}_${d}`
const bestKey = (m: MapKey, d: DiffKey): string => `tdBest_${m}_${d}`

// Legacy keys (v1) — migrated on first load, then deleted.
const LEGACY_BEST_KEY = 'towerDefenseBest'
const LEGACY_STATE_KEY = 'towerDefenseState'

type TowerKind = 'basic' | 'sniper' | 'splash' | 'freeze' | 'poison' | 'chain' | 'mortar' | 'beacon' | 'spotter' | 'mine' | 'vault'
type Phase = 'idle' | 'playing' | 'between' | 'gameOver'
type Branch = 'A' | 'B' | null

interface TowerLevel {
  cost: number
  damage: number
  range: number
  fireRate: number
  effect?: { kind: 'slow' | 'poison'; magnitude: number; duration: number }
  /** Beacon: passive aura that buffs adjacent towers */
  aura?: { kind: 'damage' | 'firerate' | 'range'; boost: number }
  /** Spotter: reveals stealth/flying in radius; also implies Spotter-vision */
  detect?: boolean
  /** Mine: one-shot trap with recharge; range = trigger radius */
  mineCharges?: number
  mineRechargeSec?: number
  mineSplash?: number
  /** Vault: passive income */
  goldPerSec?: number
  /** Plague (Toxin branch A): poison spreads to adjacent enemies */
  poisonSpread?: number
}

interface TowerDef {
  name: string
  color: string
  description: string
  levels: TowerLevel[]              // T1, T2, T3 (tier 0, 1, 2)
  branchA?: { name: string; levels: TowerLevel[] }  // T4A, T5A (tier 3, 4)
  branchB?: { name: string; levels: TowerLevel[] }  // T4B, T5B (tier 3, 4)
}

const TOWER_DEFS: Record<TowerKind, TowerDef> = {
  basic: {
    name: 'Archer',
    color: '#4ade80',
    description: 'Reliable, fast-firing',
    levels: [
      { cost: 50,  damage: 10, range: 3,   fireRate: 1.0 },
      { cost: 60,  damage: 18, range: 3.5, fireRate: 1.2 },
      { cost: 90,  damage: 32, range: 4,   fireRate: 1.5 }
    ],
    branchA: { name: 'Marksman', levels: [
      { cost: 180, damage: 70,  range: 4.5, fireRate: 1.2 },
      { cost: 320, damage: 140, range: 5,   fireRate: 1.4 }
    ]},
    branchB: { name: 'Volley',   levels: [
      { cost: 180, damage: 28, range: 4,   fireRate: 2.4 },
      { cost: 320, damage: 50, range: 4.5, fireRate: 3.2 }
    ]}
  },
  sniper: {
    name: 'Sniper',
    color: '#60a5fa',
    description: 'Long range, high damage',
    levels: [
      { cost: 100, damage: 40,  range: 6,   fireRate: 0.4 },
      { cost: 120, damage: 75,  range: 7,   fireRate: 0.5 },
      { cost: 180, damage: 140, range: 8,   fireRate: 0.6 }
    ],
    branchA: { name: 'Piercer', levels: [
      { cost: 280, damage: 220, range: 9,  fireRate: 0.6 },
      { cost: 460, damage: 400, range: 10, fireRate: 0.7 }
    ]},
    branchB: { name: 'Crit',    levels: [
      { cost: 280, damage: 180, range: 9,  fireRate: 0.65 },
      { cost: 460, damage: 320, range: 10, fireRate: 0.75 }
    ]}
  },
  splash: {
    name: 'Cannon',
    color: '#f97316',
    description: 'Hits all enemies in radius',
    levels: [
      { cost: 150, damage: 15, range: 2.5, fireRate: 0.8 },
      { cost: 175, damage: 28, range: 3,   fireRate: 0.9 },
      { cost: 250, damage: 50, range: 3.5, fireRate: 1.0 }
    ],
    branchA: { name: 'Demolisher', levels: [
      { cost: 380, damage: 90,  range: 4,   fireRate: 0.8 },
      { cost: 600, damage: 160, range: 4.5, fireRate: 0.9 }
    ]},
    branchB: { name: 'Quickshot', levels: [
      { cost: 380, damage: 60,  range: 3.5, fireRate: 1.6 },
      { cost: 600, damage: 100, range: 4,   fireRate: 2.0 }
    ]}
  },
  freeze: {
    name: 'Frost',
    color: '#22d3ee',
    description: 'Slows enemies',
    levels: [
      { cost: 80,  damage: 4,  range: 3,   fireRate: 1.2, effect: { kind: 'slow', magnitude: 0.5, duration: 1.5 } },
      { cost: 100, damage: 8,  range: 3.5, fireRate: 1.4, effect: { kind: 'slow', magnitude: 0.4, duration: 2 } },
      { cost: 150, damage: 16, range: 4,   fireRate: 1.6, effect: { kind: 'slow', magnitude: 0.3, duration: 2.5 } }
    ],
    branchA: { name: 'Glacier',  levels: [
      { cost: 240, damage: 28, range: 4.5, fireRate: 1.8, effect: { kind: 'slow', magnitude: 0.2, duration: 3.5 } },
      { cost: 400, damage: 50, range: 5,   fireRate: 2.0, effect: { kind: 'slow', magnitude: 0.15, duration: 4.5 } }
    ]},
    branchB: { name: 'Frostbite', levels: [
      { cost: 240, damage: 30, range: 4.5, fireRate: 1.8, effect: { kind: 'poison', magnitude: 12, duration: 4 } },
      { cost: 400, damage: 55, range: 5,   fireRate: 2.0, effect: { kind: 'poison', magnitude: 22, duration: 5 } }
    ]}
  },
  poison: {
    name: 'Toxin',
    color: '#a855f7',
    description: 'Damage over time',
    levels: [
      { cost: 120, damage: 5,  range: 3,   fireRate: 0.8, effect: { kind: 'poison', magnitude: 8,  duration: 3 } },
      { cost: 140, damage: 8,  range: 3.5, fireRate: 0.9, effect: { kind: 'poison', magnitude: 16, duration: 4 } },
      { cost: 200, damage: 14, range: 4,   fireRate: 1.0, effect: { kind: 'poison', magnitude: 28, duration: 5 } }
    ],
    branchA: { name: 'Plague', levels: [
      { cost: 320, damage: 18, range: 4.5, fireRate: 1.1, effect: { kind: 'poison', magnitude: 40, duration: 6 }, poisonSpread: 1.5 },
      { cost: 520, damage: 26, range: 5,   fireRate: 1.2, effect: { kind: 'poison', magnitude: 65, duration: 7 }, poisonSpread: 2.0 }
    ]},
    branchB: { name: 'Venom',  levels: [
      { cost: 320, damage: 22, range: 4.5, fireRate: 1.1, effect: { kind: 'poison', magnitude: 65,  duration: 5 } },
      { cost: 520, damage: 38, range: 5,   fireRate: 1.2, effect: { kind: 'poison', magnitude: 110, duration: 6 } }
    ]}
  },
  chain: {
    name: 'Tesla',
    color: '#facc15',
    description: 'Lightning chains between enemies',
    levels: [
      { cost: 175, damage: 25, range: 3,   fireRate: 0.8 },
      { cost: 200, damage: 45, range: 3.5, fireRate: 0.9 },
      { cost: 280, damage: 80, range: 4,   fireRate: 1.0 }
    ],
    branchA: { name: 'Conduit', levels: [
      { cost: 420, damage: 95,  range: 4.5, fireRate: 1.0 },
      { cost: 660, damage: 160, range: 5,   fireRate: 1.1 }
    ]},
    branchB: { name: 'Overcharge', levels: [
      { cost: 420, damage: 140, range: 4.5, fireRate: 1.1 },
      { cost: 660, damage: 250, range: 5,   fireRate: 1.2 }
    ]}
  },
  mortar: {
    name: 'Mortar',
    color: '#ec4899',
    description: 'Long-range explosive shells',
    levels: [
      { cost: 220, damage: 60,  range: 8,  fireRate: 0.3 },
      { cost: 260, damage: 110, range: 9,  fireRate: 0.35 },
      { cost: 360, damage: 200, range: 10, fireRate: 0.4 }
    ],
    branchA: { name: 'Howitzer', levels: [
      { cost: 540, damage: 360, range: 11, fireRate: 0.3 },
      { cost: 820, damage: 620, range: 12, fireRate: 0.35 }
    ]},
    branchB: { name: 'Barrage', levels: [
      { cost: 540, damage: 220, range: 10, fireRate: 0.7 },
      { cost: 820, damage: 360, range: 11, fireRate: 0.85 }
    ]}
  },
  beacon: {
    name: 'Beacon',
    color: '#fbbf24',
    description: 'Buffs adjacent towers (aura)',
    levels: [
      { cost: 100, damage: 0, range: 2,   fireRate: 0, aura: { kind: 'damage',   boost: 0.10 } },
      { cost: 140, damage: 0, range: 2.5, fireRate: 0, aura: { kind: 'damage',   boost: 0.20 } },
      { cost: 200, damage: 0, range: 3,   fireRate: 0, aura: { kind: 'damage',   boost: 0.30 } }
    ],
    branchA: { name: 'Amplifier', levels: [
      { cost: 300, damage: 0, range: 3.5, fireRate: 0, aura: { kind: 'damage', boost: 0.50 } },
      { cost: 480, damage: 0, range: 4,   fireRate: 0, aura: { kind: 'damage', boost: 0.80 } }
    ]},
    branchB: { name: 'Quickening', levels: [
      { cost: 300, damage: 0, range: 3.5, fireRate: 0, aura: { kind: 'firerate', boost: 0.40 } },
      { cost: 480, damage: 0, range: 4,   fireRate: 0, aura: { kind: 'firerate', boost: 0.65 } }
    ]}
  },
  spotter: {
    name: 'Spotter',
    color: '#e879f9',
    description: 'Reveals stealth & flying in radius',
    levels: [
      { cost: 90,  damage: 0, range: 3,   fireRate: 0, detect: true },
      { cost: 120, damage: 0, range: 3.5, fireRate: 0, detect: true },
      { cost: 180, damage: 0, range: 4,   fireRate: 0, detect: true }
    ],
    branchA: { name: 'Network',   levels: [
      { cost: 280, damage: 0, range: 4.5, fireRate: 0, detect: true, aura: { kind: 'range', boost: 0.25 } },
      { cost: 460, damage: 0, range: 5,   fireRate: 0, detect: true, aura: { kind: 'range', boost: 0.50 } }
    ]},
    branchB: { name: 'Scrambler', levels: [
      { cost: 280, damage: 0, range: 4.5, fireRate: 0, detect: true, aura: { kind: 'damage', boost: 0.25 } },
      { cost: 460, damage: 0, range: 5,   fireRate: 0, detect: true, aura: { kind: 'damage', boost: 0.50 } }
    ]}
  },
  mine: {
    name: 'Mine',
    color: '#dc2626',
    description: 'One-shot trap; rechargeable',
    levels: [
      { cost: 60,  damage: 120, range: 0.9, fireRate: 0, mineCharges: 1, mineRechargeSec: 10, mineSplash: 1.0 },
      { cost: 90,  damage: 220, range: 1.1, fireRate: 0, mineCharges: 1, mineRechargeSec: 8,  mineSplash: 1.2 },
      { cost: 140, damage: 400, range: 1.3, fireRate: 0, mineCharges: 1, mineRechargeSec: 7,  mineSplash: 1.5 }
    ],
    branchA: { name: 'Cluster', levels: [
      { cost: 220, damage: 280, range: 1.5, fireRate: 0, mineCharges: 3, mineRechargeSec: 10, mineSplash: 1.5 },
      { cost: 360, damage: 460, range: 1.7, fireRate: 0, mineCharges: 3, mineRechargeSec: 8,  mineSplash: 1.8 }
    ]},
    branchB: { name: 'Cryo', levels: [
      { cost: 220, damage: 700, range: 1.5, fireRate: 0, mineCharges: 1, mineRechargeSec: 6, mineSplash: 1.8, effect: { kind: 'slow', magnitude: 0.4, duration: 2 } },
      { cost: 360, damage: 1200, range: 1.7, fireRate: 0, mineCharges: 1, mineRechargeSec: 5, mineSplash: 2.0, effect: { kind: 'slow', magnitude: 0.3, duration: 3 } }
    ]}
  },
  vault: {
    name: 'Vault',
    color: '#fde047',
    description: 'Generates gold over time',
    levels: [
      { cost: 200, damage: 0, range: 0, fireRate: 0, goldPerSec: 4 },
      { cost: 220, damage: 0, range: 0, fireRate: 0, goldPerSec: 8 },
      { cost: 280, damage: 0, range: 0, fireRate: 0, goldPerSec: 14 }
    ],
    branchA: { name: 'Compound', levels: [
      { cost: 400, damage: 0, range: 0, fireRate: 0, goldPerSec: 26 },
      { cost: 640, damage: 0, range: 0, fireRate: 0, goldPerSec: 48 }
    ]},
    branchB: { name: 'Treasury', levels: [
      { cost: 400, damage: 0, range: 0, fireRate: 0, goldPerSec: 22 },
      { cost: 640, damage: 0, range: 0, fireRate: 0, goldPerSec: 38 }
    ]}
  }
}

const TOWER_ORDER: TowerKind[] = ['basic', 'sniper', 'splash', 'freeze', 'poison', 'chain', 'mortar', 'beacon', 'spotter', 'mine', 'vault']

const AURA_RADIUS_CELLS = 1.8       // adjacency for Beacon/Spotter buffs (≈ 2 cells)
const AURA_BUFF_CAP = 0.6           // max stacked +60% per stat

function getTowerStats(t: Tower): TowerLevel {
  const def = TOWER_DEFS[t.kind]
  if (t.tier <= 2) return def.levels[t.tier]
  const arr = t.branch === 'A' ? def.branchA?.levels : def.branchB?.levels
  return arr?.[t.tier - 3] ?? def.levels[2]
}

// Sum aura buffs from adjacent Beacons / Spotter-Networks / Scramblers onto each target tower.
// "Adjacent" = within AURA_RADIUS_CELLS center-to-center. Buffs are additive, capped per-stat at AURA_BUFF_CAP.
function computeAuraBuffs(towers: Tower[]): Map<number, { damage: number; firerate: number; range: number }> {
  const result = new Map<number, { damage: number; firerate: number; range: number }>()
  for (const target of towers) {
    if (target.kind === 'beacon' || target.kind === 'vault') continue
    let dmg = 0, fr = 0, rng = 0
    for (const src of towers) {
      if (src.id === target.id) continue
      const srcStats = getTowerStats(src)
      const aura = srcStats.aura
      if (!aura) continue
      // Spotter's Scrambler only buffs damage *vs revealed enemies* in original spec — we apply it
      // globally to the affected tower for simplicity. Network buffs range to all adjacent. Beacon buffs all adjacent.
      const dx = (src.col - target.col), dy = (src.row - target.row)
      if (Math.hypot(dx, dy) > AURA_RADIUS_CELLS) continue
      if (aura.kind === 'damage')   dmg += aura.boost
      if (aura.kind === 'firerate') fr  += aura.boost
      if (aura.kind === 'range')    rng += aura.boost
    }
    if (dmg || fr || rng) result.set(target.id, { damage: dmg, firerate: fr, range: rng })
  }
  return result
}

// Cost for next upgrade — undefined if at MAX or awaiting branch pick
function getNextUpgradeCost(t: Tower): number | null {
  const def = TOWER_DEFS[t.kind]
  if (t.tier < 2) return def.levels[t.tier + 1].cost
  if (t.tier === 2) return null       // branch pick required
  if (t.tier === 3) {
    const arr = t.branch === 'A' ? def.branchA?.levels : def.branchB?.levels
    return arr?.[1]?.cost ?? null
  }
  return null                          // tier 4 = MAX
}

// Cell radius used for chain lightning hops and mortar splash AOE
const CHAIN_HOP_RANGE_CELLS = 2.5
const CHAIN_HOPS_PER_LEVEL = [3, 4, 5]
const MORTAR_SPLASH_CELLS = [2.5, 3, 3.5]

interface Tower {
  id: number
  kind: TowerKind
  tier: number       // 0-2 base path, 3-4 along chosen branch
  branch: Branch     // null until tier reaches 3
  col: number
  row: number
  cooldown: number
  // Mine state
  mineChargesLeft?: number
  mineRechargeTimers?: number[]   // seconds remaining for each spent charge
  // Vault accumulator (sub-1g fractions)
  goldAccum?: number
}

interface EnemyEffect {
  kind: 'slow' | 'poison'
  magnitude: number
  remaining: number
}

type EnemyType = 'standard' | 'fast' | 'armored' | 'healer' | 'flying' | 'stealth' | 'boss'
type DamageType = 'physical' | 'magic'

interface EnemyTemplate {
  hpMult: number
  speedMult: number
  color: string
  flying: boolean
  stealth: boolean
}

const ENEMY_TEMPLATES: Record<EnemyType, EnemyTemplate> = {
  standard: { hpMult: 1.0,  speedMult: 1.0, color: '#ef4444', flying: false, stealth: false },
  fast:     { hpMult: 0.5,  speedMult: 2.5, color: '#fcd34d', flying: false, stealth: false },
  armored:  { hpMult: 1.5,  speedMult: 0.9, color: '#94a3b8', flying: false, stealth: false },
  healer:   { hpMult: 1.2,  speedMult: 0.7, color: '#86efac', flying: false, stealth: false },
  flying:   { hpMult: 0.8,  speedMult: 1.2, color: '#bae6fd', flying: true,  stealth: false },
  stealth:  { hpMult: 1.0,  speedMult: 1.1, color: '#475569', flying: false, stealth: true  },
  boss:     { hpMult: 12.0, speedMult: 0.6, color: '#dc2626', flying: false, stealth: false }
}

const HEALER_RADIUS_CELLS = 1.5
const HEALER_HPS = 10

const TOWER_DAMAGE_TYPE: Record<TowerKind, DamageType> = {
  basic: 'physical',
  sniper: 'physical',
  splash: 'physical',
  mortar: 'physical',
  mine:   'physical',
  freeze: 'magic',
  poison: 'magic',
  chain:  'magic',
  beacon: 'physical',  // unused
  spotter:'physical',  // unused
  vault:  'physical'   // unused
}

interface Enemy {
  id: number
  type: EnemyType
  progress: number
  hp: number
  maxHp: number
  effects: EnemyEffect[]
  revealed: boolean       // set by Spotter (Pass 3) — always false for now
  phase: 1 | 2 | 3        // boss phase tracker
  hasSummoned: boolean    // boss phase-3 minion spawn flag
}

interface Projectile {
  x: number
  y: number
  tx: number
  ty: number
  damage: number
  damageType: DamageType
  splash: boolean
  splashRadius?: number
  effect?: { kind: 'slow' | 'poison'; magnitude: number; duration: number }
  color: string
  speed?: number
}

interface ChainBolt { x0: number; y0: number; x1: number; y1: number; life: number }

interface SavePayload {
  version: 2 | 3
  mapKey: MapKey
  difficulty: DiffKey
  wave: number
  gold: number
  lives: number
  score: number
  towers: {
    kind: TowerKind
    /** v2 used `level` (0..2); v3 uses `tier` (0..4) + `branch`. */
    level?: number
    tier?: number
    branch?: Branch
    col: number
    row: number
  }[]
}
const SAVE_VERSION_MIN = 2

let nextId = 1

// Wave-based enemy introduction schedule (plan section 2).
// Returns a non-boss enemy type weighted by the current wave's roster.
function pickEnemyType(wave: number): EnemyType {
  const pool: { type: EnemyType; weight: number }[] = [{ type: 'standard', weight: 60 }]
  if (wave >= 5)  pool.push({ type: 'armored', weight: 20 })
  if (wave >= 10) pool.push({ type: 'flying',  weight: 15 })
  if (wave >= 12) pool.push({ type: 'fast',    weight: 20 })
  if (wave >= 15) pool.push({ type: 'stealth', weight: 15 })
  if (wave >= 18) pool.push({ type: 'healer',  weight: 10 })
  const total = pool.reduce((s, p) => s + p.weight, 0)
  let r = Math.random() * total
  for (const p of pool) {
    r -= p.weight
    if (r <= 0) return p.type
  }
  return 'standard'
}

// Apply damage with type modifiers (armored vs physical, boss phase-2 reduction)
function applyDamage(e: Enemy, dmg: number, dt: DamageType): void {
  let mult = 1
  if (e.type === 'armored' && dt === 'physical') mult *= 0.2
  if (e.type === 'boss' && e.phase === 2) mult *= 0.75
  e.hp -= dmg * mult
}

// Whether a given tower can target the given enemy (stealth/flying rules)
function canTarget(towerKind: TowerKind, e: Enemy): boolean {
  if (e.type === 'flying' && !e.revealed) {
    // Without a Spotter reveal, only sniper / tesla / mortar can hit flying
    if (towerKind !== 'sniper' && towerKind !== 'chain' && towerKind !== 'mortar') return false
  }
  if (e.type === 'stealth' && !e.revealed) {
    // Without a Spotter reveal, only sniper can see stealth
    if (towerKind !== 'sniper') return false
  }
  return true
}

export default function TowerDefense(): JSX.Element {
  const [phase, setPhase] = useState<Phase>('idle')
  const [gold, setGold] = useState(200)
  const [lives, setLives] = useState(20)
  const [wave, setWave] = useState(1)
  const [score, setScore] = useState(0)
  const [selectedKind, setSelectedKind] = useState<TowerKind | null>(null)
  const [selectedTowerId, setSelectedTowerId] = useState<number | null>(null)
  const [waveTimer, setWaveTimer] = useState(0)
  const [mapKey, setMapKey] = useState<MapKey>('zigzag')
  const [difficulty, setDifficulty] = useState<DiffKey>('normal')
  const [savedSlots, setSavedSlots] = useState<Record<string, { wave: number; gold: number; lives: number }>>({})
  const [bestScores, setBestScores] = useState<Record<string, number>>({})

  const mapKeyRef = useRef<MapKey>('zigzag')
  const difficultyRef = useRef<DiffKey>('normal')
  const pathRef = useRef<[number, number][]>(MAPS.zigzag.path)
  const pathSetRef = useRef<Set<string>>(new Set(MAPS.zigzag.path.map(([c, r]) => `${c},${r}`)))
  const lastSaveRef = useRef(0)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const phaseRef = useRef<Phase>('idle')
  const goldRef = useRef(200)
  const livesRef = useRef(20)
  const waveRef = useRef(1)
  const scoreRef = useRef(0)
  const towersRef = useRef<Tower[]>([])
  const enemiesRef = useRef<Enemy[]>([])
  const projectilesRef = useRef<Projectile[]>([])
  const chainBoltsRef = useRef<ChainBolt[]>([])
  const selectedKindRef = useRef<TowerKind | null>(null)
  const selectedTowerIdRef = useRef<number | null>(null)
  const enemiesSpawnedRef = useRef(0)
  const lastSpawnRef = useRef(0)
  const betweenWaveUntilRef = useRef(0)
  const mousePosRef = useRef({ x: 0, y: 0 })
  const rafRef = useRef<number | null>(null)
  const lastFrameRef = useRef(0)

  useEffect(() => {
    async function loadAll(): Promise<void> {
      const slots: Record<string, { wave: number; gold: number; lives: number }> = {}
      const bests: Record<string, number> = {}
      const allMaps = Object.keys(MAPS) as MapKey[]
      const allDiffs: DiffKey[] = ['easy', 'normal', 'hard']
      for (const m of allMaps) {
        for (const d of allDiffs) {
          const s = await window.api.settings.get(slotKey(m, d), '')
          if (s) {
            try {
              const data = JSON.parse(s) as SavePayload
              if (typeof data.version === 'number' && data.version >= SAVE_VERSION_MIN && data.version <= SAVE_VERSION) {
                slots[`${m}_${d}`] = { wave: data.wave, gold: data.gold, lives: data.lives }
              }
            } catch { /* skip */ }
          }
          const b = await window.api.settings.get(bestKey(m, d), '')
          if (b) {
            const n = parseInt(b, 10)
            if (!isNaN(n) && n > 0) bests[`${m}_${d}`] = n
          }
        }
      }
      // Legacy migration: surviving v1 best → assign to zigzag/normal slot if empty.
      const legacyBest = await window.api.settings.get(LEGACY_BEST_KEY, '')
      if (legacyBest) {
        try {
          const data = JSON.parse(legacyBest) as { score?: number }
          if (data.score && !bests['zigzag_normal']) {
            bests['zigzag_normal'] = data.score
            await window.api.settings.set(bestKey('zigzag', 'normal'), String(data.score))
          }
        } catch { /* skip */ }
        await window.api.settings.set(LEGACY_BEST_KEY, '').catch(() => {})
      }
      // Discard legacy state — incompatible shape.
      const legacyState = await window.api.settings.get(LEGACY_STATE_KEY, '')
      if (legacyState) await window.api.settings.set(LEGACY_STATE_KEY, '').catch(() => {})
      setSavedSlots(slots)
      setBestScores(bests)
    }
    loadAll().catch(() => {})
    draw()
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        selectedKindRef.current = null
        setSelectedKind(null)
        selectedTowerIdRef.current = null
        setSelectedTowerId(null)
      }
    }
    function onContext(e: MouseEvent): void {
      const c = canvasRef.current
      if (!c) return
      e.preventDefault()
      selectedKindRef.current = null
      setSelectedKind(null)
      selectedTowerIdRef.current = null
      setSelectedTowerId(null)
    }
    window.addEventListener('keydown', onKey)
    const c = canvasRef.current
    c?.addEventListener('contextmenu', onContext)
    return () => {
      window.removeEventListener('keydown', onKey)
      c?.removeEventListener('contextmenu', onContext)
    }
  }, [])

  useEffect(() => {
    function handleClick(e: MouseEvent): void {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left, y = e.clientY - rect.top
      if (x < 0 || x >= CANVAS_W || y < 0 || y >= CANVAS_H) return
      const col = Math.floor(x / CELL), row = Math.floor(y / CELL)
      onCanvasClick(col, row)
    }
    function handleMouseMove(e: MouseEvent): void {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      mousePosRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    const canvas = canvasRef.current
    canvas?.addEventListener('click', handleClick)
    canvas?.addEventListener('mousemove', handleMouseMove)
    return () => {
      canvas?.removeEventListener('click', handleClick)
      canvas?.removeEventListener('mousemove', handleMouseMove)
    }
  }, [])

  function onCanvasClick(col: number, row: number): void {
    if (phaseRef.current !== 'playing' && phaseRef.current !== 'between') return

    const existing = towersRef.current.find(t => t.col === col && t.row === row)
    if (existing) {
      selectedTowerIdRef.current = existing.id
      setSelectedTowerId(existing.id)
      selectedKindRef.current = null
      setSelectedKind(null)
      return
    }

    if (pathSetRef.current.has(`${col},${row}`)) return

    const kind = selectedKindRef.current
    if (!kind) return
    const baseLevel = TOWER_DEFS[kind].levels[0]
    const cost = baseLevel.cost
    if (goldRef.current < cost) return
    goldRef.current -= cost
    setGold(goldRef.current)
    const t: Tower = { id: nextId++, kind, tier: 0, branch: null, col, row, cooldown: 0 }
    if (baseLevel.mineCharges != null) {
      t.mineChargesLeft = baseLevel.mineCharges
      t.mineRechargeTimers = []
    }
    if (baseLevel.goldPerSec != null) t.goldAccum = 0
    towersRef.current.push(t)
  }

  function upgradeTower(id: number): void {
    const t = towersRef.current.find(x => x.id === id)
    if (!t) return
    const cost = getNextUpgradeCost(t)
    if (cost == null) return                        // MAX or awaiting branch pick
    if (goldRef.current < cost) return
    goldRef.current -= cost
    setGold(goldRef.current)
    t.tier++
    // Reset Mine charges to the new tier's max
    const stats = getTowerStats(t)
    if (stats.mineCharges != null) {
      t.mineChargesLeft = stats.mineCharges
      t.mineRechargeTimers = []
    }
    setSelectedTowerId(id)
  }

  function chooseBranch(id: number, branch: 'A' | 'B'): void {
    const t = towersRef.current.find(x => x.id === id)
    if (!t || t.tier !== 2) return
    const def = TOWER_DEFS[t.kind]
    const arr = branch === 'A' ? def.branchA?.levels : def.branchB?.levels
    if (!arr) return
    const cost = arr[0].cost
    if (goldRef.current < cost) return
    goldRef.current -= cost
    setGold(goldRef.current)
    t.branch = branch
    t.tier = 3
    const stats = getTowerStats(t)
    if (stats.mineCharges != null) {
      t.mineChargesLeft = stats.mineCharges
      t.mineRechargeTimers = []
    }
    setSelectedTowerId(id)
  }

  function totalTowerCost(t: Tower): number {
    const def = TOWER_DEFS[t.kind]
    let sum = 0
    for (let i = 0; i <= Math.min(t.tier, 2); i++) sum += def.levels[i].cost
    if (t.tier >= 3 && t.branch) {
      const arr = t.branch === 'A' ? def.branchA?.levels : def.branchB?.levels
      if (arr) for (let i = 0; i <= t.tier - 3; i++) sum += arr[i].cost
    }
    return sum
  }

  function sellTower(id: number): void {
    const t = towersRef.current.find(x => x.id === id)
    if (!t) return
    goldRef.current += Math.floor(totalTowerCost(t) * 0.7)
    setGold(goldRef.current)
    towersRef.current = towersRef.current.filter(x => x.id !== id)
    selectedTowerIdRef.current = null
    setSelectedTowerId(null)
  }

  function applyMap(key: MapKey): void {
    mapKeyRef.current = key
    setMapKey(key)
    pathRef.current = MAPS[key].path
    pathSetRef.current = new Set(MAPS[key].path.map(([c, r]) => `${c},${r}`))
  }

  function startGame(key: MapKey = mapKeyRef.current, diff: DiffKey = difficultyRef.current): void {
    applyMap(key)
    difficultyRef.current = diff
    setDifficulty(diff)
    const startingLives = 20 + DIFFICULTY[diff].livesMod
    goldRef.current = 200; setGold(200)
    livesRef.current = startingLives; setLives(startingLives)
    waveRef.current = 1; setWave(1)
    scoreRef.current = 0; setScore(0)
    towersRef.current = []
    enemiesRef.current = []
    projectilesRef.current = []
    enemiesSpawnedRef.current = 0
    lastSpawnRef.current = performance.now()
    selectedKindRef.current = null
    selectedTowerIdRef.current = null
    setSelectedKind(null)
    setSelectedTowerId(null)
    phaseRef.current = 'playing'
    setPhase('playing')
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    lastFrameRef.current = performance.now()
    rafRef.current = requestAnimationFrame(loop)
  }

  function saveState(): void {
    if (phaseRef.current !== 'playing' && phaseRef.current !== 'between') return
    const m = mapKeyRef.current, d = difficultyRef.current
    const payload: SavePayload = {
      version: SAVE_VERSION,
      mapKey: m,
      difficulty: d,
      wave: waveRef.current,
      gold: goldRef.current,
      lives: livesRef.current,
      score: scoreRef.current,
      towers: towersRef.current.map(t => ({ kind: t.kind, tier: t.tier, branch: t.branch, col: t.col, row: t.row })),
    }
    window.api.settings.set(slotKey(m, d), JSON.stringify(payload)).catch(() => {})
    setSavedSlots(prev => ({ ...prev, [`${m}_${d}`]: { wave: payload.wave, gold: payload.gold, lives: payload.lives } }))
  }

  function clearSavedState(): void {
    const m = mapKeyRef.current, d = difficultyRef.current
    window.api.settings.set(slotKey(m, d), '').catch(() => {})
    setSavedSlots(prev => {
      const next = { ...prev }
      delete next[`${m}_${d}`]
      return next
    })
  }

  function resumeGame(m: MapKey, d: DiffKey): void {
    window.api.settings.get(slotKey(m, d), '').then(v => {
      if (!v) return
      try {
        const data = JSON.parse(v) as SavePayload
        if (typeof data.version !== 'number' || data.version < SAVE_VERSION_MIN || data.version > SAVE_VERSION) return
        applyMap(data.mapKey)
        difficultyRef.current = data.difficulty
        setDifficulty(data.difficulty)
        goldRef.current = data.gold; setGold(data.gold)
        livesRef.current = data.lives; setLives(data.lives)
        waveRef.current = data.wave; setWave(data.wave)
        scoreRef.current = data.score; setScore(data.score)
        towersRef.current = data.towers.map(saved => {
          const tier = saved.tier ?? saved.level ?? 0     // v2 used `level` (0..2)
          const branch = saved.branch ?? null
          const t: Tower = { id: nextId++, kind: saved.kind, tier, branch, col: saved.col, row: saved.row, cooldown: 0 }
          const stats = getTowerStats(t)
          if (stats.mineCharges != null) {
            t.mineChargesLeft = stats.mineCharges
            t.mineRechargeTimers = []
          }
          if (stats.goldPerSec != null) t.goldAccum = 0
          return t
        })
        enemiesRef.current = []
        projectilesRef.current = []
        enemiesSpawnedRef.current = 0
        phaseRef.current = 'between'
        setPhase('between')
        betweenWaveUntilRef.current = performance.now() + 5000
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
        lastFrameRef.current = performance.now()
        rafRef.current = requestAnimationFrame(loop)
      } catch { /* corrupt — ignore */ }
    })
  }

  function loop(now: number): void {
    const dt = Math.min(0.05, (now - lastFrameRef.current) / 1000)
    lastFrameRef.current = now
    if (phaseRef.current === 'playing' || phaseRef.current === 'between') {
      step(dt, now)
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
  }

  function step(dt: number, now: number): void {
    // Autosave every 5 seconds
    if (now - lastSaveRef.current > 5000) {
      saveState()
      lastSaveRef.current = now
    }

    const w = waveRef.current
    const isBoss = w % 5 === 0
    // Boss waves: a small number of bosses (count grows by 1 every 5 waves)
    const enemiesThisWave = isBoss
      ? Math.min(8, 3 + Math.floor(w / 5))
      : Math.min(35, 8 + Math.floor(w * 1.8))
    const spawnInterval = isBoss
      ? Math.max(2200, 4000 - w * 30)
      : Math.max(280, 1500 - w * 45)

    const diffMods = DIFFICULTY[difficultyRef.current]
    if (phaseRef.current === 'playing') {
      if (enemiesSpawnedRef.current < enemiesThisWave && now - lastSpawnRef.current > spawnInterval) {
        const baseHp = 25 + w * w * 2.5 + w * 15    // quadratic — per plan §6
        const type: EnemyType = isBoss ? 'boss' : pickEnemyType(w)
        const tpl = ENEMY_TEMPLATES[type]
        const hp = baseHp * tpl.hpMult * diffMods.hpMult
        enemiesRef.current.push({
          id: nextId++,
          type,
          progress: 0,
          hp,
          maxHp: hp,
          effects: [],
          revealed: false,
          phase: 1,
          hasSummoned: false
        })
        enemiesSpawnedRef.current++
        lastSpawnRef.current = now
      }
      // Wave complete?
      if (enemiesSpawnedRef.current >= enemiesThisWave && enemiesRef.current.length === 0) {
        phaseRef.current = 'between'
        setPhase('between')
        betweenWaveUntilRef.current = now + 8000
        const bonus = Math.round((25 + w * 5 + (isBoss ? 50 : 0)) * diffMods.goldMult)
        goldRef.current += bonus
        setGold(goldRef.current)
        saveState()
      }
    } else if (phaseRef.current === 'between') {
      const remainSec = Math.max(0, Math.ceil((betweenWaveUntilRef.current - now) / 1000))
      setWaveTimer(remainSec)
      if (now >= betweenWaveUntilRef.current) {
        waveRef.current++
        setWave(waveRef.current)
        enemiesSpawnedRef.current = 0
        lastSpawnRef.current = now
        phaseRef.current = 'playing'
        setPhase('playing')
      }
    }

    // Healer aura: each healer regenerates HP for nearby enemies
    for (const h of enemiesRef.current) {
      if (h.type !== 'healer') continue
      const hi = Math.floor(h.progress * pathRef.current.length)
      const [hpx, hpy] = pathRef.current[Math.min(hi, pathRef.current.length - 1)]
      const hx = hpx * CELL + CELL / 2, hy = hpy * CELL + CELL / 2
      for (const e of enemiesRef.current) {
        if (e.id === h.id) continue
        const ei = Math.floor(e.progress * pathRef.current.length)
        const [epx, epy] = pathRef.current[Math.min(ei, pathRef.current.length - 1)]
        const ex = epx * CELL + CELL / 2, ey = epy * CELL + CELL / 2
        if (Math.hypot(ex - hx, ey - hy) <= HEALER_RADIUS_CELLS * CELL) {
          e.hp = Math.min(e.maxHp, e.hp + HEALER_HPS * dt)
        }
      }
    }

    // Move enemies
    for (let i = enemiesRef.current.length - 1; i >= 0; i--) {
      const e = enemiesRef.current[i]
      // Apply effects
      let speedMult = 1
      for (let j = e.effects.length - 1; j >= 0; j--) {
        const ef = e.effects[j]
        ef.remaining -= dt
        if (ef.kind === 'slow') speedMult = Math.min(speedMult, ef.magnitude)
        if (ef.kind === 'poison') applyDamage(e, ef.magnitude * dt, 'magic')
        if (ef.remaining <= 0) e.effects.splice(j, 1)
      }
      // Boss phase transitions
      if (e.type === 'boss') {
        const ratio = e.hp / e.maxHp
        if (ratio <= 0.33 && e.phase < 3) {
          e.phase = 3
          if (!e.hasSummoned) {
            e.hasSummoned = true
            // Summon 4 fast at spawn (progress 0)
            const tpl = ENEMY_TEMPLATES.fast
            const minionBase = 25 + waveRef.current * waveRef.current * 2.5 + waveRef.current * 15
            const minionHp = minionBase * tpl.hpMult * diffMods.hpMult
            for (let k = 0; k < 4; k++) {
              enemiesRef.current.push({
                id: nextId++, type: 'fast', progress: 0,
                hp: minionHp, maxHp: minionHp, effects: [],
                revealed: false, phase: 1, hasSummoned: false
              })
            }
          }
        } else if (ratio <= 0.66 && e.phase < 2) {
          e.phase = 2
        }
      }
      const tpl = ENEMY_TEMPLATES[e.type]
      const bossPhaseSpeed = (e.type === 'boss' && e.phase === 2) ? 1.5 : 1
      const baseSpeed = (1 + waveRef.current * 0.07 + Math.min(2, waveRef.current * waveRef.current * 0.005)) * diffMods.speedMult * tpl.speedMult * bossPhaseSpeed
      e.progress += (baseSpeed * speedMult * dt) / pathRef.current.length
      if (e.progress >= 1) {
        livesRef.current--
        setLives(livesRef.current)
        enemiesRef.current.splice(i, 1)
        if (livesRef.current <= 0) {
          phaseRef.current = 'gameOver'
          setPhase('gameOver')
          const m = mapKeyRef.current, d = difficultyRef.current
          const slotId = `${m}_${d}`
          const prevBest = bestScores[slotId] ?? 0
          if (scoreRef.current > prevBest) {
            setBestScores(prev => ({ ...prev, [slotId]: scoreRef.current }))
            window.api.settings.set(bestKey(m, d), String(scoreRef.current)).catch(() => {})
          }
          clearSavedState()
        }
        continue
      }
      if (e.hp <= 0) {
        scoreRef.current += 10 + waveRef.current * 2
        goldRef.current += Math.round((8 + waveRef.current * 2) * diffMods.goldMult)
        setScore(scoreRef.current)
        setGold(goldRef.current)
        enemiesRef.current.splice(i, 1)
      }
    }

    // Reset enemy revealed flag each tick; spotters set it again below
    for (const e of enemiesRef.current) e.revealed = false

    // Spotters reveal nearby enemies (must run before tower targeting)
    for (const t of towersRef.current) {
      if (t.kind !== 'spotter') continue
      const stats = getTowerStats(t)
      if (!stats.detect) continue
      const tx = t.col * CELL + CELL / 2, ty = t.row * CELL + CELL / 2
      const rPx = stats.range * CELL
      for (const e of enemiesRef.current) {
        const idx = Math.floor(e.progress * pathRef.current.length)
        const [px, py] = pathRef.current[Math.min(idx, pathRef.current.length - 1)]
        const ex = px * CELL + CELL / 2, ey = py * CELL + CELL / 2
        if (Math.hypot(ex - tx, ey - ty) <= rPx) e.revealed = true
      }
    }

    // Compute per-tower aura buffs (from adjacent Beacons + Spotter-Network/Scrambler) once per tick
    const auraBuffs = computeAuraBuffs(towersRef.current)

    // Towers act
    for (const t of towersRef.current) {
      const stats = getTowerStats(t)
      const tx = t.col * CELL + CELL / 2, ty = t.row * CELL + CELL / 2
      const buff = auraBuffs.get(t.id) ?? { damage: 0, firerate: 0, range: 0 }

      // Beacon / Spotter — no targeting, pure aura
      if (t.kind === 'beacon' || t.kind === 'spotter') continue

      // Vault — passive gold accumulator
      if (t.kind === 'vault') {
        const gps = stats.goldPerSec ?? 0
        t.goldAccum = (t.goldAccum ?? 0) + gps * dt * diffMods.goldMult
        if (t.goldAccum >= 1) {
          const whole = Math.floor(t.goldAccum)
          t.goldAccum -= whole
          goldRef.current += whole
          setGold(goldRef.current)
        }
        continue
      }

      // Mine — proximity trigger; one charge per detonation; recharges over time
      if (t.kind === 'mine') {
        // Tick recharge timers
        if (t.mineRechargeTimers && t.mineRechargeTimers.length > 0) {
          for (let i = t.mineRechargeTimers.length - 1; i >= 0; i--) {
            t.mineRechargeTimers[i] -= dt
            if (t.mineRechargeTimers[i] <= 0) {
              t.mineRechargeTimers.splice(i, 1)
              t.mineChargesLeft = (t.mineChargesLeft ?? 0) + 1
            }
          }
        }
        if ((t.mineChargesLeft ?? 0) <= 0) continue
        // Find a triggering enemy (non-flying, in range)
        const rPx = stats.range * CELL
        const splash = (stats.mineSplash ?? 1) * CELL
        const dmg = stats.damage * (1 + Math.min(AURA_BUFF_CAP, buff.damage))
        let triggered = false
        for (const e of enemiesRef.current) {
          if (e.type === 'flying' && !e.revealed) continue
          const idx = Math.floor(e.progress * pathRef.current.length)
          const [px, py] = pathRef.current[Math.min(idx, pathRef.current.length - 1)]
          const ex = px * CELL + CELL / 2, ey = py * CELL + CELL / 2
          if (Math.hypot(ex - tx, ey - ty) <= rPx) {
            // Detonate at this enemy's location, splash damages nearby foes too
            for (const e2 of enemiesRef.current) {
              const i2 = Math.floor(e2.progress * pathRef.current.length)
              const [p2x, p2y] = pathRef.current[Math.min(i2, pathRef.current.length - 1)]
              const x2 = p2x * CELL + CELL / 2, y2 = p2y * CELL + CELL / 2
              if (Math.hypot(x2 - ex, y2 - ey) <= splash) {
                applyDamage(e2, dmg, 'physical')
                if (stats.effect) e2.effects.push({ kind: stats.effect.kind, magnitude: stats.effect.magnitude, remaining: stats.effect.duration })
              }
            }
            // Brief visual: re-use chainBolts as a quick flash from mine center
            chainBoltsRef.current.push({ x0: tx, y0: ty, x1: ex, y1: ey, life: 0.15 })
            triggered = true
            break
          }
        }
        if (triggered) {
          t.mineChargesLeft = (t.mineChargesLeft ?? 1) - 1
          t.mineRechargeTimers = t.mineRechargeTimers ?? []
          t.mineRechargeTimers.push(stats.mineRechargeSec ?? 8)
        }
        continue
      }

      // Standard offensive towers — cooldown, then fire
      const fireRate = stats.fireRate * (1 + Math.min(AURA_BUFF_CAP, buff.firerate))
      t.cooldown -= dt
      if (t.cooldown > 0) continue
      const rangePx = stats.range * CELL * (1 + Math.min(AURA_BUFF_CAP, buff.range))
      let target: Enemy | null = null
      let furthestProgress = -1
      for (const e of enemiesRef.current) {
        if (!canTarget(t.kind, e)) continue
        const idx = Math.floor(e.progress * pathRef.current.length)
        const [px, py] = pathRef.current[Math.min(idx, pathRef.current.length - 1)]
        const ex = px * CELL + CELL / 2, ey = py * CELL + CELL / 2
        if (Math.hypot(ex - tx, ey - ty) <= rangePx && e.progress > furthestProgress) {
          target = e
          furthestProgress = e.progress
        }
      }
      if (!target) continue
      t.cooldown = 1 / Math.max(0.05, fireRate)
      const idx = Math.floor(target.progress * pathRef.current.length)
      const [px, py] = pathRef.current[Math.min(idx, pathRef.current.length - 1)]
      const ex = px * CELL + CELL / 2, ey = py * CELL + CELL / 2
      const dmg = stats.damage * (1 + Math.min(AURA_BUFF_CAP, buff.damage))

      if (t.kind === 'chain') {
        // Conduit (branch A) gets +2 hops, longer hop range. Overcharge (branch B) keeps standard hops.
        let hops = CHAIN_HOPS_PER_LEVEL[Math.min(t.tier, 2)]
        let hopRange = CHAIN_HOP_RANGE_CELLS
        if (t.tier >= 3 && t.branch === 'A') { hops += 2 + (t.tier - 3); hopRange = CHAIN_HOP_RANGE_CELLS + 0.5 + (t.tier - 3) * 0.3 }
        else if (t.tier >= 3) { hops += 1 }
        const hit = new Set<number>()
        let prevX = tx, prevY = ty
        let cur: Enemy | null = target
        for (let h = 0; h < hops && cur; h++) {
          hit.add(cur.id)
          applyDamage(cur, dmg, 'magic')
          const ci = Math.floor(cur.progress * pathRef.current.length)
          const [cpx, cpy] = pathRef.current[Math.min(ci, pathRef.current.length - 1)]
          const curX = cpx * CELL + CELL / 2, curY = cpy * CELL + CELL / 2
          chainBoltsRef.current.push({ x0: prevX, y0: prevY, x1: curX, y1: curY, life: 0.2 })
          prevX = curX; prevY = curY
          let next: Enemy | null = null
          let bestD = hopRange * CELL
          for (const e of enemiesRef.current) {
            if (hit.has(e.id)) continue
            if (!canTarget(t.kind, e)) continue
            const ei = Math.floor(e.progress * pathRef.current.length)
            const [epx, epy] = pathRef.current[Math.min(ei, pathRef.current.length - 1)]
            const eX = epx * CELL + CELL / 2, eY = epy * CELL + CELL / 2
            const d = Math.hypot(eX - curX, eY - curY)
            if (d < bestD) { bestD = d; next = e }
          }
          cur = next
        }
        continue
      }

      if (t.kind === 'mortar') {
        // Splash grows with tier; Howitzer (A) ~+1.5; Barrage (B) fires 3 shells
        const splashLvl = Math.min(t.tier, 2)
        let splashCells = MORTAR_SPLASH_CELLS[splashLvl]
        if (t.tier >= 3 && t.branch === 'A') splashCells += 1.5 + (t.tier - 3) * 0.5
        const shells = (t.tier >= 3 && t.branch === 'B') ? 3 : 1
        for (let s = 0; s < shells; s++) {
          const jitter = shells === 1 ? 0 : (s - 1) * CELL * 0.6
          projectilesRef.current.push({
            x: tx, y: ty, tx: ex + jitter, ty: ey,
            damage: dmg, damageType: 'physical',
            splash: true, splashRadius: splashCells,
            effect: stats.effect, color: TOWER_DEFS[t.kind].color, speed: 260
          })
        }
        continue
      }

      // Toxin Plague (branch A) — spread poison to adjacent enemies on hit
      if (t.kind === 'poison' && t.tier >= 3 && t.branch === 'A' && stats.poisonSpread) {
        const spreadPx = stats.poisonSpread * CELL
        projectilesRef.current.push({
          x: tx, y: ty, tx: ex, ty: ey,
          damage: dmg, damageType: 'magic',
          splash: true, splashRadius: stats.poisonSpread,
          effect: stats.effect, color: TOWER_DEFS[t.kind].color
        })
        // (splash radius handles propagation; spreadPx unused here)
        void spreadPx
        continue
      }

      // Sniper Piercer (branch A) — projectile continues through enemies
      // For simplicity, pierce is implemented as on-impact line damage to all enemies near the path
      if (t.kind === 'sniper' && t.tier >= 3 && t.branch === 'A') {
        const dxN = (ex - tx), dyN = (ey - ty)
        const len = Math.hypot(dxN, dyN) || 1
        const ux = dxN / len, uy = dyN / len
        const hitNow = new Set<number>()
        hitNow.add(target.id)
        applyDamage(target, dmg, 'physical')
        for (const e2 of enemiesRef.current) {
          if (hitNow.has(e2.id)) continue
          if (!canTarget(t.kind, e2)) continue
          const i2 = Math.floor(e2.progress * pathRef.current.length)
          const [p2x, p2y] = pathRef.current[Math.min(i2, pathRef.current.length - 1)]
          const x2 = p2x * CELL + CELL / 2, y2 = p2y * CELL + CELL / 2
          // distance from line tx,ty → ex,ey extended
          const rel = (x2 - tx) * ux + (y2 - ty) * uy
          if (rel < 0 || rel > rangePx) continue
          const perp = Math.hypot((x2 - tx) - ux * rel, (y2 - ty) - uy * rel)
          if (perp < 10) {
            applyDamage(e2, dmg * 0.75, 'physical')
            hitNow.add(e2.id)
          }
        }
        chainBoltsRef.current.push({ x0: tx, y0: ty, x1: ex, y1: ey, life: 0.18 })
        continue
      }

      // Sniper Crit (branch B): 25% chance triple damage
      if (t.kind === 'sniper' && t.tier >= 3 && t.branch === 'B') {
        const isCrit = Math.random() < 0.25
        projectilesRef.current.push({
          x: tx, y: ty, tx: ex, ty: ey,
          damage: dmg * (isCrit ? 3 : 1),
          damageType: 'physical', splash: false,
          effect: stats.effect, color: isCrit ? '#fff7ed' : TOWER_DEFS[t.kind].color
        })
        continue
      }

      // Default: single projectile (with cannon splash)
      projectilesRef.current.push({
        x: tx, y: ty, tx: ex, ty: ey,
        damage: dmg, damageType: TOWER_DAMAGE_TYPE[t.kind],
        splash: t.kind === 'splash',
        effect: stats.effect, color: TOWER_DEFS[t.kind].color
      })
    }

    // Fade chain bolts
    chainBoltsRef.current = chainBoltsRef.current.filter(b => { b.life -= dt; return b.life > 0 })

    // Move projectiles
    for (let i = projectilesRef.current.length - 1; i >= 0; i--) {
      const p = projectilesRef.current[i]
      const dx = p.tx - p.x, dy = p.ty - p.y, dist = Math.hypot(dx, dy)
      if (dist < 8) {
        if (p.splash) {
          const radius = (p.splashRadius ?? 2.5) * CELL
          for (const e of enemiesRef.current) {
            // Splash hits ground enemies regardless of stealth (already landed there).
            // Flying still skipped unless revealed.
            if (e.type === 'flying' && !e.revealed) continue
            const idx = Math.floor(e.progress * pathRef.current.length)
            const [px, py] = pathRef.current[Math.min(idx, pathRef.current.length - 1)]
            const ex = px * CELL + CELL / 2, ey = py * CELL + CELL / 2
            if (Math.hypot(ex - p.tx, ey - p.ty) < radius) {
              applyDamage(e, p.damage, p.damageType)
              if (p.effect) e.effects.push({ kind: p.effect.kind, magnitude: p.effect.magnitude, remaining: p.effect.duration })
            }
          }
        } else {
          let nearest: Enemy | null = null
          let minD = Infinity
          for (const e of enemiesRef.current) {
            if (e.type === 'stealth' && !e.revealed) continue
            if (e.type === 'flying' && !e.revealed) continue
            const idx = Math.floor(e.progress * pathRef.current.length)
            const [px, py] = pathRef.current[Math.min(idx, pathRef.current.length - 1)]
            const ex = px * CELL + CELL / 2, ey = py * CELL + CELL / 2
            const d = Math.hypot(ex - p.tx, ey - p.ty)
            if (d < minD) { nearest = e; minD = d }
          }
          if (nearest) {
            applyDamage(nearest, p.damage, p.damageType)
            if (p.effect) nearest.effects.push({ kind: p.effect.kind, magnitude: p.effect.magnitude, remaining: p.effect.duration })
          }
        }
        projectilesRef.current.splice(i, 1)
      } else {
        const speed = p.speed ?? 400
        p.x += (dx / dist) * speed * dt
        p.y += (dy / dist) * speed * dt
      }
    }
  }

  function draw(): void {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.fillStyle = '#0c0c18'
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H)

    // Grid
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const isPath = pathSetRef.current.has(`${c},${r}`)
        ctx.fillStyle = isPath ? '#3d2a1a' : '#0a0a14'
        ctx.fillRect(c * CELL + 1, r * CELL + 1, CELL - 2, CELL - 2)
        if (isPath) {
          ctx.strokeStyle = 'rgba(232, 180, 75, 0.15)'
          ctx.strokeRect(c * CELL + 1.5, r * CELL + 1.5, CELL - 3, CELL - 3)
        }
      }
    }

    // Path endpoints markers
    const start = pathRef.current[0], end = pathRef.current[pathRef.current.length - 1]
    ctx.fillStyle = 'rgba(74, 222, 128, 0.4)'
    ctx.fillRect(start[0] * CELL + 4, start[1] * CELL + 4, CELL - 8, CELL - 8)
    ctx.fillStyle = 'rgba(239, 68, 68, 0.4)'
    ctx.fillRect(end[0] * CELL + 4, end[1] * CELL + 4, CELL - 8, CELL - 8)

    // Range circle for selected tower or hover preview
    const selT = selectedTowerIdRef.current ? towersRef.current.find(t => t.id === selectedTowerIdRef.current) : null
    if (selT) {
      const stats = getTowerStats(selT)
      ctx.strokeStyle = TOWER_DEFS[selT.kind].color
      ctx.lineWidth = 2
      ctx.globalAlpha = 0.4
      ctx.beginPath()
      ctx.arc(selT.col * CELL + CELL / 2, selT.row * CELL + CELL / 2, Math.max(0.5, stats.range) * CELL, 0, Math.PI * 2)
      ctx.stroke()
      ctx.globalAlpha = 1
    } else if (selectedKindRef.current) {
      const m = mousePosRef.current
      const col = Math.floor(m.x / CELL), row = Math.floor(m.y / CELL)
      if (col >= 0 && col < COLS && row >= 0 && row < ROWS && !pathSetRef.current.has(`${col},${row}`)) {
        const def = TOWER_DEFS[selectedKindRef.current].levels[0]
        ctx.strokeStyle = TOWER_DEFS[selectedKindRef.current].color
        ctx.lineWidth = 2
        ctx.globalAlpha = 0.3
        ctx.beginPath()
        ctx.arc(col * CELL + CELL / 2, row * CELL + CELL / 2, def.range * CELL, 0, Math.PI * 2)
        ctx.stroke()
        ctx.fillStyle = TOWER_DEFS[selectedKindRef.current].color
        ctx.fillRect(col * CELL + 4, row * CELL + 4, CELL - 8, CELL - 8)
        ctx.globalAlpha = 1
      }
    }

    // Towers
    for (const t of towersRef.current) {
      const def = TOWER_DEFS[t.kind]
      const cx = t.col * CELL + CELL / 2, cy = t.row * CELL + CELL / 2

      // Beacons / Spotters / Vault: faint aura ring rendered first
      if (t.kind === 'beacon') {
        ctx.fillStyle = 'rgba(251, 191, 36, 0.08)'
        ctx.beginPath(); ctx.arc(cx, cy, AURA_RADIUS_CELLS * CELL, 0, Math.PI * 2); ctx.fill()
      } else if (t.kind === 'spotter') {
        const stats = getTowerStats(t)
        ctx.strokeStyle = 'rgba(232, 121, 249, 0.25)'
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(cx, cy, stats.range * CELL, 0, Math.PI * 2); ctx.stroke()
      }

      // Base
      ctx.fillStyle = def.color
      ctx.fillRect(t.col * CELL + 4, t.row * CELL + 4, CELL - 8, CELL - 8)

      // Tower-kind glyph for the non-shooting / new ones
      if (t.kind === 'vault') {
        ctx.fillStyle = '#000'
        ctx.font = 'bold 14px monospace'
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
        ctx.fillText('$', cx, cy)
      } else if (t.kind === 'mine') {
        ctx.fillStyle = '#000'
        ctx.fillRect(cx - 3, cy - 3, 6, 6)
        // charge indicator (right-aligned)
        const left = t.mineChargesLeft ?? 0
        ctx.fillStyle = '#fff'
        ctx.font = '8px monospace'
        ctx.textAlign = 'right'; ctx.textBaseline = 'top'
        ctx.fillText(String(left), t.col * CELL + CELL - 3, t.row * CELL + 3)
      } else if (t.kind === 'beacon' || t.kind === 'spotter') {
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'
        ctx.lineWidth = 1
        ctx.beginPath(); ctx.arc(cx, cy, 4, 0, Math.PI * 2); ctx.stroke()
      }

      // Tier pips — up to 3 base, plus branch letter for tier 3+
      ctx.fillStyle = '#fff'
      const pipCount = Math.min(t.tier, 2) + 1
      for (let i = 0; i < pipCount; i++) {
        ctx.fillRect(t.col * CELL + 5 + i * 4, t.row * CELL + 5, 2, 2)
      }
      if (t.tier >= 3 && t.branch) {
        ctx.fillStyle = '#000'
        ctx.font = 'bold 7px monospace'
        ctx.textAlign = 'left'; ctx.textBaseline = 'top'
        ctx.fillText(t.branch + (t.tier === 4 ? '+' : ''), t.col * CELL + 4, t.row * CELL + CELL - 10)
      }
      // Highlight selected
      if (selectedTowerIdRef.current === t.id) {
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 2
        ctx.strokeRect(t.col * CELL + 3, t.row * CELL + 3, CELL - 6, CELL - 6)
      }
    }

    // Enemies
    for (const e of enemiesRef.current) {
      const idx = Math.floor(e.progress * pathRef.current.length)
      const [px, py] = pathRef.current[Math.min(idx, pathRef.current.length - 1)]
      const x = px * CELL + CELL / 2, y = py * CELL + CELL / 2
      const tpl = ENEMY_TEMPLATES[e.type]
      const isPoisoned = e.effects.some(ef => ef.kind === 'poison')
      const isSlowed = e.effects.some(ef => ef.kind === 'slow')
      const isStealthHidden = e.type === 'stealth' && !e.revealed
      const radius = e.type === 'boss' ? 13 : 7

      // Boss phase 2 enrage glow
      if (e.type === 'boss' && e.phase >= 2) {
        ctx.fillStyle = e.phase === 3 ? 'rgba(239, 68, 68, 0.35)' : 'rgba(239, 68, 68, 0.22)'
        ctx.beginPath()
        ctx.arc(x, y, radius + 6, 0, Math.PI * 2)
        ctx.fill()
      }
      // Healer aura ring
      if (e.type === 'healer') {
        ctx.strokeStyle = 'rgba(134, 239, 172, 0.35)'
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.arc(x, y, HEALER_RADIUS_CELLS * CELL, 0, Math.PI * 2)
        ctx.stroke()
      }

      ctx.globalAlpha = isStealthHidden ? 0.28 : 1
      ctx.fillStyle = isPoisoned ? '#a855f7' : (isSlowed ? '#22d3ee' : tpl.color)
      ctx.beginPath()
      ctx.arc(x, y, radius, 0, Math.PI * 2)
      ctx.fill()
      // Flying marker — light outline ring
      if (e.type === 'flying') {
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(x, y, radius + 2, 0, Math.PI * 2)
        ctx.stroke()
      }
      // Armored marker — chevron tick
      if (e.type === 'armored') {
        ctx.strokeStyle = '#0f172a'
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(x - 3, y - 1)
        ctx.lineTo(x, y + 2)
        ctx.lineTo(x + 3, y - 1)
        ctx.stroke()
      }
      ctx.globalAlpha = 1
      // HP bar
      const barW = e.type === 'boss' ? 32 : 18, barH = 3
      ctx.fillStyle = 'rgba(0,0,0,0.6)'
      ctx.fillRect(x - barW / 2, y - radius - 7, barW, barH)
      ctx.fillStyle = '#4ade80'
      ctx.fillRect(x - barW / 2, y - radius - 7, barW * Math.max(0, e.hp / e.maxHp), barH)
    }

    // Projectiles
    for (const p of projectilesRef.current) {
      ctx.fillStyle = p.color
      ctx.beginPath()
      ctx.arc(p.x, p.y, p.splashRadius ? 5 : 3, 0, Math.PI * 2)
      ctx.fill()
    }

    // Chain lightning bolts
    for (const b of chainBoltsRef.current) {
      const a = Math.min(1, b.life / 0.2)
      ctx.strokeStyle = `rgba(250, 204, 21, ${a})`
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(b.x0, b.y0)
      // Jagged bolt with a midpoint offset
      const mx = (b.x0 + b.x1) / 2 + (Math.random() - 0.5) * 8
      const my = (b.y0 + b.y1) / 2 + (Math.random() - 0.5) * 8
      ctx.lineTo(mx, my)
      ctx.lineTo(b.x1, b.y1)
      ctx.stroke()
    }
  }

  const selectedTower = selectedTowerId !== null ? towersRef.current.find(t => t.id === selectedTowerId) : null
  const selDef = selectedTower ? TOWER_DEFS[selectedTower.kind] : null

  return (
    <div className={styles.body} ref={wrapRef}>
      <div className={styles.hud}>
        <span>Gold <strong>{gold}</strong></span>
        <span>Lives <strong className={lives < 5 ? styles.danger : ''}>{lives}</strong></span>
        <span>Wave <strong>{wave}</strong></span>
        <span>Score <strong>{score}</strong></span>
        {phase !== 'idle' && (
          <>
            <span className={styles.mapBadge}>{MAPS[mapKey].name}</span>
            <span className={styles.diffBadge} style={{ color: DIFFICULTY[difficulty].color, borderColor: DIFFICULTY[difficulty].color }}>
              {DIFFICULTY[difficulty].label}
            </span>
          </>
        )}
        {phase === 'between' && <span className={styles.timer}>Next wave: {waveTimer}s</span>}
        {(phase === 'playing' || phase === 'between') && (
          <button className={styles.saveBtn} onClick={saveState} title="Save current run">💾 Save</button>
        )}
        {bestScores[`${mapKey}_${difficulty}`] > 0 && (
          <span className={styles.best}>Best: {bestScores[`${mapKey}_${difficulty}`]}</span>
        )}
      </div>
      <canvas ref={canvasRef} width={CANVAS_W} height={CANVAS_H} className={styles.canvas} />
      {phase === 'idle' && (
        <div className={styles.idleScreen}>
          <span className={styles.titleText}>Tower Defense</span>

          <div className={styles.idleSection}>
            <span className={styles.idleLabel}>DIFFICULTY</span>
            <div className={styles.diffRow}>
              {(['easy','normal','hard'] as DiffKey[]).map(d => {
                const active = difficulty === d
                const meta = DIFFICULTY[d]
                return (
                  <button
                    key={d}
                    className={`${styles.diffPill} ${active ? styles.diffActive : ''}`}
                    style={active ? { color: meta.color, borderColor: meta.color } : undefined}
                    onClick={() => setDifficulty(d)}
                  >
                    {meta.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div className={styles.idleSection}>
            <span className={styles.idleLabel}>MAP</span>
            {(['easy','normal','hard'] as DiffKey[]).map(diffGroup => (
              <div key={diffGroup} className={styles.mapGroup}>
                <span className={styles.mapGroupLabel} style={{ color: DIFFICULTY[diffGroup].color }}>
                  {DIFFICULTY[diffGroup].label}
                </span>
                <div className={styles.mapGrid}>
                  {MAPS_BY_DIFF[diffGroup].map(k => {
                    const slotId = `${k}_${difficulty}`
                    const slot = savedSlots[slotId]
                    const best = bestScores[slotId] ?? 0
                    return (
                      <button
                        key={k}
                        className={`${styles.mapCard} ${mapKey === k ? styles.mapCardActive : ''}`}
                        onClick={() => { applyMap(k); draw() }}
                      >
                        <span className={styles.mapCardName}>{MAPS[k].name}</span>
                        {slot && <span className={styles.mapCardSlot}>Wave {slot.wave} · {slot.gold}g · {slot.lives}♥</span>}
                        {!slot && best > 0 && <span className={styles.mapCardBest}>Best: {best}</span>}
                        {!slot && !best && <span className={styles.mapCardBest}>—</span>}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.idleActions}>
            <button className={styles.startBtn} onClick={() => startGame(mapKey, difficulty)}>
              START · {MAPS[mapKey].name} · {DIFFICULTY[difficulty].label}
            </button>
            {savedSlots[`${mapKey}_${difficulty}`] && (
              <button className={styles.resumeBtn} onClick={() => resumeGame(mapKey, difficulty)}>
                RESUME (W{savedSlots[`${mapKey}_${difficulty}`].wave})
              </button>
            )}
          </div>
        </div>
      )}
      {phase === 'gameOver' && (
        <div className={styles.gameOver}>
          <span className={styles.titleText}>Defeat — Wave {wave}</span>
          <div className={styles.idleActions}>
            <button className={styles.startBtn} onClick={() => startGame(mapKey, difficulty)}>TRY AGAIN</button>
            <button className={styles.resumeBtn} onClick={() => { phaseRef.current = 'idle'; setPhase('idle') }}>BACK TO MAPS</button>
          </div>
        </div>
      )}
      {(phase === 'playing' || phase === 'between') && (
        <>
          <div className={styles.towerBar}>
            {TOWER_ORDER.map(kind => {
              const def = TOWER_DEFS[kind]
              const cost = def.levels[0].cost
              const canAfford = gold >= cost
              const active = selectedKind === kind
              return (
                <button
                  key={kind}
                  className={`${styles.towerBtn} ${active ? styles.active : ''} ${!canAfford ? styles.disabled : ''}`}
                  style={{ borderColor: active ? def.color : undefined }}
                  onClick={() => {
                    if (!canAfford) return
                    selectedKindRef.current = kind
                    setSelectedKind(kind)
                    selectedTowerIdRef.current = null
                    setSelectedTowerId(null)
                  }}
                  title={def.description}
                >
                  <span className={styles.towerName} style={{ color: def.color }}>{def.name}</span>
                  <span className={styles.towerCost}>{cost}g</span>
                </button>
              )
            })}
            {selectedKind && (
              <button
                className={styles.towerBtn}
                onClick={() => { selectedKindRef.current = null; setSelectedKind(null) }}
                title="Cancel placement (Esc or right-click also work)"
              >
                <span className={styles.towerName}>Cancel</span>
                <span className={styles.towerCost}>esc</span>
              </button>
            )}
          </div>
          {selectedTower && selDef && (() => {
            const stats = getTowerStats(selectedTower)
            const tierLabel = selectedTower.tier <= 2
              ? `T${selectedTower.tier + 1}`
              : `${selDef[selectedTower.branch === 'A' ? 'branchA' : 'branchB']?.name ?? ''} T${selectedTower.tier - 2}`
            const nextCost = getNextUpgradeCost(selectedTower)
            const awaitingBranch = selectedTower.tier === 2
            const isMax = selectedTower.tier === 4
            return (
              <div className={styles.upgradePanel} style={{ borderColor: selDef.color }}>
                <div className={styles.upgradeHeader}>
                  <span style={{ color: selDef.color, fontWeight: 700 }}>
                    {selDef.name} · {tierLabel}
                  </span>
                  <span className={styles.upgradeStats}>
                    {stats.damage > 0 && `DMG ${stats.damage} · `}
                    {stats.range > 0 && `RNG ${stats.range} · `}
                    {stats.fireRate > 0 && `${stats.fireRate}/s`}
                    {stats.aura && ` +${Math.round(stats.aura.boost * 100)}% ${stats.aura.kind}`}
                    {stats.goldPerSec != null && `+${stats.goldPerSec}g/s`}
                    {stats.mineCharges != null && ` · ${selectedTower.mineChargesLeft ?? 0}/${stats.mineCharges} charges`}
                  </span>
                </div>
                {awaitingBranch ? (
                  <div className={styles.branchPicker}>
                    {(['A','B'] as const).map(b => {
                      const branchDef = b === 'A' ? selDef.branchA : selDef.branchB
                      if (!branchDef) return null
                      const bCost = branchDef.levels[0].cost
                      return (
                        <button
                          key={b}
                          className={styles.branchBtn}
                          disabled={gold < bCost}
                          onClick={() => chooseBranch(selectedTower.id, b)}
                          style={{ borderColor: selDef.color }}
                        >
                          <span className={styles.branchName} style={{ color: selDef.color }}>{branchDef.name}</span>
                          <span className={styles.branchStats}>
                            {branchDef.levels[0].damage > 0 && `DMG ${branchDef.levels[0].damage} `}
                            {branchDef.levels[0].fireRate > 0 && `· ${branchDef.levels[0].fireRate}/s`}
                            {branchDef.levels[0].aura && `+${Math.round(branchDef.levels[0].aura.boost * 100)}% ${branchDef.levels[0].aura.kind}`}
                            {branchDef.levels[0].goldPerSec != null && `+${branchDef.levels[0].goldPerSec}g/s`}
                          </span>
                          <span className={styles.branchCost}>{bCost}g</span>
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <div className={styles.upgradeActions}>
                    {isMax || nextCost == null ? (
                      <span className={styles.upgradeMaxed}>MAX</span>
                    ) : (
                      <button
                        className={styles.upgradeBtn}
                        disabled={gold < nextCost}
                        onClick={() => upgradeTower(selectedTower.id)}
                      >
                        UPGRADE ({nextCost}g)
                      </button>
                    )}
                    <button className={styles.sellBtn} onClick={() => sellTower(selectedTower.id)}>
                      SELL ({Math.floor(totalTowerCost(selectedTower) * 0.7)}g)
                    </button>
                  </div>
                )}
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}

