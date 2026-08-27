import { useActiveColumn } from '../hooks/useActiveColumn'
import type { Clock } from '../lib/clock'

interface Props {
  values: number[]
  clock?: Clock | null
  accent?: string
}

/**
 * The sixty-four integers, laid out as one strip in column order. This is the
 * whole budget for a word: 64 numbers between 0 and 100.
 */
export function ReadoutStrip({ values, clock = null, accent = '#FF7A45' }: Props) {
  const active = useActiveColumn(clock)

  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="u-label">Waveform bytes · 64 values</span>
        <span className="u-data text-[10px] text-bone/30">
          00–63 · max {Math.max(...values)} · min {Math.min(...values)}
        </span>
      </div>

      <div className="overflow-x-auto border-y border-line/40 py-2">
       <div className="min-w-[1000px]">
        <ol
          className="flex items-end"
          aria-label={`Sixty-four waveform values: ${values.join(', ')}`}
        >
          {values.map((v, i) => {
            const on = active === i
            return (
              <li key={i} aria-hidden className="flex-1 px-[1px]">
                <div
                  className="u-data mb-1 text-center text-[7px] leading-none tracking-[-0.05em]"
                  style={{ color: on ? '#F2EFE9' : accent, opacity: on ? 1 : 0.35 + (v / 100) * 0.5 }}
                >
                  {v.toString().padStart(2, '0')}
                </div>
                <div className="relative h-6 bg-ink-deep/70">
                  <div
                    className="absolute inset-x-0 bottom-0"
                    style={{
                      height: `${Math.max(4, v)}%`,
                      background: on ? '#F2EFE9' : accent,
                      opacity: on ? 1 : 0.75,
                    }}
                  />
                </div>
              </li>
            )
          })}
        </ol>
        <div className="u-data mt-1 flex text-[7px] leading-none text-bone/25" aria-hidden>
          {Array.from({ length: 8 }, (_, k) => (
            <span key={k} className="flex-1 border-l border-line/40 pl-1">
              {(k * 8).toString().padStart(2, '0')}
            </span>
          ))}
        </div>
       </div>
      </div>
    </div>
  )
}
