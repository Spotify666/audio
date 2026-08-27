/** WAV for previews, MP3 as the download, Ogg Opus for the voice-note path. */

export function encodeWav(mono: Float32Array, sampleRate: number): Blob {
  const buffer = new ArrayBuffer(44 + mono.length * 2)
  const view = new DataView(buffer)
  const str = (off: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(off + i, s.charCodeAt(i))
  }
  str(0, 'RIFF')
  view.setUint32(4, 36 + mono.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  str(36, 'data')
  view.setUint32(40, mono.length * 2, true)
  const pcm = new Int16Array(buffer, 44)
  for (let i = 0; i < mono.length; i++) {
    const s = Math.max(-1, Math.min(1, mono[i]))
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return new Blob([buffer], { type: 'audio/wav' })
}

const LAME_RATES = [8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000]

function resampleLinear(mono: Float32Array, from: number, to: number): Float32Array {
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

/** MP3 at 128 kbps mono. The encoder is loaded only when a download starts. */
export async function encodeMp3(mono: Float32Array, sampleRate: number, kbps = 128): Promise<Blob> {
  const { Mp3Encoder } = await import('@breezystack/lamejs')
  let rate = sampleRate
  let samples = mono
  if (!LAME_RATES.includes(sampleRate)) {
    rate = 44100
    samples = resampleLinear(mono, sampleRate, rate)
  }
  const encoder = new Mp3Encoder(1, rate, kbps)
  const pcm = new Int16Array(samples.length)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  const block = 1152 * 40
  const parts: Uint8Array[] = []
  for (let i = 0; i < pcm.length; i += block) {
    const encoded = encoder.encodeBuffer(pcm.subarray(i, Math.min(i + block, pcm.length)) as Int16Array)
    if (encoded.length > 0) parts.push(encoded)
    if (i % (block * 8) === 0) await new Promise((r) => setTimeout(r, 0))
  }
  const tail = encoder.flush()
  if (tail.length > 0) parts.push(tail)
  return new Blob(parts as BlobPart[], { type: 'audio/mpeg' })
}

/**
 * Ogg Opus — the format WhatsApp treats as a voice note, which is the only
 * message type that gets waveform bars at all.
 */
export async function encodeOpus(mono: Float32Array, sampleRate: number, bitrate = 32000): Promise<Blob> {
  const mod = await import('opus-recorder/dist/encoderWorker.min.js?worker&inline')
  const worker = new mod.default()
  return new Promise<Blob>((resolve, reject) => {
    const pages: BlobPart[] = []
    let ready = false
    const fail = (message: string) => {
      worker.terminate()
      reject(new Error(message))
    }
    const timer = setTimeout(() => fail('The Opus encoder did not respond.'), 30000)
    worker.onerror = () => fail('The Opus encoder failed to start.')
    worker.onmessage = ({ data }: MessageEvent) => {
      if (data?.message === 'ready') {
        if (ready) return
        ready = true
        // Header pages are only emitted on request; ask before encoding so
        // OpusHead and OpusTags lead the stream.
        worker.postMessage({ command: 'getHeaderPages' })
        worker.postMessage({ command: 'encode', buffers: [mono] })
        worker.postMessage({ command: 'done' })
      } else if (data?.message === 'page') {
        pages.push(data.page)
      } else if (data?.message === 'done') {
        clearTimeout(timer)
        worker.terminate()
        resolve(new Blob(pages, { type: 'audio/ogg' }))
      }
    }
    worker.postMessage({
      command: 'init',
      encoderSampleRate: 48000,
      originalSampleRate: sampleRate,
      numberOfChannels: 1,
      encoderApplication: 2048, // VOIP — what a voice note is encoded as
      encoderBitRate: bitrate,
      encoderComplexity: 10,
      resampleQuality: 3,
      maxFramesPerPage: 40,
      encoderFrameSize: 20,
    })
  })
}

export function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export const formatTime = (s: number) => {
  const safe = isFinite(s) && s > 0 ? s : 0
  return `${Math.floor(safe / 60)}:${Math.floor(safe % 60).toString().padStart(2, '0')}`
}
