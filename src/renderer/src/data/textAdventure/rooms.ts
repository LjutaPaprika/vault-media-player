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
  /** Override description shown after the room's enemies have been defeated. */
  clearedDesc?: string
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
    clearedDesc: a.clearedDesc,
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
      desc: 'Worn stone slabs descend through a hollow of black-barked trees, the path half-eaten by patient roots. The air is colder than the surface had any right to be, and the green light that filters down feels filtered through something other than leaves. Faint marks remain at the edges of the slabs — the masons\' guild signs, of houses whose names this country has stopped saying aloud.',
      flavor: 'You stand at the threshold of a fallen kingdom. The Sundering took it in a single winter, they say, though the truth is messier; what came down here did so over generations, and what waits below has had time to settle in. Behind you is the world that forgot. Ahead, only down.',
      exits: { east: 'path_2', south: 'path_6' },
      items: [{ id: 'silver_coin', hidden: true }],
      insp: [
        flavor('roots', 'Roots like fingers grip the slabs. Old, watching.'),
        gold('milestone', 'A weathered stone reads "Quartzlight, that way." Three silver coins lie in the offering bowl.', 15),
        lore('crest', 'A faded royal crest, twin lions weeping. Older than memory.', 'fall_of_quartz')
      ] }),

  R({ id: 'path_2', name: 'Hollow of Roots', area: 'sunken_path', pos: [1, 0], tier: 1,
      desc: 'The trees lean inward here as if conferring, their crowns laced into a single dim canopy. Roots have surfaced like the ribs of something half-buried, and between them, small bones are stacked in neat conical piles — squirrel, rat, the occasional finger. Whoever does the stacking is careful. Whoever does the stacking has been doing it for a long time.',
      exits: { west: 'path_1', east: 'path_3', south: 'path_5' },
      enemies: ['cave_rat'],
      insp: [
        flavor('bones', 'Picked clean. Stacked deliberate. Whatever did this had time.'),
        reveal('pile', 'Beneath the bones — a cracked vial of something red.', 'potion')
      ] }),

  R({ id: 'path_3', name: 'Brokenshrine', area: 'sunken_path', pos: [2, 0], tier: 1,
      desc: 'A small altar of split stone, the dedication line scoured to a whisper of glyphs. Black-veined flowers rest upon it in a heap that does not decay, their petals turned toward you regardless of where you stand. When the wind drops, the flowers do not — a sound like breath through teeth keeps going. Whoever was prayed to here is still listening; the question is whether the listener and the prayed-for are the same thing.',
      exits: { west: 'path_2', south: 'path_4' },
      save: 'shrine',
      items: [{ id: 'silver_coin', hidden: true }, { id: 'ration', hidden: true }],
      insp: [
        buff('altar', 'You kneel. Something old answers — not unkindly. Your wounds knit a little deeper. (+5 max HP, permanent.)', 'maxHp', 5),
        damage('flowers', 'You touch one. It bites back.', 3, 'flowers'),
        flavor('petals', 'The black petals do not wilt. They have not wilted in centuries.')
      ] }),

  R({ id: 'path_4', name: 'Ruined Gate', area: 'sunken_path', pos: [2, 1], tier: 1,
      desc: 'The arch has fallen inward, its keystone split clean down its center as if cleaved by a single intent. The threshold beneath, however, is unmistakable: a worn groove from centuries of feet, the carved sigil of the lions of Quartzlight still visible at the base. Beyond, the ruins of a keep rise in fragments through the mist — towers without roofs, walls without rooms, a silhouette that would once have been the second-largest city in the kingdom.',
      exits: { north: 'path_3', west: 'path_5', south: 'ruins_1' },
      enemies: ['goblin'], items: ['torch', { id: 'ration', hidden: true }],
      insp: [
        lore('arch', 'Carved with lions and crowns. The lions weep.', 'fall_of_quartz'),
        flavor('rubble', 'The gate fell from the inside. Whatever broke it was already within.')
      ] }),

  R({ id: 'path_5', name: 'Moss Hollow', area: 'sunken_path', pos: [1, 1], tier: 1,
      desc: 'A natural bowl in the earth, lined floor to lip with moss so deep your boots vanish to the ankle. A statue stands at the center, weathered to anonymity — the head taken, the hands taken, the sword-stub at the hip the only clue it was ever a warrior. Around its feet, the moss has grown unnaturally vivid in a perfect circle, as if something keeps feeding it; you do not want to know what.',
      exits: { north: 'path_2', east: 'path_4', west: 'path_6' },
      enemies: ['spider'],
      items: [{ id: 'silver_coin', hidden: true }],
      insp: [
        gold('statue', 'Someone has hidden three silver coins in the broken collar of the statue.', 15),
        flavor('moss', 'The moss is unnaturally vivid. Something fed it well.')
      ] }),

  R({ id: 'path_6', name: 'Old Camp', area: 'sunken_path', pos: [0, 1], tier: 1,
      desc: 'A dead campfire ringed in stones, three bedrolls laid out as if for a watch rotation that never ended. The packs are still here, untouched by the years; the owners did not return for them, and nothing else has dared. Above the fire, on a notched stick, a tin kettle hangs empty. The water inside it has dried to a thin crust of minerals, and beneath the crust, in fine careful script, someone wrote a word that you cannot quite read.',
      exits: { north: 'path_1', east: 'path_5' },
      items: ['ration', 'silver_coin'],
      insp: [
        reveal('bedroll', 'You search a bedroll and find a sealed letter — and a healing potion tucked beneath it.', 'potion'),
        flavor('letter', 'A letter, water-warped: "If you find this, do not look for me."')
      ] }),

  // ═══ Area 2: Surface Ruins (11 rooms, tier 1-2, Vex boss + cursed knight miniboss) ═══
  R({ id: 'ruins_1', name: 'Outer Bailey', area: 'surface_ruins', pos: [0, 0], tier: 1,
      desc: 'The bailey lies open to the grey sky, its curtain walls fallen inward as though the keep had drawn breath and held it too long. Banners of bleached cloth, faded past identification, snag on crooked pikes. Near a half-collapsed lean-to, a fire has been banked under embers — recent, careful, watched. Bandits, then, and they know the value of not announcing themselves.',
      exits: { north: 'path_4', east: 'ruins_2', south: 'ruins_5' },
      enemies: ['bandit'],
      insp: [
        flavor('fire', 'Banked, recent. Bandits, then.'),
        reveal('barrel', 'A water barrel, hidden behind it: a small purse and a healing potion.', 'potion')
      ] }),

  R({ id: 'ruins_2', name: 'Collapsed Hall', area: 'surface_ruins', pos: [1, 0], tier: 1,
      desc: 'What was once the great hall now lies open to wind and crow, its roof beams rotted to splinters years ago and its floor mosaics worn to suggestion. Two bandits sprawl at the threshold, throats opened by a hand that took its time and made its work efficient. The killer left coin in the pouches and weapons in the sheaths — only the warning has been taken. Whoever does this works for someone who wants the bandits afraid, not poorer.',
      exits: { west: 'ruins_1', east: 'ruins_3', south: 'ruins_6' },
      items: ['silver_coin', 'silver_coin', 'ration'],
      insp: [
        flavor('bodies', 'Throats. Quick and quiet.'),
        reveal('crate', 'A locked crate, splintered open from the side. A scroll inside.', 'scroll_spark')
      ] }),

  R({ id: 'ruins_3', name: 'Watchtower Stairs', area: 'surface_ruins', pos: [2, 0], tier: 1,
      desc: 'A spiral of stair clings to the inside of a half-broken watchtower, each step lipped with moss and the patient damage of weather. At the top, where the roof should be, a young woman in dark leather sits cross-legged in the empty doorframe with the patience of a person who has waited longer than this. She cleans her dagger with a folded cloth, glances at you once, and does not bother to stand. Whatever she\'s seen of you, she has already decided about.',
      exits: { west: 'ruins_2', east: 'ruins_4', south: 'ruins_7' },
      npcs: ['ada_recruit'],
      insp: [
        flavor('view', 'From here you see the gate-tower. Their captain — Vex — is in there.')
      ] }),

  R({ id: 'ruins_4', name: 'Tower Top', area: 'surface_ruins', pos: [3, -1], tier: 1,
      desc: 'The tower opens to ragged sky and to all directions at once: the sunken forest behind you, the long bowl of the keep below, the silver thread of road that no caravan has used in three lifetimes. A bandit lookout slumps over the parapet, throat opened, his half-written warning letter still pinned beneath an arrowhead. The arrows lodged in the masonry are old, and new ones are lodged among them. The siege never quite ended; it only changed sides.',
      exits: { west: 'ruins_3', south: 'ruins_8' },
      items: ['gold_coin'],
      enemies: ['bandit_a'],
      insp: [
        gold('lookout', 'You search the body. A pouch, a half-written letter to no one, twelve silvers.', 60),
        flavor('parapet', 'Spent arrows in the masonry. The siege didn\'t end well for someone.')
      ] }),

  R({ id: 'ruins_5', name: 'Roofless Chapel', area: 'surface_ruins', pos: [0, 1], tier: 1,
      desc: 'A chapel that has lost its roof and most of its certainties. Three different orders\' marks have been carved over each other on the altar — the lion-and-key of old Quartzlight, the sun-and-spear of the Vesper rite, and beneath both a circle that no living priest would recognize. Each was defaced by the next, and then the defacer was defaced in turn. Someone has been here recently with a chisel, trying to put one of them back.',
      exits: { north: 'ruins_1', east: 'ruins_6' },
      items: ['potion', { id: 'silver_coin', hidden: true }],
      insp: [
        buff('icon', 'You re-bless what you can. The room hums faintly. (+1 mdef permanent.)', 'mdef', 1),
        flavor('altar', 'Three different gods\' marks here. None remembered.')
      ] }),

  R({ id: 'ruins_6', name: 'Bandit Stores', area: 'surface_ruins', pos: [1, 1], tier: 1,
      desc: 'A stone-walled storeroom turned cache, stuffed with sacks of grain and tallow, ironbound crates of mixed coin, and a few oddments still bearing the noble crests they were lifted from. The bandits had built themselves a thieves\' winter and then run out of winters. Tracks in the dust suggest they were ambushed mid-inventory; the ledger lies open, the last entry an unfinished line.',
      exits: { north: 'ruins_2', west: 'ruins_5', east: 'ruins_7', south: 'ruins_9' },
      items: ['ration', 'gold_coin'],
      enemies: ['goblin'],
      insp: [
        reveal('sack', 'A sack with a heavy clink — coins and a leather jerkin.', 'leather'),
        gold('crate', 'A crate of mixed coin: ten silver, three gold.', 75)
      ] }),

  R({ id: 'ruins_7', name: 'Bandit Barracks', area: 'surface_ruins', pos: [2, 1], tier: 1,
      desc: 'Cots lined under low arches, smouldering braziers, the smell of woodsmoke and unwashed leather. Three bandits lie dead in their armor — wounds clean, throats first, the kind of work a scout learns when a town stops being a town. Their dice are still on the table mid-game; one of them was winning. The kettle on the brazier has boiled dry, and the silence of the room is the silence after a held breath.',
      exits: { north: 'ruins_3', west: 'ruins_6', east: 'ruins_8', south: 'ruins_10' },
      enemies: ['bandit'],
      items: ['shortsword', { id: 'ration', hidden: true }],
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

  R({ id: 'ruins_9', name: 'Cellar of the Cursed Knight', area: 'surface_ruins', pos: [0, 2], tier: 2,
      desc: 'A cold cellar that smells of old iron and older grief. The bandits, sensibly, did not come down here. A figure in rusted plate stands motionless in the center, helmet bowed as if in prayer to a floor that has long since forgotten what shape a knight kneels in. The plate has fused to him — rust runs into the skin beneath the gorget and the skin gives no objection — and the inscription on the far wall names him as Sir Edrus, who would not surrender, and was not surrendered to.',
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
      desc: 'The gate-tower rises above the inner ward, its murder-holes still functional, its iron-banded door scarred by a hundred small assaults and one large one. A tall man in mottled leathers and dark chain stands before the door with the absolute stillness of a person who has done this many times. Three bandit archers wait behind him at the parapets, bows half-drawn. He looks you up and down and finds you unsurprising. "Lost?" he says, and the question is not a question.',
      clearedDesc: 'The gate-tower stands silent. Vex lies where he fell, beside his bandits and his unfinished words; the contract that paid him for this is still folded in his coat. The inner door is no longer barred. Beyond it, the path to Quartzlight is, for the first time in two years, open.',
      exits: { north: 'ruins_8', west: 'ruins_10', south: 'ql_gate' },
      enemies: ['boss_vex'],
      insp: [
        flavor('door', 'The inner door. The way down is on the other side of this man.')
      ] }),

  // ═══ Area 3: Quartzlight Outpost (4 rooms, hub) ═════════════════════════
  R({ id: 'ql_gate', name: 'Quartzlight Gate', area: 'quartzlight', pos: [0, 0], tier: 1,
      desc: 'A free outpost cut directly into the cliffside, its arches hewn from the same pale stone that gives the place its name. Quartz lanterns burn at every threshold without lamp-oil or tending, a courtesy of the cliff itself — locals will tell you the rock here remembers fire, and the fire returns the favor. You hear voices, and the steady ring of a hammer on iron, and somewhere a child laughing as if children have not yet been told what country they live in.',
      exits: { north: 'ruins_boss', east: 'ql_market', south: 'ql_inn' },
      save: 'outpost',
      insp: [
        lore('lamps', 'Quartz lanterns. Light without oil. The locals say the cliff itself remembers fire.', 'quartz_light'),
        flavor('walls', 'The walls have been mended a hundred times. They will be mended a hundred more.')
      ] }),

  R({ id: 'ql_market', name: 'Quartzlight Market', area: 'quartzlight', pos: [1, 0], tier: 1,
      desc: 'A market of three stalls and a corner table — modest enough to fit beneath a single carved overhang, generous enough to feel like a city in a country where cities have stopped happening. Pell the merchant stands at one stall, weighing things; Sage Oma at another, weighing words; the Wandering Bard sits at a corner table with a battered lyre and a half-cup of something brown, watching new arrivals the way an old soldier watches new arrivals. Above all three, a tapestry of the lions of Quartzlight, mended a hundred times, still weeps stitched tears.',
      exits: { west: 'ql_gate', east: 'lib_1', south: 'ql_smithyard' },
      save: 'outpost',
      npcs: ['merchant_pell', 'sage_oma', 'bard'],
      insp: [
        flavor('crystal', 'Sage Oma\'s focus crystal. Not for sale, she says — but you may borrow knowledge from it.'),
        flavor('bardsong', 'The bard sings the old songs. Crowns and traitors. The names are familiar.')
      ] }),

  R({ id: 'ql_inn', name: 'The Mended Hearth', area: 'quartzlight', pos: [0, 1], tier: 1,
      desc: 'A common room with three tables, two empty, and a fireplace that has been repaired with stones taken from the keep — patches of pale quartz set among older grey. Lin the innkeeper polishes a cup that did not need polishing and smiles in the way of a man who has not slept properly in a year and has decided to be cheerful about it anyway. The sign above the door, "The Mended Hearth," is itself a mended sign; you can still see the original name "The Lion-and-Crown" beneath the new paint, ghosting up through.',
      exits: { north: 'ql_gate' },
      save: 'outpost',
      npcs: ['inn_keeper'],
      insp: [
        message('kettle', 'Lin pours tea. It is hot and good.', 'You drink. (+5 HP, just this once.)')
      ] }),

  R({ id: 'ql_smithyard', name: 'Smithyard', area: 'quartzlight', pos: [1, 1], tier: 1,
      desc: 'Marn the smith works beneath an awning of patched canvas, his forge a small bellows-and-hearth affair set into a niche of the cliff. He hammers in the long, level rhythm of someone who is not in a hurry and never has been; this is not the impatient ring of a war smithy. Across from him, the Cartographer keeps a stall heaped with half-drawn maps — the spaces left blank are deliberate, he\'ll tell you, because they have to be earned by feet, and the feet have to come back.',
      exits: { north: 'ql_market' },
      save: 'outpost',
      npcs: ['ql_smith', 'cartographer'],
      insp: [
        flavor('forge', 'A small forge. Marn does not have ambition; he has work.'),
        flavor('maps', 'The Cartographer\'s maps are mostly empty. He waits for travelers to fill them.')
      ] }),

  // ═══ Area 4: Library Wing (14 rooms, tier 2, Custodian boss + cursed knight side) ═══
  R({ id: 'lib_1', name: 'Library Threshold', area: 'library_wing', pos: [0, 0], tier: 2,
      desc: 'Doors of black wood stand open before you, taller than two men and carved with binding sigils so dense the wood is almost mathematics. They were not opened — they were forced, and they were forced from the inside. The wards still smell faintly of ash and ink. Whatever was kept here was kept until it stopped being kept; what reads in a library now reads alone.',
      exits: { west: 'ql_market', east: 'lib_2', south: 'lib_10' },
      enemies: ['skeleton'],
      items: [{ id: 'mana_potion', hidden: true }],
      insp: [
        flavor('sigils', 'Wards. Broken. Whatever came through tore them apart from the inside.'),
        lore('mosaic', 'A mosaic of a sundered sky. You feel something shift.', 'the_sundering')
      ] }),

  R({ id: 'lib_2', name: 'Reading Hall', area: 'library_wing', pos: [1, 0], tier: 2,
      desc: 'Reading desks lie overturned, as though every scholar in the hall stood up at once and the chairs went with them. In the wreckage, a woman in spell-stained robes works methodically — Mira, the last of the librarians, reshelving books that should have burned, that did burn, and that have somehow survived their burning. She does not look up when you enter; she does not have the time. The bindings she sets on the shelves still smoke faintly, but the smoke is the cold kind, the kind that comes out of a thing that has remembered what it was.',
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
      desc: 'A small cloister with a stone bench worn shiny by generations of robed knees, and an icon defaced by hands that did not know what they were undoing. Brother Tomas kneels there, head bowed, hammer and chisel laid carefully beside him; he is not destroying the icon further, he is patiently restoring it, line by line. He does not look up at first. When he does, his eyes are tired in the specific way of a man who keeps the hours of dawn, of midday, of vesper, and has done so even after the order he kept them for ceased to exist.',
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
      desc: 'A long, low cell of black stone, the walls bristling with iron rings to which great chains are still bolted. The chains run inward and converge on a figure of moving ink and shifting plate — the Custodian, the library\'s old archivist made over into its old archivist\'s prison. It does not have a face, but it has a posture, and the posture is reading. Pages it has finished lie stacked behind it; the pages are blank now, the words consumed. It does not stop reading when you arrive. It merely turns one more page.',
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
      desc: 'A narrow chamber that belonged to someone who lived among books rather than visiting them — Catharine, the last head librarian, judging by the engravings on the small desk. The bed is made. The cup on the bedside table is full and the water in it has not evaporated, which is the kind of detail you notice once and try not to think about. On the desk, a journal is left open to its final entry: I will go down with the others.',
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
      items: [{ id: 'gold_coin', hidden: true }, { id: 'silver_coin', hidden: true }],
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

  R({ id: 'lib_12', name: 'East Annex', area: 'library_wing', pos: [4, -1], tier: 2,
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
      desc: 'A vaulted antechamber lined with stone sarcophagi, each carved with the family crest of a noble house that has not produced a living member in decades. Two of the lids have been broken open — pushed up from within, not pried from without, the difference written in the angle of the cracked stone. The dust on the floor remembers footprints leading out, and only out. Whatever was inside these is somewhere ahead of you now, and has been for a long time.',
      exits: { north: 'lib_13', east: 'crypt_2' },
      enemies: ['skeleton'],
      items: [{ id: 'ration', hidden: true }, { id: 'silver_coin', hidden: true }],
      insp: [
        flavor('lids', 'They were pushed up, not pulled. From inside.'),
        gold('sarcophagus', 'A sarcophagus, cracked: a few coins, an old ring.', 30)
      ] }),

  R({ id: 'crypt_2', name: 'Bone Hall', area: 'crypts', pos: [1, 0], tier: 2,
      desc: 'A long hall whose walls have been finished, floor to ceiling, in human bone — femurs ribbed into arches, skulls fitted into lattices like masonry that has been told it is masonry. The work is precise enough to feel devotional, and the latticework is still being added to: at the far end, a small alcove has been freshly bricked with vertebrae set carefully into mortar that has not finished setting. The dead, here, are being maintained.',
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
      items: [{ id: 'potion_g', hidden: true }],
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
      desc: 'A vast circular chamber, the ceiling lost to dark, the floor mosaic worn unreadable except for the suggestion of six small figures around a central seventh. At its center sits a woman composed entirely of bone — vertebrae for spine, small teeth for tears — weeping, and the tears that fall are not water but more bone, accreting in heaps around her hem. She does not stop weeping when you arrive. She has not stopped since the Sundering, when she lost her daughters to it, and she has been collecting whatever pieces of them the dark gives back.',
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
      items: [{ id: 'gold_coin', hidden: true }],
      insp: [
        damage('wall', 'You touch the wall by accident. It responds. (-2 HP)', 2, 'wall')
      ] }),

  R({ id: 'cata_3', name: 'Catacomb Shrine', area: 'catacombs', pos: [3, 0], tier: 3,
      desc: 'A shrine no larger than a closet, dedicated to the dead who never had names — paupers, foundlings, soldiers who fell where no one knew them. A single lamp burns above the altar, and its flame is blue and gives no heat; cup your hand near it and the cold deepens. A small bowl is set out for offerings, and recent ones lie in it: a copper coin, a button, a tooth.',
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
      items: ['gold_coin', { id: 'gem', hidden: true }],
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

  R({ id: 'cata_7', name: 'Forgotten Cell', area: 'catacombs', pos: [-1, 2], tier: 3,
      desc: 'A monk\'s cell, the door sealed from the outside with a brick-and-mortar job done in haste centuries ago. The body is still here, slumped against the inner wall, robes intact, posture peaceful — he chose to be sealed in, and chose not to make trouble of it. On the writing slab beside him, in a careful hand, is his last note: I would not flee. I do not regret. I do not forgive. The "not" in the third sentence has been pressed deeper than the others.',
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
      items: [{ id: 'potion_g', hidden: true }],
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
      desc: 'A cavern so vast its ceiling is not a ceiling but a darker shade of dark. The walls are ringed in bones of two kinds: the dead the catacombs were built for, and the bones of things that came to eat them, equally picked, equally arranged. A long shape stirs in the bone-litter at the far end of the chamber, longer than the chamber should permit, and you understand all at once that the Gravewyrm did not move in here after Quartzlight fell. The Gravewyrm was here first. The keep was built around it as a courtesy.',
      exits: { north: 'cata_11', south: 'cave_1' },
      enemies: ['boss_gravewyrm'],
      insp: [
        lore('wyrm', 'The Gravewyrm is older than the keep. It was here when the keep was built. It will be here after.', 'gravewyrm')
      ] }),

  // ═══ Area 7: Deepcaves (15 rooms, tier 3-4, Echo boss + Cave Tyrant miniboss + Kael recruit) ═══
  R({ id: 'cave_1', name: 'Cave Mouth', area: 'deepcaves', pos: [0, 0], tier: 3,
      desc: 'The worked stone of the catacombs gives way, without ceremony, to natural cavern — limestone teeth above, a soft luminous floor of pale moss below. Glowing spores drift through the air like slow, deliberate snow, settling on shoulders, hair, the corners of mouths. They are warm. They follow. They are also, very faintly, watching.',
      exits: { north: 'cata_boss', east: 'cave_2', south: 'cave_5' },
      insp: [
        flavor('spores', 'The spores are warm. They follow you.'),
        damage('spore', 'You inhale a spore. (-2 HP, but a small ringing in your ears.)', 2, 'spore')
      ] }),

  R({ id: 'cave_2', name: 'Cave Spring', area: 'deepcaves', pos: [1, 0], tier: 3,
      desc: 'A pool of warm, still water lit from below. Drinking it is dangerous. Resting nearby is restorative.',
      exits: { west: 'cave_1', east: 'cave_3', south: 'cave_6' },
      save: 'shrine',
      items: [{ id: 'ether', hidden: true }],
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

  R({ id: 'cave_4', name: 'Hunter\'s Camp', area: 'deepcaves', pos: [3, -1], tier: 3,
      desc: 'A camp set in a natural alcove where three cave passages meet — strategic, defensible, easily abandoned. Kael the Hunter sits at its center with his bow across his knees and the patience of a man who has buried half his clan and is not done yet. A small smokeless fire (he knows the trick) heats a kettle of stew. Notches mark the wall behind him in groups of seven, each set scored over by a single diagonal line.',
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
      items: [{ id: 'mana_potion', hidden: true }],
      insp: [
        flavor('cold', 'The cold is from below, not above.')
      ] }),

  R({ id: 'cave_6', name: 'Mushroom Hall', area: 'deepcaves', pos: [1, 1], tier: 3,
      desc: 'A long hall under a ceiling of bioluminescent fungi. Beautiful, in its way.',
      exits: { north: 'cave_2', west: 'cave_5', east: 'cave_7', south: 'cave_10' },
      enemies: ['centipede'],
      items: [{ id: 'antidote', hidden: true }],
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

  R({ id: 'cave_9', name: 'Tyrant\'s Lair', area: 'deepcaves', pos: [-1, 2], tier: 4,
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
      items: ['gem', { id: 'diamond', hidden: true }],
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
      desc: 'A black pool fills the floor of a high natural chapel, its surface so still it appears solid until your boots\' echoes ring it into ripples. From the pool rises a shape that is almost yours — the same height, the same posture, the same small habitual tilt of the head — but its features are a blur where features should be, an absence in the shape of intention. The Echo of the Deep has been remembering every visitor who entered this cavern for two thousand years, and the weight of that remembering shows in the way it moves.',
      exits: { north: 'cave_14', south: 'forge_1' },
      enemies: ['boss_echo'],
      insp: [
        lore('pool', 'The Echo of the Deep is the part of the keep that remembers everyone who entered. It is tired of remembering.', 'echo_of_deep')
      ] }),

  // ═══ Area 8: Forge Hold (8 rooms, tier 4, Forsaken Smith boss + Iron Twins miniboss + Garrick) ═══
  R({ id: 'forge_1', name: 'Forge Gate', area: 'forge_hold', pos: [0, 0], tier: 4,
      desc: 'A great iron gate, dwarf-built and dwarf-proud, stands half-open before you. It is the kind of door that was designed to never need to open at all — its bolts could have held against an army, and once did, for six gates of the original seven. Beyond, the smell that hits you is the smell of cold smoke and old iron, the smell of a workshop where the last hammer fell mid-blow and the heat has been waiting ever since for someone to come back.',
      exits: { north: 'cave_boss', east: 'forge_2', south: 'forge_3' },
      save: 'outpost',
      insp: [
        flavor('gate', 'The gate is dwarven work. It would have held against an army. It did, once.'),
        lore('inscription', 'Inscription: "The Hold endures." The inscription is recent.', 'forge_hold_history')
      ] }),

  R({ id: 'forge_2', name: 'Hall of Anvils', area: 'forge_hold', pos: [1, 0], tier: 4,
      desc: 'A long hall where, on a working day, every smith of Forge Hold once stood at his own anvil and the air rang with seven hundred hammers in seven hundred slightly different times. The anvils are still here, arranged in their disciplined rows; they are warm to the touch and have been warm for seven hundred years, refusing the cold the way good iron refuses anything. Bellows hang motionless above each one. The hold did not go quiet because it stopped caring. It went quiet because the only smiths left are the ones who cannot tell living from forging.',
      exits: { west: 'forge_1', east: 'forge_4', south: 'forge_5' },
      enemies: ['forge_remnant'],
      items: ['gold_coin', { id: 'ether', hidden: true }],
      insp: [
        flavor('anvils', 'The anvils are warm. They have not been cold in seven hundred years.'),
        gold('toolbox', 'A toolbox kicked under a workbench: small change.', 35)
      ] }),

  R({ id: 'forge_3', name: 'Garrick\'s Chamber', area: 'forge_hold', pos: [0, 1], tier: 4,
      desc: 'A small room with a low ceiling and a single oil lamp, half-converted into a barracks of one. A man in heavy iron-clad plate — Garrick the Reaver, last of the gate-wardens — sits at a table set for two and eats slowly, methodically, the way a man eats who knows he will eat alone tomorrow as well. He does not stop chewing when you enter. The second place at the table has not been cleared in years; the cup is dust, the plate is dust, the chair is exactly the angle it was pushed back to.',
      exits: { north: 'forge_1', east: 'forge_5' },
      npcs: ['garrick_recruit', 'forge_innkeeper'],
      save: 'outpost',
      items: [{ id: 'gold_coin', hidden: true }],
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
      items: [{ id: 'mana_potion', hidden: true }],
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
      desc: 'The Forge-Master\'s great forge, the heart of Forge Hold and the largest workspace ever cut from this rock. At its center stands a single anvil the size of a horse — and standing before it, hammer eternally raised, the Forsaken Smith waits. He is the Forge-Master, and he is the anvil, and he is the hammer too. He would not finish his last commission while the hold fell around him, so the hold made sure his last commission would not finish him. He has been about to strike for seven hundred years. The strike is for you.',
      exits: { north: 'forge_7', south: 'vault_1' },
      enemies: ['boss_smith'],
      insp: [
        flavor('anvil', 'The anvil is the size of a horse. It is also him, somehow.'),
        lore('smith', 'The Forge-Master would not finish his last work. So his last work would not finish him.', 'forsaken_smith')
      ] }),

  // ═══ Area 9: Vault Complex (12 rooms, tier 4-5, Vault Sentinel boss + Vault Wraith miniboss) ═══
  R({ id: 'vault_1', name: 'Vault Threshold', area: 'vault_complex', pos: [0, 0], tier: 4,
      desc: 'A round antechamber, its walls ringed in carved reliefs of impossibly tall figures bearing crowns. The crowns sit awkwardly on the figures, because the figures are not human; the carvings have been re-cut over much older reliefs, the original lines still visible at the edges where the human reworking failed to fully overwrite the shapes beneath. Whatever the Vault remembers, it does not remember being built by Quartzlight.',
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
      items: ['gem', { id: 'gem', hidden: true }],
      enemies: ['vault_w'],
      insp: [
        reveal('case', 'A case still sealed: a fine gem.', 'gem'),
        damage('case2', 'You force a sealed case. Glass shards bite. (-4 HP)', 4, 'glass')
      ] }),

  R({ id: 'vault_6', name: 'Crowns of the Dead', area: 'vault_complex', pos: [2, 1], tier: 5,
      desc: 'A long hall of black velvet plinths, each crowned with — a crown. Some are gold, some bronze, some quartz wired with starless wire; each is labeled with the name of the king or queen it last sat on, and most of the names are forgotten beyond record. A few labels are shockingly recent. Try one on, the room seems to suggest. None of them, the room knows, would fit anyone alive.',
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
      desc: 'A long hall of full-length silver mirrors set in pairs facing each other, an infinity built into the architecture. The mirrors do not show you. They show a version of the hall that is dustier, or cleaner, or burning, or perfect, and through that version a figure that walks at your pace but never quite at your bearing. The longer you look, the more committed the figure becomes to its difference from you.',
      exits: { north: 'vault_6', west: 'vault_8', east: 'vault_10', south: 'vault_11' },
      enemies: ['shadow'],
      items: [{ id: 'mirror_shard', hidden: true }],
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
      desc: 'The deepest hall of the Vault complex, its ceiling lost in dark, its floor inlaid with concentric circles of pale metal. At the exact center stands the Vault Sentinel — a figure as tall as two men, plate seamless, eyes covered, hands resting on a sword whose tip touches the floor in a way that suggests it has not moved in centuries. It does not breathe, and it will not breathe; it merely persists. It will continue to persist until something makes persisting impossible.',
      exits: { north: 'vault_10', west: 'vault_11', south: 'throne_1' },
      enemies: ['boss_sentinel'],
      insp: [
        flavor('sentinel', 'The Sentinel does not breathe. It will not stop being still until you make it.')
      ] }),

  // ═══ Area 10: Throne Quarter (9 rooms, tier 5, Lich boss) ═══
  R({ id: 'throne_1', name: 'Throne Approach', area: 'throne_quarter', pos: [0, 0], tier: 5,
      desc: 'A long carpet runs from the entry inward — what was once court-red, faded now to the color of dried blood and dust. Banners hang in tatters from the high beams, their devices reduced to fragmentary heraldry: half a lion here, a single crowned cipher there. Generations of courtiers walked this carpet to be admitted; generations of supplicants knelt at its end and waited to be acknowledged. None of them, it turns out, were ever quite acknowledged enough.',
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
      desc: 'A long working chamber, the tables of cracked glass and obsidian, the air faintly sweet with the chemistry of preservation. Shelves climb the walls, every jar labeled in a meticulous hand and every jar containing something that once belonged to someone: an eye still tracking, a heart still ticking, a hand still curled around a coin it would not release in life. The diagrams chalked across one wall describe a process for binding souls to crystal lattices; the diagrams have been refined, refined again, and refined a third time, the final version annotated me — done.',
      exits: { west: 'throne_2', east: 'throne_4', south: 'throne_7' },
      items: ['phylactery', 'potion_g'],
      insp: [
        lore('diagram', 'The diagrams describe the Lich. He has been working on himself for a long time.', 'lich_history'),
        damage('jar', 'You knock over a jar. Something leaks. (-4 HP)', 4, 'unguent'),
        reveal('shelf', 'A shelf hides a mana crystal.', 'mana_crystal')
      ] }),

  R({ id: 'throne_4', name: 'Lich\'s Sanctum', area: 'throne_quarter', pos: [3, 0], tier: 5,
      desc: 'A great circle of standing stones, set into the floor in a pattern that has nothing to do with the room\'s geometry — the stones align with stars, but the stars they align with are the stars of a sky no astronomer alive could verify. The Lich stands at the circle\'s center, robed in dark cloth that holds shape without a body to hold, hood lifted just enough to find you. The face beneath is not gone. It is simply the face of someone who has been deciding, for two hundred years, not to die yet.',
      exits: { west: 'throne_3', south: 'throne_8' },
      enemies: ['boss_lich'],
      insp: [
        lore('stones', 'The stones are aligned with stars that no longer exist.', 'lich_history')
      ] }),

  R({ id: 'throne_5', name: 'Servants\' Wing', area: 'throne_quarter', pos: [0, 1], tier: 5,
      desc: 'Dormitories for those who once kept the throne quarter. The beds are made.',
      exits: { north: 'throne_1', east: 'throne_6' },
      items: ['ration', 'potion', { id: 'gold_coin', hidden: true }],
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
      desc: 'The throne itself, halved by some impossibly precise cut — the right arm and seat sheared away cleanly, the left arm and back still standing. A figure sits in what remains, leaning to compensate, wearing crown and robes and the unmistakable mass of a king who has not, technically, stopped reigning. He did not flee when the Sundering came. He sat. He is sitting still, in the loose sense of the word "still."',
      exits: { north: 'throne_6' },
      enemies: ['royal_rev'],
      items: ['throne_blade'],
      insp: [
        lore('throne', 'The king did not flee. He sat. He is sitting still, in a way.', 'old_kings')
      ] }),

  // ═══ Area 11: Hidden Sanctum (7 rooms, tier 6 postgame, Worldbreaker boss + Whispering One miniboss) ═══
  R({ id: 'sanctum_1', name: 'Beneath the Throne', area: 'hidden_sanctum', pos: [0, 0], tier: 6,
      desc: 'The bottom of the descent, where the descent finally agrees to be a floor. The dark here is older than the keep, older than the kingdom, older than the convention of dark being something light can leave; it is the dark a thing settles into when it has decided to wait the surface out. Your torch flickers but does not quite go out — the dark is not, yet, interested in you.',
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
      items: [{ id: 'mana_crystal', hidden: true }, { id: 'phoenix_pearl', hidden: true }],
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
      desc: 'A small cell carved into the rock by hands that did not have tools, only patience. The Hermit sits cross-legged at its center, robed in something that was once cloth, eyes the gentle grey of polished slate. He has lived in this cell since before the keep above was built, and his only company has been the tally marks on the walls; the marks are uncountable, and grouped in sevens, and the wall has been tallied in layers, the older marks faded almost to suggestion beneath the newer.',
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
      desc: 'A vast hall, perfectly circular, its walls fused glass-smooth from some long-ago heat that no recorded furnace could have produced. At its center is the Worldbreaker — and the Worldbreaker is older than the Lich, older than the keep, older than the convention of naming. It was the Worldbreaker who made the world, the texts say, and it has spent the time since deciding whether the work was worth keeping. It has not yet decided. Your arrival, whether you like it or not, is now part of the decision.',
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
