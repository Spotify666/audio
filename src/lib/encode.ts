import { resampleLinear } from './audio'

const toInt16 = (mono: Float32Array): Int16Array => {
  const out = new Int16Array(mono.length)
  for (let i = 0; i < mono.length; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

/** 16-bit mono PCM. Trivial, exact, plays everywhere. */
export function encodeWav(mono: Float32Array, sampleRate: number): Blob {
  const pcm = toInt16(mono)
  const buffer = new ArrayBuffer(44 + pcm.length * 2)
  const view = new DataView(buffer)
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  view.setUint32(4, 36 + pcm.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true) // PCM
  view.setUint16(22, 1, true) // mono
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  str(36, 'data')
  view.setUint32(40, pcm.length * 2, true)
  new Int16Array(buffer, 44).set(pcm)
  return new Blob([buffer], { type: 'audio/wav' })
}

const LAME_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]

/**
 * MP3 is the default download: smaller than WAV and WhatsApp accepts it as a
 * document/audio attachment. Encoding runs in chunks with a yield between each
 * so the page keeps responding on a long clip.
 */
export async function encodeMp3(
  mono: Float32Array,
  sampleRate: number,
  kbps = 128,
  onProgress?: (fraction: number) => void,
): Promise<{ blob: Blob; sampleRate: number }> {
  let rate = sampleRate
  let samples = mono
  if (!LAME_RATES.includes(sampleRate)) {
    rate = 44100
    samples = resampleLinear(mono, sampleRate, rate)
  }
  // Loaded on demand: the encoder is ~350 kB and most visits never download.
  const { Mp3Encoder } = await import('@breezystack/lamejs')
  const encoder = new Mp3Encoder(1, rate, kbps)
  const pcm = toInt16(samples)
  const block = 1152 * 40
  const parts: Uint8Array[] = []
  for (let i = 0; i < pcm.length; i += block) {
    const chunk = pcm.subarray(i, Math.min(i + block, pcm.length))
    const encoded = encoder.encodeBuffer(chunk as Int16Array)
    if (encoded.length > 0) parts.push(encoded)
    onProgress?.(Math.min(1, i / pcm.length))
    if (i % (block * 8) === 0) await new Promise((r) => setTimeout(r, 0))
  }
  const tail = encoder.flush()
  if (tail.length > 0) parts.push(tail)
  onProgress?.(1)
  return {
    blob: new Blob(parts as BlobPart[], { type: 'audio/mpeg' }),
    sampleRate: rate,
  }
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`
