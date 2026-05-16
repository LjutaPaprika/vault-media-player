import type { CharacterId, PartyMember } from './types'

export interface CharacterTemplate {
  id: CharacterId
  name: string
  class: PartyMember['class']
  hp: number; mp: number
  atk: number; def: number; matk: number; mdef: number; speed: number
  startingGear: { weapon?: string; armor?: string; accessory?: string; catalyst?: string }
  knownSpells: string[]
  joinRoom?: string
  bio: string
}

export const CHARACTERS: Record<CharacterId, CharacterTemplate> = {
  ada: {
    id: 'ada', name: 'Ada the Scout', class: 'thief',
    hp: 60, mp: 20, atk: 12, def: 6, matk: 4, mdef: 5, speed: 14,
    startingGear: { weapon: 'dagger', armor: 'leather' },
    knownSpells: [],
    joinRoom: 'ruins_3',
    bio: 'Raised in the watchtowers of Quartzlight. Quick hands, quicker tongue.'
  },
  tomas: {
    id: 'tomas', name: 'Brother Tomas', class: 'cleric',
    hp: 70, mp: 50, atk: 8, def: 6, matk: 12, mdef: 10, speed: 9,
    startingGear: { weapon: 'shortsword', armor: 'leather', catalyst: 'app_wand' },
    knownSpells: ['mend', 'shield'],
    joinRoom: 'library_4',
    bio: 'A monk of an order whose temple no longer exists. He still keeps the hours.'
  },
  garrick: {
    id: 'garrick', name: 'Garrick the Reaver', class: 'fighter',
    hp: 120, mp: 0, atk: 18, def: 12, matk: 0, mdef: 4, speed: 8,
    startingGear: { weapon: 'warhammer', armor: 'chain' },
    knownSpells: [],
    joinRoom: 'forge_3',
    bio: 'Once iron-clad guardian of Forge Hold. Now its only survivor.'
  },
  mira: {
    id: 'mira', name: 'Mira the Loremaster', class: 'mage',
    hp: 55, mp: 80, atk: 5, def: 4, matk: 16, mdef: 12, speed: 11,
    startingGear: { weapon: 'dagger', armor: 'leather', catalyst: 'oak_staff' },
    knownSpells: ['spark', 'frost', 'shield', 'aura'],
    joinRoom: 'library_5',
    bio: 'Last librarian. She walks the stacks even now, cataloguing what survives.'
  },
  kael: {
    id: 'kael', name: 'Kael the Hunter', class: 'archer',
    hp: 75, mp: 15, atk: 14, def: 5, matk: 4, mdef: 6, speed: 13,
    startingGear: { weapon: 'longbow', armor: 'leather' },
    knownSpells: [],
    joinRoom: 'cave_4',
    bio: 'He hunted the deeper caves before they swallowed half his clan. He is still hunting.'
  }
}

export function makePartyMember(charId: CharacterId, joinedAt: string): PartyMember | null {
  const tpl = CHARACTERS[charId]
  if (!tpl) return null
  return {
    id: `pm_${charId}`,
    charId,
    name: tpl.name,
    class: tpl.class,
    hp: tpl.hp, maxHp: tpl.hp,
    mp: tpl.mp, maxMp: tpl.mp,
    atk: tpl.atk, def: tpl.def,
    matk: tpl.matk, mdef: tpl.mdef,
    speed: tpl.speed,
    buffs: [], debuffs: [],
    alive: true,
    equipment: {
      weapon: tpl.startingGear.weapon ?? null,
      armor: tpl.startingGear.armor ?? null,
      accessory: tpl.startingGear.accessory ?? null,
      catalyst: tpl.startingGear.catalyst ?? null
    },
    inventory: [],
    knownSpells: [...tpl.knownSpells],
    tactics: 'auto',
    joinedAt
  }
}
