import { useEffect, useRef, useState } from 'react'
import { COLUMNS, FLOOR, clamp } from '../lib/envelope'
import { PALETTE, rgba } from '../lib/render'

interface Props {
  values: number[]
  onChange: (values: number[]) => void
}

const SNAP = 5

/** Freehand 64-column envelope. Drag across it; values snap to steps of 5. */
export function DrawPad({ values, onChange }: Props) {
  const wrap = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const lastCol = useRef<number | null>(null)
  const [cursor, setCursor] = useState(0)
  const [size, setSize] = useState({ w: 640, h: 180 })

  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientWidth < 480 ? 140 : 180 }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const cvs = canvas.current
    if (!cvs) return
    const ctx = cvs.getContext('2d')
    if (!ctx) return
    const dpr = Math.min(2.5, window.devicePixelRatio || 1)
    cvs.width = size.w * dpr
    cvs.height = size.h * dpr
    cvs.style.width = `${size.w}px`
    cvs.style.height = `${size.h}px`
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, size.w, size.h)

    const slot = size.w / COLUMNS
    // Grid: every column, majors every eight, plus the mirror axis.
    for (let i = 0; i <= COLUMNS; i++) {
      ctx.fillStyle = rgba(PALETTE.line, i % 8 === 0 ? 0.55 : 0.22)
      ctx.fillRect(Math.round(i * slot), 0, 1, size.h)
    }
    for (let k = 0; k <= 4; k++) {
      ctx.fillStyle = rgba(PALETTE.line, k === 2 ? 0.6 : 0.22)
      ctx.fillRect(0, Math.round((k / 4) * (size.h - 1)), size.w, 1)
    }

    const mid = size.h / 2
    for (let i = 0; i < COLUMNS; i++) {
      const h = Math.max(2, (values[i] / 100) * size.h)
      const x = i * slot + slot * 0.17
      const w = Math.max(1, slot * 0.66)
      ctx.fillStyle = i === cursor ? PALETTE.bone : rgba(PALETTE.signal, 0.9)
      ctx.beginPath()
      if (typeof ctx.roundRect === 'function') ctx.roundRect(x, mid - h / 2, w, h, Math.min(w / 2, h / 2))
      else ctx.rect(x, mid - h / 2, w, h)
      ctx.fill()
    }
  }, [values, size, cursor])

  const write = (clientX: number, clientY: number, interpolate: boolean) => {
    const cvs = canvas.current
    if (!cvs) return
    const rect = cvs.getBoundingClientRect()
    const col = clamp(Math.floor(((clientX - rect.left) / rect.width) * COLUMNS), 0, COLUMNS - 1)
    const rel = 1 - Math.abs((clientY - rect.top) / rect.height - 0.5) * 2
    const raw = clamp(Math.round((rel * 100) / SNAP) * SNAP, FLOOR, 100)
    const next = values.slice()
    if (interpolate && lastCol.current != null && Math.abs(col - lastCol.current) > 1) {
      // Fill the columns a fast drag skipped, so a swipe leaves no holes.
      const a = lastCol.current
      const from = next[a]
      const step = col > a ? 1 : -1
      for (let c = a + step; c !== col; c += step) {
        const t = (c - a) / (col - a)
        next[c] = clamp(Math.round((from + (raw - from) * t) / SNAP) * SNAP, FLOOR, 100)
      }
    }
    next[col] = raw
    lastCol.current = col
    setCursor(col)
    onChange(next)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    const next = values.slice()
    if (e.key === 'ArrowLeft') setCursor((c) => Math.max(0, c - 1))
    else if (e.key === 'ArrowRight') setCursor((c) => Math.min(COLUMNS - 1, c + 1))
    else if (e.key === 'ArrowUp') next[cursor] = clamp(next[cursor] + SNAP, FLOOR, 100)
    else if (e.key === 'ArrowDown') next[cursor] = clamp(next[cursor] - SNAP, FLOOR, 100)
    else if (e.key === 'Home') setCursor(0)
    else if (e.key === 'End') setCursor(COLUMNS - 1)
    else return
    e.preventDefault()
    onChange(next)
  }

  return (
    <div ref={wrap}>
      <canvas
        ref={canvas}
        tabIndex={0}
        role="application"
        aria-label={`Envelope drawing pad, 64 columns. Column ${cursor + 1} is ${values[cursor]}. Use arrow keys to move and adjust.`}
        className="block w-full cursor-crosshair touch-none rounded-[2px] bg-ink-deep/80"
        onKeyDown={onKeyDown}
        onPointerDown={(e) => {
          drawing.current = true
          lastCol.current = null
          ;(e.target as Element).setPointerCapture(e.pointerId)
          write(e.clientX, e.clientY, false)
        }}
        onPointerMove={(e) => {
          if (drawing.current) write(e.clientX, e.clientY, true)
        }}
        onPointerUp={() => {
          drawing.current = false
          lastCol.current = null
        }}
        onPointerCancel={() => {
          drawing.current = false
        }}
      />
      <p className="u-data mt-2 text-[10px] text-bone/40">
        Column {String(cursor + 1).padStart(2, '0')}/64 · value {String(values[cursor]).padStart(2, '0')} ·
        snap {SNAP} · arrow keys work
      </p>
    </div>
  )
}
