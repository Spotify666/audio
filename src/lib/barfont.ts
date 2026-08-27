/**
 * BAR FONT
 * ---------------------------------------------------------------------------
 * Every glyph is five column heights, 0-100. That is the entire alphabet we
 * get: WhatsApp draws 64 bars mirrored around a centre line, so a glyph is a
 * silhouette and nothing else. No horizontal strokes, no enclosed counters,
 * no top-vs-bottom difference. "H" and "X" are near-identical by construction.
 *
 * This file is meant to be tuned by hand. Change a number, reload, look at the
 * hero circle. `note` is shown in the UI so a person can see why a letter is
 * weak before they commit to it.
 */

export type Legibility = 'good' | 'fair' | 'poor'

export interface Glyph {
  cols: [number, number, number, number, number]
  legibility: Legibility
  /** Shown inline when this character is in the current word. */
  note?: string
}

export const GLYPH_WIDTH = 5
/** Empty columns between two glyphs. */
export const GLYPH_GAP = 1

const g = (
  cols: [number, number, number, number, number],
  legibility: Legibility = 'fair',
  note?: string,
): Glyph => ({ cols, legibility, note })

export const BAR_FONT: Record<string, Glyph> = {
  ' ': g([0, 0, 0, 0, 0], 'good'),

  A: g([30, 70, 100, 70, 30], 'fair', 'A reads as a plain peak — close to a lone spike.'),
  B: g([100, 60, 70, 60, 35], 'poor', 'B has no counters to show. Reads as a lopsided block.'),
  C: g([75, 100, 55, 40, 40], 'fair'),
  D: g([100, 70, 70, 60, 35], 'poor', 'D and B share a silhouette.'),
  E: g([100, 55, 50, 45, 45], 'fair'),
  F: g([100, 50, 45, 30, 25], 'fair'),
  G: g([75, 100, 55, 55, 70], 'poor', 'G and C differ by one column.'),
  H: g([100, 45, 45, 45, 100], 'poor', 'H and X are the same shape mirrored — indistinguishable.'),
  I: g([0, 0, 100, 0, 0], 'good'),
  J: g([30, 25, 30, 50, 100], 'fair'),
  K: g([100, 40, 65, 85, 95], 'fair'),
  L: g([100, 30, 30, 30, 30], 'good'),
  M: g([100, 70, 40, 70, 100], 'good'),
  N: g([100, 85, 70, 85, 100], 'poor', 'N sits between M and H. Expect it to read as either.'),
  O: g([60, 95, 95, 95, 60], 'good'),
  P: g([100, 60, 65, 55, 25], 'fair'),
  Q: g([60, 95, 95, 100, 70], 'fair'),
  R: g([100, 60, 65, 60, 55], 'poor', 'R reads much like P.'),
  S: g([65, 80, 55, 80, 65], 'fair'),
  T: g([0, 20, 100, 20, 0], 'good'),
  U: g([100, 45, 35, 45, 100], 'good'),
  V: g([100, 60, 20, 60, 100], 'good'),
  W: g([100, 40, 80, 40, 100], 'good'),
  X: g([100, 50, 25, 50, 100], 'fair', 'X and H, V and U all crowd the same silhouette.'),
  Y: g([85, 45, 100, 45, 85], 'fair'),
  Z: g([75, 45, 65, 45, 75], 'poor', 'Z has only diagonals and horizontals — almost nothing survives.'),

  '0': g([65, 95, 100, 95, 65], 'fair', '0 and O are the same letter here.'),
  '1': g([20, 40, 100, 20, 0], 'good'),
  '2': g([65, 50, 60, 70, 80], 'poor'),
  '3': g([45, 55, 60, 75, 75], 'poor'),
  '4': g([40, 55, 70, 100, 45], 'fair'),
  '5': g([75, 60, 55, 60, 70], 'poor'),
  '6': g([75, 95, 70, 80, 60], 'poor'),
  '7': g([70, 40, 45, 55, 65], 'poor'),
  '8': g([80, 100, 70, 100, 80], 'fair'),
  '9': g([60, 80, 70, 95, 75], 'poor'),

  '!': g([0, 0, 90, 0, 0], 'fair', '! and I are the same bar.'),
  '?': g([35, 55, 95, 60, 25], 'fair'),
  '.': g([0, 0, 15, 0, 0], 'good'),
  ',': g([0, 0, 18, 10, 0], 'fair'),
  "'": g([0, 0, 45, 0, 0], 'fair'),
  ':': g([0, 0, 35, 0, 0], 'fair'),
  '-': g([0, 25, 25, 25, 0], 'good'),
  '+': g([0, 30, 100, 30, 0], 'fair'),
  '*': g([40, 20, 100, 20, 40], 'fair'),
  '/': g([20, 40, 60, 80, 100], 'good'),
  '\\': g([100, 80, 60, 40, 20], 'good'),
  '&': g([70, 95, 75, 90, 80], 'poor'),
  '#': g([45, 100, 55, 100, 45], 'fair'),
  '@': g([65, 90, 100, 95, 70], 'poor'),
  '(': g([0, 0, 40, 75, 90], 'fair'),
  ')': g([90, 75, 40, 0, 0], 'fair'),
  '<': g([25, 45, 70, 95, 60], 'fair'),
  '>': g([60, 95, 70, 45, 25], 'fair'),
  '=': g([0, 40, 40, 40, 0], 'fair'),
}

/** Anything we do not have a profile for. Deliberately bland, never silent. */
const FALLBACK: Glyph = g([50, 65, 50, 65, 50], 'poor', 'No profile for this character.')

export function glyphFor(char: string): Glyph {
  return BAR_FONT[char.toUpperCase()] ?? FALLBACK
}

export function isSupported(char: string): boolean {
  return char.toUpperCase() in BAR_FONT
}

/** Letters that collapse onto the same silhouette once mirrored. */
export const COLLISIONS: string[][] = [
  ['H', 'X'],
  ['U', 'V'],
  ['B', 'D'],
  ['C', 'G'],
  ['P', 'R'],
  ['O', '0', 'Q'],
  ['I', '!', '1'],
]

/** Human-readable warnings for the characters actually in use. */
export function legibilityNotes(text: string): string[] {
  const used = new Set(text.toUpperCase().replace(/\s+/g, '').split(''))
  const out: string[] = []
  for (const ch of used) {
    const note = glyphFor(ch).note
    if (note && !out.includes(note)) out.push(note)
  }
  for (const group of COLLISIONS) {
    const hit = group.filter((c) => used.has(c))
    if (hit.length > 1) {
      const line = `${hit.join(' and ')} render identically.`
      if (!out.includes(line)) out.push(line)
    }
  }
  return out.slice(0, 3)
}
