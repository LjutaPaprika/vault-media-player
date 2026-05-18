import { useEffect, useRef, useState } from 'react'
import styles from './TextDungeon.module.css'
import type {
  Player, PartyMember, Enemy, Room, RoomId, Direction, ItemId,
  TurnEntry, CombatContext, ActiveEffect, Inspectable, Corpse
} from '../data/textAdventure/types'
import { ITEMS, itemGoldValue } from '../data/textAdventure/items'
import { SPELLS } from '../data/textAdventure/spells'
import { ENEMY_TEMPLATES } from '../data/textAdventure/enemies'
import { CHARACTERS, makePartyMember } from '../data/textAdventure/characters'
import { NPCS } from '../data/textAdventure/npcs'
import { makeRooms, STARTING_ROOM } from '../data/textAdventure/rooms'
import { AREAS } from '../data/textAdventure/areas'
import {
  effectiveAtk, effectiveDef, effectiveSpeed, effectiveMatk,
  isStunned, isSilenced, rollInitiative, tickEffects, physDamage,
  fleeChance, takeEnemyTurn, decidePartyAction
} from '../data/textAdventure/combat'
import { renderAreaMap, gridToText, visitedAreas } from '../data/textAdventure/map'
import type { MapGrid } from '../data/textAdventure/map'

const SAVE_KEY = 'textDungeonSave_v2'
const LEGACY_KEY = 'textDungeonBest' // wiped on first new-version load

// ── Helpers ────────────────────────────────────────────────────────────────

function makePlayer(): Player {
  return {
    id: 'player',
    name: 'You',
    class: 'wanderer',
    hp: 35, maxHp: 35,
    mp: 10, maxMp: 10,
    atk: 6, def: 2,
    matk: 2, mdef: 2,
    speed: 10,
    buffs: [], debuffs: [],
    alive: true,
    gold: 50,
    inventory: [],
    equipment: { weapon: null, armor: null, accessory: null, catalyst: null },
    knownSpells: [],
    room: STARTING_ROOM,
    visitedRooms: new Set([STARTING_ROOM]),
    discoveredExits: new Set(),
    hasTorch: false,
    torchCharges: 0,
    killed: 0,
    loreUnlocked: new Set()
  }
}

interface CombatState {
  active: boolean
  enemies: Enemy[]
  order: TurnEntry[]
  turnIndex: number
  round: number
  pendingPlayerInput: boolean
  randomEncounter: boolean
}

interface UiState {
  log: string[]
  showMap: boolean
  mapArea: string | null
  shopOpen: string | null // npc id
}

const DIR_ALIAS: Record<string, Direction> = {
  n: 'north', north: 'north', s: 'south', south: 'south',
  e: 'east', east: 'east', w: 'west', west: 'west',
  u: 'up', up: 'up', d: 'down', down: 'down'
}

const HELP_LINES = [
  'Movement:  go <dir> · n/s/e/w · up · down',
  'Examine:   look · inspect <thing> · examine <thing> · search',
  'Items:     take <item> · drop <item> · use <item> · equip <item> · read <item>',
  'Magic:     cast <spell> [on <target>] · spells · learn',
  'Combat:    attack [target] · flee · status · party',
  'NPCs:      talk <npc> · trade · buy <item> · sell <item> · rest',
  'Tactics:   tactics <member> <auto|attack|defend>',
  'World:     inventory/inv · gold · map · save · load · help'
]

const INTRO = [
  '╔═══════════════════════════════════════════════╗',
  '║  THE FALLEN KEEP — A Text Adventure           ║',
  '╚═══════════════════════════════════════════════╝',
  '',
  'You stand at the threshold of an abandoned realm.',
  'Whatever felled it three centuries ago still stirs below.',
  '',
  'Type "help" for commands. "map" to see the area.'
]

// ── Component ──────────────────────────────────────────────────────────────

interface TextDungeonProps {
  onNewBest?: (score: number) => void
}

export default function TextDungeon(_props: TextDungeonProps): JSX.Element {
  const [log, setLog] = useState<string[]>(INTRO)
  const [input, setInput] = useState('')
  const [player, setPlayer] = useState<Player>(() => makePlayer())
  const [party, setParty] = useState<PartyMember[]>([])
  const [rooms, setRooms] = useState<Record<RoomId, Room>>(() => makeRooms())
  const [combat, setCombat] = useState<CombatState>({ active: false, enemies: [], order: [], turnIndex: 0, round: 0, pendingPlayerInput: false, randomEncounter: false })
  const [gameOver, setGameOver] = useState<'dead' | 'won' | null>(null)
  const [showMap, setShowMap] = useState(true)
  const [shopOpen, setShopOpen] = useState<string | null>(null)

  const logEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const initRef = useRef(false)

  // ── Lifecycle: load + intro
  useEffect(() => {
    if (initRef.current) return
    initRef.current = true
    // Wipe legacy key
    window.api.settings.set(LEGACY_KEY, '').catch(() => { /* ignore */ })
    window.api.settings.get(SAVE_KEY, '').then(v => {
      if (v) {
        appendLog('A previous save exists. Type "load" to resume, or any command to begin anew.')
      }
      setTimeout(() => describeRoom(player, rooms), 0)
    })
  }, [])

  useEffect(() => { logEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [log])

  // ── Logging ──
  function appendLog(...lines: string[]): void { setLog(prev => [...prev, ...lines]) }

  // ── State helpers ──
  function clonePlayer(p: Player): Player {
    return { ...p,
      buffs: [...p.buffs], debuffs: [...p.debuffs],
      inventory: [...p.inventory],
      equipment: { ...p.equipment },
      knownSpells: [...p.knownSpells],
      visitedRooms: new Set(p.visitedRooms),
      discoveredExits: new Set(p.discoveredExits),
      loreUnlocked: new Set(p.loreUnlocked)
    }
  }
  function cloneParty(ps: PartyMember[]): PartyMember[] {
    return ps.map(m => ({ ...m,
      buffs: [...m.buffs], debuffs: [...m.debuffs],
      inventory: [...m.inventory],
      equipment: { ...m.equipment },
      knownSpells: [...m.knownSpells]
    }))
  }
  function cloneRooms(r: Record<RoomId, Room>): Record<RoomId, Room> {
    const out: Record<RoomId, Room> = {}
    for (const k of Object.keys(r)) {
      const src = r[k]
      out[k] = { ...src,
        exits: { ...src.exits },
        enemies: [...src.enemies],
        items: src.items.map(i => ({ ...i })),
        npcs: [...src.npcs],
        inspectables: src.inspectables.map(i => ({ ...i })),
        corpses: src.corpses ? src.corpses.map(c => ({ ...c, droppedItems: [...c.droppedItems] })) : []
      }
    }
    return out
  }

  // ── Describe ──
  function describeRoom(p: Player, r: Record<RoomId, Room>): void {
    const room = r[p.room]
    const lines: string[] = []
    const area = AREAS[room.area]?.name ?? room.area
    lines.push(`── ${room.name}  (${area}) ──`)

    if (room.isDark && !p.hasTorch) {
      lines.push('Pitch black. You can see nothing without a light source.')
      lines.push('Exits: ???')
      lines.push('')
      appendLog(...lines)
      return
    }

    const isFirst = !room.visited
    const desc = room.cleared && room.clearedDesc ? room.clearedDesc : room.longDesc
    lines.push(desc)
    if (room.flavor && isFirst) lines.push(`  — ${room.flavor}`)

    if (room.items.length) {
      const visible = room.items.filter(i => !i.hidden).map(i => ITEMS[i.id]?.name ?? i.id)
      if (visible.length) lines.push(`You see: ${visible.join(', ')}.`)
    }
    if (room.corpses && room.corpses.length) {
      for (const c of room.corpses) {
        const dropped = c.droppedItems.map(id => ITEMS[id]?.name ?? id).join(', ')
        lines.push(`The body of ${c.name} lies here${dropped ? `, with: ${dropped}` : ''}.`)
      }
    }
    if (room.npcs.length) {
      const names = room.npcs.map(id => NPCS[id]?.name ?? id).join(', ')
      lines.push(`Here: ${names}.`)
    }
    if (room.enemies.length && !room.cleared) {
      const names = room.enemies.map(id => ENEMY_TEMPLATES[id]?.().name ?? id).join(', ')
      lines.push(`⚔  ${names} — hostile.`)
    }

    const exitParts: string[] = []
    for (const [dir, tgt] of Object.entries(room.exits)) {
      const lock = typeof tgt === 'object' ? tgt : null
      if (lock) {
        const lockedTxt = lock.itemRequired ? ` (locked: ${ITEMS[lock.itemRequired]?.name ?? lock.itemRequired})` : ' (locked)'
        exitParts.push(`${dir}${lockedTxt}`)
      } else {
        exitParts.push(dir)
      }
    }
    lines.push(`Exits: ${exitParts.join(', ') || 'none'}.`)
    if (room.saveType !== 'none') lines.push(`(${room.saveType === 'shrine' ? 'Shrine' : 'Outpost'} — type "save" to save your progress.)`)
    lines.push('')
    appendLog(...lines)
  }

  // ── Movement ──
  function tryMove(p: Player, r: Record<RoomId, Room>, ps: PartyMember[], dir: Direction): boolean {
    const room = r[p.room]
    if (combat.active) { appendLog('You are in combat. "flee" or "attack".', ''); return false }
    if (room.enemies.length && !room.cleared) {
      // Trigger combat
      startCombat(p, r, ps, room, false)
      return true
    }
    const target = room.exits[dir]
    if (!target) { appendLog(`You can't go ${dir}.`, ''); return false }
    let nextId: RoomId
    if (typeof target === 'string') nextId = target
    else {
      if (target.itemRequired && !p.inventory.includes(target.itemRequired)) {
        appendLog(`The way ${dir} is locked. You need: ${ITEMS[target.itemRequired]?.name ?? target.itemRequired}.`, '')
        return false
      }
      nextId = target.to
      appendLog(`You unlock the way ${dir}.`)
    }

    p.room = nextId
    const wasVisited = p.visitedRooms.has(nextId)
    if (!wasVisited) p.visitedRooms.add(nextId)
    p.discoveredExits.add(`${room.id}:${dir}`)
    r[nextId].visited = true

    // MP regen on room change
    p.mp = Math.min(p.maxMp, p.mp + 1)
    for (const m of ps) m.mp = Math.min(m.maxMp, m.mp + 1)

    // Dark room torch consumption
    if (r[nextId].isDark && p.hasTorch) {
      p.torchCharges -= 1
      if (p.torchCharges <= 0) {
        p.hasTorch = false
        const idx = p.inventory.indexOf('torch')
        if (idx >= 0) p.inventory.splice(idx, 1)
        appendLog('Your torch sputters out.')
      } else {
        appendLog(`(Torch: ${p.torchCharges} charges left.)`)
      }
    }

    // Random encounter on cleared room re-entry (12%)
    if (wasVisited && r[nextId].cleared && Math.random() < 0.12) {
      // Spawn 1-2 area-tier enemies
      const area = r[nextId].area
      const tierMin = AREAS[area]?.tierRange[0] ?? 1
      const pool = Object.values(ENEMY_TEMPLATES).map(f => f()).filter(e => e.tier === tierMin && !e.isBoss)
      if (pool.length) {
        const count = 1 + Math.floor(Math.random() * 2)
        const picks: Enemy[] = []
        for (let i = 0; i < count; i++) picks.push(pool[Math.floor(Math.random() * pool.length)])
        appendLog('Something stirs in the shadows...')
        startCombat(p, r, ps, r[nextId], true, picks)
        setPlayer(p); setRooms(r); setParty(ps)
        return true
      }
    }

    setPlayer(p); setRooms(r); setParty(ps)
    // Auto-save when entering a shrine or outpost
    if (r[nextId].saveType !== 'none') {
      saveGame(p, ps, r)
      appendLog('(Progress auto-saved.)')
    }
    describeRoom(p, r)
    return true
  }

  // ── Inspect framework ──
  function doInspect(p: Player, r: Record<RoomId, Room>, ps: PartyMember[], target: string): void {
    const room = r[p.room]
    const insp = room.inspectables.find(i => i.target === target.toLowerCase())
    if (!insp) {
      // Fallback: maybe it's an item description
      const itemId = resolveItem(target, [...p.inventory, ...room.items.map(i => i.id)])
      if (itemId) { appendLog(`${ITEMS[itemId].name}: ${ITEMS[itemId].desc}`, ''); return }
      appendLog(`There is no "${target}" to inspect here.`, '')
      return
    }
    if (insp.oneTime && insp.triggered) {
      appendLog(insp.description, '(You\'ve already taken what was here.)', '')
      return
    }
    if (insp.guard?.itemRequired && !p.inventory.includes(insp.guard.itemRequired)) {
      appendLog(`You need ${ITEMS[insp.guard.itemRequired]?.name ?? insp.guard.itemRequired} to make sense of this.`, '')
      return
    }
    if (insp.guard?.spellRequired && !p.knownSpells.includes(insp.guard.spellRequired)) {
      appendLog(`You sense the resonance of an unknown art. (Spell required.)`, '')
      return
    }

    appendLog(insp.description)
    applyInspectEffect(insp, p, r, ps, room.id)
    if (insp.oneTime) insp.triggered = true
    appendLog('')
    setPlayer(p); setRooms(r); setParty(ps)
  }

  function applyInspectEffect(insp: Inspectable, p: Player, r: Record<RoomId, Room>, _ps: PartyMember[], roomId: RoomId): void {
    const e = insp.effect
    switch (e.kind) {
      case 'flavor': break
      case 'message': appendLog(e.text); break
      case 'gold': p.gold += e.amount; appendLog(`(+${e.amount} gold)`); break
      case 'damage':
        p.hp = Math.max(0, p.hp - e.amount)
        appendLog(`(-${e.amount} HP from ${e.source})`)
        if (p.hp <= 0) finishGame(p, 'dead')
        break
      case 'revealItem':
        r[roomId].items.push({ id: e.itemId })
        appendLog(`You find: ${ITEMS[e.itemId]?.name ?? e.itemId}.`)
        break
      case 'revealExit':
        r[roomId].exits[e.dir] = e.toRoom
        appendLog(`A new way ${e.dir} is revealed.`)
        break
      case 'learnSpell':
        if (!p.knownSpells.includes(e.spellId)) {
          p.knownSpells.push(e.spellId)
          appendLog(`You learn ${SPELLS[e.spellId]?.name ?? e.spellId}!`)
        } else appendLog(`(You already know this spell.)`)
        break
      case 'permaBuff': {
        const stat = e.stat as keyof Player
        ;(p[stat] as number) = ((p[stat] as number) ?? 0) + e.magnitude
        if (stat === 'maxHp') p.hp += e.magnitude
        if (stat === 'maxMp') p.mp += e.magnitude
        appendLog(`(+${e.magnitude} ${stat}, permanent)`)
        break
      }
      case 'permaDebuff': {
        const stat = e.stat as keyof Player
        ;(p[stat] as number) = Math.max(0, ((p[stat] as number) ?? 0) - e.magnitude)
        appendLog(`(-${e.magnitude} ${stat})`)
        break
      }
      case 'lore':
        if (!p.loreUnlocked.has(e.entryId)) {
          p.loreUnlocked.add(e.entryId)
          appendLog(`(Lore unlocked: "${e.entryId}")`)
        }
        break
      case 'statusEffect':
        p.debuffs.push({ ...e.effect })
        appendLog(`(Status: ${e.effect.kind})`)
        break
    }
  }

  // ── Combat ──
  function startCombat(p: Player, r: Record<RoomId, Room>, ps: PartyMember[], room: Room, randomEncounter: boolean, presetEnemies?: Enemy[]): void {
    const enemies: Enemy[] = presetEnemies ?? room.enemies.map(id => ENEMY_TEMPLATES[id]?.() ?? null).filter((e): e is Enemy => !!e)
    if (!enemies.length) return
    const order = rollInitiative([p, ...ps], enemies)
    appendLog(`⚔  Combat begins! ${enemies.map(e => e.name).join(', ')}.`)
    appendLog(`Order: ${order.map(o => nameFor(o.combatantId, p, ps, enemies)).join(' → ')}`, '')
    const cs: CombatState = { active: true, enemies, order, turnIndex: 0, round: 1, pendingPlayerInput: true, randomEncounter }
    setCombat(cs)
    setPlayer(p); setRooms(r); setParty(ps)
    advanceCombatUntilPlayer(p, ps, cs)
  }

  function nameFor(id: string, p: Player, ps: PartyMember[], es: Enemy[]): string {
    if (id === p.id) return p.name
    const pm = ps.find(m => m.id === id); if (pm) return pm.name
    const e = es.find(x => x.id === id); if (e) return e.name
    return id
  }

  // Drives turn order: keeps stepping enemy/AI turns until the player must act, or combat ends.
  function advanceCombatUntilPlayer(pIn: Player, psIn: PartyMember[], csIn: CombatState): void {
    let p = pIn
    let ps = psIn
    let cs = { ...csIn }
    const ctx: CombatContext = { party: [p, ...ps], enemies: cs.enemies, log: () => {} }
    let safety = 0

    while (safety++ < 100) {
      if (cs.enemies.every(e => !e.alive)) { onVictory(p, ps, cs); return }
      if (![p, ...ps].some(c => c.alive)) { finishGame(p, 'dead'); return }

      if (cs.turnIndex >= cs.order.length) {
        // End of round
        const allies = [p, ...ps]
        for (const c of [...allies, ...cs.enemies]) tickEffects(c, l => appendLog(l))
        cs.round++
        cs.order = rollInitiative(allies.filter(a => a.alive) as (Player | PartyMember)[], cs.enemies.filter(e => e.alive))
        cs.turnIndex = 0
        appendLog(`── Round ${cs.round} ──`)
      }

      const entry = cs.order[cs.turnIndex]
      if (!entry) break

      if (entry.side === 'enemy') {
        const e = cs.enemies.find(x => x.id === entry.combatantId)
        if (!e || !e.alive) { cs.turnIndex++; continue }
        if (isStunned(e)) { appendLog(`${e.name} is stunned.`); cs.turnIndex++; continue }
        const lines = takeEnemyTurn(e, { ...ctx, party: [p, ...ps], enemies: cs.enemies })
        for (const l of lines) appendLog(l)
        // Check defeated allies
        for (const c of [p, ...ps]) {
          if (c.alive && c.hp <= 0) {
            c.hp = 0
            c.alive = false
            appendLog(`${c.name} falls!`)
            if (c === p) {
              setCombat({ ...cs, active: false })
              setPlayer(p); setParty(ps)
              finishGame(p, 'dead')
              return
            } else {
              const pm = c as PartyMember
              const dropped: ItemId[] = []
              for (const slot of Object.keys(pm.equipment) as (keyof typeof pm.equipment)[]) {
                const id = pm.equipment[slot]
                if (id) { dropped.push(id); pm.equipment[slot] = null }
              }
              dropped.push(...pm.inventory)
              pm.inventory = []
              const corpse: Corpse = { charId: pm.charId, name: pm.name, droppedItems: dropped }
              const room = rooms[p.room]
              if (room) (room.corpses ??= []).push(corpse)
            }
          }
        }
        cs.turnIndex++
        continue
      }

      // Party turn
      if (entry.combatantId === p.id) {
        // Wait for player input
        cs.pendingPlayerInput = true
        appendLog(`Your turn. (HP ${p.hp}/${p.maxHp} · MP ${p.mp}/${p.maxMp})`)
        setCombat(cs)
        setPlayer(p); setParty(ps)
        return
      } else {
        const m = ps.find(x => x.id === entry.combatantId)
        if (!m || !m.alive) { cs.turnIndex++; continue }
        if (isStunned(m)) { appendLog(`${m.name} is stunned.`); cs.turnIndex++; continue }
        const action = decidePartyAction(m, { ...ctx, party: [p, ...ps], enemies: cs.enemies })
        runPartyAction(m, action, [p, ...ps], cs.enemies)
        // Check if any enemy died
        cleanupDead(cs.enemies)
        cs.turnIndex++
      }
    }
  }

  function runPartyAction(actor: PartyMember, action: ReturnType<typeof decidePartyAction>, party: (Player | PartyMember)[], enemies: Enemy[]): void {
    if (action.kind === 'defend') {
      actor.buffs.push({ id: 'def_brace', kind: 'defUp', magnitude: 50, remaining: 1, source: actor.id })
      appendLog(`${actor.name} braces for impact.`)
      return
    }
    if (action.kind === 'attack') {
      const tgt = enemies.find(e => e.id === action.targetId && e.alive) ?? enemies.find(e => e.alive)
      if (!tgt) return
      const dmg = physDamage(actor, tgt)
      tgt.hp -= dmg
      appendLog(`${actor.name} hits ${tgt.name} for ${dmg}.`)
      return
    }
    if (action.kind === 'cast') {
      const spell = SPELLS[action.spellId]
      if (!spell || actor.mp < spell.mpCost) return
      actor.mp -= spell.mpCost
      const targets = resolveSpellTargets(spell.target, action.targetId, party, enemies)
      const lines: string[] = []
      for (const t of targets) lines.push(...spell.apply(actor, t, { party, enemies, log: () => {} }))
      for (const l of lines) appendLog(l)
    }
  }

  function resolveSpellTargets(target: ReturnType<typeof SPELLS.spark.apply> extends infer _R ? import('../data/textAdventure/types').SpellTarget : never, targetId: string, party: (Player | PartyMember)[], enemies: Enemy[]): import('../data/textAdventure/types').Combatant[] {
    switch (target) {
      case 'singleEnemy': { const t = enemies.find(e => e.id === targetId && e.alive); return t ? [t] : [] }
      case 'allEnemies': return enemies.filter(e => e.alive)
      case 'singleAlly': { const t = party.find(p => p.id === targetId && p.alive); return t ? [t] : [] }
      case 'allAllies': return party.filter(p => p.alive)
      case 'self': return [party[0]]
      case 'fallenAlly': { const t = party.find(p => p.id === targetId && !p.alive); return t ? [t] : [] }
    }
    return []
  }

  function cleanupDead(enemies: Enemy[]): void {
    for (const e of enemies) {
      if (e.alive && e.hp <= 0) {
        // Lich revive once
        if (e.templateId === 'boss_lich' && (e.state?.revives as number) > 0 && (e.state?.phylactery as number) > 0) {
          e.state!.revives = 0
          e.hp = Math.floor(e.maxHp * 0.5)
          appendLog(`${e.name} surges back, knit by its phylactery!`)
          continue
        }
        e.hp = 0
        e.alive = false
        appendLog(`${e.name} falls.`)
      }
    }
  }

  function onVictory(p: Player, ps: PartyMember[], cs: CombatState): void {
    const tierTotal = cs.enemies.reduce((s, e) => s + e.tier, 0)
    const goldReward = cs.enemies.reduce((s, e) => s + e.goldDrop[0] + Math.floor(Math.random() * (e.goldDrop[1] - e.goldDrop[0] + 1)), 0)
    p.gold += goldReward
    p.killed += cs.enemies.length
    appendLog(`Victory! +${goldReward} gold (tier ${tierTotal}).`)
    // Stolen items returned
    for (const e of cs.enemies) {
      if (e.stolenFrom) {
        for (const s of e.stolenFrom) {
          if (s.gold) { p.gold += s.gold; appendLog(`You recover ${s.gold} stolen gold.`) }
          if (s.itemId) { p.inventory.push(s.itemId); appendLog(`You recover your ${ITEMS[s.itemId]?.name ?? s.itemId}.`) }
        }
      }
      // Item drops
      for (const drop of e.itemDrops) {
        if (Math.random() < drop.chance) {
          const room = rooms[p.room]
          room.items.push({ id: drop.id })
          appendLog(`Dropped: ${ITEMS[drop.id]?.name ?? drop.id}.`)
        }
      }
    }
    // Mark room cleared
    rooms[p.room].cleared = true
    rooms[p.room].enemies = []
    appendLog('')
    setCombat({ active: false, enemies: [], order: [], turnIndex: 0, round: 0, pendingPlayerInput: false, randomEncounter: false })
    setPlayer(p); setParty(ps)
    setRooms({ ...rooms })
  }

  // ── Player command (combat) ──
  function combatCommand(p: Player, ps: PartyMember[], cs: CombatState, verb: string, arg: string): boolean {
    if (verb === 'attack' || verb === 'a' || verb === 'fight' || verb === 'kill') {
      let target: Enemy | undefined
      if (arg) {
        const idx = parseInt(arg, 10)
        if (!isNaN(idx)) target = cs.enemies.filter(e => e.alive)[idx - 1]
        else target = cs.enemies.find(e => e.alive && e.name.toLowerCase().includes(arg.toLowerCase()))
      }
      if (!target) target = cs.enemies.find(e => e.alive)
      if (!target) return true
      const dmg = physDamage(p, target)
      target.hp -= dmg
      appendLog(`You strike ${target.name} for ${dmg}.`)
      cleanupDead(cs.enemies)
      // Boss summon trigger
      for (const e of cs.enemies.filter(x => x.alive && x.isBoss)) {
        for (const ab of e.abilities) {
          const fn = (window as unknown as { x?: never }).x // placeholder; we'll call from advance
          void fn
        }
      }
      cs.pendingPlayerInput = false
      cs.turnIndex++
      setCombat(cs)
      advanceCombatUntilPlayer(p, ps, cs)
      return true
    }
    if (verb === 'cast') {
      const m = arg.match(/^([\w\s]+?)(?:\s+on\s+(.+))?$/)
      if (!m) { appendLog('Usage: cast <spell> [on <target>]'); return true }
      const spellName = m[1].trim().toLowerCase()
      const targetName = (m[2] ?? '').trim().toLowerCase()
      const spellId = Object.keys(SPELLS).find(id => SPELLS[id].name.toLowerCase() === spellName || id === spellName)
      if (!spellId) { appendLog(`No spell "${spellName}".`); return true }
      if (!p.knownSpells.includes(spellId)) { appendLog(`You don't know ${SPELLS[spellId].name}.`); return true }
      if (!p.equipment.catalyst) { appendLog('You have no focus to channel through.'); return true }
      if (isSilenced(p)) { appendLog('You are silenced.'); return true }
      const spell = SPELLS[spellId]
      if (p.mp < spell.mpCost) { appendLog(`Not enough MP (need ${spell.mpCost}).`); return true }
      let targets: import('../data/textAdventure/types').Combatant[] = []
      switch (spell.target) {
        case 'allEnemies': targets = cs.enemies.filter(e => e.alive); break
        case 'allAllies': targets = [p, ...ps].filter(c => c.alive); break
        case 'self': targets = [p]; break
        case 'singleEnemy': {
          const t = targetName ? cs.enemies.find(e => e.alive && e.name.toLowerCase().includes(targetName)) : cs.enemies.find(e => e.alive)
          if (!t) { appendLog('No valid target.'); return true }
          targets = [t]; break
        }
        case 'singleAlly': {
          const allies = [p, ...ps].filter(c => c.alive)
          const t = targetName ? allies.find(a => a.name.toLowerCase().includes(targetName)) : p
          if (!t) { appendLog('No valid ally.'); return true }
          targets = [t]; break
        }
        case 'fallenAlly': {
          const t = ps.find(m2 => !m2.alive && m2.name.toLowerCase().includes(targetName))
          if (!t) { appendLog('No fallen ally by that name.'); return true }
          targets = [t]; break
        }
      }
      p.mp -= spell.mpCost
      for (const t of targets) for (const l of spell.apply(p, t, { party: [p, ...ps], enemies: cs.enemies, log: () => {} })) appendLog(l)
      cleanupDead(cs.enemies)
      cs.pendingPlayerInput = false
      cs.turnIndex++
      setCombat(cs)
      advanceCombatUntilPlayer(p, ps, cs)
      return true
    }
    if (verb === 'flee' || verb === 'run' || verb === 'retreat') {
      const chance = fleeChance([p, ...ps], cs.enemies, cs.randomEncounter)
      appendLog(`You attempt to flee. (${Math.round(chance * 100)}% chance)`)
      if (Math.random() < chance) {
        appendLog('You break away!')
        // Move to a random non-locked exit
        const room = rooms[p.room]
        const exits = (Object.keys(room.exits) as Direction[]).filter(d => typeof room.exits[d] === 'string')
        if (exits.length) {
          const dir = exits[0]
          p.room = room.exits[dir] as RoomId
          p.visitedRooms.add(p.room)
          rooms[p.room].visited = true
        }
        setCombat({ active: false, enemies: [], order: [], turnIndex: 0, round: 0, pendingPlayerInput: false, randomEncounter: false })
        setPlayer(p); setParty(ps); setRooms({ ...rooms })
        describeRoom(p, rooms)
        return true
      }
      appendLog('You fail to escape!')
      cs.pendingPlayerInput = false
      cs.turnIndex++
      setCombat(cs)
      advanceCombatUntilPlayer(p, ps, cs)
      return true
    }
    if (verb === 'use' || verb === 'drink') {
      const itemId = resolveItem(arg, p.inventory)
      if (!itemId) { appendLog(`No "${arg}" in inventory.`); return true }
      const item = ITEMS[itemId]
      if (item.heal) {
        p.inventory.splice(p.inventory.indexOf(itemId), 1)
        const amt = Math.min(p.maxHp - p.hp, item.heal)
        p.hp += amt
        appendLog(`You drink ${item.name}. +${amt} HP.`)
      } else if (item.healMp) {
        p.inventory.splice(p.inventory.indexOf(itemId), 1)
        const amt = Math.min(p.maxMp - p.mp, item.healMp)
        p.mp += amt
        appendLog(`You drink ${item.name}. +${amt} MP.`)
      } else { appendLog(`Can't use ${item.name} in combat.`); return true }
      cs.pendingPlayerInput = false
      cs.turnIndex++
      setCombat(cs)
      advanceCombatUntilPlayer(p, ps, cs)
      return true
    }
    if (verb === 'status' || verb === 'party' || verb === 'spells' || verb === 'help' || verb === '?' || verb === 'inventory' || verb === 'inv' || verb === 'i') {
      // free actions
      handleNonCombatInfo(p, ps, verb)
      return true
    }
    appendLog('In combat. Try: attack, cast <spell>, flee, use <item>.')
    return true
  }

  function handleNonCombatInfo(p: Player, ps: PartyMember[], verb: string): void {
    if (verb === 'help' || verb === '?') { for (const l of HELP_LINES) appendLog(l); appendLog(''); return }
    if (verb === 'status') {
      appendLog(`HP ${p.hp}/${p.maxHp} · MP ${p.mp}/${p.maxMp} · ATK ${effectiveAtk(p)} · DEF ${effectiveDef(p)} · MATK ${effectiveMatk(p)} · SPD ${effectiveSpeed(p)}`)
      appendLog(`Gold ${p.gold} · Killed ${p.killed} · Rooms ${p.visitedRooms.size}`, '')
      return
    }
    if (verb === 'party') {
      if (!ps.length) appendLog('You travel alone.', '')
      else {
        for (const m of ps) {
          appendLog(`${m.name} (${m.class}) — HP ${m.hp}/${m.maxHp} · MP ${m.mp}/${m.maxMp} · ATK ${effectiveAtk(m)} · tactics: ${m.tactics}${m.alive ? '' : ' (DOWN)'}`)
        }
        appendLog('')
      }
      return
    }
    if (verb === 'spells') {
      if (!p.knownSpells.length) appendLog('You know no spells.', '')
      else {
        appendLog('Known spells:')
        for (const id of p.knownSpells) {
          const s = SPELLS[id]
          appendLog(`  ${s.name} (${s.mpCost} MP) — ${s.description}`)
        }
        appendLog('')
      }
      return
    }
    if (verb === 'inventory' || verb === 'inv' || verb === 'i') {
      if (!p.inventory.length) appendLog('You carry nothing.')
      else {
        // Group by category, with stack counts. Equipped items get an [E] marker.
        const equippedSet = new Set<string>()
        for (const slot of Object.keys(p.equipment) as (keyof typeof p.equipment)[]) {
          const id = p.equipment[slot]; if (id) equippedSet.add(id)
        }
        const counts = new Map<string, number>()
        for (const id of p.inventory) counts.set(id, (counts.get(id) ?? 0) + 1)
        const buckets: Record<string, string[]> = {
          'Weapons': [], 'Armor': [], 'Catalysts': [], 'Accessories': [],
          'Consumables': [], 'Quest / Keys': [], 'Other': []
        }
        for (const [id, n] of counts) {
          const item = ITEMS[id]
          if (!item) { buckets['Other'].push(`${id}${n > 1 ? ` (x${n})` : ''}`); continue }
          const equipMark = equippedSet.has(id) ? ' [E]' : ''
          const entry = `${item.name}${n > 1 ? ` (x${n})` : ''}${equipMark}`
          const cat = item.category
          if (cat === 'weapon') buckets['Weapons'].push(entry)
          else if (cat === 'armor') buckets['Armor'].push(entry)
          else if (cat === 'catalyst') buckets['Catalysts'].push(entry)
          else if (cat === 'accessory') buckets['Accessories'].push(entry)
          else if (cat === 'consumable' || item.heal != null || item.healMp != null || item.cureStatus) buckets['Consumables'].push(entry)
          else if (cat === 'key') buckets['Quest / Keys'].push(entry)
          else if (cat === 'scroll') buckets['Consumables'].push(entry)
          else buckets['Other'].push(entry)
        }
        appendLog('Inventory:')
        for (const [label, entries] of Object.entries(buckets)) {
          if (!entries.length) continue
          appendLog(`  ${label}: ${entries.join(', ')}`)
        }
      }
      const eq = p.equipment
      const names: string[] = []
      if (eq.weapon) names.push(`Weapon: ${ITEMS[eq.weapon].name}`)
      if (eq.armor) names.push(`Armor: ${ITEMS[eq.armor].name}`)
      if (eq.catalyst) names.push(`Catalyst: ${ITEMS[eq.catalyst].name}`)
      if (eq.accessory) names.push(`Accessory: ${ITEMS[eq.accessory].name}`)
      appendLog(names.join(' · ') || 'Unarmed.')
      appendLog(`Gold: ${p.gold}`, '')
      return
    }
  }

  // ── Process command (out-of-combat or hybrid) ──
  function processCommand(raw: string): void {
    if (gameOver) return
    const cmd = raw.trim()
    if (!cmd) return
    appendLog(`> ${raw}`)

    const tokens = cmd.toLowerCase().split(/\s+/)
    const verb = tokens[0]
    const arg = tokens.slice(1).join(' ').replace(/^the\s+/, '').replace(/^on\s+/, '').trim()

    // Clone state
    const p = clonePlayer(player)
    const ps = cloneParty(party)
    const r = cloneRooms(rooms)
    const cs = { ...combat, enemies: combat.enemies.map(e => ({ ...e, buffs: [...e.buffs], debuffs: [...e.debuffs] })) }

    if (cs.active) {
      if (combatCommand(p, ps, cs, verb, arg)) return
    }

    // Pre-emptive attack: out-of-combat "attack" triggers combat in the current room
    if (verb === 'attack' || verb === 'a' || verb === 'fight' || verb === 'kill') {
      const room = r[p.room]
      if (!room.enemies.length || room.cleared) {
        appendLog('Nothing here to attack.', '')
        return
      }
      appendLog('You strike first!', '')
      // The first round's initiative gives the player a normal turn order; the surprise
      // is conveyed narratively. (No mechanical first-strike bonus yet.)
      startCombat(p, r, ps, room, false)
      return
    }

    // Movement
    if (verb === 'go') {
      const d = DIR_ALIAS[arg] ?? DIR_ALIAS[tokens[1]]
      if (d) { tryMove(p, r, ps, d); return }
      appendLog(`Go where?`, ''); return
    }
    if (DIR_ALIAS[verb]) { tryMove(p, r, ps, DIR_ALIAS[verb]); return }

    // Look / inspect
    if (verb === 'look' || verb === 'l') { describeRoom(p, r); return }
    if (verb === 'inspect' || verb === 'examine' || verb === 'x') {
      if (!arg) { appendLog('Inspect what?', ''); return }
      doInspect(p, r, ps, arg); return
    }
    if (verb === 'search') {
      const room = r[p.room]
      const hidden = room.items.filter(i => i.hidden)
      if (!hidden.length) { appendLog('You search but find nothing.', ''); return }
      for (const i of hidden) i.hidden = false
      appendLog(`You find: ${hidden.map(i => ITEMS[i.id]?.name ?? i.id).join(', ')}.`, '')
      setRooms(r); return
    }

    // Take / drop / equip / use / read
    if (verb === 'take' || verb === 'get') {
      const room = r[p.room]
      const visibleIds = room.items.filter(i => !i.hidden).map(i => i.id)
      // Special: take from corpse
      if (room.corpses?.length) for (const c of room.corpses) visibleIds.push(...c.droppedItems)
      const itemId = resolveItem(arg, visibleIds)
      if (!itemId) { appendLog(`No "${arg}" here.`, ''); return }
      // Remove from room or corpse
      const fromRoomIdx = room.items.findIndex(i => !i.hidden && i.id === itemId)
      if (fromRoomIdx >= 0) room.items.splice(fromRoomIdx, 1)
      else if (room.corpses) {
        for (const c of room.corpses) {
          const idx = c.droppedItems.indexOf(itemId)
          if (idx >= 0) { c.droppedItems.splice(idx, 1); break }
        }
      }
      p.inventory.push(itemId)
      const item = ITEMS[itemId]
      appendLog(`You take ${item.name}.`)
      // Special: torch
      if (itemId === 'torch') { p.hasTorch = true; p.torchCharges += 5 }
      // Auto-equip if better
      autoEquipIfBetter(p, itemId)
      appendLog('')
      setPlayer(p); setRooms(r); return
    }
    if (verb === 'drop') {
      const itemId = resolveItem(arg, p.inventory)
      if (!itemId) { appendLog(`You don't have a "${arg}".`, ''); return }
      p.inventory.splice(p.inventory.indexOf(itemId), 1)
      r[p.room].items.push({ id: itemId })
      for (const slot of Object.keys(p.equipment) as (keyof typeof p.equipment)[]) {
        if (p.equipment[slot] === itemId) p.equipment[slot] = null
      }
      if (itemId === 'torch') { p.hasTorch = false; p.torchCharges = 0 }
      appendLog(`You drop ${ITEMS[itemId].name}.`, '')
      setPlayer(p); setRooms(r); return
    }
    if (verb === 'equip') {
      const itemId = resolveItem(arg, p.inventory)
      if (!itemId) { appendLog(`No "${arg}" to equip.`, ''); return }
      const item = ITEMS[itemId]
      const slot: keyof typeof p.equipment | null =
        item.category === 'weapon' ? 'weapon' :
        item.category === 'armor' ? 'armor' :
        item.category === 'catalyst' ? 'catalyst' :
        item.category === 'accessory' ? 'accessory' : null
      if (!slot) { appendLog(`Can't equip ${item.name}.`, ''); return }
      const previous = p.equipment[slot]
      p.equipment[slot] = itemId
      if (previous && previous !== itemId) {
        appendLog(`Equipped ${item.name}. ${ITEMS[previous]?.name ?? previous} returns to inventory.`, '')
      } else {
        appendLog(`Equipped ${item.name}.`, '')
      }
      setPlayer(p); return
    }
    if (verb === 'use' || verb === 'drink' || verb === 'eat') {
      const itemId = resolveItem(arg, p.inventory)
      if (!itemId) { appendLog(`No "${arg}".`, ''); return }
      const item = ITEMS[itemId]
      if (item.heal) {
        p.inventory.splice(p.inventory.indexOf(itemId), 1)
        const amt = Math.min(p.maxHp - p.hp, item.heal)
        p.hp += amt
        appendLog(`You drink ${item.name}. +${amt} HP.`, '')
      } else if (item.healMp) {
        p.inventory.splice(p.inventory.indexOf(itemId), 1)
        const amt = Math.min(p.maxMp - p.mp, item.healMp)
        p.mp += amt
        appendLog(`You drink ${item.name}. +${amt} MP.`, '')
      } else if (item.cureStatus) {
        p.inventory.splice(p.inventory.indexOf(itemId), 1)
        p.debuffs = p.debuffs.filter(d => !item.cureStatus!.includes(d.kind))
        appendLog(`You use ${item.name}.`, '')
      } else if (itemId === 'phoenix_pearl') {
        const fallen = ps.find(m => !m.alive)
        if (!fallen) { appendLog('No fallen ally to revive.', ''); return }
        p.inventory.splice(p.inventory.indexOf(itemId), 1)
        fallen.alive = true
        fallen.hp = fallen.maxHp
        appendLog(`${fallen.name} returns!`, '')
      } else { appendLog(`Can't use ${item.name} that way.`, ''); return }
      setPlayer(p); setParty(ps); return
    }
    if (verb === 'read') {
      const itemId = resolveItem(arg, p.inventory)
      if (!itemId) { appendLog(`No "${arg}" to read.`, ''); return }
      const item = ITEMS[itemId]
      if (item.teachesSpell) {
        if (p.knownSpells.includes(item.teachesSpell)) appendLog(`You already know ${SPELLS[item.teachesSpell].name}.`)
        else { p.knownSpells.push(item.teachesSpell); appendLog(`You learn ${SPELLS[item.teachesSpell].name}!`) }
        p.inventory.splice(p.inventory.indexOf(itemId), 1)
        appendLog('(scroll consumed)', '')
        setPlayer(p); return
      }
      if (item.text) { appendLog(`${item.name}:`, item.text, ''); return }
      appendLog(`Nothing to read on ${item.name}.`, ''); return
    }

    // Magic
    if (verb === 'cast') {
      if (!p.equipment.catalyst) { appendLog('You have no focus to channel through.', ''); return }
      // Out-of-combat cast: only healing/buff usable
      const m = arg.match(/^([\w\s]+?)(?:\s+on\s+(.+))?$/)
      if (!m) { appendLog('Usage: cast <spell> [on <target>]', ''); return }
      const spellName = m[1].trim().toLowerCase()
      const spellId = Object.keys(SPELLS).find(id => SPELLS[id].name.toLowerCase() === spellName || id === spellName)
      if (!spellId || !p.knownSpells.includes(spellId)) { appendLog(`You don't know "${spellName}".`, ''); return }
      const spell = SPELLS[spellId]
      if (!['singleAlly', 'allAllies', 'self', 'fallenAlly'].includes(spell.target)) {
        appendLog('No enemies here.', ''); return
      }
      if (p.mp < spell.mpCost) { appendLog(`Not enough MP.`, ''); return }
      p.mp -= spell.mpCost
      const targets: import('../data/textAdventure/types').Combatant[] =
        spell.target === 'allAllies' ? [p, ...ps].filter(c => c.alive) :
        spell.target === 'self' ? [p] :
        spell.target === 'fallenAlly' ? ps.filter(m2 => !m2.alive) :
        [p]
      for (const t of targets) for (const l of spell.apply(p, t, { party: [p, ...ps], enemies: [], log: () => {} })) appendLog(l)
      appendLog('')
      setPlayer(p); setParty(ps); return
    }
    if (verb === 'spells') { handleNonCombatInfo(p, ps, 'spells'); return }
    // (The real "learn" handler runs below; only fall through to the "no sage here" notice
    //  if no sage is currently in conversation.)

    // NPCs
    if (verb === 'talk' || verb === 'speak') {
      const room = r[p.room]
      // First check if the arg matches a party member — they can be spoken to anywhere
      if (arg) {
        const member = ps.find(m => m.name.toLowerCase().includes(arg) || m.charId === arg)
        if (member) {
          const tpl = CHARACTERS[member.charId]
          const lines = tpl?.idleLines ?? []
          if (!lines.length) { appendLog(`${member.name} nods, says nothing.`, ''); return }
          const line = lines[Math.floor(Math.random() * lines.length)]
          appendLog(`${member.name}: ${line}`, '')
          return
        }
      }
      const npcId = room.npcs.find(id => NPCS[id]?.name.toLowerCase().includes(arg)) ?? room.npcs[0]
      if (!npcId) { appendLog('No one to talk to.', ''); return }
      const npc = NPCS[npcId]
      appendLog(`${npc.name}: ${npc.greeting}`)
      if (npc.kind === 'recruit' && npc.recruitChar) {
        if (ps.find(m => m.charId === npc.recruitChar)) appendLog('(Already in party.)', '')
        else if (ps.length >= 2) appendLog('(Your party is full. Swap at an outpost.)', '')
        else {
          const m = makePartyMember(npc.recruitChar, p.room)
          if (m) {
            ps.push(m)
            appendLog(`${m.name} joins your party!`, '')
          }
        }
      } else if (npc.kind === 'merchant') {
        appendLog('Type "buy <item>" or "sell <item>". Type "shop" to list wares.', '')
        setShopOpen(npcId)
      } else if (npc.kind === 'innkeeper') {
        appendLog(`Type "rest" to pay ${npc.innCost} gold and recover.`, '')
      } else if (npc.kind === 'sage') {
        appendLog('Spells available:')
        for (const t of npc.teaches ?? []) appendLog(`  ${SPELLS[t.spellId].name} — ${t.price}g`)
        appendLog('Type "learn <spell>" to purchase.', '')
        setShopOpen(npcId)
      } else if (npc.dialogue) {
        for (const line of npc.dialogue) appendLog(line)
        appendLog('')
      }
      setPlayer(p); setParty(ps); setRooms(r); return
    }
    if (verb === 'shop' || verb === 'wares') {
      if (!shopOpen || !NPCS[shopOpen]) { appendLog('No shop open.', ''); return }
      const npc = NPCS[shopOpen]
      if (npc.shop) for (const it of npc.shop) appendLog(`  ${ITEMS[it.id]?.name ?? it.id} — ${it.price}g`)
      appendLog('')
      return
    }
    if (verb === 'buy') {
      if (!shopOpen || !NPCS[shopOpen]) { appendLog('No merchant nearby. Try "talk".', ''); return }
      const npc = NPCS[shopOpen]
      const offer = npc.shop?.find(s => ITEMS[s.id]?.name.toLowerCase().includes(arg) || s.id === arg)
      if (!offer) { appendLog(`No "${arg}" for sale.`, ''); return }
      if (p.gold < offer.price) { appendLog('Not enough gold.', ''); return }
      p.gold -= offer.price
      p.inventory.push(offer.id)
      appendLog(`You buy ${ITEMS[offer.id].name}. (-${offer.price}g)`, '')
      setPlayer(p); return
    }
    if (verb === 'sell') {
      if (!shopOpen || !NPCS[shopOpen]) { appendLog('No merchant.', ''); return }
      const itemId = resolveItem(arg, p.inventory)
      if (!itemId) { appendLog(`No "${arg}" to sell.`, ''); return }
      const npc = NPCS[shopOpen]
      const offer = npc.shop?.find(s => s.id === itemId)
      const sellPrice = offer ? Math.floor(offer.price * 0.5) : Math.max(1, Math.floor(itemGoldValue(itemId) || 5))
      p.inventory.splice(p.inventory.indexOf(itemId), 1)
      // If the item being sold is currently equipped, unequip it
      for (const slot of Object.keys(p.equipment) as (keyof typeof p.equipment)[]) {
        if (p.equipment[slot] === itemId) p.equipment[slot] = null
      }
      p.gold += sellPrice
      appendLog(`Sold ${ITEMS[itemId].name} for ${sellPrice}g.`, '')
      setPlayer(p); return
    }
    if (verb === 'learn') {
      if (!shopOpen || NPCS[shopOpen]?.kind !== 'sage') { appendLog('No sage here.', ''); return }
      const npc = NPCS[shopOpen]
      const offer = npc.teaches?.find(t => SPELLS[t.spellId].name.toLowerCase().includes(arg) || t.spellId === arg)
      if (!offer) { appendLog(`Sage doesn't teach "${arg}".`, ''); return }
      if (p.knownSpells.includes(offer.spellId)) { appendLog('Already known.', ''); return }
      if (p.gold < offer.price) { appendLog('Not enough gold.', ''); return }
      p.gold -= offer.price
      p.knownSpells.push(offer.spellId)
      appendLog(`You learn ${SPELLS[offer.spellId].name}! (-${offer.price}g)`, '')
      setPlayer(p); return
    }
    if (verb === 'rest') {
      const room = r[p.room]
      const innkeeper = room.npcs.map(id => NPCS[id]).find(n => n?.kind === 'innkeeper')
      if (!innkeeper) { appendLog('No place to rest here.', ''); return }
      const cost = innkeeper.innCost ?? 25
      if (p.gold < cost) { appendLog(`You need ${cost} gold to rest.`, ''); return }
      p.gold -= cost
      p.hp = p.maxHp; p.mp = p.maxMp
      for (const m of ps) { m.hp = m.maxHp; m.mp = m.maxMp; m.alive = true }
      appendLog(`You rest. (-${cost}g) Fully restored.`, '')
      setPlayer(p); setParty(ps); return
    }
    if (verb === 'tactics') {
      const parts = arg.split(/\s+/)
      if (parts.length < 2) { appendLog('tactics <member> <auto|attack|defend>', ''); return }
      const mode = parts[parts.length - 1] as PartyMember['tactics']
      const memberName = parts.slice(0, -1).join(' ')
      const member = ps.find(m => m.name.toLowerCase().includes(memberName))
      if (!member) { appendLog(`No party member "${memberName}".`, ''); return }
      if (!['auto', 'attack', 'defend'].includes(mode)) { appendLog('Invalid mode.', ''); return }
      member.tactics = mode as PartyMember['tactics']
      appendLog(`${member.name}'s tactics → ${mode}.`, '')
      setParty(ps); return
    }

    // Status / inv / party / spells / help — info
    if (['status', 'inventory', 'inv', 'i', 'party', 'spells', 'help', '?'].includes(verb)) {
      handleNonCombatInfo(p, ps, verb); return
    }
    if (verb === 'gold') { appendLog(`Gold: ${p.gold}`, ''); return }

    // Map
    if (verb === 'map') {
      if (arg === 'off') { setShowMap(false); appendLog('Map hidden.', ''); return }
      if (arg === 'on') { setShowMap(true); appendLog('Map shown.', ''); return }
      const room = r[p.room]
      const grid = renderAreaMap(room.area, r, p.visitedRooms, p.room, new Set(Object.values(r).filter(rm => rm.cleared && rm.enemies.length === 0).map(rm => rm.id)))
      appendLog(`── ${grid.areaName} ──`)
      for (const line of gridToText(grid)) appendLog(line)
      appendLog('@ you · ■ visited · S save · B boss · ? hinted', '')
      return
    }

    // Save / load
    if (verb === 'save') {
      const room = r[p.room]
      if (room.saveType === 'none') { appendLog('You can only save at a shrine or outpost.', ''); return }
      saveGame(p, ps, r)
      appendLog('Progress saved.', '')
      return
    }
    if (verb === 'load') {
      loadGame()
      return
    }

    // Special: smash phylactery (legacy hook)
    if (verb === 'smash' && arg === 'phylactery') {
      const idx = p.inventory.indexOf('phylactery')
      if (idx < 0) { appendLog('You don\'t have a phylactery.', ''); return }
      p.inventory.splice(idx, 1)
      // Find lich room
      for (const room of Object.values(r)) {
        for (const eid of room.enemies) {
          if (eid === 'boss_lich') {
            // Mark as weakened
            r[room.id].cleared = false
          }
        }
      }
      appendLog('You shatter the phylactery against the stones. A scream tears the deepest dark.', '')
      setPlayer(p); setRooms(r); return
    }

    appendLog(`I don't understand "${cmd}". Type "help".`, '')
  }

  function autoEquipIfBetter(p: Player, itemId: string): void {
    const item = ITEMS[itemId]
    const slot: keyof typeof p.equipment | null =
      item.category === 'weapon' ? 'weapon' :
      item.category === 'armor' ? 'armor' :
      item.category === 'catalyst' ? 'catalyst' :
      item.category === 'accessory' ? 'accessory' : null
    if (!slot) return
    const cur = p.equipment[slot] ? ITEMS[p.equipment[slot]!] : null
    const better =
      slot === 'weapon' ? (item.atk ?? 0) > (cur?.atk ?? 0) :
      slot === 'armor' ? (item.def ?? 0) > (cur?.def ?? 0) :
      slot === 'catalyst' ? (item.matk ?? 0) > (cur?.matk ?? 0) :
      true
    if (better) {
      p.equipment[slot] = itemId
      appendLog(`(Equipped ${item.name}.)`)
    }
  }

  function resolveItem(needle: string, pool: string[]): string | null {
    const lc = needle.toLowerCase().trim()
    if (!lc) return null
    if (pool.includes(lc)) return lc
    for (const id of pool) {
      const item = ITEMS[id]
      if (!item) continue
      if (item.name.toLowerCase() === lc) return id
      if (item.name.toLowerCase().includes(lc)) return id
      if (id.includes(lc.replace(/\s+/g, '_'))) return id
    }
    return null
  }

  // ── Save / load ──
  function saveGame(p: Player, ps: PartyMember[], r: Record<RoomId, Room>): void {
    const roomFlags: Record<string, { cleared?: boolean; visited?: boolean; itemsTaken?: string[]; inspectablesTriggered?: string[]; corpses?: Corpse[] }> = {}
    for (const k of Object.keys(r)) {
      const room = r[k]
      if (room.visited || room.cleared || (room.corpses?.length)) {
        roomFlags[k] = {
          visited: room.visited,
          cleared: room.cleared,
          inspectablesTriggered: room.inspectables.filter(i => i.triggered).map(i => i.target),
          corpses: room.corpses
        }
      }
    }
    const snapshot = {
      version: 2,
      player: { ...p,
        visitedRooms: Array.from(p.visitedRooms),
        discoveredExits: Array.from(p.discoveredExits),
        loreUnlocked: Array.from(p.loreUnlocked)
      },
      party: ps,
      roomFlags,
      flags: {}
    }
    window.api.settings.set(SAVE_KEY, JSON.stringify(snapshot)).catch(() => {})
  }

  function loadGame(): void {
    window.api.settings.get(SAVE_KEY, '').then(v => {
      if (!v) { appendLog('No save found.', ''); return }
      try {
        const data = JSON.parse(v)
        const p: Player = { ...data.player,
          visitedRooms: new Set(data.player.visitedRooms),
          discoveredExits: new Set(data.player.discoveredExits),
          loreUnlocked: new Set(data.player.loreUnlocked)
        }
        const ps: PartyMember[] = data.party
        const r = makeRooms()
        for (const k of Object.keys(data.roomFlags ?? {})) {
          if (!r[k]) continue
          const flags = data.roomFlags[k]
          r[k].visited = !!flags.visited
          r[k].cleared = !!flags.cleared
          r[k].corpses = flags.corpses ?? []
          if (flags.inspectablesTriggered) {
            for (const i of r[k].inspectables) if (flags.inspectablesTriggered.includes(i.target)) i.triggered = true
          }
        }
        setPlayer(p); setParty(ps); setRooms(r)
        setCombat({ active: false, enemies: [], order: [], turnIndex: 0, round: 0, pendingPlayerInput: false, randomEncounter: false })
        appendLog('Save loaded.', '')
        setTimeout(() => describeRoom(p, r), 0)
      } catch {
        appendLog('Save data corrupted.', '')
      }
    })
  }

  // ── End game ──
  function finishGame(p: Player, result: 'won' | 'dead'): void {
    appendLog('═════════════════════════════════════════════════')
    if (result === 'dead') appendLog('You fall. The keep keeps its secrets.')
    else appendLog('You step into sunlight. You have escaped.')
    appendLog(`${p.killed} foes slain · ${p.visitedRooms.size} rooms · ${p.gold}g`)
    appendLog('═════════════════════════════════════════════════')
    setPlayer(p)
    setGameOver(result)
  }

  // ── Form ──
  function onSubmit(e: React.FormEvent): void {
    e.preventDefault()
    if (!input.trim()) return
    processCommand(input)
    setInput('')
  }
  function quickCommand(cmd: string): void { processCommand(cmd); inputRef.current?.focus() }
  function reset(): void {
    setLog(INTRO)
    const p = makePlayer()
    setPlayer(p)
    setParty([])
    setRooms(makeRooms())
    setCombat({ active: false, enemies: [], order: [], turnIndex: 0, round: 0, pendingPlayerInput: false, randomEncounter: false })
    setGameOver(null)
    setShopOpen(null)
    setTimeout(() => describeRoom(p, rooms), 0)
  }

  // ── Render ──
  const currentRoom = rooms[player.room]
  let mapGrid: MapGrid | null = null
  let otherMaps: MapGrid[] = []
  if (currentRoom) {
    const cleared = new Set(Object.values(rooms).filter(r => r.cleared).map(r => r.id))
    mapGrid = renderAreaMap(currentRoom.area, rooms, player.visitedRooms, player.room, cleared)
    const areaIds = visitedAreas(rooms, player.visitedRooms).filter(a => a !== currentRoom.area)
    otherMaps = areaIds.map(a => renderAreaMap(a, rooms, player.visitedRooms, player.room, cleared))
  }

  return (
    <div className={styles.body}>
      <div className={styles.hud}>
        <span>HP <strong style={{ color: player.hp <= 5 ? '#ef4444' : '#4ade80' }}>{player.hp}/{player.maxHp}</strong></span>
        <span>MP <strong style={{ color: '#22d3ee' }}>{player.mp}/{player.maxMp}</strong></span>
        <span>ATK <strong>{effectiveAtk(player)}</strong></span>
        <span>DEF <strong>{effectiveDef(player)}</strong></span>
        <span>Gold <strong style={{ color: '#e8b44b' }}>{player.gold}</strong></span>
        {party.length > 0 && <span className={styles.partyBadge}>Party: {party.length}</span>}
      </div>

      {combat.active && (
        <div className={styles.turnBar}>
          <span className={styles.turnLabel}>Turn</span>
          <div className={styles.turnTrack}>
            {combat.order.slice(combat.turnIndex, combat.turnIndex + 6).map((t, i) => {
              const c = t.side === 'enemy'
                ? combat.enemies.find(e => e.id === t.combatantId)
                : (t.combatantId === player.id ? player : party.find(m => m.id === t.combatantId))
              if (!c) return null
              const hpPct = Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100))
              const isCurrent = i === 0
              const sideCls = t.side === 'enemy' ? styles.turnEnemy : styles.turnAlly
              const curCls = isCurrent ? styles.turnCurrent : styles.turnNext
              const isPlayerEntry = t.combatantId === player.id
              const marker = isCurrent ? '▶' : `${i + 1}`
              return (
                <div key={i} className={`${styles.turnPill} ${sideCls} ${curCls}`}>
                  <span className={styles.turnIndex}>{marker}</span>
                  <span className={styles.turnIcon}>
                    {t.side === 'enemy' ? '◊' : isPlayerEntry ? '★' : '◆'}
                  </span>
                  <div className={styles.turnPillBody}>
                    <div className={styles.turnPillHead}>
                      <span className={styles.turnPillName}>{c.name}</span>
                      <span className={styles.turnPillHp}>{c.hp}/{c.maxHp}</span>
                    </div>
                    <div className={styles.turnPillBar}><div className={styles.turnPillFill} style={{ width: `${hpPct}%` }} /></div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <div className={styles.mainRow}>
        <div className={styles.terminal}>
          <div className={styles.logArea}>
            {log.map((line, i) => (
              <div key={i} className={line.startsWith('>') ? styles.logCommand : styles.logLine}>{line || ' '}</div>
            ))}
            <div ref={logEndRef} />
          </div>

          <form className={styles.inputRow} onSubmit={onSubmit}>
            <span className={styles.prompt}>&gt;</span>
            <input
              ref={inputRef}
              className={styles.input}
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder={gameOver ? 'Game ended — New Adventure' : 'type a command...'}
              disabled={!!gameOver}
              autoFocus
            />
            <button type="submit" className={styles.submitBtn} disabled={!!gameOver}>Enter</button>
          </form>

          <div className={styles.quickActions}>
            <div className={styles.directionsGroup}>
              {(['north', 'south', 'east', 'west'] as const).map(d => (
                <button key={d} className={styles.quickBtn} onClick={() => quickCommand(d)} disabled={!!gameOver || combat.active}>{d[0].toUpperCase() + d.slice(1)}</button>
              ))}
              <button className={styles.quickBtn} onClick={() => quickCommand('up')} disabled={!!gameOver || combat.active}>Up</button>
              <button className={styles.quickBtn} onClick={() => quickCommand('down')} disabled={!!gameOver || combat.active}>Down</button>
            </div>
            <div className={styles.actionsGroup}>
              <button className={styles.quickBtn} onClick={() => quickCommand('look')} disabled={!!gameOver}>Look</button>
              <button className={styles.quickBtn} onClick={() => quickCommand('search')} disabled={!!gameOver}>Search</button>
              <button className={styles.quickBtn} onClick={() => quickCommand('inventory')} disabled={!!gameOver}>Inv</button>
              <button className={styles.quickBtn} onClick={() => quickCommand('party')} disabled={!!gameOver}>Party</button>
              <button className={styles.quickBtn} onClick={() => quickCommand('spells')} disabled={!!gameOver}>Spells</button>
              <button className={styles.quickBtn} onClick={() => quickCommand('map')} disabled={!!gameOver}>Map</button>
              <button className={styles.quickBtnAttack} onClick={() => quickCommand('attack')} disabled={!!gameOver}>⚔ Attack</button>
            </div>
          </div>

          {gameOver && <button className={styles.resetBtn} onClick={reset}>↻ New Adventure</button>}
        </div>

        {showMap && mapGrid && mapGrid.cells.length > 0 && (
          <div className={styles.mapPanel}>
            <div className={styles.mapHeader}>{mapGrid.areaName}</div>
            <pre className={styles.mapGrid}>
              {mapGrid.cells.map((row, ri) => (
                <div key={ri} className={styles.mapRow}>
                  {row.map((cell, ci) => (
                    <span key={ci} className={styles[`mapCell_${cell.cls}`]} title={cell.passageTo ? `Passage to ${cell.passageTo}` : undefined}>{cell.ch}</span>
                  ))}
                </div>
              ))}
            </pre>
            {mapGrid.passageDestinations.length > 0 && (
              <div className={styles.mapPassages}>
                Passages: {mapGrid.passageDestinations.map(p => p.areaName).join(' · ')}
              </div>
            )}
            <div className={styles.mapLegend}>
              <span className={styles.mapCell_me}>@</span> you
              <span className={styles.mapCell_visited}> ■</span> visited
              <span className={styles.mapCell_save}> S</span> save
              <span className={styles.mapCell_boss}> B</span> boss
              <span className={styles.mapCell_hint}> ?</span> hint
              <span className={styles.mapCell_passage}> →</span> passage
            </div>

            {otherMaps.filter(g => g.cells.length > 0).map(g => (
              <div key={g.area} className={styles.mapSubMap}>
                <div className={styles.mapHeader}>{g.areaName}</div>
                <pre className={styles.mapGrid}>
                  {g.cells.map((row, ri) => (
                    <div key={ri} className={styles.mapRow}>
                      {row.map((cell, ci) => (
                        <span key={ci} className={styles[`mapCell_${cell.cls}`]} title={cell.passageTo ? `Passage to ${cell.passageTo}` : undefined}>{cell.ch}</span>
                      ))}
                    </div>
                  ))}
                </pre>
                {g.passageDestinations.length > 0 && (
                  <div className={styles.mapPassages}>
                    Passages: {g.passageDestinations.map(p => p.areaName).join(' · ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
