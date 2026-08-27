import { BarStrip } from './BarStrip'
import type { Clock } from '../lib/clock'
import { formatTime } from '../lib/audio'

interface Props {
  values: number[]
  duration: number
  clock?: Clock | null
  playing: boolean
  onToggle: () => void
}

/**
 * Roughly how the shaped clip lands in a chat: a bubble, a play control, and
 * the mirrored strip. Drawn in this app's own colours — the point is the
 * silhouette, not a pixel copy of anyone's client.
 */
export function ChatPreview({ values, duration, clock, playing, onToggle }: Props) {
  return (
    <div className="u-panel u-tick p-4 sm:p-5">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <span className="u-label">Chat preview</span>
        <span className="u-data text-[10px] text-bone/35">approximate</span>
      </div>
      <div className="flex justify-end">
        <div className="flex w-full max-w-[420px] items-center gap-3 rounded-l-xl rounded-tr-xl border border-mint/25 bg-mint/8 p-3">
          <button
            type="button"
            onClick={onToggle}
            aria-label={playing ? 'Pause preview' : 'Play preview'}
            className="grid size-10 shrink-0 place-items-center rounded-full border border-mint/40 text-mint transition-colors hover:bg-mint/15"
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
          <BarStrip
            values={values}
            color="#7FD1A8"
            height={38}
            clock={clock}
            className="min-w-0 flex-1"
            ariaLabel="Waveform as a chat client would draw it"
          />
          <span className="u-data shrink-0 text-[10px] text-mint/70">{formatTime(duration)}</span>
        </div>
      </div>
      <p className="mt-4 text-[13px] leading-relaxed text-bone/50">
        Your chat client measures the file itself when you send it. This is our measurement of the same
        file, so the two should land close — not identical.
      </p>
    </div>
  )
}
