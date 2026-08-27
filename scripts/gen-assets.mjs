/**
 * Generates favicon.svg, icon-512.png and og.png with no dependencies.
 * The letterforms are a 5x7 bitmap face, which is the same idea as the bar
 * font: type made of a very small number of cells.
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const PUB = join(ROOT, 'public')
mkdirSync(PUB, { recursive: true })

const INK = [0x14, 0x1b, 0x2e]
const DEEP = [0x0e, 0x14, 0x23]
const LINE = [0x3d, 0x4a, 0x63]
const BONE = [0xf2, 0xef, 0xe9]
const SIGNAL = [0xff, 0x7a, 0x45]

// --- PNG ------------------------------------------------------------------
const CRC = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return (buf) => {
    let c = -1
    for (const b of buf) c = t[(c ^ b) & 255] ^ (c >>> 8)
    return (c ^ -1) >>> 0
  }
})()

const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(CRC(body))
  return Buffer.concat([len, body, crc])
}

function writePng(path, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h)
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0)
  ihdr.writeUInt32BE(h, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  writeFileSync(
    path,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ]),
  )
}

// --- canvas ---------------------------------------------------------------
class Surface {
  constructor(w, h, bg) {
    this.w = w
    this.h = h
    this.buf = Buffer.alloc(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      this.buf[i * 4] = bg[0]
      this.buf[i * 4 + 1] = bg[1]
      this.buf[i * 4 + 2] = bg[2]
      this.buf[i * 4 + 3] = 255
    }
  }
  blend(x, y, c, a) {
    if (a <= 0 || x < 0 || y < 0 || x >= this.w || y >= this.h) return
    const i = (y * this.w + x) * 4
    for (let k = 0; k < 3; k++) this.buf[i + k] = Math.round(this.buf[i + k] * (1 - a) + c[k] * a)
  }
  /** Coverage-sampled shape fill: `inside(x, y)` is evaluated on a 3x3 grid. */
  fill(x0, y0, x1, y1, c, inside, alpha = 1) {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.h, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.w, Math.ceil(x1)); x++) {
        let hit = 0
        for (let sy = 0; sy < 3; sy++)
          for (let sx = 0; sx < 3; sx++)
            if (inside(x + (sx + 0.5) / 3, y + (sy + 0.5) / 3)) hit++
        if (hit) this.blend(x, y, c, (hit / 9) * alpha)
      }
    }
  }
  rect(x, y, w, h, c, a = 1) {
    this.fill(x, y, x + w, y + h, c, (px, py) => px >= x && px < x + w && py >= y && py < y + h, a)
  }
  roundBar(x, y, w, h, c, a = 1) {
    const r = Math.min(w, h) / 2
    this.fill(x, y, x + w, y + h, c, (px, py) => {
      const cx = Math.min(Math.max(px, x + r), x + w - r)
      const cy = Math.min(Math.max(py, y + r), y + h - r)
      return (px - cx) ** 2 + (py - cy) ** 2 <= r * r
    }, a)
  }
  ring(cx, cy, r, thickness, c, a = 1) {
    const outer = r
    const inner = r - thickness
    this.fill(cx - r - 1, cy - r - 1, cx + r + 1, cy + r + 1, c, (px, py) => {
      const d2 = (px - cx) ** 2 + (py - cy) ** 2
      return d2 <= outer * outer && d2 >= inner * inner
    }, a)
  }
}

// --- 5x7 bitmap face ------------------------------------------------------
const FONT = {
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  B: ['####.', '#...#', '####.', '#...#', '#...#', '#...#', '####.'],
  C: ['.####', '#....', '#....', '#....', '#....', '#....', '.####'],
  D: ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
  E: ['#####', '#....', '####.', '#....', '#....', '#....', '#####'],
  F: ['#####', '#....', '####.', '#....', '#....', '#....', '#....'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  P: ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  V: ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
  W: ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '##.##', '#...#'],
  X: ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
  '6': ['.###.', '#....', '####.', '#...#', '#...#', '#...#', '.###.'],
  '4': ['#..#.', '#..#.', '#..#.', '#####', '...#.', '...#.', '...#.'],
  S: ['.####', '#....', '#....', '.###.', '....#', '....#', '####.'],
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '·': ['.....', '.....', '.....', '..#..', '.....', '.....', '.....'],
}

function text(surface, str, x, y, px, color, alpha = 1) {
  let cx = x
  for (const ch of str.toUpperCase()) {
    const g = FONT[ch] ?? FONT[' ']
    g.forEach((row, ry) => {
      ;[...row].forEach((cell, rx) => {
        if (cell === '#') surface.rect(cx + rx * px, y + ry * px, px, px, color, alpha)
      })
    })
    cx += px * 6
  }
  return cx - x - px
}

// --- the mark -------------------------------------------------------------
const LOGO_W = [100, 40, 80, 40, 100]

function mark(s, cx, cy, r, color) {
  s.ring(cx, cy, r, Math.max(2, r * 0.1), color)
  const slot = r * 0.3
  const w = r * 0.19
  const x0 = cx - (slot * 5) / 2 + (slot - w) / 2
  LOGO_W.forEach((v, i) => {
    const h = (v / 100) * r * 1.16
    s.roundBar(x0 + i * slot, cy - h / 2, w, h, color)
  })
}

// --- favicon.svg ----------------------------------------------------------
const slot = 15
const bw = 9.5
const x0 = 50 - (slot * 5) / 2 + (slot - bw) / 2
const bars = LOGO_W.map((v, i) => {
  const h = (v / 100) * 58
  return `<rect x="${(x0 + i * slot).toFixed(2)}" y="${(50 - h / 2).toFixed(2)}" width="${bw}" height="${h.toFixed(2)}" rx="${bw / 2}" fill="#FF7A45"/>`
}).join('')
writeFileSync(
  join(PUB, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" rx="22" fill="#141B2E"/><circle cx="50" cy="50" r="42" fill="none" stroke="#FF7A45" stroke-width="5"/>${bars}</svg>\n`,
)

// --- icon-512.png ---------------------------------------------------------
{
  const s = new Surface(512, 512, INK)
  mark(s, 256, 256, 210, SIGNAL)
  writePng(join(PUB, 'icon-512.png'), 512, 512, s.buf)
}

// --- og.png ---------------------------------------------------------------
{
  const W = 1200
  const H = 630
  const s = new Surface(W, H, INK)
  for (let x = 0; x < W; x += 48) s.rect(x, 0, 1, H, LINE, 0.28)
  for (let y = 0; y < H; y += 48) s.rect(0, y, W, 1, LINE, 0.28)

  mark(s, 96, 92, 40, SIGNAL)
  text(s, 'WAVEPRINT', 158, 66, 8, BONE)

  // The word WAVE in the bar font, mirrored, exactly as the app would send it.
  const GLYPHS = {
    W: [100, 40, 80, 40, 100],
    A: [30, 70, 100, 70, 30],
    V: [100, 60, 20, 60, 100],
    E: [100, 55, 50, 45, 45],
  }
  const cols = []
  ;['W', 'A', 'V', 'E'].forEach((c, i) => {
    if (i) cols.push(0)
    cols.push(...GLYPHS[c])
  })
  const N = 64
  const values = Array.from({ length: N }, (_, i) => cols[Math.floor((i * cols.length) / N)])

  const fieldX = 96
  const fieldW = W - 192
  const midY = 340
  const slotW = fieldW / N
  const barW = slotW * 0.64
  s.rect(fieldX, midY, fieldW, 1, LINE, 0.6)
  values.forEach((v, i) => {
    const h = Math.max(3, (v / 100) * 240)
    s.roundBar(fieldX + i * slotW + (slotW - barW) / 2, midY - h / 2, barW, h, SIGNAL)
  })

  s.rect(96, 520, W - 192, 1, LINE, 0.7)
  text(s, '64 BARS · MIRRORED · APPROXIMATE', 96, 552, 5, BONE, 0.55)
  writePng(join(PUB, 'og.png'), W, H, s.buf)
}

// A dark well behind nothing: keep DEEP referenced for future variants.
void DEEP
console.log('assets written to public/')
