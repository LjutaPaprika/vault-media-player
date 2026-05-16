import type { Item, ItemId } from './types'

export const ITEMS: Record<ItemId, Item> = {
  // ── Tools ────────────────────────────────────────────────────────────────
  torch:        { id: 'torch', name: 'Torch', desc: 'A pitch-soaked torch. 5 charges.', category: 'tool' },
  pickaxe:      { id: 'pickaxe', name: 'Iron Pickaxe', desc: 'Clears cave-ins.', category: 'tool' },
  holy_water:   { id: 'holy_water', name: 'Holy Water', desc: 'Sealed crypt doors recoil from this.', category: 'tool' },
  rope:         { id: 'rope', name: 'Coiled Rope', desc: 'Useful where the floor isn\'t.', category: 'tool' },
  lantern_oil:  { id: 'lantern_oil', name: 'Lantern Oil', desc: 'Refills torch +5 charges.', category: 'tool' },

  // ── Weapons ──────────────────────────────────────────────────────────────
  fists:        { id: 'fists', name: 'Bare Fists', desc: 'Last resort.', category: 'weapon', atk: 0 },
  dagger:       { id: 'dagger', name: 'Rusted Dagger', desc: 'Better than nothing.', category: 'weapon', atk: 2, speed: 1 },
  shortsword:   { id: 'shortsword', name: 'Shortsword', desc: 'Balanced and quick.', category: 'weapon', atk: 4 },
  iron_sword:   { id: 'iron_sword', name: 'Iron Sword', desc: 'A worn but reliable blade.', category: 'weapon', atk: 6 },
  steel_sword:  { id: 'steel_sword', name: 'Steel Sword', desc: 'Bright steel, fine edge.', category: 'weapon', atk: 9 },
  warhammer:    { id: 'warhammer', name: 'Steel Warhammer', desc: 'Heavy, brutal.', category: 'weapon', atk: 11, speed: -1 },
  runeblade:    { id: 'runeblade', name: 'Runeblade', desc: 'Glyphs hum with cold power.', category: 'weapon', atk: 14, matk: 4 },
  longbow:      { id: 'longbow', name: 'Longbow', desc: 'Reach. Precision.', category: 'weapon', atk: 8, speed: 2 },

  // ── Armor ────────────────────────────────────────────────────────────────
  leather:      { id: 'leather', name: 'Leather Armor', desc: 'Cracked but serviceable.', category: 'armor', def: 2 },
  chain:        { id: 'chain', name: 'Chain Mail', desc: 'Tight rings of dark iron.', category: 'armor', def: 5, speed: -1 },
  plate:        { id: 'plate', name: 'Plate Mail', desc: 'Heavy plates of blackened steel.', category: 'armor', def: 9, speed: -2 },

  // ── Accessories ──────────────────────────────────────────────────────────
  ring_vigor:   { id: 'ring_vigor', name: 'Ring of Vigor', desc: 'Pulses warm.', category: 'accessory', maxHp: 15 },
  amulet_swift: { id: 'amulet_swift', name: 'Amulet of Swiftness', desc: 'Light as breath.', category: 'accessory', speed: 3 },

  // ── Catalysts ────────────────────────────────────────────────────────────
  app_wand:     { id: 'app_wand', name: 'Apprentice Wand', desc: 'A simple focus.', category: 'catalyst', matk: 2 },
  oak_staff:    { id: 'oak_staff', name: 'Oak Staff', desc: 'Carved with sigils.', category: 'catalyst', matk: 4, maxMp: 5 },
  crystal_orb:  { id: 'crystal_orb', name: 'Crystal Orb', desc: 'Stars wheel inside.', category: 'catalyst', matk: 6, mpRegen: 1 },
  phylactery:   { id: 'phylactery', name: 'Lich\'s Phylactery', desc: 'Cold radiates from inside. Channel through it at your peril.', category: 'catalyst', matk: 10, maxMp: 20 },

  // ── Consumables ──────────────────────────────────────────────────────────
  potion:       { id: 'potion', name: 'Minor Potion', desc: 'Restores 15 HP.', category: 'consumable', heal: 15 },
  potion_g:     { id: 'potion_g', name: 'Greater Potion', desc: 'Restores 40 HP.', category: 'consumable', heal: 40 },
  ration:       { id: 'ration', name: 'Ration', desc: 'Hardtack. Restores 8 HP.', category: 'consumable', heal: 8 },
  mana_potion:  { id: 'mana_potion', name: 'Mana Potion', desc: 'Restores 30 MP.', category: 'consumable', healMp: 30 },
  mana_crystal: { id: 'mana_crystal', name: 'Mana Crystal', desc: 'Fully restores MP.', category: 'consumable', healMp: 9999 },
  ether:        { id: 'ether', name: 'Ether', desc: 'Restores 15 MP.', category: 'consumable', healMp: 15 },
  antidote:     { id: 'antidote', name: 'Antidote', desc: 'Cures poison.', category: 'consumable', cureStatus: ['poison'] },
  phoenix_pearl:{ id: 'phoenix_pearl', name: 'Phoenix Pearl', desc: 'Revives a fallen ally at full HP.', category: 'consumable' },

  // ── Keys ─────────────────────────────────────────────────────────────────
  brass_key:    { id: 'brass_key', name: 'Brass Key', desc: 'Royal crest.', category: 'key' },
  ornate_key:   { id: 'ornate_key', name: 'Ornate Key', desc: 'Cold filigreed silver.', category: 'key' },
  vault_key:    { id: 'vault_key', name: 'Vault Key', desc: 'Crystal. Hums.', category: 'key' },
  forge_key:    { id: 'forge_key', name: 'Forge Key', desc: 'Heavy iron.', category: 'key' },
  crypt_seal:   { id: 'crypt_seal', name: 'Crypt Seal', desc: 'A bone disc, warm.', category: 'key' },
  sanctum_key:  { id: 'sanctum_key', name: 'Sanctum Key', desc: 'A shard of dead star.', category: 'key' },

  // ── Boss drops & quest gear ──────────────────────────────────────────────
  wyrm_fang:     { id: 'wyrm_fang', name: 'Gravewyrm Fang', desc: 'Bone, etched with curses.', category: 'weapon', atk: 12, matk: 3 },
  mirror_shard:  { id: 'mirror_shard', name: 'Mirror Shard', desc: 'Cuts the air, not your fingers.', category: 'accessory', mdef: 6 },
  forge_axe:     { id: 'forge_axe', name: 'Forge-Master Axe', desc: 'Black iron, warm.', category: 'weapon', atk: 13 },
  aegis_plate:   { id: 'aegis_plate', name: 'Aegis Plate', desc: 'Plate of the last guardian.', category: 'armor', def: 12, mdef: 4 },
  throne_blade:  { id: 'throne_blade', name: 'Throne Blade', desc: 'Blade of a forgotten king.', category: 'weapon', atk: 15 },
  bone_amulet:   { id: 'bone_amulet', name: 'Bone Amulet', desc: 'Mother\'s grief, set in silver.', category: 'accessory', maxHp: 25, mdef: 3 },
  worldshard:    { id: 'worldshard', name: 'Worldshard', desc: 'A piece of something that did not break cleanly.', category: 'accessory', atk: 4, matk: 4, mdef: 4, maxMp: 10 },
  cracked_horn:  { id: 'cracked_horn', name: 'Cracked War-Horn', desc: 'Sounds for the dead. They hear.', category: 'tool' },
  cathar_ring:   { id: 'cathar_ring', name: 'Catharine\'s Ring', desc: 'A silver band engraved with a name.', category: 'accessory', speed: 2, maxMp: 5 },

  // ── Treasure (currency) ──────────────────────────────────────────────────
  silver_coin:  { id: 'silver_coin', name: 'Silver Coin', desc: 'Tarnished silver.', category: 'treasure', gold: 5 },
  gold_coin:    { id: 'gold_coin', name: 'Gold Coin', desc: 'Surprisingly heavy.', category: 'treasure', gold: 25 },
  gem:          { id: 'gem', name: 'Cut Gem', desc: 'Flawless red.', category: 'treasure', gold: 50 },
  diamond:      { id: 'diamond', name: 'Star Diamond', desc: 'A captured galaxy.', category: 'treasure', gold: 200 },
  crown:        { id: 'crown', name: 'Royal Crown', desc: 'Heavy with old, old grief. Not for sale.', category: 'treasure' },

  // ── Lore ─────────────────────────────────────────────────────────────────
  scroll_lore:  { id: 'scroll_lore', name: 'Tattered Scroll', desc: 'Read it.', category: 'lore', text: '"...the Lich rises when the moon swallows the gate..."' },
  journal:      { id: 'journal', name: 'Royal Journal', desc: 'A noble\'s last entries.', category: 'lore', text: '"Day 47. The lower halls fell tonight..."' },
  codex:        { id: 'codex', name: 'Codex of Whispers', desc: 'Bound in something pale.', category: 'lore', text: '"...by ornate key the antechamber opens..."' },

  // ── Spell Scrolls (consumed on read) ─────────────────────────────────────
  scroll_spark:    { id: 'scroll_spark', name: 'Scroll of Spark', desc: 'A spell scroll.', category: 'scroll', teachesSpell: 'spark' },
  scroll_mend:     { id: 'scroll_mend', name: 'Scroll of Mend', desc: 'A spell scroll.', category: 'scroll', teachesSpell: 'mend' },
  scroll_fireball: { id: 'scroll_fireball', name: 'Scroll of Fireball', desc: 'A spell scroll.', category: 'scroll', teachesSpell: 'fireball' }
}

export function itemName(id: ItemId): string {
  return ITEMS[id]?.name ?? id
}

export function itemGoldValue(id: ItemId): number {
  return ITEMS[id]?.gold ?? 0
}
