import { useEffect, useRef } from 'react'
import { COLUMNS } from '../lib/word'
import { formatTime } from '../lib/encode'

/**
 * An outgoing voice note, drawn the way WhatsApp draws one. This is the only
 * place a waveform appears at all: sent as mp3 or m4a the same audio arrives as
 * a document — a generic icon and a plain seek bar — so the preview has to be
 * the voice note, not a house style.
 */

const BAR_IDLE = '#9EACA4'
const BAR_PLAYED = '#0E8A6E'
const BUBBLE_OUT = '#D9FDD3'
const BUBBLE_IN = '#FFFFFF'
const INK = '#111B21'
const MUTED = '#667781'

interface Props {
  bars: number[]
  duration: number
  progress: number
  playing: boolean
  onToggle: () => void
  scale: number
  /** No audio behind this bubble yet — grey the play control out. */
  disabled?: boolean
  /** 'out' is a green sent bubble, 'in' a white received one. */
  variant?: 'in' | 'out'
}

function Waveform({ bars, progress, width, height }: { bars: number[]; progress: number; width: number; height: number }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const cvs = ref.current
    const ctx = cvs?.getContext('2d')
    if (!cvs || !ctx) return
    const dpr = Math.min(3, window.devicePixelRatio || 1)
    cvs.width = Math.round(width * dpr)
    cvs.height = Math.round(height * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, height)

    const slot = width / COLUMNS
    const bw = Math.max(1.5, slot * 0.58)
    const mid = height / 2
    const head = progress * COLUMNS

    bars.forEach((v, i) => {
      const h = Math.max(2, (v / 100) * height)
      ctx.fillStyle = i <= head ? BAR_PLAYED : BAR_IDLE
      const x = i * slot + (slot - bw) / 2
      ctx.beginPath()
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x, mid - h / 2, bw, h, bw / 2)
      else ctx.rect(x, mid - h / 2, bw, h)
      ctx.fill()
    })

    // Seek handle
    const hx = Math.min(width - 5, Math.max(5, progress * width))
    ctx.fillStyle = BAR_PLAYED
    ctx.beginPath()
    ctx.arc(hx, mid, 5, 0, Math.PI * 2)
    ctx.fill()
  }, [bars, progress, width, height])

  return <canvas ref={ref} style={{ width, height, display: 'block' }} aria-hidden />
}

export function VoiceNote({ bars, duration, progress, playing, onToggle, scale, variant = 'out', disabled }: Props) {
  return (
    <div
      style={{
        width: 292 * scale,
        transformOrigin: 'top center',
        fontFamily: '"Instrument Sans", system-ui, sans-serif',
      }}
    >
      <div
        style={{
          background: variant === 'out' ? BUBBLE_OUT : BUBBLE_IN,
          borderRadius: 8 * scale,
          ...(variant === 'out' ? { borderTopRightRadius: 0 } : { borderTopLeftRadius: 0 }),
          padding: `${7 * scale}px ${8 * scale}px ${5 * scale}px`,
          boxShadow: `0 ${1 * scale}px ${1 * scale}px rgba(11,20,26,.13)`,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 * scale }}>
          <button
            type="button"
            onClick={disabled ? undefined : onToggle}
            aria-label={playing ? 'Pause preview' : 'Play preview'}
            aria-disabled={disabled || undefined}
            title={disabled ? 'Add audio below to hear it' : undefined}
            style={{
              flex: '0 0 auto',
              width: 26 * scale,
              height: 26 * scale,
              border: 0,
              padding: 0,
              background: 'transparent',
              color: '#54656F',
              opacity: disabled ? 0.3 : 1,
              cursor: disabled ? 'default' : 'pointer',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            {playing ? (
              <svg width={13 * scale} height={15 * scale} viewBox="0 0 13 15" aria-hidden>
                <rect width="4" height="15" rx="1" fill="currentColor" />
                <rect x="9" width="4" height="15" rx="1" fill="currentColor" />
              </svg>
            ) : (
              <svg width={13 * scale} height={15 * scale} viewBox="0 0 13 15" aria-hidden>
                <path d="M1 1.2a.6.6 0 0 1 .9-.5l10 6.1a.6.6 0 0 1 0 1l-10 6.1a.6.6 0 0 1-.9-.5z" fill="currentColor" />
              </svg>
            )}
          </button>

          <Waveform bars={bars} progress={progress} width={168 * scale} height={22 * scale} />

          {/* Sender thumbnail with the mic badge WhatsApp puts on voice notes */}
          <div style={{ position: 'relative', flex: '0 0 auto', width: 42 * scale, height: 42 * scale }}>
            <div
              style={{
                width: '100%',
                height: '100%',
                borderRadius: '50%',
                background: '#C8D4CE',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <svg width={26 * scale} height={26 * scale} viewBox="0 0 24 24" aria-hidden>
                <circle cx="12" cy="9" r="4" fill="#F5F8F6" />
                <path d="M4.5 21a7.5 7.5 0 0 1 15 0z" fill="#F5F8F6" />
              </svg>
            </div>
            <span
              style={{
                position: 'absolute',
                right: -1 * scale,
                bottom: -1 * scale,
                width: 15 * scale,
                height: 15 * scale,
                borderRadius: '50%',
                background: progress > 0 ? '#53BDEB' : '#25D366',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              <svg width={9 * scale} height={9 * scale} viewBox="0 0 24 24" aria-hidden>
                <path
                  d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3m5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.9V21h2v-3.1A7 7 0 0 0 19 11z"
                  fill="#fff"
                />
              </svg>
            </span>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 1 * scale,
            paddingLeft: 33 * scale,
            paddingRight: 49 * scale,
          }}
        >
          <span style={{ fontSize: 11 * scale, color: MUTED }}>
            {formatTime(progress > 0 ? progress * duration : duration)}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 3 * scale }}>
            <span style={{ fontSize: 11 * scale, color: MUTED }}>8:13 am</span>
            {variant === 'out' && (
              <svg width={15 * scale} height={11 * scale} viewBox="0 0 16 11" aria-hidden>
                <path
                  d="M11.1.5 5.3 8.2 3 5.9l-.8.8 3.2 3.2zm3.6 0L8.9 8.2l-.6-.6-.8.8 1.4 1.5z"
                  fill="#53BDEB"
                />
              </svg>
            )}
          </span>
        </div>
      </div>
      <span style={{ display: 'none' }}>{INK}</span>
    </div>
  )
}
