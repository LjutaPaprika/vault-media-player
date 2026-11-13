#!/usr/bin/env node
// Converts build/icon.svg → build/icon.png + build/icon.ico + build/icon-mac.png
// ICO uses traditional BMP (DIB) image data for maximum rcedit/Windows compatibility.
// Sizes up to SMALL_MAX come from build/icon-small.svg, a simplified drawing:
// the full one's detail (the door's bolts) turns to mush at 16px.

const sharp = require('sharp')
const fs = require('fs')
const path = require('path')

const buildDir = path.join(__dirname, '..', 'build')
const svgPath      = path.join(buildDir, 'icon.svg')
const smallSvgPath = path.join(buildDir, 'icon-small.svg')
const pngPath      = path.join(buildDir, 'icon.png')
const icoPath      = path.join(buildDir, 'icon.ico')
const macPngPath   = path.join(buildDir, 'icon-mac.png')

const SIZES = [16, 24, 32, 48, 64, 128, 256]
const SMALL_MAX = 24

// macOS draws app icons on a 1024 canvas with the tile inset 100px each side
// (Apple's icon grid); a full-bleed tile looks oversized in the Dock.
const MAC_CANVAS = 1024
const MAC_INSET = 100

// Render from the SVG at the target size (density scales the vector up front),
// rather than rasterising at 256 and shrinking, so small sizes stay crisp.
function render(svg, size) {
  return sharp(svg, { density: Math.max(72, Math.ceil((72 * size) / 256) * 2) }).resize(size, size)
}

async function renderRgba(size) {
  const svg = size <= SMALL_MAX && fs.existsSync(smallSvgPath) ? smallSvgPath : svgPath
  return render(svg, size).ensureAlpha().raw().toBuffer()
}

function makeDib(rawRgba, size) {
  // Convert RGBA top-down → BGRA bottom-up (BMP pixel order)
  const pixels = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const src = ((size - 1 - y) * size + x) * 4
      const dst = (y * size + x) * 4
      pixels[dst + 0] = rawRgba[src + 2] // B
      pixels[dst + 1] = rawRgba[src + 1] // G
      pixels[dst + 2] = rawRgba[src + 0] // R
      pixels[dst + 3] = rawRgba[src + 3] // A
    }
  }

  // AND mask: 1-bit per pixel, rows padded to 4-byte boundary, all 0 (use alpha)
  const andRowBytes = Math.ceil(Math.ceil(size / 8) / 4) * 4
  const andMask = Buffer.alloc(andRowBytes * size, 0)

  // BITMAPINFOHEADER (40 bytes)
  const bih = Buffer.alloc(40)
  bih.writeUInt32LE(40, 0)        // biSize
  bih.writeInt32LE(size, 4)       // biWidth
  bih.writeInt32LE(size * 2, 8)   // biHeight × 2 (ICO convention: XOR + AND masks)
  bih.writeUInt16LE(1, 12)        // biPlanes
  bih.writeUInt16LE(32, 14)       // biBitCount
  bih.writeUInt32LE(0, 16)        // biCompression = BI_RGB
  // remaining fields are 0

  return Buffer.concat([bih, pixels, andMask])
}

async function run() {
  // 1. SVG → PNG at 256×256 (reference copy)
  await render(svgPath, 256).png().toFile(pngPath)
  console.log('✓ icon.png written')

  // 1b. macOS: 1024 canvas, tile inset per Apple's grid
  const tile = MAC_CANVAS - 2 * MAC_INSET
  await sharp({ create: { width: MAC_CANVAS, height: MAC_CANVAS, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: await render(svgPath, tile).png().toBuffer(), left: MAC_INSET, top: MAC_INSET }])
    .png()
    .toFile(macPngPath)
  console.log(`✓ icon-mac.png written (${MAC_CANVAS}px, ${MAC_INSET}px inset)`)

  // 2. Build multi-size ICO with BMP image data
  const dibs = []
  for (const size of SIZES) {
    const rgba = await renderRgba(size)
    dibs.push(makeDib(rgba, size))
  }

  // ICONDIR (6 bytes)
  const iconDir = Buffer.alloc(6)
  iconDir.writeUInt16LE(0, 0)           // reserved
  iconDir.writeUInt16LE(1, 2)           // type: 1 = icon
  iconDir.writeUInt16LE(SIZES.length, 4)

  // ICONDIRENTRYs (16 bytes each)
  let offset = 6 + SIZES.length * 16
  const entries = SIZES.map((size, i) => {
    const entry = Buffer.alloc(16)
    entry.writeUInt8(size === 256 ? 0 : size, 0) // width  (0 means 256)
    entry.writeUInt8(size === 256 ? 0 : size, 1) // height (0 means 256)
    entry.writeUInt8(0, 2)                        // color count
    entry.writeUInt8(0, 3)                        // reserved
    entry.writeUInt16LE(1, 4)                     // planes
    entry.writeUInt16LE(32, 6)                    // bit count
    entry.writeUInt32LE(dibs[i].length, 8)        // data size
    entry.writeUInt32LE(offset, 12)               // data offset
    offset += dibs[i].length
    return entry
  })

  fs.writeFileSync(icoPath, Buffer.concat([iconDir, ...entries, ...dibs]))
  console.log(`✓ icon.ico written (${SIZES.join(', ')}px BMP)`)
}

run().catch((err) => { console.error(err); process.exit(1) })
