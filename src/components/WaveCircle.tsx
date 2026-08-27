import { useEffect, useRef } from 'react'
import { drawCircle, PALETTE, rgba } from '../lib/render'
import type { Clock } from '../lib/clock'
import { prefersReducedMotion } from '../lib/clock'
import type { WordSlot } from '../lib/envelope'
import { COLUMNS } from '../lib/envelope'

const MORPH_MS = 400
const STAGGER_MS = 220
const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)

interface Props {
  values: number[]
  color: string
  ghost?: number[] | null
  clock?: Clock | null
  slots?: WordSlot[]
  /** Travel from the previous shape to this one, staggered per column. */
  morph?: boolean
  max?: number
  className?: string
  ariaLabel: string
}

export function WaveCircle({
  values,
  color,
  ghost = null,
  clock = null,
  slots,
  morph = true,
  max = 420,
  className = '',
  ariaLabel,
}: Props) {
  const holder = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const size = useRef(0)

  const target = useRef(values)
  const from = useRef(values)
  const morphStart = useRef(0)
  const raf = useRef(0)
  const state = useRef({ color, ghost, slots, clock })
  state.current = { color, ghost, slots, clock }

  useEffect(() => {
    const reduced = prefersReducedMotion()
    from.current = reduced ? values : (target.current ?? values)
    target.current = values
    morphStart.current = reduced || !morph ? 0 : performance.now()
    tick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values, morph])

  function currentValues(now: number): number[] {
    const start = morphStart.current
    if (!start) return target.current
    const a = from.current
    const b = target.current
    const total = MORPH_MS + STAGGER_MS
    const elapsed = now - start
    if (elapsed >= total) {
      morphStart.current = 0
      return b
    }
    const out = new Array<number>(b.length)
    for (let i = 0; i < b.length; i++) {
      const delay = (i / Math.max(1, b.length - 1)) * STAGGER_MS
      const t = Math.max(0, Math.min(1, (elapsed - delay) / MORPH_MS))
      const av = a[i] ?? 0
      out[i] = av + (b[i] - av) * easeOutCubic(t)
    }
    return out
  }

  function paint(now: number) {
    const cvs = canvas.current
    if (!cvs || !size.current) return
    const ctx = cvs.getContext('2d')
    if (!ctx) return
    const { color: c, ghost: gh, slots: sl, clock: ck } = state.current
    const s = size.current
    const dpr = Math.min(2.5, window.devicePixelRatio || 1)
    if (cvs.width !== Math.round(s * dpr)) {
      cvs.width = Math.round(s * dpr)
      cvs.height = Math.round(s * dpr)
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const vals = currentValues(now)
    let playhead: number | null = null
    let activeRange: [number, number] | null = null
    if (ck && ck.duration > 0 && (ck.playing || ck.time > 0)) {
      playhead = ck.progress
      if (sl?.length) {
        const col = playhead * COLUMNS
        const hit = sl.find((x) => col >= x.start && col < x.end)
        if (hit) activeRange = [hit.start, hit.end]
      }
    }
    drawCircle(ctx, {
      values: vals,
      size: s,
      color: c,
      dim: rgba(PALETTE.line, 0.9),
      ghost: gh,
      ghostColor: rgba(c, 0.16),
      playhead,
      activeRange,
    })
  }

  function tick() {
    cancelAnimationFrame(raf.current)
    const loop = () => {
      const now = performance.now()
      paint(now)
      const ck = state.current.clock
      if (morphStart.current || ck?.playing) raf.current = requestAnimationFrame(loop)
    }
    raf.current = requestAnimationFrame(loop)
  }

  useEffect(() => {
    const el = holder.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      size.current = Math.min(max, el.clientWidth)
      const cvs = canvas.current
      if (cvs) {
        cvs.style.width = `${size.current}px`
        cvs.style.height = `${size.current}px`
        cvs.width = 0
      }
      paint(performance.now())
    })
    ro.observe(el)
    return () => ro.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [max])

  useEffect(() => {
    const ck = clock
    if (!ck) return
    return ck.subscribe(() => tick())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clock])

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  return (
    <div ref={holder} className={`flex justify-center ${className}`}>
      <canvas ref={canvas} role="img" aria-label={ariaLabel} className="block" />
    </div>
  )
}
