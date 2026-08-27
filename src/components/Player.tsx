import { useEffect, useRef, useState } from 'react'
import type { Clock } from '../lib/clock'
import { formatTime } from '../lib/audio'

interface Props {
  audio: HTMLAudioElement | null
  clock: Clock
  playing: boolean
  onToggle: () => void
  duration: number
  accent?: string
  hint?: string
}

/** Transport for the shaped clip: hear it before you commit to it. */
export function Player({ audio, clock, playing, onToggle, duration, accent = '#FF7A45', hint }: Props) {
  const [time, setTime] = useState(0)
  const raf = useRef(0)

  useEffect(() => {
    const loop = () => {
      if (audio) {
        setTime(audio.currentTime)
        clock.set(audio.currentTime, duration || audio.duration || 0, !audio.paused)
      }
      raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf.current)
  }, [audio, clock, duration])

  const pct = duration > 0 ? (time / duration) * 100 : 0

  return (
    <div>
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onToggle}
          aria-label={playing ? 'Pause' : 'Play processed audio'}
          className="grid size-12 shrink-0 place-items-center border transition-colors"
          style={{ borderColor: accent, color: accent }}
        >
          {playing ? (
            <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden>
              <rect width="4" height="14" fill="currentColor" />
              <rect x="8" width="4" height="14" fill="currentColor" />
            </svg>
          ) : (
            <svg width="12" height="14" viewBox="0 0 12 14" aria-hidden>
              <path d="M0 0l12 7-12 7z" fill="currentColor" />
            </svg>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <label htmlFor="scrub" className="sr-only">
            Seek within the clip
          </label>
          <input
            id="scrub"
            type="range"
            min={0}
            max={Math.max(0.01, duration)}
            step={0.01}
            value={Math.min(time, duration)}
            onChange={(e) => {
              const v = Number(e.target.value)
              if (audio) audio.currentTime = v
              setTime(v)
            }}
          />
          <div className="u-data -mt-1 flex justify-between text-[10px] text-bone/45">
            <span>{formatTime(time)}</span>
            <span>{pct.toFixed(0)}%</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>
      {hint && <p className="mt-2 text-[12px] text-bone/40">{hint}</p>}
    </div>
  )
}
