import { COLUMNS, clamp } from './envelope'

/**
 * Everything here runs on the file the person picked, in their own browser.
 * Nothing is uploaded, and there is no server to upload it to.
 */

let ctx: AudioContext | null = null
export function audioContext(): AudioContext {
  if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
  return ctx
}

export async function decodeAudioFile(file: File): Promise<AudioBuffer> {
  const bytes = await file.arrayBuffer()
  return await audioContext().decodeAudioData(bytes)
}

/** Average the channels. Voice notes are mono anyway and it halves the file. */
export function downmixToMono(buffer: AudioBuffer): Float32Array {
  const n = buffer.length
  const out = new Float32Array(n)
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c)
    for (let i = 0; i < n; i++) out[i] += data[i]
  }
  const k = 1 / Math.max(1, buffer.numberOfChannels)
  for (let i = 0; i < n; i++) out[i] *= k
  return out
}

/** RMS of each of the 64 equal segments — the same measurement WhatsApp makes. */
export function segmentRms(mono: Float32Array, columns = COLUMNS): Float32Array {
  const out = new Float32Array(columns)
  for (let i = 0; i < columns; i++) {
    const a = Math.floor((i * mono.length) / columns)
    const b = Math.floor(((i + 1) * mono.length) / columns)
    let sum = 0
    for (let s = a; s < b; s++) sum += mono[s] * mono[s]
    out[i] = b > a ? Math.sqrt(sum / (b - a)) : 0
  }
  return out
}

/**
 * Normalise segment RMS to 0-100 the way a waveform renderer does: relative to
 * the loudest segment. This is the transform applied to both the "before"
 * trace and the verified "after" trace, so the two are directly comparable.
 */
export function rmsToBars(rms: Float32Array): number[] {
  let max = 0
  for (const v of rms) max = Math.max(max, v)
  if (max <= 0) return new Array(rms.length).fill(0)
  return Array.from(rms, (v) => Math.round(clamp((v / max) * 100, 0, 100)))
}

export const analyseBars = (mono: Float32Array, columns = COLUMNS) =>
  rmsToBars(segmentRms(mono, columns))

/** Overall RMS — the loudness the shaped version is pinned to. */
export function overallRms(mono: Float32Array): number {
  let sum = 0
  for (let i = 0; i < mono.length; i++) sum += mono[i] * mono[i]
  return Math.sqrt(sum / Math.max(1, mono.length))
}

/** Drop near-silent head and tail so the shape starts where the sound does. */
export function trimSilence(mono: Float32Array, thresholdDb = -45): Float32Array {
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

const smoothstep = (u: number) => u * u * (3 - 2 * u)

export interface ShapeOptions {
  /** 64 target heights, 0-100, already floored. */
  targets: number[]
  /** Cross-fade width at each segment boundary, milliseconds. */
  smoothingMs: number
  /** Ceiling on per-segment gain. Above ~4x you are amplifying room noise. */
  maxGain: number
}

export interface ShapeResult {
  samples: Float32Array
  sampleRate: number
  /** Per-segment gain actually applied. */
  gains: Float32Array
  /** Segments that wanted more gain than the ceiling allowed. */
  clipped: number
  /** Segments where the source is silent, so no gain can reach the target. */
  dead: number
  /** Smoothing is capped at just under half a segment; this is what was used. */
  effectiveSmoothingMs: number
  peak: number
}

/**
 * Impose the target envelope by measuring each segment's RMS and scaling it to
 * the height we want, then cross-fading the gain across every boundary.
 */
export function shapeEnvelope(
  mono: Float32Array,
  sampleRate: number,
  { targets, smoothingMs, maxGain }: ShapeOptions,
): ShapeResult {
  const n = mono.length
  const rms = segmentRms(mono, COLUMNS)
  const base = overallRms(mono)
  const meanTarget = targets.reduce((a, b) => a + b, 0) / targets.length || 1

  const gains = new Float32Array(COLUMNS)
  let clipped = 0
  let dead = 0
  for (let i = 0; i < COLUMNS; i++) {
    const desired = base * (targets[i] / meanTarget)
    if (rms[i] < 1e-6) {
      dead++
      gains[i] = 1
      continue
    }
    const want = desired / rms[i]
    if (want > maxGain) clipped++
    gains[i] = clamp(want, 0.0005, maxGain)
  }

  const segLen = n / COLUMNS
  const halfWindow = Math.min(
    Math.floor((smoothingMs / 1000) * sampleRate * 0.5),
    Math.floor(segLen * 0.49),
  )
  const effectiveSmoothingMs = (halfWindow * 2 * 1000) / sampleRate

  const out = new Float32Array(n)
  // Flat gain across each segment...
  for (let i = 0; i < COLUMNS; i++) {
    const a = Math.floor((i * n) / COLUMNS)
    const b = i === COLUMNS - 1 ? n : Math.floor(((i + 1) * n) / COLUMNS)
    const gsegment = gains[i]
    for (let s = a; s < b; s++) out[s] = mono[s] * gsegment
  }
  // ...then a raised cosine across every internal boundary, so the gain does
  // not step. This is what stops the output clicking 63 times.
  if (halfWindow > 0) {
    for (let i = 1; i < COLUMNS; i++) {
      const boundary = Math.floor((i * n) / COLUMNS)
      const from = gains[i - 1]
      const to = gains[i]
      if (from === to) continue
      const lo = Math.max(0, boundary - halfWindow)
      const hi = Math.min(n, boundary + halfWindow)
      const span = hi - lo
      for (let s = lo; s < hi; s++) {
        const w = smoothstep((s - lo) / span)
        out[s] = mono[s] * (from * (1 - w) + to * w)
      }
    }
  }

  let peak = 0
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]))
  if (peak > 0.99) {
    const k = 0.99 / peak
    for (let i = 0; i < n; i++) out[i] *= k
  }

  return { samples: out, sampleRate, gains, clipped, dead, effectiveSmoothingMs, peak }
}

/** Naive linear resample. Only used when an exotic rate blocks MP3 encoding. */
export function resampleLinear(mono: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return mono
  const ratio = to / from
  const n = Math.round(mono.length * ratio)
  const out = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const x = i / ratio
    const a = Math.floor(x)
    const b = Math.min(mono.length - 1, a + 1)
    const t = x - a
    out[i] = mono[a] * (1 - t) + mono[b] * t
  }
  return out
}

export function toAudioBuffer(mono: Float32Array, sampleRate: number): AudioBuffer {
  const buffer = audioContext().createBuffer(1, mono.length, sampleRate)
  buffer.copyToChannel(mono as Float32Array<ArrayBuffer>, 0)
  return buffer
}

export const formatTime = (s: number) => {
  if (!isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}
