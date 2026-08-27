/**
 * Ogg Opus, because that is the only container a chat client will treat as a
 * voice note. Sent as mp3 or m4a the message becomes an audio *document*: a
 * generic icon and a plain seek bar, with no waveform anywhere for the shape to
 * appear in.
 */

export interface OpusResult {
  blob: Blob
  bytes: number
}

/**
 * Inlined so the single-file build keeps working, and imported lazily so a
 * visit that never downloads never pays for the encoder.
 */
const loadWorker = async () => {
  const mod = await import('opus-recorder/dist/encoderWorker.min.js?worker&inline')
  return new mod.default()
}

export async function encodeOpus(
  mono: Float32Array,
  sampleRate: number,
  bitrate = 32000,
): Promise<OpusResult> {
  const worker = await loadWorker()
  return new Promise<OpusResult>((resolve, reject) => {
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
        const blob = new Blob(pages, { type: 'audio/ogg' })
        resolve({ blob, bytes: blob.size })
      }
    }

    worker.postMessage({
      command: 'init',
      encoderSampleRate: 48000,
      originalSampleRate: sampleRate,
      numberOfChannels: 1,
      // 2048 = OPUS_APPLICATION_VOIP, which is what a voice note is encoded as.
      encoderApplication: 2048,
      encoderBitRate: bitrate,
      encoderComplexity: 10,
      resampleQuality: 3,
      maxFramesPerPage: 40,
      encoderFrameSize: 20,
    })
  })
}

/** 16-bit mono PCM. Kept as a fallback for anything that will not take Ogg. */
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

export const formatBytes = (n: number) =>
  n < 1024 ? `${n} B` : n < 1048576 ? `${Math.round(n / 1024)} KB` : `${(n / 1048576).toFixed(1)} MB`

export const formatTime = (s: number) => {
  const safe = isFinite(s) && s > 0 ? s : 0
  return `${Math.floor(safe / 60)}:${Math.floor(safe % 60).toString().padStart(2, '0')}`
}
