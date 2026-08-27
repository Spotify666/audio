import { useEffect, useRef, useState } from 'react'
import { LOGO_W } from '../lib/render'
import { prefersReducedMotion } from '../lib/clock'

/**
 * The mark is the letter W in the bar font: five vertical bars in a ring,
 * built from the same array the renderer uses for the hero.
 */
export function Logo({ size = 34 }: { size?: number }) {
  const [t, setT] = useState(0)
  const hover = useRef(false)
  const raf = useRef(0)

  useEffect(() => () => cancelAnimationFrame(raf.current), [])

  const start = () => {
    if (prefersReducedMotion()) return
    hover.current = true
    const t0 = performance.now()
    const loop = () => {
      const e = (performance.now() - t0) / 1000
      setT(e)
      if (hover.current) raf.current = requestAnimationFrame(loop)
      else setT(0)
    }
    raf.current = requestAnimationFrame(loop)
  }
  const stop = () => {
    hover.current = false
  }

  const slot = 15
  const w = 9.5
  const fieldW = slot * 5
  const x0 = 50 - fieldW / 2 + (slot - w) / 2

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      onMouseEnter={start}
      onMouseLeave={stop}
      onFocus={start}
      onBlur={stop}
      aria-hidden="true"
      className="shrink-0 overflow-visible"
    >
      <circle cx="50" cy="50" r="46" fill="none" stroke="#FF7A45" strokeWidth="5" />
      {LOGO_W.map((v, i) => {
        const wob = t > 0 ? 1 + 0.24 * Math.sin(t * 5 - i * 0.9) : 1
        const h = Math.min(62, (v / 100) * 58 * wob)
        return (
          <rect
            key={i}
            x={x0 + i * slot}
            y={50 - h / 2}
            width={w}
            height={h}
            rx={w / 2}
            fill="#FF7A45"
          />
        )
      })}
    </svg>
  )
}
