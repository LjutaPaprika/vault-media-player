import type { Enemy, EnemyId } from './types'

interface EnemyTemplate {
  templateId: EnemyId
  build: () => Enemy
}

let _idCounter = 0
const nextId = (prefix: string): string => `${prefix}_${++_idCounter}`

function mk(
  templateId: EnemyId,
  name: string,
  tier: Enemy['tier'],
  ai: Enemy['ai'],
  stats: { hp: number; atk: number; def: number; matk?: number; mdef?: number; speed: number; mp?: number },
  drops: { gold: [number, number]; items?: { id: string; chance: number }[]; abilities?: string[] }
): Enemy {
  return {
    id: nextId(templateId),
    templateId,
    name,
    tier,
    ai,
    hp: stats.hp, maxHp: stats.hp,
    mp: stats.mp ?? 0, maxMp: stats.mp ?? 0,
    atk: stats.atk, def: stats.def,
    matk: stats.matk ?? 0, mdef: stats.mdef ?? 0,
    speed: stats.speed,
    buffs: [], debuffs: [],
    alive: true,
    abilities: drops.abilities ?? [],
    goldDrop: drops.gold,
    itemDrops: drops.items ?? []
  }
}

export const ENEMY_TEMPLATES: Record<EnemyId, () => Enemy> = {
  // ── Tier 1 ──
  cave_rat:   () => mk('cave_rat',   'Cave Rat',         1, 'aggressive', { hp: 8,  atk: 3, def: 0, speed: 7 },  { gold: [1, 3] }),
  spider:     () => mk('spider',     'Giant Spider',     1, 'aggressive', { hp: 12, atk: 4, def: 1, speed: 9 },  { gold: [2, 5], items: [{ id: 'silver_coin', chance: 0.3 }] }),
  goblin:     () => mk('goblin',     'Goblin',           1, 'aggressive', { hp: 14, atk: 5, def: 2, speed: 8 },  { gold: [3, 6], items: [{ id: 'potion', chance: 0.25 }] }),
  bandit:     () => mk('bandit',     'Bandit',           1, 'thief',      { hp: 16, atk: 5, def: 2, speed: 10 }, { gold: [4, 8], items: [{ id: 'dagger', chance: 0.2 }] }),
  bandit_a:   () => mk('bandit_a',   'Bandit Archer',    2, 'aggressive', { hp: 14, atk: 7, def: 1, speed: 12 }, { gold: [5, 9] }),

  // ── Tier 2 ──
  zombie:     () => mk('zombie',     'Zombie',           2, 'aggressive', { hp: 24, atk: 7, def: 3, speed: 5 },  { gold: [6, 12], items: [{ id: 'ration', chance: 0.3 }] }),
  skeleton:   () => mk('skeleton',   'Skeleton',         2, 'aggressive', { hp: 20, atk: 8, def: 4, speed: 8 },  { gold: [6, 12], items: [{ id: 'silver_coin', chance: 0.5 }] }),
  ghoul:      () => mk('ghoul',      'Ghoul',            2, 'cautious',   { hp: 22, atk: 8, def: 3, speed: 9 },  { gold: [8, 14] }),
  cultist:    () => mk('cultist',    'Robed Cultist',    2, 'caster',     { hp: 18, atk: 5, def: 2, matk: 6, speed: 10, mp: 12 }, { gold: [8, 14], abilities: ['cast_spark'] }),

  // ── Tier 3 ──
  spectre:    () => mk('spectre',    'Spectre',          3, 'caster',     { hp: 30, atk: 8, def: 4, matk: 10, mdef: 6, speed: 12, mp: 20 }, { gold: [12, 20], abilities: ['cast_frost'] }),
  shadow:     () => mk('shadow',     'Shadow Stalker',   3, 'thief',      { hp: 28, atk: 11, def: 5, speed: 14 }, { gold: [12, 20], items: [{ id: 'gem', chance: 0.15 }] }),
  bone_lord:  () => mk('bone_lord',  'Bone Lord',        3, 'tank',       { hp: 45, atk: 10, def: 9, speed: 6 },  { gold: [15, 25], abilities: ['weaken'] }),

  // ── Tier 4 ──
  troll:      () => mk('troll',      'Cave Troll',       4, 'tank',       { hp: 60, atk: 14, def: 10, speed: 5 }, { gold: [20, 35], items: [{ id: 'gold_coin', chance: 0.5 }] }),
  drowned:    () => mk('drowned',    'Drowned Knight',   4, 'aggressive', { hp: 55, atk: 16, def: 9,  speed: 9 }, { gold: [22, 38] }),
  vault_w:    () => mk('vault_w',    'Vault Wraith',     4, 'caster',     { hp: 50, atk: 12, def: 6, matk: 14, mdef: 10, speed: 13, mp: 30 }, { gold: [25, 40], abilities: ['cast_fireball'] }),

  // ── Tier 5 ──
  sentinel:   () => mk('sentinel',   'Crystal Sentinel', 5, 'tank',       { hp: 90, atk: 18, def: 14, speed: 7 }, { gold: [40, 60] }),
  keeper:     () => mk('keeper',     'Vault Keeper',     5, 'caster',     { hp: 75, atk: 14, def: 8, matk: 18, mdef: 12, speed: 11, mp: 40 }, { gold: [50, 80], items: [{ id: 'diamond', chance: 0.5 }], abilities: ['cast_inferno'] }),

  // ── More tier-2 / tier-3 variety ──
  skel_archer: () => mk('skel_archer', 'Skeletal Archer',  2, 'aggressive', { hp: 18, atk: 9, def: 2, speed: 11 }, { gold: [7, 13] }),
  wight:       () => mk('wight',       'Wight',            2, 'caster',     { hp: 22, atk: 7, def: 4, matk: 8, speed: 9, mp: 15 }, { gold: [10, 16], abilities: ['weaken'] }),
  undead_priest:() => mk('undead_priest', 'Undead Priest', 3, 'caster',     { hp: 28, atk: 6, def: 4, matk: 12, mdef: 8, speed: 10, mp: 25 }, { gold: [14, 22], abilities: ['cast_spark', 'cast_silence'] }),
  crypt_horror:() => mk('crypt_horror', 'Crypt Horror',    3, 'aggressive', { hp: 38, atk: 12, def: 6, speed: 8 },  { gold: [16, 26] }),
  ossuary_g:   () => mk('ossuary_g',   'Ossuary Guardian', 3, 'tank',       { hp: 50, atk: 10, def: 10, speed: 6 }, { gold: [18, 28], abilities: ['weaken'] }),

  // ── More tier-4 variety ──
  centipede:   () => mk('centipede',   'Giant Centipede',  4, 'aggressive', { hp: 42, atk: 13, def: 4, speed: 12 }, { gold: [20, 32] }),
  spore_thing: () => mk('spore_thing', 'Spore Drone',      3, 'caster',     { hp: 30, atk: 8, def: 4, matk: 10, speed: 9, mp: 20 }, { gold: [16, 24], abilities: ['cast_spark'] }),
  cave_bear:   () => mk('cave_bear',   'Cave Bear',        4, 'aggressive', { hp: 70, atk: 16, def: 6, speed: 7 },  { gold: [24, 38] }),
  forge_remnant:() => mk('forge_remnant','Forge Remnant',   4, 'tank',       { hp: 65, atk: 13, def: 12, speed: 6 }, { gold: [25, 40], items: [{ id: 'gold_coin', chance: 0.5 }] }),
  iron_const:  () => mk('iron_const',  'Iron Construct',   4, 'tank',       { hp: 80, atk: 14, def: 14, speed: 5 }, { gold: [28, 44] }),
  dwarven_rev: () => mk('dwarven_rev', 'Dwarven Revenant', 4, 'aggressive', { hp: 58, atk: 17, def: 8, speed: 10 }, { gold: [26, 40] }),

  // ── Tier 5 ──
  golem:       () => mk('golem',       'Stone Golem',      5, 'tank',       { hp: 110, atk: 19, def: 16, speed: 4 }, { gold: [50, 75] }),
  throne_g:    () => mk('throne_g',    'Throne Guard',     5, 'aggressive', { hp: 85, atk: 20, def: 12, speed: 9 }, { gold: [45, 70] }),
  royal_rev:   () => mk('royal_rev',   'Royal Revenant',   5, 'caster',     { hp: 80, atk: 16, def: 8, matk: 18, mdef: 12, speed: 12, mp: 50 }, { gold: [55, 85], abilities: ['cast_drain', 'cast_inferno'] }),

  // ── Tier 6 (postgame) ──
  shadow_thing:() => mk('shadow_thing', 'Shadow Thing',    6, 'aggressive', { hp: 130, atk: 24, def: 14, mdef: 12, speed: 14 }, { gold: [80, 120] }),
  void_priest: () => mk('void_priest',  'Void Priest',     6, 'caster',     { hp: 110, atk: 18, def: 10, matk: 26, mdef: 18, speed: 13, mp: 80 }, { gold: [100, 150], abilities: ['cast_inferno', 'cast_drain', 'cast_silence'] }),

  // ── Minibosses ──
  mb_cursed_knight: () => {
    const e = mk('mb_cursed_knight', 'Cursed Knight', 2, 'tank', { hp: 75, atk: 12, def: 10, speed: 7 }, { gold: [50, 70], items: [{ id: 'chain', chance: 1 }] })
    e.isMiniboss = true
    e.abilities = ['weaken']
    return e
  },
  mb_crypt_warden: () => {
    const e = mk('mb_crypt_warden', 'Crypt Warden', 3, 'caster', { hp: 90, atk: 12, def: 8, matk: 16, mdef: 10, speed: 10, mp: 40 }, { gold: [70, 100], items: [{ id: 'crypt_seal', chance: 1 }] })
    e.isMiniboss = true
    e.abilities = ['cast_frost', 'cast_silence']
    return e
  },
  mb_cave_tyrant: () => {
    const e = mk('mb_cave_tyrant', 'Cave Tyrant', 4, 'aggressive', { hp: 130, atk: 19, def: 8, speed: 9 }, { gold: [90, 130], items: [{ id: 'gem', chance: 1 }, { id: 'gem', chance: 0.5 }] })
    e.isMiniboss = true
    return e
  },
  mb_iron_twin_a: () => {
    const e = mk('mb_iron_twin_a', 'Iron Twin (Hammer)', 4, 'tank', { hp: 95, atk: 17, def: 13, speed: 7 }, { gold: [60, 90] })
    e.isMiniboss = true
    return e
  },
  mb_iron_twin_b: () => {
    const e = mk('mb_iron_twin_b', 'Iron Twin (Shield)', 4, 'cautious', { hp: 95, atk: 14, def: 16, speed: 7 }, { gold: [60, 90], items: [{ id: 'forge_key', chance: 1 }] })
    e.isMiniboss = true
    return e
  },
  mb_vault_wraith: () => {
    const e = mk('mb_vault_wraith', 'Vault Wraith', 5, 'caster', { hp: 110, atk: 14, def: 10, matk: 22, mdef: 16, speed: 13, mp: 60 }, { gold: [120, 180], items: [{ id: 'mirror_shard', chance: 1 }] })
    e.isMiniboss = true
    e.abilities = ['cast_inferno', 'cast_silence']
    return e
  },
  mb_whispering: () => {
    const e = mk('mb_whispering', 'The Whispering One', 5, 'caster', { hp: 120, atk: 15, def: 8, matk: 24, mdef: 18, speed: 12, mp: 70 }, { gold: [150, 220], items: [{ id: 'cathar_ring', chance: 1 }] })
    e.isMiniboss = true
    e.abilities = ['cast_drain', 'cast_silence']
    return e
  },

  // ── Bosses ──
  boss_vex: () => {
    const e = mk('boss_vex', 'Bandit Captain Vex', 1, 'aggressive', { hp: 60, atk: 8, def: 4, speed: 11 }, { gold: [40, 60], items: [{ id: 'shortsword', chance: 1 }, { id: 'leather', chance: 1 }] })
    e.isBoss = true
    e.abilities = ['summon_bandits']
    e.state = { reinforced: 0 }
    return e
  },
  boss_custodian: () => {
    const e = mk('boss_custodian', 'The Bound Custodian', 2, 'caster', { hp: 90, atk: 10, def: 5, matk: 16, mdef: 8, speed: 9, mp: 60 }, { gold: [80, 120], items: [{ id: 'oak_staff', chance: 1 }] })
    e.isBoss = true
    e.abilities = ['cast_silence', 'cast_spark']
    return e
  },
  boss_lich: () => {
    const e = mk('boss_lich', 'The Lich', 5, 'caster', { hp: 200, atk: 18, def: 10, matk: 24, mdef: 16, speed: 13, mp: 100 }, { gold: [300, 500], items: [{ id: 'runeblade', chance: 1 }] })
    e.isBoss = true
    e.abilities = ['cast_inferno', 'cast_drain', 'lich_revive']
    e.state = { phylactery: 1, revives: 1 }
    return e
  },
  boss_mother: () => {
    const e = mk('boss_mother', 'Mother of Bones', 3, 'caster', { hp: 120, atk: 14, def: 8, matk: 14, mdef: 10, speed: 9, mp: 50 }, { gold: [120, 180], items: [{ id: 'bone_amulet', chance: 1 }, { id: 'crypt_seal', chance: 1 }] })
    e.isBoss = true
    e.abilities = ['summon_skeletons', 'cast_drain']
    e.state = { summoned: 0 }
    return e
  },
  boss_gravewyrm: () => {
    const e = mk('boss_gravewyrm', 'Gravewyrm', 3, 'aggressive', { hp: 180, atk: 18, def: 12, speed: 8 }, { gold: [180, 250], items: [{ id: 'wyrm_fang', chance: 1 }] })
    e.isBoss = true
    e.abilities = ['burrow', 'weaken']
    e.state = { burrowed: 0 }
    return e
  },
  boss_echo: () => {
    const e = mk('boss_echo', 'Echo of the Deep', 4, 'caster', { hp: 150, atk: 14, def: 10, matk: 18, mdef: 12, speed: 12, mp: 60 }, { gold: [200, 300] })
    e.isBoss = true
    e.abilities = ['split', 'cast_frost']
    e.state = { split: 0 }
    return e
  },
  boss_smith: () => {
    const e = mk('boss_smith', 'The Forsaken Smith', 4, 'tank', { hp: 220, atk: 16, def: 18, mdef: 4, speed: 6 }, { gold: [250, 350], items: [{ id: 'forge_axe', chance: 1 }, { id: 'plate', chance: 1 }] })
    e.isBoss = true
    e.abilities = ['weaken']
    return e
  },
  boss_sentinel: () => {
    const e = mk('boss_sentinel', 'Vault Sentinel', 5, 'tank', { hp: 280, atk: 22, def: 18, mdef: 14, speed: 8 }, { gold: [350, 500], items: [{ id: 'aegis_plate', chance: 1 }, { id: 'vault_key', chance: 1 }] })
    e.isBoss = true
    e.abilities = ['taunt']
    return e
  },
  boss_worldbreaker: () => {
    const e = mk('boss_worldbreaker', 'The Worldbreaker', 6, 'caster', { hp: 400, atk: 26, def: 16, matk: 30, mdef: 20, speed: 15, mp: 200 }, { gold: [800, 1200], items: [{ id: 'worldshard', chance: 1 }] })
    e.isBoss = true
    e.abilities = ['cast_inferno', 'cast_drain', 'cast_silence', 'weaken']
    e.state = { phase: 1 }
    return e
  }
}

// ── Enemy ability registry ──
// Abilities produce log lines and mutate ctx.party / ctx.enemies.
import type { CombatContext } from './types'

export type EnemyAbility = (self: Enemy, ctx: CombatContext) => string[]

export const ENEMY_ABILITIES: Record<string, EnemyAbility> = {
  cast_spark: (self, ctx) => {
    if (self.mp < 3) return []
    const target = ctx.party.filter(p => p.alive)[0]
    if (!target) return []
    self.mp -= 3
    const dmg = Math.max(1, 8 + Math.floor(self.matk * 0.5) - Math.floor(target.mdef * 0.4))
    target.hp -= dmg
    return [`${self.name} hurls a spark at ${target.name} for ${dmg} damage.`]
  },
  cast_frost: (self, ctx) => {
    if (self.mp < 6) return []
    const target = ctx.party.filter(p => p.alive)[0]
    if (!target) return []
    self.mp -= 6
    const dmg = Math.max(1, 12 + Math.floor(self.matk * 0.5) - Math.floor(target.mdef * 0.4))
    target.hp -= dmg
    target.debuffs.push({ id: 'frost_dbf', kind: 'speedDown', magnitude: 30, remaining: 2, source: self.id })
    return [`${self.name} freezes ${target.name} for ${dmg} damage. Slowed.`]
  },
  cast_fireball: (self, ctx) => {
    if (self.mp < 8) return []
    self.mp -= 8
    const lines: string[] = [`${self.name} casts Fireball!`]
    for (const p of ctx.party.filter(x => x.alive)) {
      const dmg = Math.max(1, 16 + Math.floor(self.matk * 0.5) - Math.floor(p.mdef * 0.3))
      p.hp -= dmg
      lines.push(`  ${p.name} burns for ${dmg}.`)
    }
    return lines
  },
  cast_inferno: (self, ctx) => {
    if (self.mp < 20) return []
    self.mp -= 20
    const lines: string[] = [`${self.name} unleashes an Inferno!`]
    for (const p of ctx.party.filter(x => x.alive)) {
      const dmg = Math.max(1, 30 + Math.floor(self.matk * 0.6) - Math.floor(p.mdef * 0.3))
      p.hp -= dmg
      lines.push(`  ${p.name} scorched for ${dmg}.`)
    }
    return lines
  },
  cast_drain: (self, ctx) => {
    if (self.mp < 7) return []
    const target = ctx.party.filter(p => p.alive)[0]
    if (!target) return []
    self.mp -= 7
    const dmg = Math.max(1, 14 + Math.floor(self.matk * 0.5) - Math.floor(target.mdef * 0.4))
    target.hp -= dmg
    self.hp = Math.min(self.maxHp, self.hp + Math.floor(dmg / 2))
    return [`${self.name} drains ${target.name} for ${dmg}, healing itself.`]
  },
  cast_silence: (self, ctx) => {
    if (self.mp < 5) return []
    const casters = ctx.party.filter(p => p.alive && p.knownSpells.length > 0)
    const target = casters[0] ?? ctx.party.filter(p => p.alive)[0]
    if (!target) return []
    self.mp -= 5
    target.debuffs.push({ id: 'silence_dbf', kind: 'silence', magnitude: 1, remaining: 2, source: self.id })
    return [`${self.name} silences ${target.name}.`]
  },
  weaken: (self, ctx) => {
    const target = ctx.party.filter(p => p.alive)[0]
    if (!target) return []
    target.debuffs.push({ id: 'weaken_dbf', kind: 'atkDown', magnitude: 25, remaining: 3, source: self.id })
    return [`${self.name} weakens ${target.name}.`]
  },
  summon_bandits: (self, ctx) => {
    const reinforced = (self.state?.reinforced as number) ?? 0
    if (reinforced) return []
    if (self.hp / self.maxHp > 0.5) return []
    self.state = { ...self.state, reinforced: 1 }
    const b1 = ENEMY_TEMPLATES.bandit()
    const b2 = ENEMY_TEMPLATES.bandit()
    ctx.enemies.push(b1, b2)
    return [`${self.name} whistles. Two bandits crash in from the wings!`]
  },
  lich_revive: (_self) => {
    // Passive: handled when lich's hp drops to 0 — see combat engine
    return []
  },
  summon_skeletons: (self, ctx) => {
    const summoned = (self.state?.summoned as number) ?? 0
    if (summoned >= 2) return []
    if (self.hp / self.maxHp > 0.7) return []
    self.state = { ...self.state, summoned: summoned + 1 }
    const a = ENEMY_TEMPLATES.skeleton()
    const b = ENEMY_TEMPLATES.skel_archer()
    ctx.enemies.push(a, b)
    return [`${self.name} keens, and bones rise from the floor — two skeletons heed her grief.`]
  },
  burrow: (self) => {
    const burrowed = (self.state?.burrowed as number) ?? 0
    if (burrowed) return []
    if (self.hp / self.maxHp > 0.3) return []
    self.state = { ...self.state, burrowed: 1 }
    self.buffs.push({ id: 'burrow_def', kind: 'defUp', magnitude: 80, remaining: 1, source: self.id })
    return [`${self.name} burrows beneath the floor. Its hide is unreachable for a turn.`]
  },
  split: (self, ctx) => {
    const split = (self.state?.split as number) ?? 0
    if (split) return []
    if (self.hp / self.maxHp > 0.5) return []
    self.state = { ...self.state, split: 1 }
    const c1 = ENEMY_TEMPLATES.boss_echo()
    const c2 = ENEMY_TEMPLATES.boss_echo()
    c1.name = 'Echo (copy)'; c2.name = 'Echo (copy)'
    c1.hp = c1.maxHp = Math.floor(self.maxHp * 0.4)
    c2.hp = c2.maxHp = Math.floor(self.maxHp * 0.4)
    c1.isBoss = false; c2.isBoss = false
    c1.itemDrops = []; c2.itemDrops = []
    c1.goldDrop = [10, 20]; c2.goldDrop = [10, 20]
    ;(c1.state as Record<string, number>).split = 1
    ;(c2.state as Record<string, number>).split = 1
    ctx.enemies.push(c1, c2)
    return [`${self.name} fractures. Two reflections detach and circle you.`]
  },
  taunt: (self, ctx) => {
    const target = ctx.party.filter(p => p.alive)[0]
    if (!target) return []
    target.buffs.push({ id: 'taunt_to', kind: 'taunt', magnitude: 1, remaining: 2, source: self.id })
    return [`${self.name} forces ${target.name}'s attention.`]
  }
}
