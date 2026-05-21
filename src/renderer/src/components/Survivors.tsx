import { useEffect, useRef, useState } from 'react'
import styles from './Survivors.module.css'

// Vampire Survivors-lite — survive 10 minutes against waves of monsters.
// Move only; weapons auto-fire. Pick upgrades on level-up.

const W = 720
const H = 480
const WORLD_W = 4000
const WORLD_H = 4000
const RUN_DURATION = 600       // 10 minutes
const ENEMY_CAP = 240

const SAVE_KEY = 'survivorsBest'

// ── Types ──────────────────────────────────────────────────────────────────

type WeaponId = 'whip' | 'wand' | 'garlic' | 'knife' | 'bible'
type PassiveId = 'power' | 'haste' | 'speed' | 'pickup' | 'armor' | 'maxhp'

interface Weapon {
  id: WeaponId
  level: number
  cooldown: number   // seconds remaining
}

interface Player {
  x: number; y: number
  hp: number; maxHp: number
  speed: number
  pickupRadius: number
  damageMult: number
  cooldownMult: number
  armor: number
  facing: number          // angle radians
  xp: number
  level: number
  invul: number           // i-frames seconds
}

interface Enemy {
  x: number; y: number
  hp: number
  speed: number
  dmg: number
  radius: number
  kind: 'zombie' | 'bat' | 'skeleton' | 'wraith' | 'boss'
  xpValue: number
  hitTimer: number
}

interface Projectile {
  x: number; y: number
  vx: number; vy: number
  life: number
  dmg: number
  radius: number
  kind: 'wand' | 'knife' | 'bibleOrb'
  hitIds?: Set<number>
}

interface Gem { x: number; y: number; value: number }
interface DamageText { x: number; y: number; vy: number; life: number; text: string; color: string }

// ── Catalog ────────────────────────────────────────────────────────────────

const WEAPON_INFO: Record<WeaponId, { name: string; desc: string }> = {
  whip:   { name: 'Whip',   desc: 'Strikes horizontally — wide arc damage.' },
  wand:   { name: 'Wand',   desc: 'Auto-aims a magical bolt at the nearest enemy.' },
  garlic: { name: 'Garlic', desc: 'Burns enemies that come too close.' },
  knife:  { name: 'Knife',  desc: 'Throws blades in the direction you face.' },
  bible:  { name: 'Bible',  desc: 'Holy tomes orbit you, damaging on contact.' }
}

const PASSIVE_INFO: Record<PassiveId, { name: string; desc: string }> = {
  power:  { name: 'Power',  desc: '+15% damage per level.' },
  haste:  { name: 'Haste',  desc: '-12% cooldown per level.' },
  speed:  { name: 'Boots',  desc: '+12% move speed per level.' },
  pickup: { name: 'Magnet', desc: '+25% pickup radius per level.' },
  armor:  { name: 'Armor',  desc: '+1 flat damage reduction per level.' },
  maxhp:  { name: 'Vitality', desc: '+20 max HP and heal per level.' }
}

const WEAPON_LEVEL_CAP = 5
const PASSIVE_LEVEL_CAP = 5

// Whip params per level
function whipCooldown(level: number): number { return 1.2 - (level - 1) * 0.10 }
function whipDamage(level: number): number   { return 18 + (level - 1) * 8 }
function whipRange(level: number): number    { return 110 + (level - 1) * 12 }
function whipArc(level: number): number      { return 0.95 + (level - 1) * 0.08 }

function wandCooldown(level: number): number { return 1.0 - (level - 1) * 0.08 }
function wandDamage(level: number): number   { return 14 + (level - 1) * 6 }

function garlicCooldown(level: number): number { return 0.5 }
function garlicDamage(level: number): number   { return 6 + (level - 1) * 3 }
function garlicRange(level: number): number    { return 70 + (level - 1) * 10 }

function knifeCooldown(level: number): number { return 0.8 - (level - 1) * 0.06 }
function knifeDamage(level: number): number   { return 12 + (level - 1) * 5 }
function knifeCount(level: number): number    { return Math.min(4, 1 + Math.floor((level - 1) / 2)) }

function bibleCooldown(level: number): number { return 4.0 - (level - 1) * 0.4 }
function bibleDuration(level: number): number { return 1.6 + (level - 1) * 0.3 }
function bibleDamage(level: number): number   { return 16 + (level - 1) * 6 }
function bibleCount(level: number): number    { return Math.min(4, 1 + Math.floor((level - 1) / 2)) }

function xpToNext(level: number): number {
  return 5 + level * 4 + Math.floor(level * level * 0.6)
}

// ── Enemy templates by time ────────────────────────────────────────────────

function makeEnemy(t: number, x: number, y: number): Enemy {
  const r = Math.random()
  const tierBoost = 1 + t / 180   // hp/dmg scaling over time
  if (t > 240 && r < 0.18) {
    return { x, y, hp: 16 * tierBoost, speed: 90, dmg: 9, radius: 11, kind: 'wraith', xpValue: 3, hitTimer: 0 }
  }
  if (t > 120 && r < 0.40) {
    return { x, y, hp: 22 * tierBoost, speed: 64, dmg: 8, radius: 13, kind: 'skeleton', xpValue: 2, hitTimer: 0 }
  }
  if (r < 0.55) {
    return { x, y, hp: 8 * tierBoost, speed: 110, dmg: 4, radius: 9, kind: 'bat', xpValue: 1, hitTimer: 0 }
  }
  return { x, y, hp: 18 * tierBoost, speed: 50, dmg: 6, radius: 14, kind: 'zombie', xpValue: 1, hitTimer: 0 }
}

function makeBoss(t: number, x: number, y: number): Enemy {
  const tier = 1 + Math.floor(t / 90)
  return {
    x, y,
    hp: 400 * tier,
    speed: 56,
    dmg: 15,
    radius: 26,
    kind: 'boss',
    xpValue: 20,
    hitTimer: 0
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Survivors(): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  const playerRef = useRef<Player>(initialPlayer())
  const weaponsRef = useRef<Weapon[]>([{ id: 'whip', level: 1, cooldown: 0 }])
  const passivesRef = useRef<Map<PassiveId, number>>(new Map())
  const enemiesRef = useRef<Enemy[]>([])
  const projsRef = useRef<Projectile[]>([])
  const gemsRef = useRef<Gem[]>([])
  const damageTextsRef = useRef<DamageText[]>([])
  const enemyIdRef = useRef(1)

  const timeRef = useRef(0)
  const lastBossRef = useRef(0)
  const spawnTimerRef = useRef(0)
  const inputRef = useRef({ up: false, down: false, left: false, right: false })
  const lastFrameRef = useRef(0)
  const rafRef = useRef<number | null>(null)
  const aliveRef = useRef(true)
  const pausedRef = useRef(false)

  const [hpUI, setHpUI] = useState(100)
  const [maxHpUI, setMaxHpUI] = useState(100)
  const [levelUI, setLevelUI] = useState(1)
  const [xpUI, setXpUI] = useState(0)
  const [timeUI, setTimeUI] = useState(0)
  const [killsUI, setKillsUI] = useState(0)
  const [killsTotalRef] = useState({ n: 0 })
  const [best, setBest] = useState({ time: 0, kills: 0 })
  const [phase, setPhase] = useState<'playing' | 'paused' | 'dead' | 'won'>('playing')
  const [upgradeChoices, setUpgradeChoices] = useState<UpgradeOption[] | null>(null)

  useEffect(() => {
    window.api.settings.get(SAVE_KEY, '{}').then(v => {
      try {
        const d = JSON.parse(v) as { time?: number; kills?: number }
        setBest({ time: d.time ?? 0, kills: d.kills ?? 0 })
      } catch { /* ignore */ }
    })
  }, [])

  useEffect(() => {
    const c = canvasRef.current
    if (!c) return
    c.focus()
    function setKey(e: KeyboardEvent, down: boolean): void {
      const k = e.key.toLowerCase()
      if (k === 'arrowup' || k === 'w') { e.preventDefault(); inputRef.current.up = down }
      else if (k === 'arrowdown' || k === 's') { e.preventDefault(); inputRef.current.down = down }
      else if (k === 'arrowleft' || k === 'a') { e.preventDefault(); inputRef.current.left = down }
      else if (k === 'arrowright' || k === 'd') { e.preventDefault(); inputRef.current.right = down }
    }
    function onDown(e: KeyboardEvent): void { setKey(e, true) }
    function onUp(e: KeyboardEvent): void { setKey(e, false) }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [])

  useEffect(() => {
    lastFrameRef.current = performance.now()
    const loop = (t: number): void => {
      const dt = Math.min(0.05, (t - lastFrameRef.current) / 1000)
      lastFrameRef.current = t
      if (!pausedRef.current) step(dt)
      draw()
      rafRef.current = requestAnimationFrame(loop)
    }
    rafRef.current = requestAnimationFrame(loop)
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function initialPlayer(): Player {
    return {
      x: WORLD_W / 2, y: WORLD_H / 2,
      hp: 100, maxHp: 100,
      speed: 160,
      pickupRadius: 60,
      damageMult: 1,
      cooldownMult: 1,
      armor: 0,
      facing: 0,
      xp: 0, level: 1,
      invul: 0
    }
  }

  function reset(): void {
    playerRef.current = initialPlayer()
    weaponsRef.current = [{ id: 'whip', level: 1, cooldown: 0 }]
    passivesRef.current = new Map()
    enemiesRef.current = []
    projsRef.current = []
    gemsRef.current = []
    damageTextsRef.current = []
    timeRef.current = 0
    lastBossRef.current = 0
    spawnTimerRef.current = 0
    aliveRef.current = true
    pausedRef.current = false
    killsTotalRef.n = 0
    setHpUI(100); setMaxHpUI(100); setLevelUI(1); setXpUI(0); setTimeUI(0); setKillsUI(0)
    setUpgradeChoices(null)
    setPhase('playing')
    canvasRef.current?.focus()
  }

  function spawnEnemies(dt: number): void {
    const t = timeRef.current
    spawnTimerRef.current -= dt
    const baseInterval = Math.max(0.18, 1.4 - t / 240)
    if (spawnTimerRef.current > 0) return
    spawnTimerRef.current = baseInterval

    if (enemiesRef.current.length >= ENEMY_CAP) return

    const burst = 1 + Math.floor(t / 90)
    for (let i = 0; i < burst; i++) {
      if (enemiesRef.current.length >= ENEMY_CAP) break
      const p = playerRef.current
      const angle = Math.random() * Math.PI * 2
      const dist = 480 + Math.random() * 80
      const ex = p.x + Math.cos(angle) * dist
      const ey = p.y + Math.sin(angle) * dist
      enemiesRef.current.push(makeEnemy(t, ex, ey))
    }

    // Boss every 90s
    if (t - lastBossRef.current >= 90 && t > 30) {
      lastBossRef.current = t
      const p = playerRef.current
      const angle = Math.random() * Math.PI * 2
      const ex = p.x + Math.cos(angle) * 520
      const ey = p.y + Math.sin(angle) * 520
      enemiesRef.current.push(makeBoss(t, ex, ey))
    }
  }

  function step(dt: number): void {
    if (phase !== 'playing') return
    timeRef.current += dt
    setTimeUI(timeRef.current)

    const p = playerRef.current

    // Win
    if (timeRef.current >= RUN_DURATION) {
      finishRun(true)
      return
    }

    // Player movement
    let dx = 0, dy = 0
    if (inputRef.current.up) dy -= 1
    if (inputRef.current.down) dy += 1
    if (inputRef.current.left) dx -= 1
    if (inputRef.current.right) dx += 1
    if (dx !== 0 || dy !== 0) {
      const m = Math.hypot(dx, dy)
      dx /= m; dy /= m
      p.x += dx * p.speed * dt
      p.y += dy * p.speed * dt
      p.facing = Math.atan2(dy, dx)
    }
    p.x = Math.max(20, Math.min(WORLD_W - 20, p.x))
    p.y = Math.max(20, Math.min(WORLD_H - 20, p.y))
    if (p.invul > 0) p.invul -= dt

    spawnEnemies(dt)

    // Move enemies
    for (const e of enemiesRef.current) {
      const ex = p.x - e.x
      const ey = p.y - e.y
      const d = Math.hypot(ex, ey) || 1
      e.x += (ex / d) * e.speed * dt
      e.y += (ey / d) * e.speed * dt
      if (e.hitTimer > 0) e.hitTimer -= dt

      // Player damage
      const overlap = e.radius + 14
      if (Math.hypot(ex, ey) < overlap && p.invul <= 0) {
        const dmg = Math.max(1, e.dmg - p.armor)
        p.hp -= dmg
        p.invul = 0.5
        setHpUI(Math.max(0, p.hp))
        if (p.hp <= 0) { finishRun(false); return }
      }
    }

    // Enemy-enemy soft separation (cheap pass over neighbors)
    for (let i = 0; i < enemiesRef.current.length; i++) {
      const a = enemiesRef.current[i]
      for (let j = i + 1; j < enemiesRef.current.length; j++) {
        const b = enemiesRef.current[j]
        const sx = b.x - a.x, sy = b.y - a.y
        const d = Math.hypot(sx, sy)
        const minD = a.radius + b.radius
        if (d > 0 && d < minD) {
          const push = (minD - d) * 0.5
          const nx = sx / d, ny = sy / d
          a.x -= nx * push
          a.y -= ny * push
          b.x += nx * push
          b.y += ny * push
        }
      }
    }

    // Fire weapons
    for (const w of weaponsRef.current) {
      w.cooldown -= dt
      if (w.cooldown > 0) continue
      fireWeapon(w)
    }

    // Move projectiles
    for (const pr of projsRef.current) {
      if (pr.kind === 'bibleOrb') {
        const o = pr as Projectile & { phase?: number; orbR?: number; orbW?: number }
        if (o.phase !== undefined && o.orbR !== undefined && o.orbW !== undefined) {
          o.phase += o.orbW * dt
          pr.x = p.x + Math.cos(o.phase) * o.orbR
          pr.y = p.y + Math.sin(o.phase) * o.orbR
        }
      } else {
        pr.x += pr.vx * dt
        pr.y += pr.vy * dt
      }
      pr.life -= dt
    }
    projsRef.current = projsRef.current.filter(pr => pr.life > 0)

    // Projectile-enemy collisions
    for (const pr of projsRef.current) {
      for (const e of enemiesRef.current) {
        if (e.hp <= 0) continue
        if (pr.hitIds && pr.hitIds.has(enemyKey(e))) continue
        const d = Math.hypot(pr.x - e.x, pr.y - e.y)
        if (d < pr.radius + e.radius) {
          damage(e, pr.dmg)
          if (pr.kind === 'bibleOrb') {
            if (!pr.hitIds) pr.hitIds = new Set()
            pr.hitIds.add(enemyKey(e))
          } else {
            pr.life = 0
            break
          }
        }
      }
    }

    // Cleanup dead enemies, drop gems
    const alive: Enemy[] = []
    for (const e of enemiesRef.current) {
      if (e.hp > 0) {
        alive.push(e)
      } else {
        killsTotalRef.n += 1
        gemsRef.current.push({ x: e.x, y: e.y, value: e.xpValue })
      }
    }
    if (alive.length !== enemiesRef.current.length) {
      enemiesRef.current = alive
      setKillsUI(killsTotalRef.n)
    }

    // Gem pickup
    const pickupSq = p.pickupRadius * p.pickupRadius
    const collectedGems: Gem[] = []
    for (const g of gemsRef.current) {
      const dxg = p.x - g.x
      const dyg = p.y - g.y
      const dsq = dxg * dxg + dyg * dyg
      if (dsq < pickupSq) {
        // attract
        const d = Math.sqrt(dsq) || 1
        g.x += (dxg / d) * 240 * dt
        g.y += (dyg / d) * 240 * dt
        if (d < 18) {
          collectedGems.push(g)
        }
      }
    }
    if (collectedGems.length) {
      let xpGain = 0
      for (const g of collectedGems) xpGain += g.value
      gemsRef.current = gemsRef.current.filter(g => !collectedGems.includes(g))
      p.xp += xpGain
      setXpUI(p.xp)
      while (p.xp >= xpToNext(p.level)) {
        p.xp -= xpToNext(p.level)
        p.level += 1
        setLevelUI(p.level)
        setXpUI(p.xp)
        triggerLevelUp()
      }
    }

    // Damage texts
    for (const dt2 of damageTextsRef.current) {
      dt2.y += dt2.vy * dt
      dt2.life -= dt
    }
    damageTextsRef.current = damageTextsRef.current.filter(d => d.life > 0)
  }

  function enemyKey(e: Enemy): number {
    // Use object identity via WeakMap would be cleaner; just use stable id from position+kind hash
    return (e as Enemy & { _id?: number })._id ??= enemyIdRef.current++
  }

  function damage(e: Enemy, dmg: number): void {
    e.hp -= dmg
    e.hitTimer = 0.12
    damageTextsRef.current.push({
      x: e.x, y: e.y - e.radius - 4,
      vy: -40, life: 0.6,
      text: String(Math.floor(dmg)),
      color: dmg > 30 ? '#fde047' : '#fff'
    })
  }

  function fireWeapon(w: Weapon): void {
    const p = playerRef.current
    if (w.id === 'whip') {
      w.cooldown = whipCooldown(w.level) * p.cooldownMult
      const range = whipRange(w.level)
      const arc = whipArc(w.level)
      const baseDmg = whipDamage(w.level) * p.damageMult
      // alternate left/right based on time
      const dir = Math.floor(timeRef.current * 2) % 2 === 0 ? -1 : 1
      for (const e of enemiesRef.current) {
        const dx = e.x - p.x
        const dy = e.y - p.y
        const d = Math.hypot(dx, dy)
        if (d > range) continue
        const ex = dx / (d || 1)
        // hit cone along ±X axis depending on dir
        if (Math.sign(ex) !== dir) continue
        // arc check: how far off axis
        if (Math.abs(Math.atan2(dy, dx) - (dir > 0 ? 0 : Math.PI)) > arc &&
            Math.abs(Math.atan2(dy, dx) - (dir > 0 ? 0 : -Math.PI)) > arc) continue
        damage(e, baseDmg)
      }
    } else if (w.id === 'wand') {
      w.cooldown = wandCooldown(w.level) * p.cooldownMult
      // Find nearest enemy
      let nearest: Enemy | null = null
      let nd = Infinity
      for (const e of enemiesRef.current) {
        const d = Math.hypot(e.x - p.x, e.y - p.y)
        if (d < nd) { nd = d; nearest = e }
      }
      if (!nearest) return
      const dx = nearest.x - p.x, dy = nearest.y - p.y
      const d = Math.hypot(dx, dy) || 1
      const v = 400
      projsRef.current.push({
        x: p.x, y: p.y,
        vx: (dx / d) * v, vy: (dy / d) * v,
        life: 1.6,
        dmg: wandDamage(w.level) * p.damageMult,
        radius: 7,
        kind: 'wand'
      })
    } else if (w.id === 'garlic') {
      w.cooldown = garlicCooldown(w.level)
      const range = garlicRange(w.level)
      const baseDmg = garlicDamage(w.level) * p.damageMult
      for (const e of enemiesRef.current) {
        const d = Math.hypot(e.x - p.x, e.y - p.y)
        if (d <= range + e.radius) damage(e, baseDmg)
      }
    } else if (w.id === 'knife') {
      w.cooldown = knifeCooldown(w.level) * p.cooldownMult
      const count = knifeCount(w.level)
      const baseDmg = knifeDamage(w.level) * p.damageMult
      const baseAngle = p.facing
      const spread = 0.2
      for (let i = 0; i < count; i++) {
        const a = baseAngle + (i - (count - 1) / 2) * spread
        const v = 460
        projsRef.current.push({
          x: p.x, y: p.y,
          vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          life: 0.9,
          dmg: baseDmg,
          radius: 6,
          kind: 'knife'
        })
      }
    } else if (w.id === 'bible') {
      w.cooldown = bibleCooldown(w.level) * p.cooldownMult
      const count = bibleCount(w.level)
      const dur = bibleDuration(w.level)
      const baseDmg = bibleDamage(w.level) * p.damageMult
      // Spawn orbiting orbs that exist for `dur` seconds; track their orbit via per-frame update tag
      const radius = 90
      const orbV = (Math.PI * 2 * radius) / 0.9   // one revolution per 0.9s
      for (let i = 0; i < count; i++) {
        const phase = (i / count) * Math.PI * 2
        // Build an "orb projectile" with synthetic vx/vy that the orbit code will rewrite each frame;
        // for simplicity, give them a tangential velocity that approximates orbit via re-anchoring in moveBibleOrbs.
        projsRef.current.push({
          x: p.x + Math.cos(phase) * radius,
          y: p.y + Math.sin(phase) * radius,
          vx: 0, vy: 0,
          life: dur,
          dmg: baseDmg,
          radius: 14,
          kind: 'bibleOrb',
          hitIds: new Set()
        })
        // attach orbit metadata
        const orb = projsRef.current[projsRef.current.length - 1] as Projectile & { phase?: number; orbR?: number; orbW?: number }
        orb.phase = phase
        orb.orbR = radius
        orb.orbW = orbV / radius     // angular speed
      }
    }
  }

  // ── Level up / upgrade pool ──────────────────────────────────────────────

  function rollUpgrades(): UpgradeOption[] {
    const opts: UpgradeOption[] = []
    // Existing weapons can level up
    for (const w of weaponsRef.current) {
      if (w.level < WEAPON_LEVEL_CAP) {
        opts.push({ kind: 'weaponLevel', weaponId: w.id, nextLevel: w.level + 1 })
      }
    }
    // New weapons available (up to 6 total)
    if (weaponsRef.current.length < 6) {
      for (const id of ['whip', 'wand', 'garlic', 'knife', 'bible'] as WeaponId[]) {
        if (!weaponsRef.current.find(w => w.id === id)) {
          opts.push({ kind: 'weaponNew', weaponId: id })
        }
      }
    }
    // Passives
    for (const id of ['power', 'haste', 'speed', 'pickup', 'armor', 'maxhp'] as PassiveId[]) {
      const cur = passivesRef.current.get(id) ?? 0
      if (cur < PASSIVE_LEVEL_CAP) {
        opts.push({ kind: 'passive', passiveId: id, nextLevel: cur + 1 })
      }
    }
    // shuffle and pick 3
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[opts[i], opts[j]] = [opts[j], opts[i]]
    }
    return opts.slice(0, 3)
  }

  function triggerLevelUp(): void {
    const choices = rollUpgrades()
    if (choices.length === 0) return    // everything maxed
    setUpgradeChoices(choices)
    pausedRef.current = true
    setPhase('paused')
  }

  function applyUpgrade(opt: UpgradeOption): void {
    if (opt.kind === 'weaponLevel') {
      const w = weaponsRef.current.find(x => x.id === opt.weaponId)
      if (w) w.level += 1
    } else if (opt.kind === 'weaponNew') {
      weaponsRef.current.push({ id: opt.weaponId, level: 1, cooldown: 0 })
    } else if (opt.kind === 'passive') {
      const cur = passivesRef.current.get(opt.passiveId) ?? 0
      passivesRef.current.set(opt.passiveId, cur + 1)
      const p = playerRef.current
      if (opt.passiveId === 'power') p.damageMult = 1 + 0.15 * (cur + 1)
      else if (opt.passiveId === 'haste') p.cooldownMult = Math.max(0.2, 1 - 0.12 * (cur + 1))
      else if (opt.passiveId === 'speed') p.speed = 160 * (1 + 0.12 * (cur + 1))
      else if (opt.passiveId === 'pickup') p.pickupRadius = 60 * (1 + 0.25 * (cur + 1))
      else if (opt.passiveId === 'armor') p.armor = cur + 1
      else if (opt.passiveId === 'maxhp') {
        p.maxHp = 100 + 20 * (cur + 1)
        p.hp = Math.min(p.maxHp, p.hp + 20)
        setHpUI(p.hp); setMaxHpUI(p.maxHp)
      }
    }
    setUpgradeChoices(null)
    pausedRef.current = false
    setPhase('playing')
    canvasRef.current?.focus()
  }

  function finishRun(won: boolean): void {
    if (!aliveRef.current) return
    aliveRef.current = false
    setPhase(won ? 'won' : 'dead')
    const t = Math.floor(timeRef.current)
    const k = killsTotalRef.n
    const newBest = { time: Math.max(best.time, t), kills: Math.max(best.kills, k) }
    if (newBest.time !== best.time || newBest.kills !== best.kills) {
      setBest(newBest)
      window.api.settings.set(SAVE_KEY, JSON.stringify(newBest)).catch(() => {})
    }
  }

  // ── Drawing ──────────────────────────────────────────────────────────────

  function draw(): void {
    const c = canvasRef.current
    if (!c) return
    const ctx = c.getContext('2d')!
    const p = playerRef.current
    const camX = p.x - W / 2
    const camY = p.y - H / 2

    ctx.fillStyle = '#100820'
    ctx.fillRect(0, 0, W, H)

    // Ground grid pattern
    const gridSize = 80
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.08)'
    ctx.lineWidth = 1
    const startX = Math.floor(camX / gridSize) * gridSize
    const startY = Math.floor(camY / gridSize) * gridSize
    for (let gx = startX; gx < camX + W + gridSize; gx += gridSize) {
      ctx.beginPath()
      ctx.moveTo(gx - camX, 0)
      ctx.lineTo(gx - camX, H)
      ctx.stroke()
    }
    for (let gy = startY; gy < camY + H + gridSize; gy += gridSize) {
      ctx.beginPath()
      ctx.moveTo(0, gy - camY)
      ctx.lineTo(W, gy - camY)
      ctx.stroke()
    }

    // Gems
    for (const g of gemsRef.current) {
      const sx = g.x - camX, sy = g.y - camY
      if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue
      ctx.fillStyle = g.value >= 3 ? '#06b6d4' : g.value >= 2 ? '#22d3ee' : '#67e8f9'
      ctx.beginPath()
      ctx.moveTo(sx, sy - 6)
      ctx.lineTo(sx + 5, sy)
      ctx.lineTo(sx, sy + 6)
      ctx.lineTo(sx - 5, sy)
      ctx.closePath()
      ctx.fill()
    }

    // Enemies
    for (const e of enemiesRef.current) {
      const sx = e.x - camX, sy = e.y - camY
      if (sx < -40 || sx > W + 40 || sy < -40 || sy > H + 40) continue
      if (e.hitTimer > 0) ctx.fillStyle = '#fff'
      else if (e.kind === 'zombie') ctx.fillStyle = '#65a30d'
      else if (e.kind === 'bat') ctx.fillStyle = '#7c3aed'
      else if (e.kind === 'skeleton') ctx.fillStyle = '#e7e5e4'
      else if (e.kind === 'wraith') ctx.fillStyle = '#1e293b'
      else if (e.kind === 'boss') ctx.fillStyle = '#dc2626'
      ctx.beginPath()
      ctx.arc(sx, sy, e.radius, 0, Math.PI * 2)
      ctx.fill()
      if (e.kind === 'wraith') {
        ctx.strokeStyle = '#a855f7'
        ctx.lineWidth = 2
        ctx.stroke()
      }
      if (e.kind === 'boss') {
        ctx.fillStyle = '#7f1d1d'
        ctx.fillRect(sx - 18, sy - e.radius - 8, 36, 4)
        ctx.fillStyle = '#fbbf24'
        ctx.fillRect(sx - 18, sy - e.radius - 8, 36 * Math.max(0, e.hp / (400 + Math.floor(timeRef.current / 90) * 400)), 4)
      }
    }

    // Projectiles
    for (const pr of projsRef.current) {
      const sx = pr.x - camX, sy = pr.y - camY
      if (sx < -20 || sx > W + 20 || sy < -20 || sy > H + 20) continue
      if (pr.kind === 'wand') {
        ctx.fillStyle = '#60a5fa'
        ctx.beginPath()
        ctx.arc(sx, sy, pr.radius, 0, Math.PI * 2)
        ctx.fill()
      } else if (pr.kind === 'knife') {
        ctx.fillStyle = '#e2e8f0'
        ctx.beginPath()
        ctx.arc(sx, sy, pr.radius, 0, Math.PI * 2)
        ctx.fill()
      } else if (pr.kind === 'bibleOrb') {
        ctx.fillStyle = '#fde047'
        ctx.beginPath()
        ctx.arc(sx, sy, pr.radius, 0, Math.PI * 2)
        ctx.fill()
        ctx.strokeStyle = '#facc15'
        ctx.lineWidth = 2
        ctx.stroke()
      }
    }

    // Garlic aura if equipped
    const garlic = weaponsRef.current.find(w => w.id === 'garlic')
    if (garlic) {
      const r = garlicRange(garlic.level)
      ctx.strokeStyle = 'rgba(255, 200, 100, 0.35)'
      ctx.fillStyle = 'rgba(255, 200, 100, 0.07)'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.arc(p.x - camX, p.y - camY, r, 0, Math.PI * 2)
      ctx.fill()
      ctx.stroke()
    }

    // Whip flash
    const whip = weaponsRef.current.find(w => w.id === 'whip')
    if (whip && whip.cooldown > whipCooldown(whip.level) * p.cooldownMult - 0.12) {
      const dir = Math.floor(timeRef.current * 2) % 2 === 0 ? -1 : 1
      const range = whipRange(whip.level)
      ctx.fillStyle = 'rgba(254, 240, 138, 0.45)'
      ctx.beginPath()
      ctx.moveTo(p.x - camX, p.y - camY)
      ctx.arc(p.x - camX, p.y - camY, range, dir > 0 ? -0.6 : Math.PI - 0.6, dir > 0 ? 0.6 : Math.PI + 0.6)
      ctx.closePath()
      ctx.fill()
    }

    // Player
    ctx.fillStyle = p.invul > 0 && Math.floor(p.invul * 12) % 2 === 0 ? '#fde68a' : '#c084fc'
    ctx.beginPath()
    ctx.arc(p.x - camX, p.y - camY, 12, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = '#581c87'
    ctx.beginPath()
    ctx.arc(p.x - camX, p.y - camY, 5, 0, Math.PI * 2)
    ctx.fill()

    // Damage texts
    for (const d of damageTextsRef.current) {
      const sx = d.x - camX, sy = d.y - camY
      ctx.fillStyle = d.color
      ctx.globalAlpha = Math.min(1, d.life * 2)
      ctx.font = 'bold 11px ui-monospace, monospace'
      ctx.textAlign = 'center'
      ctx.fillText(d.text, sx, sy)
      ctx.globalAlpha = 1
    }

    // HUD overlay
    // HP bar
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(10, 10, 200, 16)
    ctx.fillStyle = '#dc2626'
    ctx.fillRect(12, 12, 196 * (p.hp / p.maxHp), 12)
    ctx.fillStyle = '#fff'
    ctx.font = 'bold 10px ui-monospace, monospace'
    ctx.textAlign = 'left'
    ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, 14, 22)

    // XP bar
    ctx.fillStyle = 'rgba(0,0,0,0.5)'
    ctx.fillRect(10, 30, 200, 8)
    ctx.fillStyle = '#22d3ee'
    ctx.fillRect(11, 31, 198 * (p.xp / xpToNext(p.level)), 6)
  }

  function fmtTime(s: number): string {
    const m = Math.floor(s / 60)
    const ss = Math.floor(s % 60).toString().padStart(2, '0')
    return `${m}:${ss}`
  }

  return (
    <div className={styles.body}>
      <div className={styles.header}>
        <span>HP <strong>{Math.max(0, Math.ceil(hpUI))} / {maxHpUI}</strong></span>
        <span>Lv <strong>{levelUI}</strong></span>
        <span>XP <strong>{xpUI} / {xpToNext(levelUI)}</strong></span>
        <span>Time <strong>{fmtTime(timeUI)}</strong></span>
        <span>Kills <strong>{killsUI}</strong></span>
        {best.time > 0 && <span>Best <strong>{fmtTime(best.time)} · {best.kills}k</strong></span>}
        <button className={styles.resetBtn} onClick={reset}>↻ New Run</button>
      </div>
      <canvas
        ref={canvasRef}
        width={W}
        height={H}
        className={styles.canvas}
        tabIndex={0}
        onMouseDown={() => canvasRef.current?.focus()}
      />
      <div className={styles.hint}>WASD or arrows to move · weapons fire automatically · pick upgrades on level up</div>
      {phase === 'paused' && upgradeChoices && (
        <div className={styles.overlay}>
          <div className={styles.title}>LEVEL {levelUI}</div>
          <div className={styles.subtitle}>Choose an upgrade</div>
          <div className={styles.upgradeRow}>
            {upgradeChoices.map((opt, i) => (
              <button key={i} className={styles.upgradeCard} onClick={() => applyUpgrade(opt)}>
                <div className={styles.upgradeName}>{describeName(opt)}</div>
                <div className={styles.upgradeDesc}>{describeDesc(opt)}</div>
                <div className={styles.upgradeLevel}>{describeLevel(opt)}</div>
              </button>
            ))}
          </div>
        </div>
      )}
      {phase === 'dead' && (
        <div className={styles.overlay}>
          <div className={styles.title}>YOU DIED</div>
          <div className={styles.subtitle}>{fmtTime(timeUI)} survived · {killsUI} kills</div>
          <button className={styles.btn} onClick={reset}>Try Again</button>
        </div>
      )}
      {phase === 'won' && (
        <div className={styles.overlay}>
          <div className={styles.title}>SURVIVED</div>
          <div className={styles.subtitle}>Ten minutes · {killsUI} kills</div>
          <button className={styles.btn} onClick={reset}>New Run</button>
        </div>
      )}
    </div>
  )
}

// ── Upgrade option helpers ───────────────────────────────────────────────────

type UpgradeOption =
  | { kind: 'weaponLevel'; weaponId: WeaponId; nextLevel: number }
  | { kind: 'weaponNew'; weaponId: WeaponId }
  | { kind: 'passive'; passiveId: PassiveId; nextLevel: number }

function describeName(opt: UpgradeOption): string {
  if (opt.kind === 'weaponLevel') return WEAPON_INFO[opt.weaponId].name
  if (opt.kind === 'weaponNew') return WEAPON_INFO[opt.weaponId].name
  return PASSIVE_INFO[opt.passiveId].name
}

function describeDesc(opt: UpgradeOption): string {
  if (opt.kind === 'weaponLevel') return WEAPON_INFO[opt.weaponId].desc
  if (opt.kind === 'weaponNew') return WEAPON_INFO[opt.weaponId].desc
  return PASSIVE_INFO[opt.passiveId].desc
}

function describeLevel(opt: UpgradeOption): string {
  if (opt.kind === 'weaponLevel') return `Level ${opt.nextLevel} / ${WEAPON_LEVEL_CAP}`
  if (opt.kind === 'weaponNew') return 'New weapon'
  return `Level ${opt.nextLevel} / ${PASSIVE_LEVEL_CAP}`
}
