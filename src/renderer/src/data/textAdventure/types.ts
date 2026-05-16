// Text Adventure — core type definitions (Phase 4A)

export type Direction = 'north' | 'south' | 'east' | 'west' | 'up' | 'down'
export type AreaId = string
export type RoomId = string
export type ItemId = string
export type EnemyId = string
export type SpellId = string
export type NpcId = string
export type CharacterId = string

export type EquipSlot = 'weapon' | 'armor' | 'accessory' | 'catalyst'

export type EffectKind =
  | 'atkUp' | 'atkDown'
  | 'defUp' | 'defDown'
  | 'speedUp' | 'speedDown'
  | 'poison' | 'regen'
  | 'stun' | 'silence'
  | 'shield' | 'taunt'

export interface ActiveEffect {
  id: string
  kind: EffectKind
  magnitude: number
  remaining: number // turns
  source: string
}

export interface Combatant {
  id: string
  name: string
  hp: number; maxHp: number
  mp: number; maxMp: number
  atk: number; def: number
  matk: number; mdef: number
  speed: number
  buffs: ActiveEffect[]
  debuffs: ActiveEffect[]
  alive: boolean
}

export type EnemyAI = 'aggressive' | 'cautious' | 'caster' | 'thief' | 'tank'

export interface AbilityDef {
  id: string
  name: string
  mpCost?: number
  apply: (self: Enemy, ctx: CombatContext) => string[] // returns log lines
}

export interface Enemy extends Combatant {
  templateId: EnemyId
  tier: 1 | 2 | 3 | 4 | 5 | 6
  ai: EnemyAI
  abilities: string[] // ability ids referencing ABILITIES
  goldDrop: [number, number]
  itemDrops: { id: ItemId; chance: number }[]
  stolenFrom?: { itemId?: ItemId; gold?: number; ownerId: string }[]
  isBoss?: boolean
  isMiniboss?: boolean
  // boss-specific scratch state (phase, summons-spawned, etc.)
  state?: Record<string, number | string | boolean>
}

export type PlayerClass = 'fighter' | 'mage' | 'archer' | 'thief' | 'cleric' | 'wanderer'

export type TacticsMode = 'auto' | 'attack' | 'defend' | 'heal' | 'cast'

export interface PartyMember extends Combatant {
  charId: CharacterId
  class: PlayerClass
  equipment: Record<EquipSlot, ItemId | null>
  inventory: ItemId[]
  knownSpells: SpellId[]
  tactics: TacticsMode
  joinedAt: RoomId
}

export interface Player extends Combatant {
  class: PlayerClass
  gold: number
  inventory: ItemId[]
  equipment: Record<EquipSlot, ItemId | null>
  knownSpells: SpellId[]
  room: RoomId
  visitedRooms: Set<RoomId>
  discoveredExits: Set<string> // "roomId:direction"
  hasTorch: boolean
  torchCharges: number // remaining charges
  killed: number
  loreUnlocked: Set<string>
}

// ── Items ──────────────────────────────────────────────────────────────────

export type ItemCategory =
  | 'weapon' | 'armor' | 'accessory' | 'catalyst'
  | 'consumable' | 'key' | 'treasure' | 'lore' | 'tool' | 'scroll'

export interface Item {
  id: ItemId
  name: string
  desc: string
  category: ItemCategory
  // Combat stats (only for gear)
  atk?: number; def?: number
  matk?: number; mdef?: number
  speed?: number
  maxHp?: number; maxMp?: number; mpRegen?: number
  // Consumable
  heal?: number; healMp?: number; cureStatus?: EffectKind[]
  // Treasure currency value
  gold?: number
  // Lore reading body
  text?: string
  // Scroll teaches a spell on read
  teachesSpell?: SpellId
}

// ── Spells ─────────────────────────────────────────────────────────────────

export type SpellTarget = 'singleEnemy' | 'allEnemies' | 'singleAlly' | 'allAllies' | 'self' | 'fallenAlly'

export interface Spell {
  id: SpellId
  name: string
  mpCost: number
  target: SpellTarget
  description: string
  power: number // raw magnitude, interpreted by kind
  // Effect applies within a CombatContext
  apply: (caster: Combatant, target: Combatant, ctx: CombatContext) => string[]
}

// ── Inspectables ───────────────────────────────────────────────────────────

export type InspectEffect =
  | { kind: 'flavor' }
  | { kind: 'revealItem'; itemId: ItemId }
  | { kind: 'revealExit'; dir: Direction; toRoom: RoomId }
  | { kind: 'damage'; amount: number; source: string }
  | { kind: 'learnSpell'; spellId: SpellId }
  | { kind: 'permaBuff'; stat: 'maxHp' | 'maxMp' | 'atk' | 'def' | 'matk' | 'mdef' | 'speed'; magnitude: number }
  | { kind: 'permaDebuff'; stat: 'maxHp' | 'maxMp' | 'atk' | 'def' | 'matk' | 'mdef' | 'speed'; magnitude: number; cure?: ItemId }
  | { kind: 'lore'; entryId: string }
  | { kind: 'message'; text: string }
  | { kind: 'gold'; amount: number }
  | { kind: 'statusEffect'; effect: ActiveEffect }

export interface Inspectable {
  target: string // user-typed match: 'rag' / 'staff' / 'mosaic'
  description: string
  effect: InspectEffect
  oneTime: boolean
  triggered?: boolean
  guard?: { itemRequired?: ItemId; spellRequired?: SpellId }
}

// ── NPCs ────────────────────────────────────────────────────────────────────

export type NpcKind = 'merchant' | 'innkeeper' | 'sage' | 'smith' | 'cartographer' | 'recruit' | 'questgiver' | 'lore'

export interface Npc {
  id: NpcId
  name: string
  kind: NpcKind
  greeting: string
  // Merchant inventory: list of items with prices
  shop?: { id: ItemId; price: number; stock?: number }[]
  // Recruiter: which char joins
  recruitChar?: CharacterId
  // Sage: which spells can be taught at what price
  teaches?: { spellId: SpellId; price: number }[]
  // Innkeeper: rest cost
  innCost?: number
  // Quest hint or static dialogue
  dialogue?: string[]
}

// ── Rooms ──────────────────────────────────────────────────────────────────

export interface LockedExit {
  to: RoomId
  itemRequired?: ItemId
  flagRequired?: string // e.g. 'lich_dead'
  description?: string // shown when locked
}

export type ExitTarget = RoomId | LockedExit

export type SaveType = 'none' | 'shrine' | 'outpost'

export interface ItemRef {
  id: ItemId
  hidden?: boolean
}

export interface Corpse {
  charId: CharacterId
  name: string
  droppedItems: ItemId[]
}

export interface Room {
  id: RoomId
  name: string
  area: AreaId
  pos: { x: number; y: number }
  tier: 1 | 2 | 3 | 4 | 5 | 6
  shortDesc: string
  longDesc: string
  flavor?: string // first-visit only
  exits: Partial<Record<Direction, ExitTarget>>
  enemies: EnemyId[]
  items: ItemRef[]
  npcs: NpcId[]
  inspectables: Inspectable[]
  isDark: boolean
  saveType: SaveType
  // Mutable runtime fields (cloned per game)
  visited?: boolean
  cleared?: boolean // post-boss/encounter clear flag
  corpses?: Corpse[]
}

// ── Areas ──────────────────────────────────────────────────────────────────

export interface Area {
  id: AreaId
  name: string
  tierRange: [number, number]
  description: string
}

// ── Combat ─────────────────────────────────────────────────────────────────

export type Side = 'party' | 'enemy'

export interface TurnEntry {
  combatantId: string
  side: Side
  initiative: number
}

export interface CombatContext {
  party: (Player | PartyMember)[] // index 0 always = player
  enemies: Enemy[]
  log: (line: string) => void
  rngBoost?: number // for testing
}

export type ActionResult = {
  consumed: boolean // whether the actor's turn was used
  log: string[]
  endsCombat?: 'victory' | 'defeat' | 'flee'
}

// ── Map ────────────────────────────────────────────────────────────────────

export interface MapView {
  area: AreaId
  rows: string[]
  legend: { sym: string; meaning: string }[]
}

// ── Persistence ────────────────────────────────────────────────────────────

export interface SaveSnapshot {
  version: number
  player: Omit<Player, 'visitedRooms' | 'discoveredExits' | 'loreUnlocked'> & {
    visitedRooms: string[]
    discoveredExits: string[]
    loreUnlocked: string[]
  }
  party: PartyMember[]
  // Per-room cleared/visited flags (only changed rooms are stored)
  roomFlags: Record<RoomId, { cleared?: boolean; visited?: boolean; itemsTaken?: ItemId[]; inspectablesTriggered?: string[]; corpses?: Corpse[] }>
  flags: Record<string, boolean | number | string>
}
