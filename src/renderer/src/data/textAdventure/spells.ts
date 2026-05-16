import type { Spell, SpellId, ActiveEffect } from './types'

function mkEffect(kind: ActiveEffect['kind'], magnitude: number, remaining: number, source: string): ActiveEffect {
  return { id: `${kind}_${Math.random().toString(36).slice(2, 8)}`, kind, magnitude, remaining, source }
}

export const SPELLS: Record<SpellId, Spell> = {
  spark: {
    id: 'spark', name: 'Spark', mpCost: 3, target: 'singleEnemy', power: 8,
    description: '8 magic damage, single target.',
    apply(caster, target) {
      const dmg = Math.max(1, this.power + Math.floor(caster.matk * 0.5) - Math.floor(target.mdef * 0.4))
      target.hp -= dmg
      return [`${caster.name} casts Spark on ${target.name} for ${dmg} damage.`]
    }
  },
  mend: {
    id: 'mend', name: 'Mend', mpCost: 5, target: 'singleAlly', power: 15,
    description: 'Heal 15 HP, single ally.',
    apply(caster, target) {
      const amt = Math.min(target.maxHp - target.hp, this.power + Math.floor(caster.matk * 0.4))
      target.hp += amt
      return [`${caster.name} casts Mend on ${target.name} (+${amt} HP).`]
    }
  },
  aura: {
    id: 'aura', name: 'Aura', mpCost: 4, target: 'allAllies', power: 20,
    description: '+20% atk all allies, 3 turns.',
    apply(caster, target) {
      target.buffs.push(mkEffect('atkUp', this.power, 3, caster.id))
      return [`${target.name} is bolstered by Aura.`]
    }
  },
  frost: {
    id: 'frost', name: 'Frost', mpCost: 6, target: 'singleEnemy', power: 12,
    description: '12 dmg + slow 2 turns.',
    apply(caster, target) {
      const dmg = Math.max(1, this.power + Math.floor(caster.matk * 0.5) - Math.floor(target.mdef * 0.4))
      target.hp -= dmg
      target.debuffs.push(mkEffect('speedDown', 30, 2, caster.id))
      return [`${caster.name} casts Frost on ${target.name} for ${dmg} damage. ${target.name} is chilled.`]
    }
  },
  shock: {
    id: 'shock', name: 'Shock', mpCost: 5, target: 'singleEnemy', power: 10,
    description: '10 dmg, 25% stun.',
    apply(caster, target) {
      const dmg = Math.max(1, this.power + Math.floor(caster.matk * 0.5) - Math.floor(target.mdef * 0.4))
      target.hp -= dmg
      const lines = [`${caster.name} casts Shock on ${target.name} for ${dmg} damage.`]
      if (Math.random() < 0.25) {
        target.debuffs.push(mkEffect('stun', 1, 1, caster.id))
        lines.push(`${target.name} is stunned!`)
      }
      return lines
    }
  },
  fireball: {
    id: 'fireball', name: 'Fireball', mpCost: 8, target: 'allEnemies', power: 20,
    description: '20 magic damage, all enemies.',
    apply(caster, target) {
      const dmg = Math.max(1, this.power + Math.floor(caster.matk * 0.5) - Math.floor(target.mdef * 0.4))
      target.hp -= dmg
      return [`Fireball engulfs ${target.name} for ${dmg} damage.`]
    }
  },
  drain: {
    id: 'drain', name: 'Drain', mpCost: 7, target: 'singleEnemy', power: 12,
    description: '12 dmg, heal caster half.',
    apply(caster, target) {
      const dmg = Math.max(1, this.power + Math.floor(caster.matk * 0.5) - Math.floor(target.mdef * 0.4))
      target.hp -= dmg
      const heal = Math.floor(dmg / 2)
      caster.hp = Math.min(caster.maxHp, caster.hp + heal)
      return [`${caster.name} drains ${target.name} for ${dmg} (+${heal} HP returned).`]
    }
  },
  shield: {
    id: 'shield', name: 'Shield', mpCost: 4, target: 'singleAlly', power: 50,
    description: '+50% def 3 turns.',
    apply(caster, target) {
      target.buffs.push(mkEffect('defUp', this.power, 3, caster.id))
      return [`${target.name} is shielded.`]
    }
  },
  silence: {
    id: 'silence', name: 'Silence', mpCost: 5, target: 'singleEnemy', power: 1,
    description: 'Prevents casting 2 turns.',
    apply(caster, target) {
      target.debuffs.push(mkEffect('silence', 1, 2, caster.id))
      return [`${target.name} is silenced.`]
    }
  },
  mass_heal: {
    id: 'mass_heal', name: 'Mass Heal', mpCost: 15, target: 'allAllies', power: 12,
    description: 'Heal 12 HP all allies.',
    apply(caster, target) {
      const amt = Math.min(target.maxHp - target.hp, this.power + Math.floor(caster.matk * 0.3))
      target.hp += amt
      return [`${target.name} recovers ${amt} HP from Mass Heal.`]
    }
  },
  inferno: {
    id: 'inferno', name: 'Inferno', mpCost: 20, target: 'allEnemies', power: 35,
    description: '35 magic damage all enemies.',
    apply(caster, target) {
      const dmg = Math.max(1, this.power + Math.floor(caster.matk * 0.6) - Math.floor(target.mdef * 0.3))
      target.hp -= dmg
      return [`Inferno scorches ${target.name} for ${dmg} damage.`]
    }
  },
  resurrect: {
    id: 'resurrect', name: 'Resurrect', mpCost: 25, target: 'fallenAlly', power: 50,
    description: 'Revive fallen ally @ 50% HP.',
    apply(caster, target) {
      target.alive = true
      target.hp = Math.floor(target.maxHp * 0.5)
      return [`${target.name} rises again, restored.`]
    }
  }
}

export function spellName(id: SpellId): string {
  return SPELLS[id]?.name ?? id
}
