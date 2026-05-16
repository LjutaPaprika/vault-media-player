import type { Npc, NpcId } from './types'

export const NPCS: Record<NpcId, Npc> = {
  ada_recruit: {
    id: 'ada_recruit', name: 'Ada the Scout', kind: 'recruit',
    greeting: '"You\'re going down there. Vex has the gate. I want him dead. We help each other?"',
    recruitChar: 'ada',
    dialogue: ['"I\'ll cover the stairs. Take Vex, I\'ll join you on the other side of his door."']
  },
  mira_recruit: {
    id: 'mira_recruit', name: 'Mira the Loremaster', kind: 'recruit',
    greeting: '"Quietly. The shelves are listening. — yes, you may stay. yes, I will come with you. The Custodian must end."',
    recruitChar: 'mira'
  },
  tomas_recruit: {
    id: 'tomas_recruit', name: 'Brother Tomas', kind: 'recruit',
    greeting: '"My order is gone. My duty isn\'t. Take me with you. I will keep what living I can keep."',
    recruitChar: 'tomas'
  },
  merchant_pell: {
    id: 'merchant_pell', name: 'Old Pell', kind: 'merchant',
    greeting: '"Mind the prices. Times are soft."',
    shop: [
      { id: 'potion', price: 10 },
      { id: 'potion_g', price: 40 },
      { id: 'mana_potion', price: 12 },
      { id: 'mana_crystal', price: 60 },
      { id: 'antidote', price: 15 },
      { id: 'shortsword', price: 30 },
      { id: 'iron_sword', price: 80 },
      { id: 'leather', price: 30 },
      { id: 'chain', price: 180 },
      { id: 'app_wand', price: 80 },
      { id: 'oak_staff', price: 220 },
      { id: 'torch', price: 8 },
      { id: 'lantern_oil', price: 12 }
    ]
  },
  sage_oma: {
    id: 'sage_oma', name: 'Sage Oma', kind: 'sage',
    greeting: '"Knowledge has a price. The price is gold or grief. I prefer gold."',
    teaches: [
      { spellId: 'spark', price: 100 },
      { spellId: 'mend', price: 150 },
      { spellId: 'frost', price: 250 },
      { spellId: 'shield', price: 200 },
      { spellId: 'aura', price: 250 },
      { spellId: 'fireball', price: 500 }
    ]
  },
  inn_keeper: {
    id: 'inn_keeper', name: 'Lin the Innkeeper', kind: 'innkeeper',
    greeting: '"Bed\'s 25 gold. Tea is on the house."',
    innCost: 25
  },
  garrick_recruit: {
    id: 'garrick_recruit', name: 'Garrick the Reaver', kind: 'recruit',
    greeting: '"You came down here on purpose? Then you\'re either brave or stupid. Either is useful."',
    recruitChar: 'garrick'
  },
  kael_recruit: {
    id: 'kael_recruit', name: 'Kael the Hunter', kind: 'recruit',
    greeting: '"My clan is bones now. The thing that did it is still down there. So am I."',
    recruitChar: 'kael'
  },
  brokk_smith: {
    id: 'brokk_smith', name: 'Brokk the Smith', kind: 'smith',
    greeting: '"I\'ll upgrade what you bring. 150 gold and a gem per tier."',
    shop: [
      { id: 'iron_sword', price: 80 },
      { id: 'steel_sword', price: 200 },
      { id: 'chain', price: 180 },
      { id: 'plate', price: 350 },
      { id: 'crystal_orb', price: 500 },
      { id: 'longbow', price: 120 },
      { id: 'antidote', price: 15 }
    ]
  },
  cartographer: {
    id: 'cartographer', name: 'The Cartographer', kind: 'cartographer',
    greeting: '"Lost? Bring me lore — scraps, scrolls, anything written down. I trade in the shape of things."',
    dialogue: [
      'They say the Crypts give up bone seals to those who burn enough cobwebs.',
      'Forge Hold sealed itself in. Whoever holds the Forge-Key holds the way through.',
      'The Lich keeps its phylactery in its laboratory. Smash it before you face it.'
    ]
  },
  hermit: {
    id: 'hermit', name: 'The Hermit', kind: 'lore',
    greeting: '"You\'re the third this year. The first two are dead. I am sorry."',
    dialogue: [
      'The Worldbreaker is older than the Lich. The Lich is its student, its pupil, its cage.',
      'Free the cage and the lesson walks again. I would not free the cage.'
    ]
  },
  bard: {
    id: 'bard', name: 'The Wandering Bard', kind: 'questgiver',
    greeting: '"A song for a coin? A hint for two?"',
    dialogue: [
      '"Catharine fell in the Library Wing. Her ring is still there, if anyone\'s reading."',
      '"The Mother grieves. Bring her a bone of her own daughter and she may yet sleep."',
      '"The Forge-Master is bound to his anvil — break the anvil, break him."'
    ]
  },
  ql_smith: {
    id: 'ql_smith', name: 'Marn the Local Smith', kind: 'smith',
    greeting: '"Repairs and oddments. I do not deal in wonders."',
    shop: [
      { id: 'shortsword', price: 30 },
      { id: 'iron_sword', price: 80 },
      { id: 'leather', price: 30 },
      { id: 'chain', price: 180 },
      { id: 'pickaxe', price: 25 }
    ]
  },
  forge_innkeeper: {
    id: 'forge_innkeeper', name: 'Old Korr', kind: 'innkeeper',
    greeting: '"Bed\'s 50 down here. The dark is louder than it ought to be."',
    innCost: 50
  },
  deep_sage: {
    id: 'deep_sage', name: 'The Deep Sage', kind: 'sage',
    greeting: '"What you would not learn above, I will sell you below."',
    teaches: [
      { spellId: 'shock', price: 250 },
      { spellId: 'drain', price: 400 },
      { spellId: 'silence', price: 350 },
      { spellId: 'mass_heal', price: 700 },
      { spellId: 'inferno', price: 1200 },
      { spellId: 'resurrect', price: 1500 }
    ]
  },
  vault_clerk: {
    id: 'vault_clerk', name: 'The Last Clerk', kind: 'merchant',
    greeting: '"Records. Receipts. Witnesses. The vault\'s contents are recorded here. They will remain so."',
    shop: [
      { id: 'potion_g', price: 60 },
      { id: 'mana_crystal', price: 100 },
      { id: 'phoenix_pearl', price: 800 },
      { id: 'antidote', price: 25 },
      { id: 'lantern_oil', price: 25 }
    ]
  }
}
