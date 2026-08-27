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

/** The loudest stretch of the clip, reused to fill segments the gain cannot reach. */
function extractTexture(mono: Float32Array, rate: number): Float32Array {
  const win = Math.min(Math.max(rate, 1), Math.max(1, Math.floor(mono.length / 4)))
  const hop = Math.max(1, Math.floor(win / 4))
  let best = 0
  let bestAt = 0
  for (let a = 0; a + win <= mono.length; a += hop) {
    let sum = 0
    for (let s = a; s < a + win; s++) sum += mono[s] * mono[s]
    if (sum > best) {
      best = sum
      bestAt = a
    }
  }
  const tex = mono.slice(bestAt, bestAt + win)
  // Fade the loop ends so repeats do not click.
  const edge = Math.min(Math.floor(rate * 0.01), Math.floor(tex.length / 4))
  for (let s = 0; s < edge; s++) {
    const w = smoothstep(s / edge)
    tex[s] *= w
    tex[tex.length - 1 - s] *= w
  }
  return tex
}

const rmsOf = (a: Float32Array, from: number, to: number) => {
  let sum = 0
  for (let s = from; s < to; s++) sum += a[s] * a[s]
  return Math.sqrt(sum / Math.max(1, to - from))
}

export interface Reshaped {
  samples: Float32Array
  /** 0-100 · how closely the output's measured bars follow the word. */
  match: number
}

/**
 * Scale each segment's loudness toward its target height: a coarse pass, then
 * a fine correction measured off the intermediate result. Where the source is
 * too quiet for any reasonable gain to reach the target — silence cannot be
 * amplified into a letter — the deficit is filled with a low loop of the
 * clip's own loudest stretch, so the shape survives pauses in the recording.
 */
export function reshape(
  mono: Float32Array,
  rate: number,
  targets: number[],
  smoothingMs: number,
): Reshaped {
  let out = mono
  const meanTarget = targets.reduce((a, b) => a + b, 0) / targets.length || 1
  const texture = extractTexture(mono, rate)
  const textureRms = rmsOf(texture, 0, texture.length) || 1e-9

  for (const ceiling of [6, 2]) {
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
      gains[i] = Math.min(ceiling, Math.max(0.0005, desired / rms[i]))
    }
    out = applyGainCurve(out === mono ? mono.slice() : out, gains, rate, smoothingMs)

    if (ceiling !== 6) continue
    // Fill what the gain could not reach.
    const n = out.length
    const measured = segmentRms(out)
    const edge = Math.min(Math.floor(rate * 0.015), Math.floor(n / COLUMNS / 4))
    for (let i = 0; i < COLUMNS; i++) {
      const desired = overall * (targets[i] / meanTarget)
      if (measured[i] >= desired * 0.7) continue
      const deficit = Math.sqrt(Math.max(0, desired * desired - measured[i] * measured[i]))
      const k = deficit / textureRms
      const a = Math.floor((i * n) / COLUMNS)
      const b = i === COLUMNS - 1 ? n : Math.floor(((i + 1) * n) / COLUMNS)
      for (let s = a; s < b; s++) {
        let w = 1
        if (s - a < edge) w = smoothstep((s - a) / edge)
        else if (b - s < edge) w = smoothstep((b - s) / edge)
        out[s] += texture[(s - a) % texture.length] * k * w
      }
    }
  }

  let peak = 0
  for (let i = 0; i < out.length; i++) peak = Math.max(peak, Math.abs(out[i]))
  if (peak > 0) {
    const k = 0.95 / peak
    for (let i = 0; i < out.length; i++) out[i] *= k
  }

  const bars = measureBars(out)
  let err = 0
  for (let i = 0; i < COLUMNS; i++) err += Math.abs(bars[i] - targets[i])
  return { samples: out, match: Math.max(0, Math.round(100 - err / COLUMNS)) }
}
