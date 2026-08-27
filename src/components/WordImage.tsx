import { useCallback, useEffect, useRef } from 'react'
import { download, formatTime } from '../lib/encode'

/**
 * The word drawn as waveform-style lettering inside the audio circle — as an
 * image. This is the only version that reads exactly like text: an audio
 * file can only carry bar heights, but a picture can carry letterforms.
 */

const CIRCLE = '#E2573B'
const BUBBLE = '#D9FDD3'

/** Deterministic jitter so the preview is stable for a given word. */
function rng(seed: string) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 15), h | 1)
    h ^= h + Math.imul(h ^ (h >>> 7), h | 61)
    return ((h ^ (h >>> 14)) >>> 0) / 4294967296
  }
}

function render(canvas: HTMLCanvasElement, word: string, duration: number | null, size = 1024) {
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const rand = rng(word)

  // Chat-bubble ground, so the export looks like the message it imitates.
  ctx.fillStyle = BUBBLE
  ctx.beginPath()
  ctx.roundRect(0, 0, size, size, size * 0.16)
  ctx.fill()

  const cx = size / 2
  const cy = size / 2
  const r = size * 0.38
  ctx.fillStyle = CIRCLE
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()

  // Fit the word inside the circle, leaving room for the trace squiggles.
  const text = word || 'OCEAN'
  let fs = r * 0.58
  const setFont = () => {
    ctx.font = `700 ${fs}px Archivo, 'Instrument Sans', system-ui, sans-serif`
  }
  setFont()
  const maxWidth = r * 1.5
  if (ctx.measureText(text).width > maxWidth) {
    fs *= maxWidth / ctx.measureText(text).width
    setFont()
  }

  const wordY = cy - r * 0.08
  const wordW = ctx.measureText(text).width
  ctx.textBaseline = 'middle'
  ctx.strokeStyle = '#FFFFFF'
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  // Letter by letter, each with its own bob and tilt, stroked in several
  // slightly-offset passes — reads as one continuous hand-drawn trace.
  ctx.textAlign = 'left'
  ctx.lineWidth = Math.max(2, fs * 0.034)
  const widths = [...text].map((ch) => ctx.measureText(ch).width)
  let x = cx - wordW / 2
  ;[...text].forEach((ch, i) => {
    const bob = (rand() - 0.5) * fs * 0.14
    const tilt = (rand() - 0.5) * 0.09
    ctx.save()
    ctx.translate(x + widths[i] / 2, wordY + bob)
    ctx.rotate(tilt)
    for (let pass = 0; pass < 5; pass++) {
      const j = fs * 0.03
      ctx.strokeText(ch, -widths[i] / 2 + (rand() - 0.5) * j * 2, (rand() - 0.5) * j * 2)
    }
    ctx.restore()
    x += widths[i]
  })

  // Lead-in / lead-out squiggles, like a trace entering and leaving the word.
  const zig = (x0: number, x1: number, amp: number) => {
    if (x1 - x0 < fs * 0.15) return
    const step = fs * 0.08
    ctx.beginPath()
    ctx.moveTo(x0, wordY)
    let up = 1
    for (let x = x0 + step; x <= x1; x += step) {
      ctx.lineTo(x, wordY + up * amp * (0.5 + rand() * 0.9))
      up = -up
    }
    ctx.stroke()
  }
  ctx.lineWidth = Math.max(2, fs * 0.04)
  const inset = Math.sqrt(Math.max(0, r * r - Math.pow(wordY - cy, 2))) * 0.96
  zig(cx - inset, cx - wordW / 2 - fs * 0.1, fs * 0.13)
  zig(cx + wordW / 2 + fs * 0.1, cx + inset, fs * 0.13)

  // Duration, like the real icon.
  ctx.textAlign = 'center'
  ctx.fillStyle = '#FFFFFF'
  ctx.font = `400 ${r * 0.26}px 'Instrument Sans', system-ui, sans-serif`
  ctx.fillText(formatTime(duration ?? 19), cx, cy + r * 0.55)
}

interface Props {
  word: string
  duration: number | null
}

export function WordImage({ word, duration }: Props) {
  const ref = useRef<HTMLCanvasElement>(null)

  const draw = useCallback(() => {
    if (ref.current) render(ref.current, word, duration)
  }, [word, duration])

  useEffect(() => {
    draw()
    let live = true
    // Redraw once the webfont arrives so the export uses the real face.
    document.fonts?.ready.then(() => live && draw()).catch(() => {})
    return () => {
      live = false
    }
  }, [draw])

  const save = () => {
    const c = document.createElement('canvas')
    render(c, word, duration)
    c.toBlob((b) => b && download(b, `${(word || 'waveprint').toLowerCase()}.png`), 'image/png')
  }

  return (
    <section className="flex flex-col gap-3">
      <span className="u-label">Image · always readable</span>
      <div className="flex items-center gap-5">
        <canvas
          ref={ref}
          role="img"
          aria-label={`${word || 'Your word'} drawn as a waveform inside the audio circle`}
          className="size-[136px] shrink-0 rounded-[22px] sm:size-[168px]"
        />
        <div className="flex min-w-0 flex-col gap-3">
          <button
            type="button"
            onClick={save}
            className="border border-line/70 px-4 py-3 text-sm text-bone transition-colors hover:border-signal hover:text-signal"
          >
            Download PNG
          </button>
          <p className="text-[12px] leading-snug text-bone/45">
            A picture, not audio — send it as a photo or sticker. Only an image can carry real
            letterforms; audio can only carry the bar heights above.
          </p>
        </div>
      </div>
    </section>
  )
}
