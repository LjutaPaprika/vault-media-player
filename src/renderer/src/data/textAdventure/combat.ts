import type {
  Combatant, Enemy, Player, PartyMember, ActiveEffect, CombatContext, TurnEntry,
  Side, ItemId
} from './types'
import { ITEMS } from './items'
import { SPELLS } from './spells'
import { ENEMY_ABILITIES } from './enemies'

// ── Stat application (gear + buffs/debuffs) ─────────────────────────────────

function gearOf(c: Player | PartyMember): ItemId[] {
  return Object.values(c.equipment).filter((x): x is ItemId => !!x)
}

export function effectiveAtk(c: Combatant): number {
  const base = c.atk + (isPartyOrPlayer(c) ? gearOf(c).reduce((s, id) => s + (ITEMS[id]?.atk ?? 0), 0) : 0)
  return applyMod(base, c.buffs, 'atkUp', +1) - applyMod(0, c.debuffs, 'atkDown', +1)
}
export function effectiveDef(c: Combatant): number {
  const base = c.def + (isPartyOrPlayer(c) ? gearOf(c).reduce((s, id) => s + (ITEMS[id]?.def ?? 0), 0) : 0)
  return applyMod(base, c.buffs, 'defUp', +1) - applyMod(0, c.debuffs, 'defDown', +1)
}
export function effectiveSpeed(c: Combatant): number {
  const base = c.speed + (isPartyOrPlayer(c) ? gearOf(c).reduce((s, id) => s + (ITEMS[id]?.speed ?? 0), 0) : 0)
  return applyMod(base, c.buffs, 'speedUp', +1) - applyMod(0, c.debuffs, 'speedDown', +1)
}
export function effectiveMatk(c: Combatant): number {
  const base = c.matk + (isPartyOrPlayer(c) ? gearOf(c).reduce((s, id) => s + (ITEMS[id]?.matk ?? 0), 0) : 0)
  return base
}
export function effectiveMdef(c: Combatant): number {
  const base = c.mdef + (isPartyOrPlayer(c) ? gearOf(c).reduce((s, id) => s + (ITEMS[id]?.mdef ?? 0), 0) : 0)
  return base
}

function isPartyOrPlayer(c: Combatant): c is Player | PartyMember {
  return (c as Player | PartyMember).equipment !== undefined
}

function applyMod(base: number, effects: ActiveEffect[], kind: ActiveEffect['kind'], sign: 1 | -1): number {
  let total = base
  for (const e of effects) if (e.kind === kind) total += sign * Math.floor((base || 1) * (e.magnitude / 100))
  return total
}

export function isStunned(c: Combatant): boolean {
  return c.debuffs.some(e => e.kind === 'stun')
}
export function isSilenced(c: Combatant): boolean {
  return c.debuffs.some(e => e.kind === 'silence')
}

// ── Turn order ──────────────────────────────────────────────────────────────

export function rollInitiative(party: (Player | PartyMember)[], enemies: Enemy[]): TurnEntry[] {
  const entries: TurnEntry[] = []
  for (const p of party) if (p.alive) entries.push({ combatantId: p.id, side: 'party', initiative: effectiveSpeed(p) + Math.floor(Math.random() * 6) + 1 })
  for (const e of enemies) if (e.alive) entries.push({ combatantId: e.id, side: 'enemy', initiative: effectiveSpeed(e) + Math.floor(Math.random() * 6) + 1 })
  entries.sort((a, b) => b.initiative - a.initiative)
  return entries
}

// ── End-of-round tick ───────────────────────────────────────────────────────

export function tickEffects(c: Combatant, log: (l: string) => void): void {
  const next: ActiveEffect[] = []
  for (const e of c.buffs) {
    if (e.kind === 'regen') {
      const amt = Math.min(c.maxHp - c.hp, e.magnitude)
      c.hp += amt
      if (amt > 0) log(`${c.name} regenerates ${amt} HP.`)
    }
    e.remaining -= 1
    if (e.remaining > 0) next.push(e)
  }
  c.buffs = next
  const dnext: ActiveEffect[] = []
  for (const e of c.debuffs) {
    if (e.kind === 'poison') {
      const dmg = e.magnitude
      c.hp -= dmg
      log(`${c.name} suffers ${dmg} poison damage.`)
    }
    e.remaining -= 1
    if (e.remaining > 0) dnext.push(e)
  }
  c.debuffs = dnext
}

// ── Damage ──────────────────────────────────────────────────────────────────

export function physDamage(attacker: Combatant, defender: Combatant): number {
  const atk = effectiveAtk(attacker)
  const def = effectiveDef(defender)
  return Math.max(1, atk - def + Math.floor(Math.random() * 3) - 1)
}

// ── Flee formula (party-aware) ──────────────────────────────────────────────

export function fleeChance(party: (Player | PartyMember)[], enemies: Enemy[], randomEncounter = false): number {
  const allies = party.filter(p => p.alive)
  const foes = enemies.filter(e => e.alive)
  if (!allies.length) return 0
  if (!foes.length) return 1
  const partySpeed = avg(allies.map(a => effectiveSpeed(a)))
  const enemySpeed = avg(foes.map(e => effectiveSpeed(e)))
  const partyHpPct = avg(allies.map(a => a.hp / a.maxHp))
  const enemyHpPct = avg(foes.map(e => e.hp / e.maxHp))
  const baseChance = 0.30 + (partySpeed - enemySpeed) * 0.04
  const hpFactor = (partyHpPct - enemyHpPct) * 0.30
  let chance = baseChance + hpFactor
  if (randomEncounter) chance *= 1.5
  return Math.max(0.05, Math.min(0.95, chance))
}

function avg(xs: number[]): number {
  if (!xs.length) return 0
  return xs.reduce((a, b) => a + b, 0) / xs.length
}

// ── Enemy AI ────────────────────────────────────────────────────────────────

export function takeEnemyTurn(e: Enemy, ctx: CombatContext): string[] {
  if (!e.alive) return []
  if (isStunned(e)) return [`${e.name} is stunned.`]

  const allies = ctx.party.filter(p => p.alive)
  if (!allies.length) return []

  const lines: string[] = []

  switch (e.ai) {
    case 'aggressive': {
      const target = allies.reduce((a, b) => a.hp < b.hp ? a : b)
      const dmg = physDamage(e, target)
      target.hp -= dmg
      lines.push(`${e.name} strikes ${target.name} for ${dmg}.`)
      break
    }
    case 'cautious': {
      if (e.hp / e.maxHp < 0.30) {
        e.buffs.push({ id: 'def_self', kind: 'defUp', magnitude: 50, remaining: 1, source: e.id })
        lines.push(`${e.name} braces, raising guard.`)
        break
      }
      const target = allies[Math.floor(Math.random() * allies.length)]
      const dmg = physDamage(e, target)
      target.hp -= dmg
      lines.push(`${e.name} attacks ${target.name} for ${dmg}.`)
      break
    }
    case 'caster': {
      // Try abilities in order; fall back to attack if no MP / silenced
      if (!isSilenced(e)) {
        for (const abilityId of e.abilities) {
          const ability = ENEMY_ABILITIES[abilityId]
          if (!ability) continue
          const out = ability(e, ctx)
          if (out.length) { lines.push(...out); return lines }
        }
      }
      const target = allies[0]
      const dmg = physDamage(e, target)
      target.hp -= dmg
      lines.push(`${e.name} lashes out at ${target.name} for ${dmg}.`)
      break
    }
    case 'thief': {
      // 35% chance to steal once
      const stolen = !!e.stolenFrom?.length
      if (!stolen && Math.random() < 0.35) {
        const target = allies[Math.floor(Math.random() * allies.length)]
        if ('gold' in target && (target as Player).gold && (target as Player).gold > 0) {
          const taken = Math.min((target as Player).gold, 10 + Math.floor(Math.random() * 15))
          ;(target as Player).gold -= taken
          e.stolenFrom = [...(e.stolenFrom ?? []), { gold: taken, ownerId: target.id }]
          lines.push(`${e.name} snatches ${taken} gold from ${target.name} and skitters back!`)
          return lines
        }
        if (target.id === ctx.party[0].id && (target as Player).inventory?.length) {
          const inv = (target as Player).inventory
          const idx = Math.floor(Math.random() * inv.length)
          const itemId = inv[idx]
          inv.splice(idx, 1)
          e.stolenFrom = [...(e.stolenFrom ?? []), { itemId, ownerId: target.id }]
          lines.push(`${e.name} pockets your ${ITEMS[itemId]?.name ?? itemId}!`)
          return lines
        }
      }
      const target = allies.reduce((a, b) => a.hp < b.hp ? a : b)
      const dmg = physDamage(e, target)
      target.hp -= dmg
      lines.push(`${e.name} stabs ${target.name} for ${dmg}.`)
      break
    }
    case 'tank': {
      // Apply a debuff occasionally instead of damage
      if (Math.random() < 0.4 && e.abilities.length) {
        const abilityId = e.abilities[Math.floor(Math.random() * e.abilities.length)]
        const ability = ENEMY_ABILITIES[abilityId]
        if (ability) {
          const out = ability(e, ctx)
          if (out.length) { lines.push(...out); return lines }
        }
      }
      const target = allies[Math.floor(Math.random() * allies.length)]
      const dmg = physDamage(e, target)
      target.hp -= dmg
      lines.push(`${e.name} crushes ${target.name} for ${dmg}.`)
      break
    }
  }
  return lines
}

// ── Party AI tactics ────────────────────────────────────────────────────────

export type PartyAction =
  | { kind: 'attack'; targetId: string }
  | { kind: 'cast'; spellId: string; targetId: string }
  | { kind: 'defend' }

export function decidePartyAction(actor: PartyMember, ctx: CombatContext): PartyAction {
  const enemies = ctx.enemies.filter(e => e.alive)
  const allies = ctx.party.filter(p => p.alive)
  if (!enemies.length) return { kind: 'defend' }
  if (isSilenced(actor)) return attackBest(actor, enemies)

  if (actor.tactics === 'defend') return { kind: 'defend' }
  if (actor.tactics === 'attack') return attackBest(actor, enemies)

  switch (actor.class) {
    case 'cleric': {
      const wounded = allies.find(a => a.hp / a.maxHp < 0.4)
      if (wounded && actor.knownSpells.includes('mend') && actor.mp >= 5)
        return { kind: 'cast', spellId: 'mend', targetId: wounded.id }
      if (allies.length >= 2 && allies.some(a => a.hp / a.maxHp < 0.6) && actor.knownSpells.includes('mass_heal') && actor.mp >= 15)
        return { kind: 'cast', spellId: 'mass_heal', targetId: actor.id }
      return attackBest(actor, enemies)
    }
    case 'mage': {
      if (enemies.length >= 2 && actor.knownSpells.includes('fireball') && actor.mp >= 8)
        return { kind: 'cast', spellId: 'fireball', targetId: enemies[0].id }
      const single = actor.knownSpells.find(s => ['spark', 'frost', 'shock'].includes(s))
      if (single && actor.mp >= SPELLS[single].mpCost) {
        const t = enemies.reduce((a, b) => a.hp < b.hp ? a : b)
        return { kind: 'cast', spellId: single, targetId: t.id }
      }
      return attackBest(actor, enemies)
    }
    case 'thief': {
      const t = enemies.reduce((a, b) => a.hp < b.hp ? a : b)
      return { kind: 'attack', targetId: t.id }
    }
    case 'fighter': {
      const tank = enemies.find(e => e.ai === 'tank') ?? enemies[0]
      return { kind: 'attack', targetId: tank.id }
    }
    case 'archer': {
      const caster = enemies.find(e => e.ai === 'caster')
      if (caster) return { kind: 'attack', targetId: caster.id }
      const t = enemies.reduce((a, b) => a.hp < b.hp ? a : b)
      return { kind: 'attack', targetId: t.id }
    }
    default:
      return attackBest(actor, enemies)
  }
}

function attackBest(_actor: Combatant, enemies: Enemy[]): PartyAction {
  const t = enemies.reduce((a, b) => a.hp < b.hp ? a : b)
  return { kind: 'attack', targetId: t.id }
}
