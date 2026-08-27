/**
 * BAR GLYPHS — 13 columns per character.
 *
 * A chat waveform is 64 bars mirrored around a centre line, so a letter is a
 * silhouette made only of heights. There is no top-versus-bottom, no
 * horizontal stroke, no enclosed counter. These profiles are therefore
 * stylised, not traced: each one is the most distinctive vertical rhythm that
 * letter has.
 *
 * Thirteen columns is deliberate. A voice-note circle is small; one letter gets
 * roughly 48 of the 64 bars, so upsampling 13 -> 48 lands each value on a
 * three-or-four-bar block. Chunky blocks read at small size, individually
 * varying bars do not.
 *
 * Run `npm run font` to render every glyph as a contact sheet and look at it.
 */

export const GLYPH_COLUMNS = 13

export type Profile = number[]

/** Confidence that the silhouette reads as the intended character. */
export type Legibility = 'strong' | 'fair' | 'weak'

export interface Glyph {
  profile: Profile
  legibility: Legibility
}

const g = (legibility: Legibility, ...profile: Profile): Glyph => ({ profile, legibility })

export const GLYPHS: Record<string, Glyph> = {
  // Tuned against scripts/preview-font.mjs, at the size a voice note actually
  // renders. The aim is mutual distinctiveness, not fidelity to the letterform:
  // a mirrored bar strip can carry maybe a dozen shapes people can tell apart,
  // so each strong glyph gets its own rhythm and the rest are marked honestly.
  A: g('fair', 4, 6, 10, 20, 42, 72, 100, 72, 42, 20, 10, 6, 4),
  B: g('weak', 100, 100, 30, 62, 84, 62, 30, 62, 84, 62, 30, 12, 8),
  C: g('strong', 18, 52, 84, 100, 96, 84, 70, 56, 44, 34, 28, 24, 20),
  D: g('weak', 100, 100, 40, 74, 92, 98, 98, 92, 74, 40, 16, 8, 6),
  E: g('fair', 100, 100, 28, 56, 28, 56, 28, 56, 28, 52, 28, 44, 34),
  F: g('fair', 100, 100, 28, 56, 28, 56, 28, 22, 15, 11, 9, 7, 6),
  G: g('fair', 18, 52, 84, 100, 92, 76, 58, 44, 40, 58, 86, 62, 26),
  H: g('strong', 100, 100, 20, 20, 20, 20, 20, 20, 20, 20, 20, 100, 100),
  I: g('strong', 3, 3, 3, 3, 4, 100, 100, 100, 4, 3, 3, 3, 3),
  J: g('strong', 8, 8, 10, 12, 16, 22, 32, 48, 70, 96, 100, 58, 20),
  K: g('fair', 100, 100, 24, 34, 48, 66, 86, 100, 86, 64, 42, 24, 12),
  L: g('strong', 100, 100, 18, 16, 16, 16, 16, 16, 16, 16, 16, 16, 14),
  M: g('fair', 100, 100, 64, 32, 14, 44, 66, 44, 14, 32, 64, 100, 100),
  N: g('fair', 100, 100, 26, 34, 42, 50, 58, 66, 74, 82, 90, 100, 100),
  O: g('strong', 10, 45, 85, 100, 100, 100, 100, 100, 100, 100, 85, 45, 10),
  P: g('fair', 100, 100, 34, 66, 86, 66, 34, 14, 8, 6, 5, 5, 5),
  Q: g('weak', 12, 44, 80, 100, 100, 100, 100, 100, 96, 88, 92, 58, 22),
  R: g('weak', 100, 100, 32, 64, 84, 60, 30, 44, 60, 76, 90, 52, 20),
  S: g('fair', 26, 62, 88, 64, 32, 52, 74, 52, 32, 64, 88, 62, 26),
  T: g('strong', 50, 50, 44, 32, 66, 100, 100, 100, 66, 32, 44, 50, 50),
  U: g('strong', 100, 100, 48, 22, 14, 14, 14, 14, 14, 22, 48, 100, 100),
  V: g('strong', 100, 88, 70, 52, 34, 18, 6, 18, 34, 52, 70, 88, 100),
  W: g('strong', 100, 72, 38, 10, 38, 72, 100, 72, 38, 10, 38, 72, 100),
  X: g('weak', 100, 72, 44, 22, 8, 20, 34, 20, 8, 22, 44, 72, 100),
  Y: g('weak', 92, 68, 42, 22, 48, 78, 100, 78, 48, 22, 42, 68, 92),
  Z: g('weak', 88, 88, 70, 54, 40, 28, 20, 34, 50, 66, 82, 88, 88),

  '0': g('fair', 10, 45, 85, 100, 92, 78, 70, 78, 92, 100, 85, 45, 10),
  '1': g('strong', 4, 6, 14, 30, 22, 100, 100, 100, 8, 5, 4, 4, 4),
  '2': g('weak', 30, 56, 76, 58, 38, 42, 52, 64, 76, 84, 82, 64, 40),
  '3': g('weak', 26, 50, 70, 50, 30, 50, 72, 50, 30, 50, 70, 50, 26),
  '4': g('fair', 16, 30, 48, 70, 94, 54, 38, 54, 100, 100, 42, 20, 10),
  '5': g('weak', 84, 84, 46, 38, 52, 68, 82, 66, 44, 58, 78, 58, 28),
  '6': g('weak', 22, 52, 82, 98, 82, 62, 54, 68, 88, 98, 76, 42, 16),
  '7': g('fair', 82, 82, 62, 46, 38, 44, 54, 66, 80, 94, 68, 38, 14),
  '8': g('fair', 24, 56, 84, 96, 66, 40, 66, 40, 66, 96, 84, 56, 24),
  '9': g('weak', 16, 42, 74, 96, 86, 66, 54, 64, 84, 98, 82, 52, 22),

  '!': g('fair', 3, 3, 3, 4, 8, 100, 100, 100, 8, 4, 3, 12, 12),
  '?': g('fair', 14, 36, 66, 90, 96, 70, 100, 68, 34, 16, 10, 7, 6),
  '+': g('fair', 6, 6, 8, 14, 34, 100, 100, 100, 34, 14, 8, 6, 6),
  '-': g('fair', 5, 6, 12, 26, 38, 44, 46, 44, 38, 26, 12, 6, 5),
  '.': g('fair', 3, 3, 3, 3, 5, 26, 34, 26, 5, 3, 3, 3, 3),
  '*': g('fair', 44, 16, 52, 22, 68, 30, 100, 30, 68, 22, 52, 16, 44),
  '<': g('fair', 14, 32, 58, 88, 100, 74, 54, 38, 26, 18, 13, 10, 8),
  '>': g('fair', 8, 10, 13, 18, 26, 38, 54, 74, 100, 88, 58, 32, 14),
  '/': g('strong', 8, 14, 22, 32, 44, 57, 69, 79, 87, 93, 97, 99, 100),
  '\\': g('strong', 100, 99, 97, 93, 87, 79, 69, 57, 44, 32, 22, 14, 8),
  ' ': g('strong', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0),
}

const FALLBACK: Glyph = g('weak', 40, 56, 72, 88, 100, 88, 72, 88, 100, 88, 72, 56, 40)

export const glyphFor = (ch: string): Glyph => GLYPHS[ch.toUpperCase()] ?? FALLBACK

export const SUPPORTED = Object.keys(GLYPHS).filter((k) => k !== ' ')

/** Characters whose silhouettes collapse onto one another once mirrored. */
export const COLLISIONS: string[][] = [
  ['O', '0', 'Q'],
  ['I', '1', '!', '+'],
  ['B', 'D', 'R'],
  ['C', 'G'],
  ['V', 'X', 'Y'],
  ['S', '3', '8'],
  ['A', 'W'],
  ['M', 'U'],
]
