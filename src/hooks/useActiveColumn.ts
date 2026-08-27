import { useEffect, useState } from 'react'
import type { Clock } from '../lib/clock'
import { COLUMNS } from '../lib/envelope'

/**
 * The column under the playhead, updated at most once per column change rather
 * than once per frame — the readout has 64 cells and does not need 60fps.
 */
export function useActiveColumn(clock: Clock | null): number | null {
  const [col, setCol] = useState<number | null>(null)

  useEffect(() => {
    if (!clock) return
    let raf = 0
    let last: number | null = null
    const loop = () => {
      const next =
        clock.duration > 0 && (clock.playing || clock.time > 0)
          ? Math.min(COLUMNS - 1, Math.floor(clock.progress * COLUMNS))
          : null
      if (next !== last) {
        last = next
        setCol(next)
      }
      if (clock.playing) raf = requestAnimationFrame(loop)
    }
    const unsub = clock.subscribe(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(loop)
    })
    raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      unsub()
    }
  }, [clock])

  return col
}
