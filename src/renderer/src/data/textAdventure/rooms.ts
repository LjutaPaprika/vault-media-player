import type { Room, RoomId, Inspectable, ItemRef, Direction, EnemyId, NpcId, ExitTarget, SaveType } from './types'

// Phase 4F — full 112-room world.
// Layout: 11 areas, ~150 inspectables, 9 bosses, 6 minibosses.
// Each room is positioned on its area's grid (north = y-1, east = x+1).
// Cross-area exits cross only at boss/save thresholds.

// ── Helpers ────────────────────────────────────────────────────────────────

interface RoomBuilderArgs {
  id: RoomId
  name: string
  area: string
  pos: [number, number]
  tier: 1 | 2 | 3 | 4 | 5 | 6
  desc: string
  flavor?: string
  exits: Partial<Record<Direction, ExitTarget>>
  enemies?: EnemyId[]
  items?: (string | ItemRef)[]
  npcs?: NpcId[]
  insp?: Inspectable[]
  dark?: boolean
  save?: SaveType
}

function R(a: RoomBuilderArgs): Room {
  const items: ItemRef[] = (a.items ?? []).map(i => typeof i === 'string' ? { id: i } : i)
  return {
    id: a.id, name: a.name, area: a.area, pos: { x: a.pos[0], y: a.pos[1] }, tier: a.tier,
    shortDesc: a.desc.split('.')[0],
    longDesc: a.desc,
    flavor: a.flavor,
    exits: a.exits,
    enemies: a.enemies ?? [],
    items,
    npcs: a.npcs ?? [],
    inspectables: a.insp ?? [],
    isDark: a.dark ?? false,
    saveType: a.save ?? 'none'
  }
}

// Inspectable shorthands
const flavor = (target: string, description: string): Inspectable => ({ target, description, effect: { kind: 'flavor' }, oneTime: false })
const lore = (target: string, description: string, entryId: string): Inspectable => ({ target, description, effect: { kind: 'lore', entryId }, oneTime: true })
const gold = (target: string, description: string, amount: number): Inspectable => ({ target, description, effect: { kind: 'gold', amount }, oneTime: true })
const reveal = (target: string, description: string, itemId: string): Inspectable => ({ target, description, effect: { kind: 'revealItem', itemId }, oneTime: true })
const damage = (target: string, description: string, amount: number, source: string): Inspectable => ({ target, description, effect: { kind: 'damage', amount, source }, oneTime: false })
const buff = (target: string, description: string, stat: 'maxHp' | 'maxMp' | 'atk' | 'def' | 'matk' | 'mdef' | 'speed', magnitude: number): Inspectable => ({ target, description, effect: { kind: 'permaBuff', stat, magnitude }, oneTime: true })
const debuff = (target: string, description: string, stat: 'maxHp' | 'maxMp' | 'atk' | 'def' | 'matk' | 'mdef' | 'speed', magnitude: number): Inspectable => ({ target, description, effect: { kind: 'permaDebuff', stat, magnitude }, oneTime: true })
const learnSpell = (target: string, description: string, spellId: string): Inspectable => ({ target, description, effect: { kind: 'learnSpell', spellId }, oneTime: true })
const message = (target: string, description: string, text: string): Inspectable => ({ target, description, effect: { kind: 'message', text }, oneTime: false })

// ── Rooms ──────────────────────────────────────────────────────────────────

const ALL: Room[] = [

  // ═══ Area 1: Sunken Path (6 rooms, tier 1) ═════════════════════════════
  R({ id: 'path_1', name: 'Sunken Path', area: 'sunken_path', pos: [0, 0], tier: 1,
      desc: 'Stone slabs, half-swallowed by roots, march downward into a hollow of ancient forest. The light is green and slow.',
      flavor: 'You stand at the threshold of a fallen kingdom. Behind you is the world. Ahead, only down.',
      exits: { east: 'path_2', south: 'path_6' },
      insp: [
        flavor('roots', 'Roots like fingers grip the slabs. Old, watching.'),
        gold('milestone', 'A weathered stone reads "Quartzlight, that way." Three silver coins lie in the offering bowl.', 15),
        lore('crest', 'A faded royal crest, twin lions weeping. Older than memory.', 'fall_of_quartz')
      ] }),

  R({ id: 'path_2', name: 'Hollow of Roots', area: 'sunken_path', pos: [1, 0], tier: 1,
      desc: 'The trees lean inward here. Small bones, neatly piled, suggest someone has been here recently.',
      exits: { west: 'path_1', east: 'path_3', south: 'path_5' },
      enemies: ['cave_rat'],
      insp: [
        flavor('bones', 'Picked clean. Stacked deliberate. Whatever did this had time.'),
        reveal('pile', 'Beneath the bones — a cracked vial of something red.', 'potion')
      ] }),

  R({ id: 'path_3', name: 'Brokenshrine', area: 'sunken_path', pos: [2, 0], tier: 1,
      desc: 'A small altar of split stone. Black-veined flowers rest upon it, whispering when the wind isn\'t.',
      exits: { west: 'path_2', south: 'path_4' },
      save: 'shrine',
      insp: [
        buff('altar', 'You kneel. Something old answers — not unkindly. Your wounds knit a little deeper. (+5 max HP, permanent.)', 'maxHp', 5),
        damage('flowers', 'You touch one. It bites back.', 3, 'flowers'),
        flavor('petals', 'The black petals do not wilt. They have not wilted in centuries.')
      ] }),

  R({ id: 'path_4', name: 'Ruined Gate', area: 'sunken_path', pos: [2, 1], tier: 1,
      desc: 'The arch has fallen, but the threshold is unmistakable. Beyond, the ruins of a keep.',
      exits: { north: 'path_3', west: 'path_5', south: 'ruins_1' },
      enemies: ['goblin'], items: ['torch'],
      insp: [
        lore('arch', 'Carved with lions and crowns. The lions weep.', 'fall_of_quartz'),
        flavor('rubble', 'The gate fell from the inside. Whatever broke it was already within.')
      ] }),

  R({ id: 'path_5', name: 'Moss Hollow', area: 'sunken_path', pos: [1, 1], tier: 1,
      desc: 'A bowl of moss and silence. A cracked statue, headless, presides.',
      exits: { north: 'path_2', east: 'path_4', west: 'path_6' },
      enemies: ['spider'],
      insp: [
        gold('statue', 'Someone has hidden three silver coins in the broken collar of the statue.', 15),
        flavor('moss', 'The moss is unnaturally vivid. Something fed it well.')
      ] }),

  R({ id: 'path_6', name: 'Old Camp', area: 'sunken_path', pos: [0, 1], tier: 1,
      desc: 'A dead campfire and bedrolls long abandoned. Whoever camped here did not pack to leave.',
      exits: { north: 'path_1', east: 'path_5' },
      items: ['ration', 'silver_coin'],
      insp: [
        reveal('bedroll', 'You search a bedroll and find a sealed letter — and a healing potion tucked beneath it.', 'potion'),
        flavor('letter', 'A letter, water-warped: "If you find this, do not look for me."')
      ] }),

  // ═══ Area 2: Surface Ruins (11 rooms, tier 1-2, Vex boss + cursed knight miniboss) ═══
  R({ id: 'ruins_1', name: 'Outer Bailey', area: 'surface_ruins', pos: [0, 0], tier: 1,
      desc: 'A shattered courtyard, walls fallen inward. A small fire is banked nearby — recent.',
      exits: { north: 'path_4', east: 'ruins_2', south: 'ruins_5' },
      enemies: ['bandit'],
      insp: [
        flavor('fire', 'Banked, recent. Bandits, then.'),
        reveal('barrel', 'A water barrel, hidden behind it: a small purse and a healing potion.', 'potion')
      ] }),

  R({ id: 'ruins_2', name: 'Collapsed Hall', area: 'surface_ruins', pos: [1, 0], tier: 1,
      desc: 'A roofless hall. Two bandits dead at the entrance, very recently. Whoever is doing this is good.',
      exits: { west: 'ruins_1', east: 'ruins_3', south: 'ruins_6' },
      items: ['silver_coin', 'silver_coin', 'ration'],
      insp: [
        flavor('bodies', 'Throats. Quick and quiet.'),
        reveal('crate', 'A locked crate, splintered open from the side. A scroll inside.', 'scroll_spark')
      ] }),

  R({ id: 'ruins_3', name: 'Watchtower Stairs', area: 'surface_ruins', pos: [2, 0], tier: 1,
      desc: 'Crumbling stairs to a half-broken tower. A young woman in dark leather sits at the top, cleaning her dagger.',
      exits: { west: 'ruins_2', east: 'ruins_4', south: 'ruins_7' },
      npcs: ['ada_recruit'],
      insp: [
        flavor('view', 'From here you see the gate-tower. Their captain — Vex — is in there.')
      ] }),

  R({ id: 'ruins_4', name: 'Tower Top', area: 'surface_ruins', pos: [3, 0], tier: 1,
      desc: 'The tower opens to ragged sky. A bandit lookout, dead, hangs from the parapet.',
      exits: { west: 'ruins_3', south: 'ruins_8' },
      items: ['gold_coin'],
      enemies: ['bandit_a'],
      insp: [
        gold('lookout', 'You search the body. A pouch, a half-written letter to no one, twelve silvers.', 60),
        flavor('parapet', 'Spent arrows in the masonry. The siege didn\'t end well for someone.')
      ] }),

  R({ id: 'ruins_5', name: 'Roofless Chapel', area: 'surface_ruins', pos: [0, 1], tier: 1,
      desc: 'A chapel without a roof. The icons have been defaced and re-blessed and defaced again.',
      exits: { north: 'ruins_1', east: 'ruins_6' },
      items: ['potion'],
      insp: [
        buff('icon', 'You re-bless what you can. The room hums faintly. (+1 mdef permanent.)', 'mdef', 1),
        flavor('altar', 'Three different gods\' marks here. None remembered.')
      ] }),

  R({ id: 'ruins_6', name: 'Bandit Stores', area: 'surface_ruins', pos: [1, 1], tier: 1,
      desc: 'Stolen sacks and stacked crates. The bandits did not survive long enough to enjoy this.',
      exits: { north: 'ruins_2', west: 'ruins_5', east: 'ruins_7', south: 'ruins_9' },
      items: ['ration', 'gold_coin'],
      enemies: ['goblin'],
      insp: [
        reveal('sack', 'A sack with a heavy clink — coins and a leather jerkin.', 'leather'),
        gold('crate', 'A crate of mixed coin: ten silver, three gold.', 75)
      ] }),

  R({ id: 'ruins_7', name: 'Bandit Barracks', area: 'surface_ruins', pos: [2, 1], tier: 1,
      desc: 'Cots and braziers. Three bandits dead in their armor. Ada\'s work, probably.',
      exits: { north: 'ruins_3', west: 'ruins_6', east: 'ruins_8', south: 'ruins_10' },
      enemies: ['bandit'],
      items: ['shortsword'],
      insp: [
        flavor('cots', 'Slept in last night. Will not be slept in tonight.'),
        reveal('locker', 'A footlocker. Inside: a healing potion and a sealed envelope.', 'potion')
      ] }),

  R({ id: 'ruins_8', name: 'Sealed Armory', area: 'surface_ruins', pos: [3, 1], tier: 2,
      desc: 'A reinforced room. The bandits have looted some of it. Some.',
      exits: { north: 'ruins_4', west: 'ruins_7', south: 'ruins_boss' },
      items: ['leather', 'potion_g'],
      insp: [
        reveal('rack', 'A rack of weapons mostly looted, but a longbow remains.', 'longbow'),
        gold('chest', 'A small chest, prised open: a handful of gold.', 40),
        flavor('banner', 'A bandit banner. Crude. They were proud, and brief.')
      ] }),

  R({ id: 'ruins_9', name: 'Cellar of the Cursed Knight', area: 'surface_ruins', pos: [1, 2], tier: 2,
      desc: 'A cold cellar. The bandits did not come down here. A figure in rusted plate stands motionless in the center.',
      exits: { north: 'ruins_6' },
      enemies: ['mb_cursed_knight'],
      insp: [
        flavor('plate', 'The plate is fused to him. Rust runs into his skin and out again.'),
        lore('inscription', 'A wall inscription: "Sir Edrus, who would not surrender, was not surrendered to."', 'cursed_knight')
      ] }),

  R({ id: 'ruins_10', name: 'Bandit Kitchen', area: 'surface_ruins', pos: [2, 2], tier: 1,
      desc: 'A foul kitchen. Pots boil over a fire that no one has tended.',
      exits: { north: 'ruins_7', east: 'ruins_boss' },
      items: ['ration', 'ration'],
      insp: [
        damage('pot', 'You taste the stew. You shouldn\'t have. (-4 HP)', 4, 'bad food'),
        reveal('pantry', 'A hidden pantry: rations and an ether.', 'ether')
      ] }),

  R({ id: 'ruins_boss', name: 'Gate-Tower', area: 'surface_ruins', pos: [3, 2], tier: 1,
      desc: 'A tall man in leathers and chain stands before the inner door, bandit archers behind him. "Lost?" he says.',
      exits: { north: 'ruins_8', west: 'ruins_10', south: 'ql_gate' },
      enemies: ['boss_vex'],
      insp: [
        flavor('door', 'The inner door. The way down is on the other side of this man.')
      ] }),

  // ═══ Area 3: Quartzlight Outpost (4 rooms, hub) ═════════════════════════
  R({ id: 'ql_gate', name: 'Quartzlight Gate', area: 'quartzlight', pos: [0, 0], tier: 1,
      desc: 'A free outpost cut into the cliffside. Lamps burn steady without oil. You hear talk and steel.',
      exits: { north: 'ruins_boss', east: 'ql_market', south: 'ql_inn' },
      save: 'outpost',
      insp: [
        lore('lamps', 'Quartz lanterns. Light without oil. The locals say the cliff itself remembers fire.', 'quartz_light'),
        flavor('walls', 'The walls have been mended a hundred times. They will be mended a hundred more.')
      ] }),

  R({ id: 'ql_market', name: 'Quartzlight Market', area: 'quartzlight', pos: [1, 0], tier: 1,
      desc: 'A small market. Pell at one stall, Sage Oma at another, the Wandering Bard at a corner table.',
      exits: { west: 'ql_gate', east: 'lib_1', south: 'ql_smithyard' },
      save: 'outpost',
      npcs: ['merchant_pell', 'sage_oma', 'bard'],
      insp: [
        flavor('crystal', 'Sage Oma\'s focus crystal. Not for sale, she says — but you may borrow knowledge from it.'),
        flavor('bardsong', 'The bard sings the old songs. Crowns and traitors. The names are familiar.')
      ] }),

  R({ id: 'ql_inn', name: 'The Mended Hearth', area: 'quartzlight', pos: [0, 1], tier: 1,
      desc: 'A common room with three tables, two empty. Lin the innkeeper smiles like he hasn\'t slept in a year.',
      exits: { north: 'ql_gate' },
      save: 'outpost',
      npcs: ['inn_keeper'],
      insp: [
        message('kettle', 'Lin pours tea. It is hot and good.', 'You drink. (+5 HP, just this once.)')
      ] }),

  R({ id: 'ql_smithyard', name: 'Smithyard', area: 'quartzlight', pos: [1, 1], tier: 1,
      desc: 'Marn the smith works under an awning of patched canvas. The Cartographer keeps a stall nearby, full of half-drawn maps.',
      exits: { north: 'ql_market' },
      save: 'outpost',
      npcs: ['ql_smith', 'cartographer'],
      insp: [
        flavor('forge', 'A small forge. Marn does not have ambition; he has work.'),
        flavor('maps', 'The Cartographer\'s maps are mostly empty. He waits for travelers to fill them.')
      ] }),

  // ═══ Area 4: Library Wing (14 rooms, tier 2, Custodian boss + cursed knight side) ═══
  R({ id: 'lib_1', name: 'Library Threshold', area: 'library_wing', pos: [0, 0], tier: 2,
      desc: 'Doors of black wood, carved with sigils, stand open. They were forced open.',
      exits: { west: 'ql_market', east: 'lib_2', south: 'lib_10' },
      enemies: ['skeleton'],
      insp: [
        flavor('sigils', 'Wards. Broken. Whatever came through tore them apart from the inside.'),
        lore('mosaic', 'A mosaic of a sundered sky. You feel something shift.', 'the_sundering')
      ] }),

  R({ id: 'lib_2', name: 'Reading Hall', area: 'library_wing', pos: [1, 0], tier: 2,
      desc: 'Reading desks, all overturned. A woman in spell-stained robes is shelving books that should have burned.',
      exits: { west: 'lib_1', east: 'lib_5', south: 'lib_3' },
      items: ['scroll_lore'],
      npcs: ['mira_recruit'],
      insp: [
        learnSpell('book', 'A dusty book. You leaf through it and the rune of Spark bites itself into your mind.', 'spark'),
        reveal('desk', 'A reading desk, burned. Beneath it, a healing potion someone hid.', 'potion_g')
      ],
      save: 'shrine' }),

  R({ id: 'lib_3', name: 'Restricted Stack', area: 'library_wing', pos: [1, 1], tier: 2,
      desc: 'A stack labeled in red. Lamps out. Something moves between the shelves.',
      exits: { north: 'lib_2', east: 'lib_4', south: 'lib_6', west: 'lib_10' },
      enemies: ['ghoul'], items: ['gem'],
      dark: true,
      insp: [
        lore('shelves', 'Books on binding, on naming, on what answers when you call.', 'naming_arts'),
        flavor('runes', 'Runes glow faintly in your torchlight. Their meanings shift when you look away.')
      ] }),

  R({ id: 'lib_4', name: 'Cloister', area: 'library_wing', pos: [2, 1], tier: 2,
      desc: 'A small cloister. Brother Tomas kneels at a defaced icon. He does not look up at first.',
      exits: { north: 'lib_5', west: 'lib_3', east: 'lib_8', south: 'lib_7' },
      npcs: ['tomas_recruit'],
      insp: [
        flavor('icon', 'A holy icon, defaced and re-blessed. He keeps fixing it.'),
        buff('candle', 'You light a candle for someone you don\'t know. Something settles in you. (+2 mdef permanent.)', 'mdef', 2)
      ] }),

  R({ id: 'lib_5', name: 'Custodian\'s Vestibule', area: 'library_wing', pos: [2, 0], tier: 2,
      desc: 'Chains run along the walls into the room beyond. The chains are tight. The room beyond is lit.',
      exits: { west: 'lib_2', east: 'lib_boss', south: 'lib_4' },
      insp: [
        flavor('chains', 'Bindings. Something on the other end is awake.'),
        damage('chain', 'You touch a chain. It hums — and burns.', 4, 'chain')
      ] }),

  R({ id: 'lib_boss', name: 'Custodian\'s Cell', area: 'library_wing', pos: [3, 0], tier: 2,
      desc: 'A figure of ink and chain. It does not have a face. It is reading.',
      exits: { west: 'lib_5', east: 'lib_12', south: 'lib_8' },
      enemies: ['boss_custodian'], items: ['oak_staff'],
      insp: [
        flavor('ink', 'The figure is made of running ink. The pages it has read are stacked behind it, blank now.')
      ] }),

  R({ id: 'lib_6', name: 'Scriptorium', area: 'library_wing', pos: [1, 2], tier: 2,
      desc: 'Ink-stained desks, scratching quills set down mid-word.',
      exits: { north: 'lib_3', east: 'lib_7', west: 'lib_11' },
      items: ['scroll_mend', 'mana_potion'],
      insp: [
        learnSpell('annotation', 'An annotated page on healing. The rune for Mend writes itself into your hand.', 'mend'),
        flavor('quills', 'A pen still wet. Whoever wrote here left in a hurry.')
      ] }),

  R({ id: 'lib_7', name: 'Librarian\'s Quarters', area: 'library_wing', pos: [2, 2], tier: 2,
      desc: 'A small bedroom for someone who lived among books. The bed is made. The cup is full.',
      exits: { north: 'lib_4', west: 'lib_6', east: 'lib_9' },
      items: ['journal'],
      insp: [
        reveal('drawer', 'A drawer beneath the bed: a silver ring engraved with a name.', 'cathar_ring'),
        lore('journal2', 'Catharine\'s personal journal. The last entry: "I will go down with the others."', 'catharine')
      ] }),

  R({ id: 'lib_8', name: 'Chained Archive', area: 'library_wing', pos: [3, 1], tier: 2,
      desc: 'Books chained to lecterns. The chains are reasonable.',
      exits: { north: 'lib_boss', west: 'lib_4', east: 'lib_13', south: 'lib_9' },
      items: ['codex'],
      insp: [
        lore('codex', 'You read aloud. It does not respond. It only listens.', 'naming_arts'),
        gold('lectern', 'The lectern\'s base hides a small purse.', 50)
      ] }),

  R({ id: 'lib_9', name: 'Burned Stack', area: 'library_wing', pos: [3, 2], tier: 2,
      desc: 'A stack burned to the floor. Someone tried to save the books. Someone else made sure they couldn\'t.',
      exits: { north: 'lib_8', west: 'lib_7' },
      enemies: ['undead_priest'],
      insp: [
        flavor('ashes', 'Ash like snow. You don\'t know what was lost here. You won\'t.'),
        reveal('shelf', 'A book that survived: water-warped, but readable.', 'scroll_fireball')
      ] }),

  R({ id: 'lib_10', name: 'Catalog Hall', area: 'library_wing', pos: [0, 1], tier: 2,
      desc: 'A long hall of card catalogs. The cards have rearranged themselves into a single name.',
      exits: { north: 'lib_1', east: 'lib_3', south: 'lib_11' },
      enemies: ['wight'],
      insp: [
        lore('cards', 'The name spelled out is your own.', 'the_called'),
        flavor('drawers', 'Drawers slowly open and close on their own.')
      ] }),

  R({ id: 'lib_11', name: 'Lost Wing', area: 'library_wing', pos: [0, 2], tier: 2,
      desc: 'A wing the catalog forgot. Books here have no titles.',
      exits: { north: 'lib_10', east: 'lib_6' },
      items: ['mana_potion', 'silver_coin'],
      insp: [
        debuff('untitled', 'You read a book without a title. It reads you back.', 'maxMp', 0),
        flavor('shelves', 'Some of these books have hands inside them.')
      ] }),

  R({ id: 'lib_12', name: 'East Annex', area: 'library_wing', pos: [4, 0], tier: 2,
      desc: 'A small annex used for storage. Boxes labeled in red ink.',
      exits: { west: 'lib_boss', south: 'lib_13' },
      items: ['potion', 'mana_potion'],
      insp: [
        reveal('box', 'A box labeled "Custodian, do not open." You open it. A focus crystal.', 'crystal_orb')
      ] }),

  R({ id: 'lib_13', name: 'Library Descent', area: 'library_wing', pos: [4, 1], tier: 2,
      desc: 'A staircase down. Cold air. Something old and bone-still rises to meet you.',
      exits: { north: 'lib_12', west: 'lib_8', south: 'crypt_1' },
      insp: [
        flavor('stairs', 'The stairs are worn at the centers from the same feet, walking down forever.')
      ] }),

  // ═══ Area 5: The Crypts (14 rooms, tier 2-3, Mother of Bones boss + Crypt Warden miniboss) ═══
  R({ id: 'crypt_1', name: 'Crypt Threshold', area: 'crypts', pos: [0, 0], tier: 2,
      desc: 'A vault of stone sarcophagi. The lids of two have been broken open from within.',
      exits: { north: 'lib_13', east: 'crypt_2' },
      enemies: ['skeleton'],
      insp: [
        flavor('lids', 'They were pushed up, not pulled. From inside.'),
        gold('sarcophagus', 'A sarcophagus, cracked: a few coins, an old ring.', 30)
      ] }),

  R({ id: 'crypt_2', name: 'Bone Hall', area: 'crypts', pos: [1, 0], tier: 2,
      desc: 'A long hall walled in bone. Femurs forming arches. Skulls in lattices.',
      exits: { west: 'crypt_1', east: 'crypt_3', south: 'crypt_5' },
      enemies: ['skeleton', 'skel_archer'],
      insp: [
        flavor('arch', 'The arches hum when you pass. They are still being added to.'),
        damage('skull', 'A skull wails when you touch it. All in the room recoil.', 3, 'skull')
      ] }),

  R({ id: 'crypt_3', name: 'Ossuary', area: 'crypts', pos: [2, 0], tier: 2,
      desc: 'Bones beyond counting. The morbid art is precise.',
      exits: { west: 'crypt_2', east: 'crypt_4', south: 'crypt_6' },
      items: ['gold_coin', 'silver_coin'],
      enemies: ['ossuary_g'],
      insp: [
        reveal('niche', 'A niche behind the bones: a holy water vial, kept dry.', 'holy_water'),
        lore('plaque', 'A plaque names the families who gave their dead. None of the names are alive.', 'old_families')
      ] }),

  R({ id: 'crypt_4', name: 'Crypt Shrine', area: 'crypts', pos: [3, 0], tier: 2,
      desc: 'A small shrine, lamp lit from no oil. Someone keeps this room.',
      exits: { west: 'crypt_3', south: 'crypt_7' },
      save: 'shrine',
      insp: [
        buff('shrine', 'You kneel. The cold is gentler here. (+5 max HP permanent.)', 'maxHp', 5),
        flavor('lamp', 'The lamp burns when nothing burns it. Like Quartzlight\'s.')
      ] }),

  R({ id: 'crypt_5', name: 'Dark Wing', area: 'crypts', pos: [1, 1], tier: 3,
      desc: 'A pitch-black wing. The dark here has weight.',
      exits: { north: 'crypt_2', east: 'crypt_6', south: 'crypt_8' },
      dark: true,
      enemies: ['ghoul', 'wight'],
      insp: [
        damage('reach', 'You feel something take your wrist. (-5 HP)', 5, 'dark'),
        reveal('alcove', 'In the dark, a small alcove holds a torch and a mana potion.', 'mana_potion')
      ] }),

  R({ id: 'crypt_6', name: 'Memorial Hall', area: 'crypts', pos: [2, 1], tier: 3,
      desc: 'Names carved into every surface. Some are recent.',
      exits: { north: 'crypt_3', west: 'crypt_5', east: 'crypt_7', south: 'crypt_9' },
      enemies: ['undead_priest'],
      insp: [
        lore('names', 'You read names you cannot have known but recognize anyway.', 'old_families'),
        flavor('chisel', 'A small chisel, recently used. Some of the names look fresh.')
      ] }),

  R({ id: 'crypt_7', name: 'Reliquary', area: 'crypts', pos: [3, 1], tier: 3,
      desc: 'Glass cases, mostly broken, mostly empty. Something is still here.',
      exits: { north: 'crypt_4', west: 'crypt_6', south: 'crypt_10' },
      items: ['gold_coin', 'gem'],
      insp: [
        reveal('case', 'A reliquary case still sealed: inside, an antidote and a ring.', 'antidote'),
        gold('shards', 'You sift the shards. A few coins.', 35)
      ] }),

  R({ id: 'crypt_8', name: 'Bone Garden', area: 'crypts', pos: [1, 2], tier: 3,
      desc: 'Bones rising from the floor like growth. The garden is tended.',
      exits: { north: 'crypt_5', east: 'crypt_9', south: 'crypt_11' },
      enemies: ['crypt_horror'],
      insp: [
        flavor('garden', 'The bones sway slightly, as if in wind. There is no wind.'),
        damage('thorn', 'A bone thorn pricks you. (-3 HP)', 3, 'bone')
      ] }),

  R({ id: 'crypt_9', name: 'Catacomb Junction', area: 'crypts', pos: [2, 2], tier: 3,
      desc: 'A four-way crossing of bone-walled passages. Echoes do not return.',
      exits: { north: 'crypt_6', west: 'crypt_8', east: 'crypt_10', south: 'crypt_12' },
      enemies: ['skeleton', 'skeleton'],
      insp: [
        flavor('echo', 'You shout your own name. Nothing answers, but the silence is interested.')
      ] }),

  R({ id: 'crypt_10', name: 'Cold Chapel', area: 'crypts', pos: [3, 2], tier: 3,
      desc: 'A chapel below the chapel. The icons here have not been defaced. They watch.',
      exits: { north: 'crypt_7', west: 'crypt_9', south: 'crypt_13' },
      items: ['holy_water'],
      insp: [
        buff('icon', 'You bow. (+1 mdef permanent.)', 'mdef', 1),
        lore('crypt_text', 'A wall reads: "Mother is the door, and the door is grief, and grief opens."', 'mother_of_bones')
      ] }),

  R({ id: 'crypt_11', name: 'Warden\'s Cell', area: 'crypts', pos: [1, 3], tier: 3,
      desc: 'A large open chamber. A figure in robes of bone stands at the center, hands folded.',
      exits: { north: 'crypt_8' },
      enemies: ['mb_crypt_warden'],
      insp: [
        flavor('warden', 'The Warden does not speak. It will, when it is ready.'),
        lore('seal', 'A bone seal is set into the floor. The Warden is its keeper.', 'crypt_seal')
      ] }),

  R({ id: 'crypt_12', name: 'Twisting Way', area: 'crypts', pos: [2, 3], tier: 3,
      desc: 'A passage that should be straight but isn\'t. The walls have shifted since the last visitor.',
      exits: { north: 'crypt_9', east: 'crypt_13' },
      enemies: ['shadow'],
      insp: [
        damage('wall', 'The wall touches you. It should not be able to do that. (-4 HP)', 4, 'wall')
      ] }),

  R({ id: 'crypt_13', name: 'Antechamber to the Mother', area: 'crypts', pos: [3, 3], tier: 3,
      desc: 'A round chamber, six biers, six covers slightly raised — as if breathing.',
      exits: { north: 'crypt_10', west: 'crypt_12', south: 'crypt_boss' },
      insp: [
        flavor('biers', 'You count them. There are seven, when you look again. There are six.'),
        damage('cover', 'You lift a cover. You should not have. (-6 HP)', 6, 'underneath')
      ] }),

  R({ id: 'crypt_boss', name: 'Mother\'s Hall', area: 'crypts', pos: [3, 4], tier: 3,
      desc: 'A vast chamber. A woman of bone sits at its center, weeping bones. She does not stop weeping when you arrive.',
      exits: { north: 'crypt_13', south: 'cata_1' },
      enemies: ['boss_mother'],
      insp: [
        lore('mother', 'The Mother of Bones lost her daughters to the Sundering. She has not stopped finding pieces of them.', 'mother_of_bones')
      ] }),

  // ═══ Area 6: Catacombs (12 rooms, tier 3, Gravewyrm boss) ═══
  R({ id: 'cata_1', name: 'Catacomb Entry', area: 'catacombs', pos: [0, 0], tier: 3,
      desc: 'Tighter passages. Older bones. The dust here is older than the war.',
      exits: { north: 'crypt_boss', east: 'cata_2', south: 'cata_4' },
      enemies: ['skeleton', 'skel_archer'],
      insp: [
        flavor('dust', 'The dust holds the shape of footprints — yours, and other.')
      ] }),

  R({ id: 'cata_2', name: 'Narrow Hall', area: 'catacombs', pos: [1, 0], tier: 3,
      desc: 'A passage narrow enough that you could touch both walls if you wanted to. You don\'t want to.',
      exits: { west: 'cata_1', east: 'cata_3', south: 'cata_5' },
      enemies: ['shadow'],
      insp: [
        damage('wall', 'You touch the wall by accident. It responds. (-2 HP)', 2, 'wall')
      ] }),

  R({ id: 'cata_3', name: 'Catacomb Shrine', area: 'catacombs', pos: [2, 0], tier: 3,
      desc: 'A shrine to the unnamed dead. The lamp burns blue here.',
      exits: { west: 'cata_2', south: 'cata_6' },
      save: 'shrine',
      insp: [
        buff('shrine', 'You light a candle for the unnamed. (+5 max HP permanent.)', 'maxHp', 5),
        flavor('lamp', 'The blue flame does not heat. It cools.')
      ] }),

  R({ id: 'cata_4', name: 'Trap Hall', area: 'catacombs', pos: [0, 1], tier: 3,
      desc: 'A long hall with floor stones that depress slightly under your feet.',
      exits: { north: 'cata_1', east: 'cata_5', south: 'cata_7' },
      insp: [
        damage('stone', 'A pressure plate clicks. Darts. (-8 HP)', 8, 'darts'),
        reveal('plate', 'You disarm a panel and find what it concealed: a healing potion.', 'potion_g')
      ] }),

  R({ id: 'cata_5', name: 'Niches of the Saints', area: 'catacombs', pos: [1, 1], tier: 3,
      desc: 'Niches in the walls hold the slumped, still-shrouded dead.',
      exits: { north: 'cata_2', west: 'cata_4', east: 'cata_6', south: 'cata_8' },
      enemies: ['undead_priest'],
      items: ['gold_coin'],
      insp: [
        flavor('shroud', 'A shroud shifts as you pass. You don\'t look back.'),
        gold('niche', 'Coins set in a niche, an old offering.', 30)
      ] }),

  R({ id: 'cata_6', name: 'Bone Pile', area: 'catacombs', pos: [2, 1], tier: 3,
      desc: 'A pile of bones, recent. Whatever made this is still feeding.',
      exits: { north: 'cata_3', west: 'cata_5', south: 'cata_9' },
      enemies: ['crypt_horror'],
      insp: [
        gold('pile', 'You sift the pile. A handful of coins.', 25),
        damage('movement', 'Something inside the pile shifts. (-3 HP)', 3, 'bones')
      ] }),

  R({ id: 'cata_7', name: 'Forgotten Cell', area: 'catacombs', pos: [0, 2], tier: 3,
      desc: 'A monk\'s cell, sealed for centuries. The body is still here.',
      exits: { north: 'cata_4', east: 'cata_8' },
      items: ['scroll_lore'],
      insp: [
        lore('body', 'The monk left a final note: "I would not flee. I do not regret. I do not forgive."', 'cata_monk'),
        reveal('mat', 'Beneath his sleeping mat: a sealed letter and an antidote.', 'antidote')
      ] }),

  R({ id: 'cata_8', name: 'Pit Hall', area: 'catacombs', pos: [1, 2], tier: 3,
      desc: 'A hall with a pit in the center. Something stirs at the bottom.',
      exits: { north: 'cata_5', west: 'cata_7', east: 'cata_9', south: 'cata_10' },
      enemies: ['shadow'],
      insp: [
        damage('pit', 'You lean over. You shouldn\'t have. Something reaches up. (-6 HP)', 6, 'pit'),
        reveal('rim', 'On the rim: a discarded weapon, intact.', 'iron_sword')
      ] }),

  R({ id: 'cata_9', name: 'Crossing of Dead', area: 'catacombs', pos: [2, 2], tier: 3,
      desc: 'A crossing where four passages meet. Bones piled neatly at the center of each entry.',
      exits: { north: 'cata_6', west: 'cata_8', south: 'cata_11' },
      enemies: ['ossuary_g'],
      insp: [
        flavor('piles', 'The piles are equal in size. Someone counts.'),
        gold('pile', 'A bone pile, hidden coins.', 40)
      ] }),

  R({ id: 'cata_10', name: 'Dust Hall', area: 'catacombs', pos: [1, 3], tier: 3,
      desc: 'Dust deep enough to wade through. It rises with you.',
      exits: { north: 'cata_8', east: 'cata_11' },
      insp: [
        damage('dust', 'The dust enters your lungs. (-3 HP)', 3, 'dust'),
        reveal('mound', 'A mound in the dust. Beneath it, something half-rusted.', 'shortsword')
      ] }),

  R({ id: 'cata_11', name: 'Wyrm-Track', area: 'catacombs', pos: [2, 3], tier: 3,
      desc: 'A passage with a deep groove worn down its center, as if something long has dragged through.',
      exits: { north: 'cata_9', west: 'cata_10', south: 'cata_boss' },
      enemies: ['centipede'],
      insp: [
        flavor('groove', 'The groove is fresh. It is wet.')
      ] }),

  R({ id: 'cata_boss', name: 'Wyrm\'s Den', area: 'catacombs', pos: [2, 4], tier: 3,
      desc: 'A vast cavern. Bones of the dead, and bones of the things that came to eat them, ring the walls. A long shape stirs.',
      exits: { north: 'cata_11', south: 'cave_1' },
      enemies: ['boss_gravewyrm'],
      insp: [
        lore('wyrm', 'The Gravewyrm is older than the keep. It was here when the keep was built. It will be here after.', 'gravewyrm')
      ] }),

  // ═══ Area 7: Deepcaves (15 rooms, tier 3-4, Echo boss + Cave Tyrant miniboss + Kael recruit) ═══
  R({ id: 'cave_1', name: 'Cave Mouth', area: 'deepcaves', pos: [0, 0], tier: 3,
      desc: 'The catacombs open into natural cavern. Glowing spores drift like slow snow.',
      exits: { north: 'cata_boss', east: 'cave_2', south: 'cave_5' },
      insp: [
        flavor('spores', 'The spores are warm. They follow you.'),
        damage('spore', 'You inhale a spore. (-2 HP, but a small ringing in your ears.)', 2, 'spore')
      ] }),

  R({ id: 'cave_2', name: 'Cave Spring', area: 'deepcaves', pos: [1, 0], tier: 3,
      desc: 'A pool of warm, still water lit from below. Drinking it is dangerous. Resting nearby is restorative.',
      exits: { west: 'cave_1', east: 'cave_3', south: 'cave_6' },
      save: 'shrine',
      insp: [
        buff('water', 'You taste the water. (+5 max HP permanent.)', 'maxHp', 5),
        damage('drink', 'You drink deeply. The water remembers something. (-3 HP, but a clear head.)', 3, 'spring'),
        flavor('light', 'Something glows below. You can\'t reach it.')
      ] }),

  R({ id: 'cave_3', name: 'Spore Garden', area: 'deepcaves', pos: [2, 0], tier: 3,
      desc: 'Towering glowing mushrooms in pinks and blues. The light is dreamlike.',
      exits: { west: 'cave_2', east: 'cave_4', south: 'cave_7' },
      enemies: ['spore_thing'],
      items: ['potion_g'],
      insp: [
        buff('seed', 'A strange seed, hard as bone. You eat it. (+3 max MP permanent.)', 'maxMp', 3),
        damage('flower', 'A black flower opens at your touch. Poison. (-4 HP)', 4, 'spore')
      ] }),

  R({ id: 'cave_4', name: 'Hunter\'s Camp', area: 'deepcaves', pos: [3, 0], tier: 3,
      desc: 'A small camp at a juncture of caves. Kael the Hunter sits with his bow across his knees.',
      exits: { west: 'cave_3', south: 'cave_8' },
      npcs: ['kael_recruit'],
      insp: [
        flavor('camp', 'The camp is well-kept and small. He travels light.'),
        gold('cache', 'Kael\'s small cache: a few coins and a potion.', 30)
      ] }),

  R({ id: 'cave_5', name: 'Lower Cave', area: 'deepcaves', pos: [0, 1], tier: 3,
      desc: 'A descending cavern, the air growing colder.',
      exits: { north: 'cave_1', east: 'cave_6', south: 'cave_9' },
      enemies: ['cave_bear'],
      insp: [
        flavor('cold', 'The cold is from below, not above.')
      ] }),

  R({ id: 'cave_6', name: 'Mushroom Hall', area: 'deepcaves', pos: [1, 1], tier: 3,
      desc: 'A long hall under a ceiling of bioluminescent fungi. Beautiful, in its way.',
      exits: { north: 'cave_2', west: 'cave_5', east: 'cave_7', south: 'cave_10' },
      enemies: ['centipede'],
      insp: [
        gold('cap', 'You knock down a cap. Coins were nesting in it.', 35),
        flavor('light', 'The light is gentle. You feel the urge to lie down. You don\'t.')
      ] }),

  R({ id: 'cave_7', name: 'Echo Cavern', area: 'deepcaves', pos: [2, 1], tier: 4,
      desc: 'A wide cavern that returns nothing — neither echo nor sound. Your steps are silent.',
      exits: { north: 'cave_3', west: 'cave_6', east: 'cave_8', south: 'cave_11' },
      enemies: ['shadow'],
      insp: [
        damage('void', 'You speak. The cavern eats your voice. (-5 HP)', 5, 'void'),
        flavor('silence', 'Even your heartbeat is muffled here.')
      ] }),

  R({ id: 'cave_8', name: 'Hunter\'s Trail', area: 'deepcaves', pos: [3, 1], tier: 4,
      desc: 'A trail Kael has used. Notches on the wall mark passing days.',
      exits: { north: 'cave_4', west: 'cave_7', south: 'cave_12' },
      enemies: ['centipede'],
      insp: [
        gold('cache', 'A trail cache: coins, an antidote.', 40)
      ] }),

  R({ id: 'cave_9', name: 'Tyrant\'s Lair', area: 'deepcaves', pos: [0, 2], tier: 4,
      desc: 'A side cavern strewn with bones too large to be human. Something heavy moves at the back.',
      exits: { north: 'cave_5', east: 'cave_10' },
      enemies: ['mb_cave_tyrant'],
      insp: [
        flavor('bones', 'The bones are too large. The Tyrant did not eat people.'),
        gold('hoard', 'The Tyrant\'s hoard: small, mostly gems.', 100)
      ] }),

  R({ id: 'cave_10', name: 'Hollow', area: 'deepcaves', pos: [1, 2], tier: 4,
      desc: 'A deep hollow where water has carved the rock into a bowl.',
      exits: { north: 'cave_6', west: 'cave_9', east: 'cave_11', south: 'cave_13' },
      enemies: ['drowned'],
      insp: [
        flavor('bowl', 'The bowl is dry now. The water went somewhere.')
      ] }),

  R({ id: 'cave_11', name: 'Crystal Hall', area: 'deepcaves', pos: [2, 2], tier: 4,
      desc: 'A hall whose walls are studded with quartz. Light multiplies endlessly.',
      exits: { north: 'cave_7', west: 'cave_10', east: 'cave_12', south: 'cave_14' },
      items: ['gem'],
      insp: [
        gold('crystal', 'You break a crystal free.', 50),
        damage('reflection', 'Your reflection in a crystal moves before you do. (-3 HP)', 3, 'reflection')
      ] }),

  R({ id: 'cave_12', name: 'Deep Pool', area: 'deepcaves', pos: [3, 2], tier: 4,
      desc: 'A pool of black water. Something pale drifts in it.',
      exits: { north: 'cave_8', west: 'cave_11' },
      enemies: ['vault_w'],
      insp: [
        damage('pool', 'You touch the water. It clings.', 4, 'pool'),
        reveal('shore', 'Half-buried on the shore: an ether and a strange shard.', 'mirror_shard')
      ] }),

  R({ id: 'cave_13', name: 'Whispering Tunnel', area: 'deepcaves', pos: [1, 3], tier: 4,
      desc: 'A narrow tunnel where you can almost hear voices. Almost.',
      exits: { north: 'cave_10', east: 'cave_14' },
      insp: [
        damage('whisper', 'You listen too long. (-3 HP and a sour taste.)', 3, 'whisper'),
        learnSpell('voice', 'You catch a single rune. The shape of Frost.', 'frost')
      ] }),

  R({ id: 'cave_14', name: 'Echo Antechamber', area: 'deepcaves', pos: [2, 3], tier: 4,
      desc: 'A chamber where every step makes three. The walls are slick with damp.',
      exits: { north: 'cave_11', west: 'cave_13', south: 'cave_boss' },
      insp: [
        flavor('echo', 'Three of you walk in.')
      ] }),

  R({ id: 'cave_boss', name: 'Echo\'s Pool', area: 'deepcaves', pos: [2, 4], tier: 4,
      desc: 'A black pool. From it rises a shape that is almost you. Almost.',
      exits: { north: 'cave_14', south: 'forge_1' },
      enemies: ['boss_echo'],
      insp: [
        lore('pool', 'The Echo of the Deep is the part of the keep that remembers everyone who entered. It is tired of remembering.', 'echo_of_deep')
      ] }),

  // ═══ Area 8: Forge Hold (8 rooms, tier 4, Forsaken Smith boss + Iron Twins miniboss + Garrick) ═══
  R({ id: 'forge_1', name: 'Forge Gate', area: 'forge_hold', pos: [0, 0], tier: 4,
      desc: 'A great iron gate, half-open. Beyond, the smell of cold smoke and old iron.',
      exits: { north: 'cave_boss', east: 'forge_2', south: 'forge_3' },
      save: 'outpost',
      insp: [
        flavor('gate', 'The gate is dwarven work. It would have held against an army. It did, once.'),
        lore('inscription', 'Inscription: "The Hold endures." The inscription is recent.', 'forge_hold_history')
      ] }),

  R({ id: 'forge_2', name: 'Hall of Anvils', area: 'forge_hold', pos: [1, 0], tier: 4,
      desc: 'A hall where every dwarf in the hold once worked. Anvils still warm to the touch.',
      exits: { west: 'forge_1', east: 'forge_4', south: 'forge_5' },
      enemies: ['forge_remnant'],
      items: ['gold_coin'],
      insp: [
        flavor('anvils', 'The anvils are warm. They have not been cold in seven hundred years.'),
        gold('toolbox', 'A toolbox kicked under a workbench: small change.', 35)
      ] }),

  R({ id: 'forge_3', name: 'Garrick\'s Chamber', area: 'forge_hold', pos: [0, 1], tier: 4,
      desc: 'A small room. A man in heavy plate sits at a half-set table, eating slowly.',
      exits: { north: 'forge_1', east: 'forge_5' },
      npcs: ['garrick_recruit', 'forge_innkeeper'],
      save: 'outpost',
      insp: [
        flavor('garrick', 'Garrick eats. He does not stop eating when you arrive.'),
        flavor('table', 'The table is set for two. The other place has been empty for a long time.')
      ] }),

  R({ id: 'forge_4', name: 'Iron Stores', area: 'forge_hold', pos: [2, 0], tier: 4,
      desc: 'Bars of iron stacked floor to ceiling. The forge could have armed an army.',
      exits: { west: 'forge_2', south: 'forge_6' },
      enemies: ['iron_const'],
      items: ['plate'],
      insp: [
        gold('crate', 'A crate of mixed coin.', 80),
        reveal('rack', 'A rack of weapons, mostly looted. One remains.', 'forge_axe')
      ] }),

  R({ id: 'forge_5', name: 'Sage\'s Forge', area: 'forge_hold', pos: [1, 1], tier: 4,
      desc: 'A side forge converted to study. The Deep Sage, who would not climb to Quartzlight, sits here.',
      exits: { north: 'forge_2', west: 'forge_3', east: 'forge_6', south: 'forge_7' },
      npcs: ['deep_sage', 'brokk_smith'],
      insp: [
        flavor('books', 'Books and broken hammers. Brokk is patient. The Deep Sage less so.')
      ] }),

  R({ id: 'forge_6', name: 'Twin Forge', area: 'forge_hold', pos: [2, 1], tier: 4,
      desc: 'A forge with two anvils side by side. Two figures of iron stand at them, hammering air.',
      exits: { north: 'forge_4', west: 'forge_5' },
      enemies: ['mb_iron_twin_a', 'mb_iron_twin_b'],
      insp: [
        lore('twins', 'The Iron Twins forged the door of Forge Hold. They would not stop forging when the Hold fell.', 'iron_twins')
      ] }),

  R({ id: 'forge_7', name: 'Master\'s Forge', area: 'forge_hold', pos: [1, 2], tier: 4,
      desc: 'The Forge-Master\'s own forge. Tools laid out as for a day\'s work.',
      exits: { north: 'forge_5', south: 'forge_boss' },
      items: ['steel_sword'],
      insp: [
        flavor('tools', 'Tools laid out for work that was never finished.'),
        gold('stash', 'A stash beneath a bench.', 60)
      ] }),

  R({ id: 'forge_boss', name: 'The Anvil', area: 'forge_hold', pos: [1, 3], tier: 4,
      desc: 'A vast forge dominated by a single anvil. The Forsaken Smith stands before it, hammer raised, waiting.',
      exits: { north: 'forge_7', south: 'vault_1' },
      enemies: ['boss_smith'],
      insp: [
        flavor('anvil', 'The anvil is the size of a horse. It is also him, somehow.'),
        lore('smith', 'The Forge-Master would not finish his last work. So his last work would not finish him.', 'forsaken_smith')
      ] }),

  // ═══ Area 9: Vault Complex (12 rooms, tier 4-5, Vault Sentinel boss + Vault Wraith miniboss) ═══
  R({ id: 'vault_1', name: 'Vault Threshold', area: 'vault_complex', pos: [0, 0], tier: 4,
      desc: 'A round chamber. Reliefs of impossibly tall figures bearing crowns ring the walls.',
      exits: { north: 'forge_boss', east: 'vault_2' },
      enemies: ['drowned'],
      insp: [
        lore('relief', 'The crowned figures have been carved over a much older relief. Beneath, the figures are not human.', 'pre_quartz')
      ] }),

  R({ id: 'vault_2', name: 'Wraith\'s Hall', area: 'vault_complex', pos: [1, 0], tier: 5,
      desc: 'A hall of dust and silver. A figure of pale flame drifts at its center.',
      exits: { west: 'vault_1', east: 'vault_3', south: 'vault_5' },
      enemies: ['mb_vault_wraith'],
      insp: [
        flavor('flame', 'The flame is silent. It speaks when you don\'t.')
      ] }),

  R({ id: 'vault_3', name: 'Vault Records', area: 'vault_complex', pos: [2, 0], tier: 5,
      desc: 'A long chamber lined with ledgers. The Last Clerk works at a high desk.',
      exits: { west: 'vault_2', east: 'vault_4', south: 'vault_6' },
      save: 'shrine',
      npcs: ['vault_clerk'],
      insp: [
        lore('ledger', 'The ledger lists every coin in the Vault. The total is wrong by one.', 'vault_complex'),
        gold('drawer', 'A drawer beneath the desk holds a small payment.', 50)
      ] }),

  R({ id: 'vault_4', name: 'Stack of Coins', area: 'vault_complex', pos: [3, 0], tier: 5,
      desc: 'A chamber of coin in stacks taller than you.',
      exits: { west: 'vault_3', south: 'vault_7' },
      enemies: ['golem'],
      items: ['gold_coin', 'gold_coin', 'gold_coin'],
      insp: [
        gold('stack', 'You knock over a stack and take the spillage.', 200),
        damage('alarm', 'A tripwire trips. Something heavy starts. (-5 HP)', 5, 'trap')
      ] }),

  R({ id: 'vault_5', name: 'Treasury Hall', area: 'vault_complex', pos: [1, 1], tier: 5,
      desc: 'Display cases of jewels, mostly empty. Mostly.',
      exits: { north: 'vault_2', east: 'vault_6', south: 'vault_8' },
      items: ['gem'],
      enemies: ['vault_w'],
      insp: [
        reveal('case', 'A case still sealed: a fine gem.', 'gem'),
        damage('case2', 'You force a sealed case. Glass shards bite. (-4 HP)', 4, 'glass')
      ] }),

  R({ id: 'vault_6', name: 'Crowns of the Dead', area: 'vault_complex', pos: [2, 1], tier: 5,
      desc: 'A hall of crowns on velvet. None of them fit anyone alive.',
      exits: { north: 'vault_3', west: 'vault_5', east: 'vault_7', south: 'vault_9' },
      items: ['crown'],
      insp: [
        lore('crowns', 'Each crown is named. Most names are forgotten. Some are shockingly recent.', 'old_kings'),
        damage('crown', 'You try one on. It does not fit. It tries to fit. (-5 HP)', 5, 'crown')
      ] }),

  R({ id: 'vault_7', name: 'Locked Wing', area: 'vault_complex', pos: [3, 1], tier: 5,
      desc: 'A wing whose doors are locked. The locks are intact. The doors are not.',
      exits: { north: 'vault_4', west: 'vault_6', south: 'vault_10' },
      enemies: ['keeper'],
      insp: [
        gold('drawer', 'You sift broken locks.', 75)
      ] }),

  R({ id: 'vault_8', name: 'Hidden Chamber', area: 'vault_complex', pos: [1, 2], tier: 5,
      desc: 'A chamber that the records do not list.',
      exits: { north: 'vault_5', east: 'vault_9' },
      items: ['phoenix_pearl'],
      insp: [
        reveal('alcove', 'An alcove holds a sealed jar.', 'mana_crystal'),
        lore('chamber', 'A note: "If you have found this, then we have all already failed."', 'final_failure')
      ] }),

  R({ id: 'vault_9', name: 'Mirror Hall', area: 'vault_complex', pos: [2, 2], tier: 5,
      desc: 'A hall of full-length mirrors. The mirrors do not show you.',
      exits: { north: 'vault_6', west: 'vault_8', east: 'vault_10', south: 'vault_11' },
      enemies: ['shadow'],
      insp: [
        damage('mirror', 'You look. Something looks back. (-2 speed permanent unless mended.)', 4, 'mirror'),
        debuff('mirror_curse', 'A cursed mirror leaves a mark. (-2 speed permanent.)', 'speed', 2)
      ] }),

  R({ id: 'vault_10', name: 'Keeper\'s Approach', area: 'vault_complex', pos: [3, 2], tier: 5,
      desc: 'A hall ending in a great crystal door.',
      exits: { north: 'vault_7', west: 'vault_9', south: 'vault_boss' },
      enemies: ['golem'],
      insp: [
        flavor('door', 'The door hums. It will open only if what is behind is satisfied.')
      ] }),

  R({ id: 'vault_11', name: 'Coin Cellar', area: 'vault_complex', pos: [2, 3], tier: 5,
      desc: 'The deepest store. Coins so old they no longer spend.',
      exits: { north: 'vault_9', east: 'vault_boss' },
      items: ['diamond'],
      insp: [
        gold('coin', 'You sift the cellar. You take only what is recent.', 150)
      ] }),

  R({ id: 'vault_boss', name: 'The Sentinel\'s Hall', area: 'vault_complex', pos: [3, 3], tier: 5,
      desc: 'A vast vault. The Vault Sentinel stands at its center, motionless until it isn\'t.',
      exits: { north: 'vault_10', west: 'vault_11', south: 'throne_1' },
      enemies: ['boss_sentinel'],
      insp: [
        flavor('sentinel', 'The Sentinel does not breathe. It will not stop being still until you make it.')
      ] }),

  // ═══ Area 10: Throne Quarter (9 rooms, tier 5, Lich boss) ═══
  R({ id: 'throne_1', name: 'Throne Approach', area: 'throne_quarter', pos: [0, 0], tier: 5,
      desc: 'A long carpet, faded to dried-blood color, leads inward. Banners hang in tatters.',
      exits: { north: 'vault_boss', east: 'throne_2', south: 'throne_5' },
      enemies: ['throne_g'],
      insp: [
        flavor('carpet', 'The carpet remembers feet. Yours are heavier than the average.'),
        lore('banner', 'A banner: house Quartzlight. The lions still weep, when no one looks.', 'fall_of_quartz')
      ] }),

  R({ id: 'throne_2', name: 'Throne Antechamber', area: 'throne_quarter', pos: [1, 0], tier: 5,
      desc: 'A great antechamber, prepared for visitors who never came.',
      exits: { west: 'throne_1', east: 'throne_3', south: 'throne_6' },
      save: 'shrine',
      items: ['warhammer', 'potion_g'],
      insp: [
        buff('mosaic', 'A mosaic of a king. You bow without meaning to. (+1 mdef permanent.)', 'mdef', 1),
        flavor('chairs', 'Empty chairs. They have not been arranged for centuries.')
      ] }),

  R({ id: 'throne_3', name: 'Lich\'s Laboratory', area: 'throne_quarter', pos: [2, 0], tier: 5,
      desc: 'Tables of cracked glass and obsidian. Jars of preserved organs. Diagrams binding souls to crystal.',
      exits: { west: 'throne_2', east: 'throne_4', south: 'throne_7' },
      items: ['phylactery', 'potion_g'],
      insp: [
        lore('diagram', 'The diagrams describe the Lich. He has been working on himself for a long time.', 'lich_history'),
        damage('jar', 'You knock over a jar. Something leaks. (-4 HP)', 4, 'unguent'),
        reveal('shelf', 'A shelf hides a mana crystal.', 'mana_crystal')
      ] }),

  R({ id: 'throne_4', name: 'Lich\'s Sanctum', area: 'throne_quarter', pos: [3, 0], tier: 5,
      desc: 'A circle of standing stones, etched with star-charts of dead heavens. The Lich, robed and silent, stands at center. Its gaze finds you.',
      exits: { west: 'throne_3', south: 'throne_8' },
      enemies: ['boss_lich'],
      insp: [
        lore('stones', 'The stones are aligned with stars that no longer exist.', 'lich_history')
      ] }),

  R({ id: 'throne_5', name: 'Servants\' Wing', area: 'throne_quarter', pos: [0, 1], tier: 5,
      desc: 'Dormitories for those who once kept the throne quarter. The beds are made.',
      exits: { north: 'throne_1', east: 'throne_6' },
      items: ['ration', 'potion'],
      enemies: ['royal_rev'],
      insp: [
        flavor('beds', 'The beds are made by hands that did not survive making them.'),
        gold('drawer', 'A drawer: a small purse of coins.', 60)
      ] }),

  R({ id: 'throne_6', name: 'Royal Hall', area: 'throne_quarter', pos: [1, 1], tier: 5,
      desc: 'The hall where royal business was done. The records are perfectly preserved.',
      exits: { north: 'throne_2', west: 'throne_5', east: 'throne_7' },
      enemies: ['throne_g'],
      insp: [
        lore('records', 'The royal records list every kindness done by the throne. The list is short.', 'old_kings')
      ] }),

  R({ id: 'throne_7', name: 'Ritual Circle', area: 'throne_quarter', pos: [2, 1], tier: 5,
      desc: 'A circle of carved stones, smaller than the Lich\'s. This was a working ritual.',
      exits: { north: 'throne_3', west: 'throne_6' },
      enemies: ['royal_rev'],
      insp: [
        learnSpell('runes', 'You trace the runes. The shape of Drain enters you.', 'drain'),
        damage('circle', 'You step into the circle. The circle objects. (-6 HP)', 6, 'circle')
      ] }),

  R({ id: 'throne_8', name: 'Descent', area: 'throne_quarter', pos: [3, 1], tier: 5,
      desc: 'A staircase down, lit by quartz lamps that should not still burn. They burn.',
      exits: { north: 'throne_4', south: 'sanctum_1' },
      insp: [
        flavor('stairs', 'The stairs go down. The dark below is deeper than dark.'),
        lore('graffiti', 'Graffiti on the wall: a single word — "Deeper."', 'sanctum')
      ] }),

  R({ id: 'throne_9', name: 'Broken Throne', area: 'throne_quarter', pos: [1, 2], tier: 5,
      desc: 'The throne itself, halved. A figure sits in the half that remains.',
      exits: { north: 'throne_6' },
      enemies: ['royal_rev'],
      items: ['throne_blade'],
      insp: [
        lore('throne', 'The king did not flee. He sat. He is sitting still, in a way.', 'old_kings')
      ] }),

  // ═══ Area 11: Hidden Sanctum (7 rooms, tier 6 postgame, Worldbreaker boss + Whispering One miniboss) ═══
  R({ id: 'sanctum_1', name: 'Beneath the Throne', area: 'hidden_sanctum', pos: [0, 0], tier: 6,
      desc: 'The bottom of the descent. The dark is older than the keep.',
      exits: { north: 'throne_8', east: 'sanctum_2' },
      enemies: ['shadow_thing'],
      insp: [
        lore('dark', 'The dark here predates the kingdom. The kingdom predates the dark by less than expected.', 'sanctum')
      ] }),

  R({ id: 'sanctum_2', name: 'Hall of the Whispering', area: 'hidden_sanctum', pos: [1, 0], tier: 6,
      desc: 'A long hall. The walls speak in many voices, none above a whisper.',
      exits: { west: 'sanctum_1', east: 'sanctum_3' },
      enemies: ['mb_whispering'],
      insp: [
        damage('whisper', 'You listen. The whispers learn your name. (-5 HP)', 5, 'whisper'),
        learnSpell('voice', 'A whisper teaches you the rune of Silence.', 'silence')
      ] }),

  R({ id: 'sanctum_3', name: 'Sanctum Shrine', area: 'hidden_sanctum', pos: [2, 0], tier: 6,
      desc: 'A shrine made of starlight, somehow. The lamp here is white.',
      exits: { west: 'sanctum_2', south: 'sanctum_4' },
      save: 'shrine',
      insp: [
        buff('shrine', 'You kneel. (+10 max HP permanent.)', 'maxHp', 10),
        lore('starlight', 'The shrine is made of compressed light. It does not belong to any god the world remembers.', 'sanctum_origin')
      ] }),

  R({ id: 'sanctum_4', name: 'Hall of Mirrors', area: 'hidden_sanctum', pos: [2, 1], tier: 6,
      desc: 'A hall where the mirrors face each other. Each mirror shows a different version of the keep.',
      exits: { north: 'sanctum_3', west: 'sanctum_5', south: 'sanctum_6' },
      enemies: ['void_priest'],
      insp: [
        damage('mirror', 'You look in a mirror. You are different in it. (-6 HP)', 6, 'mirror'),
        lore('mirror2', 'In one mirror, the keep stands whole, full of the living. The version is not yours.', 'unbroken_world')
      ] }),

  R({ id: 'sanctum_5', name: 'Hermit\'s Cell', area: 'hidden_sanctum', pos: [1, 1], tier: 6,
      desc: 'A small cell. The Hermit has lived here since before the keep.',
      exits: { east: 'sanctum_4' },
      npcs: ['hermit'],
      items: ['mana_crystal'],
      insp: [
        flavor('hermit', 'The Hermit looks tired. He looks like he has been tired for a long time.'),
        lore('cell', 'The cell\'s walls are scratched with tally marks. The marks are uncountable.', 'hermit')
      ] }),

  R({ id: 'sanctum_6', name: 'Approach to the Worldbreaker', area: 'hidden_sanctum', pos: [2, 2], tier: 6,
      desc: 'A round chamber. The walls bow inward, as if pushed by something on the other side.',
      exits: { north: 'sanctum_4', south: 'sanctum_boss' },
      enemies: ['void_priest', 'shadow_thing'],
      insp: [
        flavor('walls', 'The walls press in. They have been pressing in for a long time.')
      ] }),

  R({ id: 'sanctum_boss', name: 'The Sealed Hall', area: 'hidden_sanctum', pos: [2, 3], tier: 6,
      desc: 'A vast hall. At its center, the Worldbreaker — older than the Lich, older than the keep, older than the sound of names.',
      exits: { north: 'sanctum_6' },
      enemies: ['boss_worldbreaker'],
      insp: [
        lore('worldbreaker', 'The Worldbreaker once made the world. It has been deciding whether to keep it.', 'worldbreaker')
      ] })
]

// ── Build map keyed by id ──
const R_MAP: Record<RoomId, Room> = {}
for (const r of ALL) R_MAP[r.id] = r

export function makeRooms(): Record<RoomId, Room> {
  const out: Record<RoomId, Room> = {}
  for (const k of Object.keys(R_MAP)) {
    const src = R_MAP[k]
    out[k] = {
      ...src,
      exits: { ...src.exits },
      enemies: [...src.enemies],
      items: src.items.map(i => ({ ...i })),
      npcs: [...src.npcs],
      inspectables: src.inspectables.map(i => ({ ...i, triggered: false })),
      visited: false,
      cleared: false,
      corpses: []
    }
  }
  return out
}

export const STARTING_ROOM: RoomId = 'path_1'
