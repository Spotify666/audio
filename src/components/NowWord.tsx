import { useActiveColumn } from '../hooks/useActiveColumn'
import type { Clock } from '../lib/clock'
import type { WordSlot } from '../lib/envelope'

/**
 * The word currently passing under the playhead. This is the pacing feature
 * made visible: with more than one word, the phrase arrives in time rather
 * than all at once.
 */
export function NowWord({ slots, clock }: { slots: WordSlot[]; clock: Clock }) {
  const col = useActiveColumn(clock)
  const active = col == null ? null : slots.find((s) => col >= s.start && col < s.end)

  return (
    <div className="flex h-8 items-center justify-center gap-2" aria-live="polite">
      {active ? (
        <>
          <span aria-hidden className="u-data text-[10px] text-signal/70">
            {String(active.start).padStart(2, '0')}–{String(active.end).padStart(2, '0')}
          </span>
          <span className="u-display text-lg uppercase tracking-wide text-bone">{active.word}</span>
        </>
      ) : (
        <span className="u-data text-[10px] text-bone/25">
          {slots.length > 1 ? `${slots.length} words on the timeline` : ' '}
        </span>
      )}
    </div>
  )
}
