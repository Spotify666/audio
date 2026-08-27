import { GLYPH_GAP, GLYPH_WIDTH, glyphFor } from './barfont'

/** WhatsApp stores exactly this many values in the voice-note waveform. */
export const COLUMNS = 64

/**
 * Never send a true zero. A silent segment reads as a dropout, and WhatsApp
 * sometimes trims leading/trailing silence outright, which shifts the whole
 * shape left.
 */
export const FLOOR = 5

export const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v)

export function applyFloor(values: number[], floor = FLOOR): number[] {
  return values.map((v) => clamp(Math.round(v), floor, 100))
}

/**
 * Resample an arbitrary-length column array onto `size` columns.
 *
 * Upsampling uses nearest neighbour so bars stay square-edged. Downsampling
 * blends the peak and the average of the range: pure max saturates a squeezed
 * word into one solid block of 100s, pure mean flattens the peaks that carry
 * the letterform. The blend keeps some of both.
 */
export function resample(src: number[], size = COLUMNS): number[] {
  if (src.length === 0) return new Array(size).fill(0)
  if (src.length === size) return src.slice()
  const out = new Array<number>(size)
  if (src.length < size) {
    for (let i = 0; i < size; i++) out[i] = src[Math.floor((i * src.length) / size)]
    return out
  }
  for (let i = 0; i < size; i++) {
    const a = Math.floor((i * src.length) / size)
    const b = Math.max(a + 1, Math.floor(((i + 1) * src.length) / size))
    let peak = 0
    let sum = 0
    let n = 0
    for (let j = a; j < b && j < src.length; j++) {
      peak = Math.max(peak, src[j])
      sum += src[j]
      n++
    }
    out[i] = Math.round(0.4 * peak + 0.6 * (sum / Math.max(1, n)))
  }
  return out
}

/** Raw glyph columns for a string, at native 5-per-glyph resolution. */
export function glyphColumns(text: string): number[] {
  const chars = [...text]
  const out: number[] = []
  chars.forEach((ch, i) => {
    if (i > 0) for (let k = 0; k < GLYPH_GAP; k++) out.push(0)
    out.push(...glyphFor(ch).cols)
  })
  return out
}

/** Columns a string needs at full fidelity. */
export function nativeWidth(text: string): number {
  const n = [...text].length
  return n === 0 ? 0 : n * GLYPH_WIDTH + (n - 1) * GLYPH_GAP
}

/** How many characters fit at full fidelity in 64 columns. */
export const MAX_CRISP_CHARS = Math.floor((COLUMNS + GLYPH_GAP) / (GLYPH_WIDTH + GLYPH_GAP)) // 10

/** Above this the app warns; the brief's rule of thumb for usable width. */
export const COMFORTABLE_CHARS = 6

// ---------------------------------------------------------------------------
// Pacing — where each word sits along the timeline
// ---------------------------------------------------------------------------

export type PaceMode = 'fit' | 'timed' | 'speech'

/** A half-open range of columns. */
export interface Span {
  start: number
  end: number
}

export interface WordSlot extends Span {
  word: string
  startTime: number
  endTime: number
  /** Columns per character. Under ~3 the word turns to mush. */
  density: number
}

export interface Layout {
  columns: number[]
  slots: WordSlot[]
  mode: PaceMode
  /** Longest hold a word can take before words would overlap, in seconds. */
  maxDwell: number
}

/** Words share the strip in proportion to their length. Everything visible at once. */
export function fitSpans(words: string[]): Span[] {
  if (words.length === 0) return []
  const gap = words.length > 1 ? 1 : 0
  const budget = COLUMNS - gap * (words.length - 1)
  const weights = words.map((w) => [...w].length)
  const total = weights.reduce((a, b) => a + b, 0)
  const widths = weights.map((w) => Math.max(1, Math.floor((w / total) * budget)))
  let left = budget - widths.reduce((a, b) => a + b, 0)
  const order = weights.map((w, i) => [w, i] as const).sort((a, b) => b[0] - a[0])
  for (let k = 0; left > 0; k++, left--) widths[order[k % order.length][1]] += 1

  const spans: Span[] = []
  let cursor = 0
  widths.forEach((w, i) => {
    if (i > 0) cursor += gap
    spans.push({ start: cursor, end: Math.min(COLUMNS, cursor + w) })
    cursor += w
  })
  return spans
}

/**
 * Words are spaced evenly from `start` to the end of the clip and each holds
 * for `dwell` seconds, centred in its slot. Shortening the dwell opens rests
 * between the words rather than leaving a dead tail at the end.
 */
export function timedSpans(
  words: string[],
  { start, dwell, duration }: { start: number; dwell: number; duration: number },
): Span[] {
  if (words.length === 0) return []
  const secPerCol = duration / COLUMNS
  const startCol = clamp(Math.round(start / secPerCol), 0, COLUMNS - words.length)
  const stride = (COLUMNS - startCol) / words.length
  const width = clamp(Math.round(dwell / secPerCol), 1, Math.max(1, Math.floor(stride)))
  return words.map((_, i) => {
    const centre = startCol + stride * (i + 0.5)
    const a = clamp(Math.round(centre - width / 2), 0, COLUMNS - width)
    return { start: a, end: a + width }
  })
}

/**
 * Where the source actually makes noise. Used to drop each word onto a burst
 * of speech, so the phrase lands in time with what is being said.
 */
export function detectPhrases(bars: number[], want: number): Span[] {
  const max = Math.max(...bars, 1)
  const threshold = max * 0.3
  const runs: Span[] = []
  let open: number | null = null
  for (let i = 0; i < bars.length; i++) {
    if (bars[i] >= threshold) {
      if (open === null) open = i
    } else if (open !== null) {
      runs.push({ start: open, end: i })
      open = null
    }
  }
  if (open !== null) runs.push({ start: open, end: bars.length })

  // Bridge one-column dips inside a word, then drop anything too short to hold a glyph.
  const merged: Span[] = []
  for (const r of runs) {
    const last = merged[merged.length - 1]
    if (last && r.start - last.end <= 1) last.end = r.end
    else merged.push({ ...r })
  }
  let out = merged.filter((r) => r.end - r.start >= 2)
  if (out.length === 0) return []

  // Too many bursts: keep the longest, back in time order.
  if (out.length > want) {
    out = out
      .slice()
      .sort((a, b) => b.end - b.start - (a.end - a.start))
      .slice(0, want)
      .sort((a, b) => a.start - b.start)
  }
  // Too few: split the longest until there is one per word.
  while (out.length < want) {
    let idx = 0
    for (let i = 1; i < out.length; i++) if (out[i].end - out[i].start > out[idx].end - out[idx].start) idx = i
    const s = out[idx]
    if (s.end - s.start < 4) break
    const mid = Math.floor((s.start + s.end) / 2)
    out.splice(idx, 1, { start: s.start, end: mid }, { start: mid, end: s.end })
  }
  return out
}

/**
 * Between words the audio is held at a low but audible level rather than the
 * absolute floor. Dropping the rests to near-silence makes a two-second phrase
 * mute most of a twelve-second clip, which is a worse trade than a little less
 * contrast in the bars.
 */
export const REST = 14

/** Draw the words into their spans and hand back both the columns and the timing. */
export function renderSpans(words: string[], spans: Span[], duration: number, rest = 0): Layout {
  const columns = new Array<number>(COLUMNS).fill(rest)
  const secPerCol = duration / COLUMNS
  const slots: WordSlot[] = []
  words.forEach((word, i) => {
    const span = spans[i]
    if (!span) return
    const width = span.end - span.start
    if (width <= 0) return
    const rendered = resample(glyphColumns(word), width)
    for (let c = 0; c < width; c++) columns[span.start + c] = rendered[c]
    slots.push({
      word,
      start: span.start,
      end: span.end,
      startTime: span.start * secPerCol,
      endTime: span.end * secPerCol,
      density: width / Math.max(1, [...word].length),
    })
  })
  return { columns, slots, mode: 'fit', maxDwell: duration }
}

export interface PaceOptions {
  mode: PaceMode
  /** Seconds before the first word, in timed mode. */
  start: number
  /** Seconds each word holds, in timed mode. */
  dwell: number
  duration: number
  /** The source's own 64-bar envelope, for speech alignment. */
  bars?: number[] | null
}

export function buildLayout(text: string, opts: PaceOptions): Layout {
  const words = text.split(/\s+/).filter(Boolean)
  const duration = Math.max(opts.duration, 0.001)
  if (words.length === 0) {
    return { columns: new Array(COLUMNS).fill(0), slots: [], mode: opts.mode, maxDwell: duration }
  }

  let mode = opts.mode
  let spans: Span[]
  if (mode === 'speech') {
    const found = opts.bars ? detectPhrases(opts.bars, words.length) : []
    if (found.length === words.length) spans = found
    else {
      // Not enough distinct bursts to hang the phrase on — fall back honestly.
      mode = 'timed'
      spans = timedSpans(words, { start: opts.start, dwell: opts.dwell, duration })
    }
  } else if (mode === 'timed') {
    spans = timedSpans(words, { start: opts.start, dwell: opts.dwell, duration })
  } else {
    spans = fitSpans(words)
  }

  const layout = renderSpans(words, spans, duration, mode === 'fit' ? 0 : REST)
  const startCol = clamp(Math.round(opts.start / (duration / COLUMNS)), 0, COLUMNS - words.length)
  return {
    ...layout,
    mode,
    maxDwell: ((COLUMNS - startCol) / words.length) * (duration / COLUMNS),
  }
}

/** Which word is under the playhead right now. */
export function slotAt(slots: WordSlot[], time: number): WordSlot | null {
  for (const s of slots) if (time >= s.startTime && time < s.endTime) return s
  return null
}
