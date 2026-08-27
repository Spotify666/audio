import { GLYPH_COLUMNS, glyphFor } from './glyphs'

/** A chat waveform is exactly this many bars. */
export const COLUMNS = 64

/**
 * Never send a true zero. A silent segment reads as a dropout and clients
 * sometimes trim leading or trailing silence outright, which slides the whole
 * shape sideways.
 */
export const FLOOR = 6

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

/** How many characters still read. Past this the letters are too narrow. */
export const COMFORTABLE = 3

interface Metrics {
  pad: number
  gap: number
  width: number
}

/**
 * A voice-note circle is small, so the budget is spent on width per letter
 * rather than on fitting more letters. One character gets roughly 48 of the 64
 * bars; five gets 11 and is mush.
 */
function metrics(n: number): Metrics {
  const pad = n <= 1 ? 8 : n === 2 ? 5 : n === 3 ? 3 : 2
  const gap = n <= 1 ? 0 : n === 2 ? 5 : n === 3 ? 3 : 2
  const width = Math.floor((COLUMNS - pad * 2 - gap * (n - 1)) / n)
  return { pad, gap, width }
}

/**
 * Nearest-neighbour so every source value lands on a block of whole bars.
 * Chunky blocks survive a 40-pixel-wide waveform; individually varying bars do
 * not.
 */
function stretch(src: number[], size: number): number[] {
  return Array.from({ length: size }, (_, i) => src[Math.floor((i * src.length) / size)])
}

/** Averaging, for the rare case where a glyph must be squeezed below native width. */
function squeeze(src: number[], size: number): number[] {
  return Array.from({ length: size }, (_, i) => {
    const a = Math.floor((i * src.length) / size)
    const b = Math.max(a + 1, Math.floor(((i + 1) * src.length) / size))
    let sum = 0
    for (let j = a; j < b; j++) sum += src[j]
    return Math.round(sum / (b - a))
  })
}

export interface Rendered {
  /** 64 bar heights, 0-100, floored. */
  columns: number[]
  chars: string[]
  /** Bars given to each character. */
  perChar: number
  /** Column span of each character, for highlighting during playback. */
  spans: { char: string; start: number; end: number }[]
}

export function renderWord(input: string): Rendered {
  const chars = [...input.toUpperCase()].filter((c) => c !== ' ').slice(0, 8)
  const columns = new Array<number>(COLUMNS).fill(FLOOR)
  if (chars.length === 0) return { columns, chars: [], perChar: 0, spans: [] }

  const { pad, gap, width } = metrics(chars.length)
  const spans: Rendered['spans'] = []
  let cursor = pad

  for (const char of chars) {
    const { profile } = glyphFor(char)
    const drawn = width >= GLYPH_COLUMNS ? stretch(profile, width) : squeeze(profile, width)
    for (let i = 0; i < width && cursor + i < COLUMNS; i++) {
      columns[cursor + i] = clamp(Math.round(drawn[i]), FLOOR, 100)
    }
    spans.push({ char, start: cursor, end: cursor + width })
    cursor += width + gap
  }

  return { columns, chars, perChar: width, spans }
}

/** Characters in this string that are known to read poorly once mirrored. */
export function weakCharacters(input: string): string[] {
  return [...new Set([...input.toUpperCase()].filter((c) => c !== ' '))].filter(
    (c) => glyphFor(c).legibility === 'weak',
  )
}
