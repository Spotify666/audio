import { useEffect, useRef } from 'react'
import { drawStrip, PALETTE, rgba } from '../lib/render'
import type { Clock } from '../lib/clock'

interface Props {
  values: number[]
  color: string
  height?: number
  clock?: Clock | null
  className?: string
  ariaLabel: string
}

/** The linear mirrored strip, as a chat client would draw it. */
export function BarStrip({ values, color, height = 44, clock = null, className = '', ariaLabel }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const raf = useRef(0)
  const st = useRef({ values, color, clock })
  st.current = { values, color, clock }

  useEffect(() => {
    const el = wrap.current
    const cvs = canvas.current
    if (!el || !cvs) return

    const paint = () => {
      const ctx = cvs.getContext('2d')
      const w = el.clientWidth
      if (!ctx || !w) return
      const dpr = Math.min(2.5, window.devicePixelRatio || 1)
      cvs.width = Math.round(w * dpr)
      cvs.height = Math.round(height * dpr)
      cvs.style.width = `${w}px`
      cvs.style.height = `${height}px`
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, height)
      const ck = st.current.clock
      drawStrip(ctx, {
        values: st.current.values,
        width: w,
        height,
        color: st.current.color,
        dim: rgba(PALETTE.line, 0.95),
        playhead: ck && ck.duration > 0 && (ck.playing || ck.time > 0) ? ck.progress : null,
      })
    }

    const loop = () => {
      paint()
      if (st.current.clock?.playing) raf.current = requestAnimationFrame(loop)
    }

    const ro = new ResizeObserver(() => paint())
    ro.observe(el)
    paint()
    const unsub = clock?.subscribe(() => {
      cancelAnimationFrame(raf.current)
      raf.current = requestAnimationFrame(loop)
    })
    loop()
    return () => {
      ro.disconnect()
      unsub?.()
      cancelAnimationFrame(raf.current)
    }
  }, [values, color, height, clock])

  return (
    <div ref={wrap} className={className}>
      <canvas ref={canvas} role="img" aria-label={ariaLabel} className="block" />
    </div>
  )
}
