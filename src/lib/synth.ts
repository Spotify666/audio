import { COLUMNS } from './word'

/**
 * The audio is generated, not reshaped.
 *
 * Reshaping someone's voice note means shoving its loudness up and down 64
 * times, which is what makes speech stutter. If the sound is built for the
 * envelope in the first place there is nothing to fight: the carrier holds a
 * constant level and the envelope is simply its volume over time. It sounds
 * like a tone swelling, not like damaged speech, and the shape comes out exact.
 */

export type Voice = 'hum' | 'waves' | 'chime'

export const VOICES: { id: Voice; name: string }[] = [
  { id: 'hum', name: 'Hum' },
  { id: 'waves', name: 'Waves' },
  { id: 'chime', name: 'Chime' },
]

/** Opus resamples everything to 48k anyway, so start there. */
export const SAMPLE_RATE = 48000

const TAU = Math.PI * 2

/** A carrier at a steady level, so the envelope alone decides every bar. */
function carrier(voice: Voice, n: number, rate: number): Float32Array {
  const out = new Float32Array(n)
  if (voice === 'waves') {
    // Lowpassed noise — a soft surf wash rather than hiss.
    let lp1 = 0
    let lp2 = 0
    for (let i = 0; i < n; i++) {
      const white = Math.random() * 2 - 1
      lp1 += (white - lp1) * 0.035
      lp2 += (lp1 - lp2) * 0.035
      out[i] = lp2 * 9
    }
  } else if (voice === 'chime') {
    // A struck-metal stack: fundamental plus two inharmonic partials.
    for (let i = 0; i < n; i++) {
      const t = i / rate
      out[i] =
        0.6 * Math.sin(TAU * 528 * t) +
        0.3 * Math.sin(TAU * 528 * 2.76 * t) +
        0.16 * Math.sin(TAU * 528 * 5.4 * t)
    }
  } else {
    // Warm hum: a low fundamental with a couple of quiet harmonics.
    for (let i = 0; i < n; i++) {
      const t = i / rate
      out[i] =
        0.7 * Math.sin(TAU * 174 * t) +
        0.22 * Math.sin(TAU * 348 * t) +
        0.08 * Math.sin(TAU * 522 * t)
    }
  }
  // Normalise to unit RMS so every voice hits the target the same way.
  let sum = 0
  for (let i = 0; i < n; i++) sum += out[i] * out[i]
  const rms = Math.sqrt(sum / n) || 1
  for (let i = 0; i < n; i++) out[i] /= rms
  return out
}

const smoothstep = (u: number) => u * u * (3 - 2 * u)

/**
 * Per-sample envelope: flat across each of the 64 segments, with a raised
 * cosine across every boundary so nothing clicks and the tone glides.
 */
function envelope(
  levels: number[],
  n: number,
  rate: number,
  glideMs: number,
  fadeEdges = true,
): Float32Array {
  const out = new Float32Array(n)
  const segment = n / COLUMNS
  const half = Math.min(Math.floor((glideMs / 1000) * rate * 0.5), Math.floor(segment * 0.49))

  for (let i = 0; i < COLUMNS; i++) {
    const a = Math.floor((i * n) / COLUMNS)
    const b = i === COLUMNS - 1 ? n : Math.floor(((i + 1) * n) / COLUMNS)
    const level = levels[i] / 100
    for (let s = a; s < b; s++) out[s] = level
  }
  if (half > 0) {
    for (let i = 1; i < COLUMNS; i++) {
      const boundary = Math.floor((i * n) / COLUMNS)
      const from = levels[i - 1] / 100
      const to = levels[i] / 100
      if (from === to) continue
      const lo = Math.max(0, boundary - half)
      const hi = Math.min(n, boundary + half)
      for (let s = lo; s < hi; s++) {
        const w = smoothstep((s - lo) / (hi - lo))
        out[s] = from * (1 - w) + to * w
      }
    }
  }
  // Fade the very start and end so the file opens and closes cleanly. Skipped
  // on correction passes, which would otherwise fade the edges twice and then
  // chase their own tail trying to correct for it.
  if (fadeEdges) {
    const edge = Math.min(Math.floor(rate * 0.02), Math.floor(n / 4))
    for (let s = 0; s < edge; s++) {
      const w = smoothstep(s / edge)
      out[s] *= w
      out[n - 1 - s] *= w
    }
  }
  return out
}

/** RMS of each of the 64 segments — the measurement a chat client makes. */
export function segmentRms(mono: Float32Array): Float32Array {
  const out = new Float32Array(COLUMNS)
  for (let i = 0; i < COLUMNS; i++) {
    const a = Math.floor((i * mono.length) / COLUMNS)
    const b = Math.floor(((i + 1) * mono.length) / COLUMNS)
    let sum = 0
    for (let s = a; s < b; s++) sum += mono[s] * mono[s]
    out[i] = b > a ? Math.sqrt(sum / (b - a)) : 0
  }
  return out
}

/** Segment RMS normalised to 0-100 against the loudest segment. */
export function measureBars(mono: Float32Array): number[] {
  const rms = segmentRms(mono)
  let max = 0
  for (const v of rms) max = Math.max(max, v)
  if (max <= 0) return new Array(COLUMNS).fill(0)
  return Array.from(rms, (v) => Math.round(Math.min(100, (v / max) * 100)))
}

export interface SynthOptions {
  levels: number[]
  voice: Voice
  seconds: number
  rate?: number
  /** Cross-fade across each segment boundary. Longer is smoother to listen to. */
  glideMs?: number
}

/**
 * Build the clip, then correct it: measure what the 64 segments actually came
 * out at and nudge each one until the measurement matches the target. Two
 * passes is enough to land within a bar or so.
 */
export function synthesise({
  levels,
  voice,
  seconds,
  rate = SAMPLE_RATE,
  glideMs = 30,
}: SynthOptions): Float32Array {
  const n = Math.max(rate, Math.round(seconds * rate))
  const source = carrier(voice, n, rate)
  const env = envelope(levels, n, rate, glideMs)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) out[i] = source[i] * env[i]

  for (let pass = 0; pass < 2; pass++) {
    const measured = segmentRms(out)
    let maxMeasured = 0
    let maxTarget = 0
    for (let i = 0; i < COLUMNS; i++) {
      maxMeasured = Math.max(maxMeasured, measured[i])
      maxTarget = Math.max(maxTarget, levels[i])
    }
    if (maxMeasured <= 0) break
    const correction = new Array<number>(COLUMNS)
    for (let i = 0; i < COLUMNS; i++) {
      const want = (levels[i] / maxTarget) * maxMeasured
      correction[i] = measured[i] > 1e-9 ? Math.min(4, Math.max(0.25, want / measured[i])) : 1
    }
    const curve = envelope(
      correction.map((c) => c * 100),
      n,
      rate,
      glideMs,
      false,
    )
    for (let i = 0; i < n; i++) out[i] *= curve[i]
  }

  let peak = 0
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]))
  if (peak > 0) {
    const k = 0.9 / peak
    for (let i = 0; i < n; i++) out[i] *= k
  }
  return out
}
