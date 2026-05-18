import type { Item, ItemId } from './types'

export const ITEMS: Record<ItemId, Item> = {
  // ── Tools ────────────────────────────────────────────────────────────────
  torch:        { id: 'torch', name: 'Torch', desc: 'A pitch-soaked torch in a wrought iron sleeve. Burns for five charges; smells of resin and old fear.', category: 'tool' },
  pickaxe:      { id: 'pickaxe', name: 'Iron Pickaxe', desc: 'A miner\'s pick from before the fall. Heavy enough to clear a cave-in; well-balanced enough to be regretted by anyone who walks into your swing.', category: 'tool' },
  holy_water:   { id: 'holy_water', name: 'Holy Water', desc: 'A vial of water blessed under three orders — Quartzlight\'s old rite, the Vesper sun-and-spear, and a third sigil no living priest will name. Sealed crypt doors recoil from it.', category: 'tool' },
  rope:         { id: 'rope', name: 'Coiled Rope', desc: 'Forty feet of dwarf-hemp, the kind that holds when the floor decides not to. Frayed at one end; you do not ask why the other end is missing.', category: 'tool' },
  lantern_oil:  { id: 'lantern_oil', name: 'Lantern Oil', desc: 'A small clay flask of refined whale oil. Refills a torch by five charges. The label, faded, still reads "Quartzlight Chandlery — by appointment to the crown."', category: 'tool' },

  // ── Weapons ──────────────────────────────────────────────────────────────
  fists:        { id: 'fists', name: 'Bare Fists', desc: 'Last resort. Useful for reminding yourself you are not yet entirely disarmed.', category: 'weapon', atk: 0 },
  dagger:       { id: 'dagger', name: 'Rusted Dagger', desc: 'A pitted blade with a wire-wrapped hilt. The pommel is stamped with a crest worn too smooth to read. Better than nothing — most things in here are not.', category: 'weapon', atk: 2, speed: 1 },
  shortsword:   { id: 'shortsword', name: 'Shortsword', desc: 'A militia-issue blade, balanced and quick, made for fights too close to swing the long one. The maker\'s mark on the tang reads simply M, Forge Hold.', category: 'weapon', atk: 4 },
  iron_sword:   { id: 'iron_sword', name: 'Iron Sword', desc: 'A worn but reliable blade, the kind that comes down through a household and outlives the household. Notched along one edge; whoever sharpened it last understood what they were sharpening it against.', category: 'weapon', atk: 6 },
  steel_sword:  { id: 'steel_sword', name: 'Steel Sword', desc: 'Bright Forge-Hold steel, the edge folded back on itself a hundred and twenty times. It does not sing, the way the bards claim; it hums, which is worse.', category: 'weapon', atk: 9 },
  warhammer:    { id: 'warhammer', name: 'Steel Warhammer', desc: 'A two-handed dwarvish maul, head the size of a child\'s skull and heavier. It does not finesse. It does not need to.', category: 'weapon', atk: 11, speed: -1 },
  runeblade:    { id: 'runeblade', name: 'Runeblade', desc: 'A sword whose fuller is cut with cold-binding glyphs. The glyphs hum when the blade is drawn, and the temperature in your hand drops by degrees. It remembers what it has cut.', category: 'weapon', atk: 14, matk: 4 },
  longbow:      { id: 'longbow', name: 'Longbow', desc: 'A yew bow strung with sinew that has not slacked in a decade. Reach. Precision. The arrow nock smells faintly of Kael\'s pine-pitch wax.', category: 'weapon', atk: 8, speed: 2 },

  // ── Armor ────────────────────────────────────────────────────────────────
  leather:      { id: 'leather', name: 'Leather Armor', desc: 'Hardened leather over a linen gambeson. Cracked at the shoulders, but the stitching has been redone by someone who knew their work.', category: 'armor', def: 2 },
  chain:        { id: 'chain', name: 'Chain Mail', desc: 'Tight rings of dark Forge-Hold iron, riveted not butted, the kind of mail that costs a year\'s wage and saves a year of life.', category: 'armor', def: 5, speed: -1 },
  plate:        { id: 'plate', name: 'Plate Mail', desc: 'Heavy plates of blackened steel, articulated at the joints by craft that has not been seen since the fall. It moves with you, and remembers, and is heavy.', category: 'armor', def: 9, speed: -2 },

  // ── Accessories ──────────────────────────────────────────────────────────
  ring_vigor:   { id: 'ring_vigor', name: 'Ring of Vigor', desc: 'A copper-and-brass band that pulses warm against the skin even in this cold. The inner surface is engraved with the word "endure" in a hand that does not seem to have been a person\'s.', category: 'accessory', maxHp: 15 },
  amulet_swift: { id: 'amulet_swift', name: 'Amulet of Swiftness', desc: 'A pendant of feather-pale stone that weighs less than it should — light as breath, the merchants say, and they are not wrong in any literal sense.', category: 'accessory', speed: 3 },

  // ── Catalysts ────────────────────────────────────────────────────────────
  app_wand:     { id: 'app_wand', name: 'Apprentice Wand', desc: 'A simple yew rod fitted with a small focusing crystal. The kind of catalyst a young scholar of the library was issued on the day they were first allowed to read aloud.', category: 'catalyst', matk: 2 },
  oak_staff:    { id: 'oak_staff', name: 'Oak Staff', desc: 'A staff of polished oak, carved its full length with binding sigils. The Custodian carried it once, and the wood remembers — when you cast through it, the air briefly smells of ink.', category: 'catalyst', matk: 4, maxMp: 5 },
  crystal_orb:  { id: 'crystal_orb', name: 'Crystal Orb', desc: 'A sphere of perfectly clear quartz the size of a fist. Stars wheel inside it that do not match the constellations of any sky an astronomer would attest to.', category: 'catalyst', matk: 6, mpRegen: 1 },
  phylactery:   { id: 'phylactery', name: 'Lich\'s Phylactery', desc: 'A small obsidian flask, cold to the point of frost-burn, with the Lich\'s own soul shut inside it in a thin lattice of crystal. Channel through it at your peril; the Lich is still in there, taking notes.', category: 'catalyst', matk: 10, maxMp: 20 },

  // ── Consumables ──────────────────────────────────────────────────────────
  potion:       { id: 'potion', name: 'Minor Potion', desc: 'A vial of red, faintly bitter physic from the Mended Hearth\'s back kitchen. Restores 15 HP and tastes of cloves.', category: 'consumable', heal: 15 },
  potion_g:     { id: 'potion_g', name: 'Greater Potion', desc: 'A heavier physic, twice the bitterness and twice the work. Restores 40 HP. The taste lingers, and so does the warmth.', category: 'consumable', heal: 40 },
  ration:       { id: 'ration', name: 'Ration', desc: 'A square of hardtack and a strip of dried sausage. Restores 8 HP. The hardtack outlives empires and intends to outlive you.', category: 'consumable', heal: 8 },
  mana_potion:  { id: 'mana_potion', name: 'Mana Potion', desc: 'A vial of pale blue suspension that tastes of pine resin and starlight. Restores 30 MP and leaves a clarity behind it that is almost worth the headache.', category: 'consumable', healMp: 30 },
  mana_crystal: { id: 'mana_crystal', name: 'Mana Crystal', desc: 'A shard of pure quartz still humming with one of the cliff\'s old lamp-charges. Hold it to your forehead. Fully restores MP, and briefly, the world goes very quiet.', category: 'consumable', healMp: 9999 },
  ether:        { id: 'ether', name: 'Ether', desc: 'A small flask of clear vapor under cork. Restores 15 MP. Inhaling the cork is, as the alchemists put it, "discouraged but informative."', category: 'consumable', healMp: 15 },
  antidote:     { id: 'antidote', name: 'Antidote', desc: 'A milky tincture in a black glass vial. Cures poison. Brother Tomas keeps a few of these on his belt; he refuses to say where the recipe came from.', category: 'consumable', cureStatus: ['poison'] },
  phoenix_pearl:{ id: 'phoenix_pearl', name: 'Phoenix Pearl', desc: 'A pearl of unaccountable warmth, faintly luminous. Crush it in the hand of a fallen companion and they wake at full strength, with an expression you will not forget.', category: 'consumable' },

  // ── Keys ─────────────────────────────────────────────────────────────────
  brass_key:    { id: 'brass_key', name: 'Brass Key', desc: 'A heavy brass key stamped with the royal crest of Quartzlight. Opens nothing important and several things that are.', category: 'key' },
  ornate_key:   { id: 'ornate_key', name: 'Ornate Key', desc: 'A key of cold, filigreed silver, the bow worked into a tiny circle of crowns. Library Wing, judging by the bit.', category: 'key' },
  vault_key:    { id: 'vault_key', name: 'Vault Key', desc: 'A key cut from a single piece of pale quartz, humming faintly at the same pitch as Quartzlight\'s lamps.', category: 'key' },
  forge_key:    { id: 'forge_key', name: 'Forge Key', desc: 'Heavy iron, dwarvish-cut, the teeth deeper and stranger than any human lockmaker would think to specify.', category: 'key' },
  crypt_seal:   { id: 'crypt_seal', name: 'Crypt Seal', desc: 'A bone disc, warm to the touch, the surface scored with the seven names of the Mother\'s daughters. The Warden carries the duplicate; this is the one that opens.', category: 'key' },
  sanctum_key:  { id: 'sanctum_key', name: 'Sanctum Key', desc: 'A shard of what looks like glass but does not behave like it — a piece of a star that, according to the codex, finished dying before the keep was built.', category: 'key' },

  // ── Boss drops & quest gear ──────────────────────────────────────────────
  wyrm_fang:     { id: 'wyrm_fang', name: 'Gravewyrm Fang', desc: 'A fang the length of your forearm, bone-white and engraved with curses the wyrm wrote into itself over centuries. The curses are still active. The fang is still hungry.', category: 'weapon', atk: 12, matk: 3 },
  mirror_shard:  { id: 'mirror_shard', name: 'Mirror Shard', desc: 'A triangular sliver of the Vault\'s mirror, edge sharp enough to slice the air but not your fingers. Reflects what was almost true.', category: 'accessory', mdef: 6 },
  forge_axe:     { id: 'forge_axe', name: 'Forge-Master Axe', desc: 'The axe the Forsaken Smith would have finished, if the work had been allowed to end. Black iron, warm to the touch — the Forge-Master\'s last fire has not gone out of it.', category: 'weapon', atk: 13 },
  aegis_plate:   { id: 'aegis_plate', name: 'Aegis Plate', desc: 'Plate of the last guardian of the Hidden Sanctum, designed against blows the world no longer remembers needing to defend against. It is heavier than its weight.', category: 'armor', def: 12, mdef: 4 },
  throne_blade:  { id: 'throne_blade', name: 'Throne Blade', desc: 'A long blade with a crowned pommel, carried by a king who would not stand up when the world ended. The grip still fits a hand that has stopped insisting on being a hand.', category: 'weapon', atk: 15 },
  bone_amulet:   { id: 'bone_amulet', name: 'Bone Amulet', desc: 'A polished disk of femur set in silver, given by the Mother of Bones to whichever of her daughters\' bones returned home last. Her grief is set into it like a charge.', category: 'accessory', maxHp: 25, mdef: 3 },
  worldshard:    { id: 'worldshard', name: 'Worldshard', desc: 'A jagged piece of something that did not break cleanly — a part of the world, the codex hints, that the Worldbreaker tore off before the rest could be torn off too. It thinks it should be more than this.', category: 'accessory', atk: 4, matk: 4, mdef: 4, maxMp: 10 },
  cracked_horn:  { id: 'cracked_horn', name: 'Cracked War-Horn', desc: 'A war-horn split lengthwise but not severed, still capable of one short note. The note is not for the living. The dead, however, are extraordinarily attentive.', category: 'tool' },
  cathar_ring:   { id: 'cathar_ring', name: 'Catharine\'s Ring', desc: 'A simple silver band engraved on the inside with a single name — Catharine, the last librarian, who chose to go down with the others. Wearing it is a small honor and a small responsibility.', category: 'accessory', speed: 2, maxMp: 5 },

  // ── Treasure (currency) ──────────────────────────────────────────────────
  silver_coin:  { id: 'silver_coin', name: 'Silver Coin', desc: 'A tarnished silver penny stamped with the lions of Quartzlight. Still legal tender at the Mended Hearth, by long courtesy.', category: 'treasure', gold: 5 },
  gold_coin:    { id: 'gold_coin', name: 'Gold Coin', desc: 'A surprisingly heavy gold half-mark, the king\'s profile worn nearly anonymous. The Vault is still paying it.', category: 'treasure', gold: 25 },
  gem:          { id: 'gem', name: 'Cut Gem', desc: 'A flawless red garnet, cabochon, no inclusions a jeweler would admit to. Sells for 50 gold; means rather more than that to the right kind of buyer.', category: 'treasure', gold: 50 },
  diamond:      { id: 'diamond', name: 'Star Diamond', desc: 'A stone the size of a knuckle, perfectly clear, with what appears to be a captured galaxy slowly turning inside it. Pell will pay for it. He will also ask, quietly, where you found it.', category: 'treasure', gold: 200 },
  crown:        { id: 'crown', name: 'Royal Crown', desc: 'A crown of plain Quartz-set gold, heavy with grief older than the wearer. Not for sale. Not for wearing. Not, you understand the moment it is in your hand, for keeping.', category: 'treasure' },

  // ── Lore ─────────────────────────────────────────────────────────────────
  scroll_lore:  { id: 'scroll_lore', name: 'Tattered Scroll', desc: 'A scrap of vellum, the ink faded to brown.', category: 'lore', text: '"...the Lich rises when the moon swallows the gate, and the gate has been swallowed since before the gate was a gate. He waits in the Sanctum that is not the Sanctum, behind the door that opens only inward..."' },
  journal:      { id: 'journal', name: 'Royal Journal', desc: 'A small bound book in fine court hand.', category: 'lore', text: '"Day 47. The lower halls fell tonight. We could hear the singing through the floor — they sing what we used to sing, and badly. We are sealing the stairwell. Catharine and I have agreed that the library must not be lost. We will go down with it. — C., last steward."' },
  codex:        { id: 'codex', name: 'Codex of Whispers', desc: 'A heavy book bound in something pale.', category: 'lore', text: '"...by ornate key the antechamber opens; by crypt-seal the deep gates; by quartz-key the vault; and last, by the shard of a dead star, the place that should never be opened, opens. Whoever reads this and goes there: do not say I did not write it down."' },

  // ── Spell Scrolls (consumed on read) ─────────────────────────────────────
  scroll_spark:    { id: 'scroll_spark', name: 'Scroll of Spark', desc: 'A spell scroll. The rune of Spark trembles faintly on the page, as if eager to be read.', category: 'scroll', teachesSpell: 'spark' },
  scroll_mend:     { id: 'scroll_mend', name: 'Scroll of Mend', desc: 'A spell scroll in Tomas\'s neat copyist hand. The rune of Mend is set into the page as if it were stitched.', category: 'scroll', teachesSpell: 'mend' },
  scroll_fireball: { id: 'scroll_fireball', name: 'Scroll of Fireball', desc: 'A spell scroll, the parchment lightly scorched at the edges. The rune of Fireball is already warm to the touch.', category: 'scroll', teachesSpell: 'fireball' }
}

export function itemName(id: ItemId): string {
  return ITEMS[id]?.name ?? id
}

export function itemGoldValue(id: ItemId): number {
  return ITEMS[id]?.gold ?? 0
}
