#!/usr/bin/env node
/**
 * manga-rename — apply "Chapter NNN - Title.cbz" naming to four series.
 *
 * Dry-run by default. Pass --apply to execute.
 *
 * Operations:
 *   - Monster:        delete placeholder Chapter 163, rename 1..162 with titles
 *   - Trigun:         renumber folder 0..20 to 1..21 with titles; map 20.5→21.5, 20.6→000 (pilot)
 *   - Trigun Maximum: move to new folder, rename 1..97 with titles
 *   - Witch Hat Atelier: rename to bare "Chapter NNN" (decimals preserved)
 */

import { renameSync, unlinkSync, mkdirSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { parseArgs } from 'node:util'

const ROOT = 'E:/media/manga'

// ── Titles ────────────────────────────────────────────────────────────────────
// Index = canonical chapter number. Index 0 is unused (placeholder) where titles
// start at chapter 1.

const MONSTER = [
  '',
  'Herr Dr. Tenma','Kill','The Fall','Brother and Sister','Murder','The BKA Man','Monster',
  'Execution Night','Young Woman of Heidelberg','Prince on a White Steed','Missing Person Article',
  'Birthday of Terror','House of Sorrow','Not Your Fault','Pursued','Old Soldier and Young Girl',
  'Past Erased',"Lawyer's Law",'511 Kinderheim','Project','A Little Experiment','Petra and Schumann',
  'Petra and Heinz','The Man Left Behind','The Woman Left Behind','Be My Baby','Professor Gedrich',
  "Ayse's Friend","Wolf's Confession",'Main Dish','Reunion','The Fifth Spoonful of Sugar',
  "The Monster's Abyss","Jurgens's Cellar",'After the Carnival','Journey to Freiham','A Happy Holiday',
  'Revenge at Gunpoint','A Brighter Tomorrow',"Lunge's Prediction","Lunge's Trap",'Showdown',
  'Rock Bottom',"Eva's Confession","Men's Table",'Unseen Enemy',"Tuesday's Boy","Thursday's Boy",
  'The Riddle Left Behind','The Secret Forest','Richard','Proof','Brought to Light','One Case',
  'Journey to Johan','Execution','A Decision',"Reichwein's Days",'Into the Light of Day','Verifiable',
  'After the Party','Holy Land',"The Children's View","Humanity's Legacy",'The Deepest Darkness',
  'Shining a Light','I Am Tenma','Unnamed Hero','A Greater Monster','Beast of Chaos',
  'The Nameless Monster',"The Ants' Banquet",'Demon in My Eyes','A Letter From Mother',
  'Traces of the Heart','Hell in His Eyes','The Frogs of Fairy Tale Land','Grimmer','Picnic',
  'The Ghost of 511','A New Experiment','Key','The Adventures of the Magnificent Steiner',
  'Detective Suk','A Top Secret Investigation','Something Important','Double Darkness',
  'Remnants of a Monster','Replay','Point of Contact','Blind Spot',
  'Memories of the Magnificent Steiner','Memories of Hot Cocoa','Door to a Nightmare',
  'Greatest Fear','A Long Vacation','Boy Detectives','The Cruelest Thing','Border Town',
  'House of Roses','The Sealed Door','A Long Goodbye','In Search of Helenka','The Ones Left Behind',
  'Love Letter from a Monster','The Escapee','The Lawyer','The Witness','Decision',
  'Muddy Sandwiches','Helene and Gustav','Escape','Room 402',"The Spy's Child",'Endless Journey',
  'Puppeteer','The Reading Group Children','That Night','What Johan Saw','Happy Memories',
  'The Bad Job','The Worst Necktie',"Party's Over",'The Man Who Saw a Devil',"The Devil's Friend",
  'The Man Who Knew Too Much','Sad Reunion',"Nina's Memory",'Reading Group Memories',
  'Doorway to a Memory','A Happy Table','Beyond the Rooftops','Response to Friendship',
  'Taxi Driver','Unrelated Murders',"The Baby's Gloom",'Footsteps of Terror','Traces of Johan',
  'Massacre','Father and Mother','Welcome Home',"I'm Back",'The Place to Go','Ruhenheim',
  'A Quiet Gunshot',"The Vampire's House",'Paranoia Town','Perfect Suicide','A Peaceful Home',
  'Massacre Town','A Memory to Keep','A Fictional Character',"Vacation's End","Grimmer's Scream",
  "The Magnificent Steiner's Rage",'The Nameless Man','Undrawable Pictures',"Don't Cry",
  'A Vision of the End','The Living','Tomorrow Will Come','The Real Monster',
]

const TRIGUN = [
  '',
  'High Noon at July','The 60,000,000,000.00$$ Man','Looney Tunes','Hard Puncher','Popo','Assault',
  'Die Hards','Rem','Duelist','And Between Field and Sky','Little Arcadia','Son','River of Life',
  'Blood and Thunder','Diablo','Fragile','Scar','Slaughtered Cafe','Demon Squad','Invisible Eye',
  'Fifth Moon',
]

const TRIGUN_MAXIMUM = [
  '',
  'Hero Reborn','Lina',"Bravo, Girls!",'Hero Returns','Dancing Revolver','Sin',
  'Return of the Blue Wing of Death','Resume our Business','Samurai Showdown','Wolfwood',
  'Desperado','Home Sweet Home','Darkness','Reservoir Dogs','Cement','No Escape',
  'Emilio the Player','Long Goodbye','Families','His Life as a...','Countdown','Bluesy Killer Horn',
  'Bottom of the Dark','Den of Thieves','Crying Wild Bullet','Those Who Stood Idly By',
  'Doomed Sinner','The City And Then The Banquet of Dogs','Breakout','Loss','Villain','Death Deal',
  'Let Us Walk the Path to Redemption','The Gunslinger','double team','Cross X Assassins',
  'Death Omen','Colorless Expression','Seeds Voyaging to the Stars, A World Inside a Pod',
  'happy days','Separate Ways','The King of Loneliness','Good For Nothing and the Blues',
  'When They Arrived, It Was Already the Beginning of the End','Conflict','Invasion','Silent Ruin',
  'Counter-Attack','Escape','Separate Paths','Wolfwood Spin Off - Freed Bird','Home','Gale','LR',
  'Battle to the Death','Prostrate Demon','Fortitude','Reckless Conduct','Sworn Friend',
  'Sudden Change','Death Omen','Final Battle','Homecoming','Wolfwood','Final Farewell',
  'Zero Hour','Slap Sticks Days','Thunderstruck','Return of the Wicked','Get Ready, Get Set',
  'Someone to Defend','The Journey Ends - But Heavy Breathing Still Echoes','Corrosive Thunder',
  'The Interceptor','The Gunslinger','Plus Minus Zero','resonance','Run Livio Run','Lantern',
  'Their Own World','False Doppleganger','Double Duel','Demon Fire','Black','Battle of the Mystics',
  'Tag in a Person','catch-as-catch-can','Apex Wings','VS','When Conflict Comes to An End',
  'overkill','Side by Side','Never give up - Never surrender','Ticket to the Future','Mind Games',
  'Double Wings','Never Ending Song',
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function sanitize(name) {
  return name.replace(/[<>:"/\\|?*]/g, '').replace(/\s+/g, ' ').trim()
}

function padChapter(numStr) {
  const [intPart, decPart] = String(numStr).split('.')
  return intPart.padStart(3, '0') + (decPart ? '.' + decPart : '')
}

function formatName(numStr, title) {
  const padded = padChapter(numStr)
  return title ? `Chapter ${padded} - ${sanitize(title)}.cbz` : `Chapter ${padded}.cbz`
}

// ── Operation builders ────────────────────────────────────────────────────────

function buildMonsterOps() {
  const dir = `${ROOT}/Monster`
  const ops = []
  ops.push({ kind: 'delete', src: `${dir}/Chapter 163.cbz` })
  for (let n = 1; n <= 162; n++) {
    // Source filenames are inconsistent: "Chapter 1.cbz" but others have date suffix
    const src1 = `${dir}/Chapter ${n}.cbz`
    const src2 = `${dir}/Chapter ${n} January 9, 2026.cbz`
    const src = existsSync(src1) ? src1 : src2
    const dst = `${dir}/${formatName(n, MONSTER[n])}`
    ops.push({ kind: 'rename', src, dst })
  }
  return ops
}

function buildTrigunOps() {
  const dir = `${ROOT}/Trigun`
  const ops = []
  // Folder Chapter 0..20 → renumbered to Chapter 1..21 (with title)
  for (let folderN = 0; folderN <= 20; folderN++) {
    const canonicalN = folderN + 1
    const src = `${dir}/Trigun, Chapter ${folderN}.cbz`
    const dst = `${dir}/${formatName(canonicalN, TRIGUN[canonicalN])}`
    ops.push({ kind: 'rename', src, dst })
  }
  // Extras
  ops.push({
    kind: 'rename',
    src: `${dir}/Trigun, Chapter 20.5.cbz`,
    dst: `${dir}/${formatName('21.5', 'Turn to the Maximum')}`,
  })
  ops.push({
    kind: 'rename',
    src: `${dir}/Trigun, Chapter 20.6.cbz`,
    dst: `${dir}/${formatName('0', 'Trigun Pilot')}`,
  })
  return ops
}

function buildTrigunMaximumOps() {
  const srcDir = `${ROOT}/Trigun`
  const dstDir = `${ROOT}/Trigun Maximum`
  const ops = []
  ops.push({ kind: 'mkdir', path: dstDir })
  for (let n = 1; n <= 97; n++) {
    const src = `${srcDir}/Trigun Maximum, Chapter ${n}.cbz`
    const dst = `${dstDir}/${formatName(n, TRIGUN_MAXIMUM[n])}`
    ops.push({ kind: 'rename', src, dst })
  }
  return ops
}

function buildWhaOps() {
  const dir = `${ROOT}/Witch Hat Atelier`
  const ops = []
  for (const f of readdirSync(dir)) {
    const m = f.match(/^Witch Hat Atelier, Chapter (\d+(?:\.\d+)?)\.cbz$/)
    if (!m) continue
    const src = `${dir}/${f}`
    const dst = `${dir}/${formatName(m[1], null)}`
    if (src === dst) continue
    ops.push({ kind: 'rename', src, dst })
  }
  return ops
}

// ── Runner ────────────────────────────────────────────────────────────────────

function runOps(ops, label, apply) {
  console.log(`\n── ${label} ${'─'.repeat(Math.max(0, 50 - label.length))}`)
  let ok = 0, missing = 0, conflict = 0, skipped = 0

  for (const op of ops) {
    if (op.kind === 'mkdir') {
      if (existsSync(op.path)) {
        console.log(`  mkdir (exists): ${op.path}`)
        skipped++
      } else {
        console.log(`  mkdir: ${op.path}`)
        if (apply) mkdirSync(op.path, { recursive: true })
        ok++
      }
      continue
    }
    if (op.kind === 'delete') {
      if (!existsSync(op.src)) {
        console.log(`  ?  missing: ${op.src}`)
        missing++
        continue
      }
      console.log(`  delete: ${op.src}`)
      if (apply) unlinkSync(op.src)
      ok++
      continue
    }
    if (op.kind === 'rename') {
      if (!existsSync(op.src)) {
        console.log(`  ?  missing: ${op.src}`)
        missing++
        continue
      }
      if (existsSync(op.dst) && op.src !== op.dst) {
        console.log(`  !  conflict: ${op.dst} already exists`)
        conflict++
        continue
      }
      const shortSrc = op.src.split('/').pop()
      const shortDst = op.dst.split('/').pop()
      console.log(`  ${shortSrc}  →  ${shortDst}`)
      if (apply) renameSync(op.src, op.dst)
      ok++
    }
  }
  return { ok, missing, conflict, skipped }
}

function main() {
  const { values } = parseArgs({
    options: { apply: { type: 'boolean', default: false } },
  })
  const apply = values.apply

  console.log(`[${apply ? 'APPLY' : 'DRY-RUN'}] manga-rename`)

  const totals = { ok: 0, missing: 0, conflict: 0, skipped: 0 }
  const sections = [
    ['Monster',         buildMonsterOps()],
    ['Trigun',          buildTrigunOps()],
    ['Trigun Maximum',  buildTrigunMaximumOps()],
    ['Witch Hat Atelier', buildWhaOps()],
  ]
  for (const [label, ops] of sections) {
    const r = runOps(ops, label, apply)
    totals.ok += r.ok
    totals.missing += r.missing
    totals.conflict += r.conflict
    totals.skipped += r.skipped
  }

  console.log('\n──────────────────────────────────────────────────')
  console.log(`Ops: ${totals.ok}  Missing: ${totals.missing}  Conflicts: ${totals.conflict}  Skipped: ${totals.skipped}`)
  if (!apply) console.log('\nDry-run only. Re-run with --apply to execute.')
}

main()
