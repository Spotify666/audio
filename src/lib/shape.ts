import { COLUMNS } from './word'

/**
 * Decode the person's file, measure its envelope, and reshape it so the
 * measured envelope follows the word. All of it stays in this browser.
 */

let ctx: AudioContext | null = null
const audioContext = () =>
  (ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)())

export interface Source {
  mono: Float32Array
  rate: number
  duration: number
  /** The file's real envelope — the "before". */
  bars: number[]
}

export async function decodeFile(file: File): Promise<Source> {
  const buffer = await audioContext().decodeAudioData(await file.arrayBuffer())
  const n = buffer.length
  const mixed = new Float32Array(n)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < n; i++) mixed[i] += data[i]
  }
  const k = 1 / Math.max(1, buffer.numberOfChannels)
  for (let i = 0; i < n; i++) mixed[i] *= k
  // Trim silent ends: chat clients often trim them too, which would slide the
  // whole shape sideways.
  const mono = trimSilence(mixed)
  return { mono, rate: buffer.sampleRate, duration: mono.length / buffer.sampleRate, bars: measureBars(mono) }
}

function trimSilence(mono: Float32Array, thresholdDb = -45): Float32Array {
  const t = Math.pow(10, thresholdDb / 20)
  const win = 512
  let start = 0
  let end = mono.length
  for (let i = 0; i < mono.length; i += win) {
    let peak = 0
    for (let s = i; s < Math.min(i + win, mono.length); s++) peak = Math.max(peak, Math.abs(mono[s]))
    if (peak > t) {
      start = i
      break
    }
  }
  for (let i = mono.length - win; i >= 0; i -= win) {
    let peak = 0
    for (let s = i; s < Math.min(i + win, mono.length); s++) peak = Math.max(peak, Math.abs(mono[s]))
    if (peak > t) {
      end = Math.min(mono.length, i + win)
      break
    }
  }
  if (end - start < mono.length * 0.05) return mono
  return mono.slice(start, end)
}

/** RMS of each of the 64 equal segments — the measurement a chat client makes. */
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

const smoothstep = (u: number) => u * u * (3 - 2 * u)

/** Flat gain per segment with a raised cosine across every boundary. */
function applyGainCurve(
  mono: Float32Array,
  gains: Float32Array,
  rate: number,
  smoothingMs: number,
): Float32Array {
  const n = mono.length
  const out = new Float32Array(n)
  for (let i = 0; i < COLUMNS; i++) {
    const a = Math.floor((i * n) / COLUMNS)
    const b = i === COLUMNS - 1 ? n : Math.floor(((i + 1) * n) / COLUMNS)
    for (let s = a; s < b; s++) out[s] = mono[s] * gains[i]
  }
  const half = Math.min(Math.floor((smoothingMs / 1000) * rate * 0.5), Math.floor(n / COLUMNS / 2.05))
  if (half > 0) {
    for (let i = 1; i < COLUMNS; i++) {
      const boundary = Math.floor((i * n) / COLUMNS)
      const from = gains[i - 1]
      const to = gains[i]
      if (from === to) continue
      const lo = Math.max(0, boundary - half)
      const hi = Math.min(n, boundary + half)
      for (let s = lo; s < hi; s++) {
        const w = smoothstep((s - lo) / (hi - lo))
        out[s] = mono[s] * (from * (1 - w) + to * w)
      }
    }
  }
  return out
}

/**
 * Scale each segment's loudness toward its target height. Two passes: a coarse
 * one, then a fine correction measured off the intermediate result, so the
 * output's envelope lands as close to the word as the source allows. A silent
 * segment stays silent — no gain can make a shape out of nothing.
 */
export function reshape(
  mono: Float32Array,
  rate: number,
  targets: number[],
  smoothingMs: number,
): Float32Array {
  let out = mono
  const meanTarget = targets.reduce((a, b) => a + b, 0) / targets.length || 1

  for (const ceiling of [4, 2]) {
    const rms = segmentRms(out)
    let overall = 0
    for (let i = 0; i < out.length; i++) overall += out[i] * out[i]
    overall = Math.sqrt(overall / Math.max(1, out.length))
    const gains = new Float32Array(COLUMNS)
    for (let i = 0; i < COLUMNS; i++) {
      if (rms[i] < 1e-6) {
        gains[i] = 1
        continue
      }
      const desired = overall * (targets[i] / meanTarget)
      const want = desired / rms[i]
      gains[i] = Math.min(ceiling, Math.max(0.0005, want))
    }
    out = applyGainCurve(out === mono ? mono.slice() : out, gains, rate, smoothingMs)
  }

  let peak = 0
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]))
  if (peak > 0) {
    const k = 0.95 / peak
    for (let i = 0; i < out.length; i++) out[i] *= k
  }
  return out
}
