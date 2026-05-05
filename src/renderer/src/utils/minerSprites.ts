// Sprite system for pixel-art rendering

export const TILE_PX = 16    // native sprite size in pixels
export const SCALE = 2       // canvas scale factor
export const CELL = TILE_PX * SCALE  // 32px per tile on canvas

export const PAL = {
  // wall
  wallDark:  '#0a0a14',
  wallMid:   '#1a1a2e',
  wallLight: '#2a2a44',
  wallEdge:  '#3a3a5c',
  // floor
  floorDark: '#0c0c18',
  floorMid:  '#16162a',
  floorLight:'#20203a',
  // dirt
  dirtDark:  '#3a2810',
  dirtMid:   '#5c3e1a',
  dirtLight: '#7a5424',
  dirtSpec:  '#3a2810',
  // stone
  stoneDark: '#2a2a3e',
  stoneMid:  '#3e3e58',
  stoneLight:'#5a5a78',
  // gem (cyan)
  gemCore:   '#22d3ee',
  gemEdge:   '#0891b2',
  gemHi:     '#cffafe',
  // gold
  goldCore:  '#e8b44b',
  goldEdge:  '#92650a',
  goldHi:    '#fef3c7',
  // accents
  stairsBright: '#4ade80',
  stairsDim:    '#16a34a',
  vaultDark:    '#451a03',
  vaultBand:    '#92650a',
  vaultGold:    '#e8b44b',
  // entities
  playerBody:   '#4ade80',
  playerDark:   '#166534',
  playerHi:     '#bbf7d0',
  crawlerBody:  '#dc2626',
  crawlerDark:  '#7f1d1d',
  guardBody:    '#f97316',
  guardArmor:   '#9a3412',
  guardHi:      '#fed7aa',
  bruteBody:    '#a855f7',
  bruteDark:    '#581c87',
  shooterBody:  '#fbbf24',
  shooterDark:  '#78350f',
  projectile:   '#fbbf24',
  black:        '#000000',
  fogVisited:   'rgba(8, 12, 32, 0.78)',
} as const

export interface Sprite {
  pixels: string[]
  map: Record<string, string>
}

// ── FLOOR VARIANTS ──

export const SPRITE_FLOOR_A: Sprite = {
  pixels: [
    '................',
    '.......H........',
    '................',
    '....H...........',
    '................',
    '.........H......',
    '................',
    '................',
    '.....H..........',
    '................',
    '................',
    '.......H........',
    '................',
    '........H.......',
    '................',
    '................',
  ],
  map: { 'H': PAL.floorLight, '.': PAL.floorDark },
}

export const SPRITE_FLOOR_B: Sprite = {
  pixels: [
    '................',
    '.....H..........',
    '................',
    '................',
    '.........H......',
    '................',
    '......H.........',
    '................',
    '................',
    '....H...........',
    '................',
    '.........H......',
    '................',
    '................',
    '....H...........',
    '................',
  ],
  map: { 'H': PAL.floorLight, '.': PAL.floorDark },
}

export const SPRITE_FLOOR_C: Sprite = {
  pixels: [
    '................',
    '................',
    '.......H........',
    '................',
    '.....H..........',
    '................',
    '................',
    '.........H......',
    '................',
    '....H...........',
    '................',
    '.......H........',
    '................',
    '.........H......',
    '................',
    '................',
  ],
  map: { 'H': PAL.floorLight, '.': PAL.floorDark },
}

// ── DIRT VARIANTS ──

export const SPRITE_DIRT_A: Sprite = {
  pixels: [
    '................',
    '.....D..D.......',
    '................',
    '......D.........',
    '................',
    '..D....D.......H',
    '................',
    '.........D......',
    '................',
    '.......D........',
    '................',
    '....D...........',
    '................',
    '.D.........D...H',
    '................',
    '................',
  ],
  map: { 'D': PAL.dirtSpec, 'H': PAL.dirtLight, '.': PAL.dirtMid },
}

export const SPRITE_DIRT_B: Sprite = {
  pixels: [
    '................',
    '......D.........',
    '................',
    '.....D.......D..',
    '................',
    '.........D......H',
    '................',
    '....D...........',
    '................',
    '.....D........D.',
    '................',
    '.D....D.........',
    '................',
    '.......D.......H',
    '................',
    '................',
  ],
  map: { 'D': PAL.dirtSpec, 'H': PAL.dirtLight, '.': PAL.dirtMid },
}

export const SPRITE_DIRT_C: Sprite = {
  pixels: [
    '................',
    '...D.......D....',
    '................',
    '.......D........',
    '................',
    '....D.........DH',
    '................',
    '.......D........',
    '................',
    '......D.........',
    '................',
    '...D.....D....H.',
    '................',
    '.......D........',
    '................',
    '................',
  ],
  map: { 'D': PAL.dirtSpec, 'H': PAL.dirtLight, '.': PAL.dirtMid },
}

// ── STONE ──

export const SPRITE_STONE: Sprite = {
  pixels: [
    'DDDDDDDDDDDDDDDD',
    'DSSSSSSSSSSSSSD.',
    'DSMMMMMMMMMMMD..',
    'DSMMMMMMMMMSD...',
    'DSMMMMMMMMSD....',
    'DSMMMMMMMSD.....',
    'DSMMMMMMSD......',
    'DSMMMMMSD.......',
    'DSMMMMSD........',
    'DSMMMSD.........',
    'DSMMSD..........',
    'DSMSD...........',
    'DSSD............',
    'DSD.............',
    'DD..............',
    '................',
  ],
  map: { 'D': PAL.stoneDark, 'S': PAL.stoneLight, 'M': PAL.stoneMid, '.': PAL.stoneMid },
}

// ── GEM DIRT ──

export const SPRITE_GEM_DIRT: Sprite = {
  pixels: [
    '................',
    '.....D..D.......',
    '................',
    '......D.........',
    '..........C.....',
    '..D....D..CCC..H',
    '..........CCC...',
    '.........CCC....',
    '....C....C...D..',
    '..CCCC..CCCC....',
    '..CCGCCCCCCCC...',
    '..CCCGCCCCCC....',
    '.D..CCCCCC...H..',
    '.....D.......D..',
    '................',
    '................',
  ],
  map: { 'D': PAL.dirtSpec, 'H': PAL.dirtLight, 'C': PAL.gemEdge, 'G': PAL.gemHi, '.': PAL.dirtMid },
}

// ── GOLD DIRT ──

export const SPRITE_GOLD_DIRT: Sprite = {
  pixels: [
    '................',
    '.....D..D.......',
    '................',
    '......D.........',
    '..........G.....',
    '..D....D..GGG..H',
    '..........GGG...',
    '.........GGG....',
    '....G....G...D..',
    '..GGGG..GGGG....',
    '..GGCGGGGGGGG...',
    '..GGGCGGGGGG....',
    '.D..GGGGGG...H..',
    '.....D.......D..',
    '................',
    '................',
  ],
  map: { 'D': PAL.dirtSpec, 'H': PAL.dirtLight, 'G': PAL.goldCore, 'C': PAL.goldEdge, '.': PAL.dirtMid },
}

// ── STAIRS ──

export const SPRITE_STAIRS: Sprite = {
  pixels: [
    '................',
    '.....SSSSSS.....',
    '.....SSSSSS.....',
    '.....S.SSSSS....',
    '.....S.SSSSS....',
    '.....S.S.SSSSS..',
    '.....S.S.SSSSS..',
    '.....S.S.S.SSSS.',
    '.....S.S.S.SSSS.',
    '.....S.S.S.S.DDD',
    '.....S.S.S.S.DDD',
    '.....S.S.S.S.DDD',
    '......DDDDDDDDD.',
    '......DDDDDDDDD.',
    '......DDDDDDDDD.',
    '................',
  ],
  map: { 'S': PAL.stairsBright, 'D': PAL.stairsDim, '.': PAL.floorDark },
}

// ── VAULT DOOR ──

export const SPRITE_VAULT_DOOR: Sprite = {
  pixels: [
    '................',
    '.......VV.......',
    '.....VVVVVV.....',
    '....VVVVVVVV....',
    '....VVG.GVVV....',
    '....VVVVVVVV....',
    '....VVVVVVVV....',
    '....VVVVVVVV....',
    '....VVBBBVVV....',
    '....VVBGBVVV....',
    '....VVBBBVVV....',
    '....VVVVVVVV....',
    '....VVVVVVVV....',
    '....VVVVVVVV....',
    '.....VVVVVV.....',
    '................',
  ],
  map: { 'V': PAL.vaultDark, 'B': PAL.vaultBand, 'G': PAL.vaultGold, '.': PAL.floorDark },
}

// ── VAULT FLOOR ──

export const SPRITE_VAULT_FLOOR: Sprite = {
  pixels: [
    '................',
    '.......H........',
    '................',
    '....H..G........',
    '................',
    '.........H......',
    '................',
    '.G............H.',
    '................',
    '....H.........G.',
    '................',
    '.....H........G.',
    '................',
    '........H.......',
    '................',
    '................',
  ],
  map: { 'H': PAL.floorLight, 'G': PAL.vaultGold, '.': PAL.floorDark },
}

// ── WALLS (16 autotile variants) ──

const makeWallSprite = (
  n: boolean, e: boolean, s: boolean, w: boolean
): Sprite => {
  const pixels: string[] = []
  for (let y = 0; y < 16; y++) {
    let row = ''
    for (let x = 0; x < 16; x++) {
      const isEdge = (y === 0 && n) || (x === 15 && e) || (y === 15 && s) || (x === 0 && w)
      const isCorner = (y === 0 && x === 0 && n && w) ||
                       (y === 0 && x === 15 && n && e) ||
                       (y === 15 && x === 0 && s && w) ||
                       (y === 15 && x === 15 && s && e)
      row += isCorner ? 'E' : isEdge ? 'L' : x === 0 || x === 15 || y === 0 || y === 15 ? 'M' : 'D'
    }
    pixels.push(row)
  }
  return {
    pixels,
    map: { 'D': PAL.wallDark, 'M': PAL.wallMid, 'L': PAL.wallLight, 'E': PAL.wallEdge },
  }
}

export const SPRITE_WALL: Sprite[] = [
  makeWallSprite(false, false, false, false), // 0000
  makeWallSprite(true, false, false, false),  // 0001 (N)
  makeWallSprite(false, false, true, false),  // 0010 (S)
  makeWallSprite(true, false, true, false),   // 0011 (N,S)
  makeWallSprite(false, true, false, false),  // 0100 (E)
  makeWallSprite(true, true, false, false),   // 0101 (N,E)
  makeWallSprite(false, true, true, false),   // 0110 (E,S)
  makeWallSprite(true, true, true, false),    // 0111 (N,E,S)
  makeWallSprite(false, false, false, true),  // 1000 (W)
  makeWallSprite(true, false, false, true),   // 1001 (N,W)
  makeWallSprite(false, false, true, true),   // 1010 (S,W)
  makeWallSprite(true, false, true, true),    // 1011 (N,S,W)
  makeWallSprite(false, true, false, true),   // 1100 (E,W)
  makeWallSprite(true, true, false, true),    // 1101 (N,E,W)
  makeWallSprite(false, true, true, true),    // 1110 (E,S,W)
  makeWallSprite(true, true, true, true),     // 1111 (all)
]

// ── ENTITIES ──

export const SPRITE_PLAYER_0: Sprite = {
  pixels: [
    '................',
    '.....BBBBB......',
    '....BDDDDDB.....',
    '....BDHHHDB.....',
    '....BDHHHDB.....',
    '.....BDDDB......',
    '...BBBDDDBBB....',
    '..BBBBBDBBBBB...',
    '..BBBBBDBBBBB...',
    '..BBBBBBBBBB....',
    '..BBBBBBBBBB....',
    '...BBBBBBBBB....',
    '....BBB.BBB.....',
    '....DDD.DDD.....',
    '....DDD.DDD.....',
    '................',
  ],
  map: { 'B': PAL.playerBody, 'D': PAL.playerDark, 'h': PAL.playerHi, '.': null as any },
}

export const SPRITE_PLAYER_1: Sprite = {
  pixels: [
    '................',
    '.....BBBBB......',
    '....BDDDDDB.....',
    '....BDHHHDB.....',
    '....BDHHHDB.....',
    '.....BDDDB......',
    '...BBBDDDBBB....',
    '..BBBBBDBBBBB...',
    '..BBBBBDBBBBB...',
    '..BBBBBBBBBB....',
    '..BBBBBBBBBB....',
    '...BBBBBBB......',
    '....BBB.BBB.....',
    '....DDD.DDD.....',
    '................',
    '................',
  ],
  map: { 'B': PAL.playerBody, 'D': PAL.playerDark, 'h': PAL.playerHi, '.': null as any },
}

export const SPRITE_CRAWLER_0: Sprite = {
  pixels: [
    '................',
    '.......CC.......',
    '......CCCC......',
    '.....CCCCCC.....',
    '.....CCCCCC.....',
    '....CCCDDCCC....',
    '...CCCDDDDDCC...',
    '...CCDDDDDDCC...',
    '..CCCDDDDDDDCC..',
    '..CCDDDDDDDDCC..',
    '..LCCDDDDDDCC.R.',
    '..LCCCDDDDCC.R..',
    '.LLCCCCCCCC.RR..',
    '.LLL.CCC.RRR....',
    '.LLL.CCC.RRR....',
    '................',
  ],
  map: { 'C': PAL.crawlerBody, 'D': PAL.crawlerDark, 'L': PAL.crawlerDark, 'R': PAL.crawlerDark, '.': null as any },
}

export const SPRITE_CRAWLER_1: Sprite = {
  pixels: [
    '................',
    '.......CC.......',
    '......CCCC......',
    '.....CCCCCC.....',
    '.....CCCCCC.....',
    '....CCCDDCCC....',
    '...CCCDDDDDCC...',
    '...CCDDDDDDCC...',
    '..CCCDDDDDDDCC..',
    '..CCDDDDDDDDCC..',
    '.LLCCDDDDDDCC.RR',
    '.LLCCCDDDDCC.RR.',
    '..LCC.CCCC.RR...',
    '....L.CCC.R.....',
    '................',
    '................',
  ],
  map: { 'C': PAL.crawlerBody, 'D': PAL.crawlerDark, 'L': PAL.crawlerDark, 'R': PAL.crawlerDark, '.': null as any },
}

export const SPRITE_GUARD_0: Sprite = {
  pixels: [
    '................',
    '.....AAAAAA.....',
    '....AOOOOOA.....',
    '....AOOOOOA.....',
    '....AOGGOBA.....',
    '....AOOOOOA.....',
    '....AOOOOOA.....',
    '...AAAOOAAAA....',
    '..GGGGGGGGGGG...',
    '..GGGGGGGGGGG...',
    '..GGGGGGGGGGG...',
    '...GGGG.GGGG....',
    '....GGG.GGG.....',
    '....GGG.GGG.....',
    '....GGG.GGG.....',
    '................',
  ],
  map: { 'A': PAL.guardArmor, 'O': PAL.guardBody, 'G': PAL.guardHi, '.': null as any },
}

export const SPRITE_GUARD_1: Sprite = {
  pixels: [
    '................',
    '.....AAAAAA.....',
    '....AOOOOOA.....',
    '....AOOOOOA.....',
    '....AOGGOBA.....',
    '....AOOOOOA.....',
    '....AOOOOOA.....',
    '...AAAOOAAAA....',
    '..GGGGGGGGGGG...',
    '..GGGGGGGGGGG...',
    '..GGGGGGGGGGG...',
    '...GGGG.GGGG....',
    '....GGG.GGG.....',
    '....GGG.GGG.....',
    '................',
    '................',
  ],
  map: { 'A': PAL.guardArmor, 'O': PAL.guardBody, 'G': PAL.guardHi, '.': null as any },
}

export const SPRITE_BRUTE_0: Sprite = {
  pixels: [
    '......HHHHHH....',
    '....HHHHHHHHHH..',
    '...HHHHHHHHHHHH.',
    '...HBBBBBBBBBH..',
    '...HBBBBBBBBBH..',
    '...HBBBBPBBBBH..',
    '...HBBBBBBBBBH..',
    '...HBBBBBBBBBH..',
    '..HHBBBBBBBBBHH.',
    '..HHBBBBBBBBBHH.',
    '..HHBBBBBBBBBHH.',
    '...HBBBB.BBBBH..',
    '....HBB...BBH...',
    '....HBB...BBH...',
    '....HBB...BBH...',
    '................',
  ],
  map: { 'H': PAL.bruteDark, 'B': PAL.bruteBody, 'P': PAL.bruteDark, '.': null as any },
}

export const SPRITE_BRUTE_1: Sprite = {
  pixels: [
    '....HHHHHHHH....',
    '..HHHHHHHHHHHH..',
    '.HHHHHHHHHHHHHH.',
    '.HBBBBBBBBBBBH..',
    '.HBBBBBBBBBBBH..',
    '.HBBBBPBBBBBH...',
    '.HBBBBBBBBBBBH..',
    '.HBBBBBBBBBBBH..',
    '.HHBBBBBBBBBHH..',
    '.HHBBBBBBBBBHH..',
    '.HHBBBBBBBBBHH..',
    '..HBBBB.BBBBH...',
    '...HBB...BBH....',
    '...HBB...BBH....',
    '................',
    '................',
  ],
  map: { 'H': PAL.bruteDark, 'B': PAL.bruteBody, 'P': PAL.bruteDark, '.': null as any },
}

export const SPRITE_SHOOTER_0: Sprite = {
  pixels: [
    '................',
    '.......SS.......',
    '......SSSS......',
    '.....SSSSSS.....',
    '.....SYSSYS.....',
    '....SYSSSYSS....',
    '....SYSSSYS...S.',
    '....SYSSSYS..SSS',
    '...SSYSSSYSSS...',
    '...SSYSSSYSSS...',
    '..SSSYSSSYSSS...',
    '...SSYSS.SYSSS..',
    '....SSS...SSS...',
    '....SSS...SSS...',
    '....SSS...SSS...',
    '................',
  ],
  map: { 'S': PAL.shooterBody, 'Y': PAL.shooterDark, '.': null as any },
}

export const SPRITE_SHOOTER_1: Sprite = {
  pixels: [
    '................',
    '.......SS.......',
    '......SSSS......',
    '.....SSSSSS.....',
    '.....SYSSYS.....',
    '....SYSSSYSS....',
    '....SYSSSYS.S...',
    '....SYSSSYS.SSS.',
    '...SSYSSSYSSS...',
    '...SSYSSSYSSS...',
    '..SSSYSSSYSSS...',
    '...SSYSS.SYSSS..',
    '....SSS...SSS...',
    '....SSS...SSS...',
    '................',
    '................',
  ],
  map: { 'S': PAL.shooterBody, 'Y': PAL.shooterDark, '.': null as any },
}

export const SPRITE_PROJECTILE: Sprite = {
  pixels: [
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
    '......GGG.......',
    '......GYG.......',
    '......GGG.......',
    '................',
    '................',
    '................',
    '................',
    '................',
    '................',
  ],
  map: { 'G': PAL.projectile, 'Y': PAL.goldHi, '.': null as any },
}

// ── RENDERING HELPERS ──

export function drawSprite(
  ctx: CanvasRenderingContext2D,
  sprite: Sprite,
  cellX: number,
  cellY: number,
  options?: { flipX?: boolean }
): void {
  const px = cellX * CELL
  const py = cellY * CELL
  for (let y = 0; y < TILE_PX; y++) {
    const row = sprite.pixels[y]
    for (let x = 0; x < TILE_PX; x++) {
      const ch = row[x]
      if (ch === '.' || !ch) continue
      const color = sprite.map[ch]
      if (!color) continue
      ctx.fillStyle = color
      const drawX = options?.flipX ? px + (TILE_PX - 1 - x) * SCALE : px + x * SCALE
      ctx.fillRect(drawX, py + y * SCALE, SCALE, SCALE)
    }
  }
}

export function variantFor(x: number, y: number, count: number): number {
  return ((x * 73856093) ^ (y * 19349663)) % count
}

export function getWallVariant(x: number, y: number, grid: any[][]): number {
  const MAP_W = grid[0]?.length ?? 32
  const MAP_H = grid.length ?? 18
  const n = y > 0 && grid[y - 1]?.[x] === 'wall' ? 1 : 0
  const e = x < MAP_W - 1 && grid[y]?.[x + 1] === 'wall' ? 2 : 0
  const s = y < MAP_H - 1 && grid[y + 1]?.[x] === 'wall' ? 4 : 0
  const w = x > 0 && grid[y]?.[x - 1] === 'wall' ? 8 : 0
  return n | e | s | w
}
