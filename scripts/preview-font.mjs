/**
 * Renders every glyph the way a chat client would draw it, at the size it will
 * actually appear, so legibility is a thing you look at rather than assume.
 *   node scripts/preview-font.mjs [out.png]
 */
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Surface, writePng, text } from './png.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const OUT = process.argv[2] || join(ROOT, 'font-sheet.png')

// Pull the tables straight out of the TS sources so the sheet cannot drift.
const glyphSrc = readFileSync(join(ROOT, 'src/lib/glyphs.ts'), 'utf8')
const GLYPHS = {}
for (const m of glyphSrc.matchAll(/^\s+(?:(\w)|'(.)'|"(.)"):\s*g\('(\w+)',\s*([\d,\s]+)\),$/gm)) {
  const key = m[1] ?? m[2] ?? m[3]
  GLYPHS[key] = { legibility: m[4], profile: m[5].split(',').map((n) => +n.trim()) }
}

const COLUMNS = 64
const FLOOR = 6
const PAD = 8
const stretch = (src, size) => Array.from({ length: size }, (_, i) => src[Math.floor((i * src.length) / size)])
const render = (ch) => {
  const cols = new Array(COLUMNS).fill(FLOOR)
  const drawn = stretch(GLYPHS[ch].profile, COLUMNS - PAD * 2)
  drawn.forEach((v, i) => (cols[PAD + i] = Math.max(FLOOR, v)))
  return cols
}

const INK = [0x10, 0x16, 0x26]
const WHITE = [0xff, 0xff, 0xff]
const DIM = [0x6b, 0x7a, 0x94]
const OK = [0x7f, 0xd1, 0xa8]
const WARN = [0xff, 0x7a, 0x45]
const WA_BUBBLE = [0xd9, 0xfd, 0xd3]
const WA_BAR = [0x4a, 0x60, 0x55]

const keys = Object.keys(GLYPHS).filter((k) => k !== ' ')
const COLS = 6
const rows = Math.ceil(keys.length / COLS)
const CW = 300
const CH = 150
const W = COLS * CW + 40
const H = rows * CH + 90

const s = new Surface(W, H, INK)
text(s, 'BAR GLYPHS · LEFT: LARGE · RIGHT: ACTUAL VOICE NOTE SIZE', 20, 24, 3, WHITE, 0.8)

keys.forEach((ch, i) => {
  const cx = 20 + (i % COLS) * CW
  const cy = 70 + Math.floor(i / COLS) * CH
  const g = GLYPHS[ch]
  const cols = render(ch)
  const tone = g.legibility === 'strong' ? OK : g.legibility === 'weak' ? WARN : DIM
  text(s, ch, cx, cy, 4, WHITE, 0.95)
  text(s, g.legibility, cx + 34, cy + 8, 2, tone, 0.9)

  // Large: how it looks when you can see it
  const bigW = 170
  const bigH = 84
  const bx = cx
  const by = cy + 32
  const slot = bigW / COLUMNS
  cols.forEach((v, k) => {
    const h = Math.max(2, (v / 100) * bigH)
    s.roundBar(bx + k * slot + slot * 0.15, by + bigH / 2 - h / 2, Math.max(1, slot * 0.7), h, WHITE, 0.92)
  })

  // Actual size: a real voice-note waveform is about this wide
  const smW = 96
  const smH = 26
  const sx = cx + 190
  const sy = cy + 32 + (bigH - smH) / 2
  s.rect(sx - 8, sy - 12, smW + 16, smH + 24, WA_BUBBLE)
  const sslot = smW / COLUMNS
  cols.forEach((v, k) => {
    const h = Math.max(1.5, (v / 100) * smH)
    s.roundBar(sx + k * sslot + sslot * 0.2, sy + smH / 2 - h / 2, Math.max(1, sslot * 0.6), h, WA_BAR, 0.95)
  })
})

writePng(OUT, W, H, s.buf)
console.log(`${OUT} — ${keys.length} glyphs`)
