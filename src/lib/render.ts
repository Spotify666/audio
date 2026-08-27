import { COLUMNS } from './envelope'

export const PALETTE = {
  ink: '#141B2E',
  inkDeep: '#0E1423',
  panel: '#1B2439',
  line: '#3D4A63',
  bone: '#F2EFE9',
  signal: '#FF7A45',
  mint: '#7FD1A8',
}

const rgba = (hex: string, a: number) => {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`
}

function bar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const r = Math.min(w / 2, h / 2)
  ctx.beginPath()
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r)
  else ctx.rect(x, y, w, h)
  ctx.fill()
}

export interface StripOptions {
  values: number[]
  width: number
  height: number
  color: string
  /** Bars before the playhead are drawn in `color`, after in `dim`. */
  dim?: string
  playhead?: number | null
  /** Columns to emphasise — used to spotlight the word currently sounding. */
  activeRange?: [number, number] | null
  minBar?: number
  /** A faint reference shape drawn behind, e.g. the target under the result. */
  ghost?: number[] | null
  ghostColor?: string
}

/** The mirrored 64-bar strip. This is the thing WhatsApp actually draws. */
export function drawStrip(ctx: CanvasRenderingContext2D, o: StripOptions) {
  const { values, width, height, color } = o
  const dim = o.dim ?? rgba(PALETTE.line, 0.85)
  const n = values.length || COLUMNS
  const slot = width / n
  const gap = Math.max(0.8, Math.min(2, slot * 0.34))
  const w = Math.max(1, slot - gap)
  const mid = height / 2
  const maxHalf = height / 2
  const minBar = o.minBar ?? 2

  if (o.ghost) {
    ctx.fillStyle = o.ghostColor ?? rgba(PALETTE.bone, 0.13)
    for (let i = 0; i < o.ghost.length; i++) {
      const h = Math.max(minBar, (o.ghost[i] / 100) * maxHalf * 2)
      bar(ctx, i * slot + gap / 2, mid - h / 2, w, h)
    }
  }

  const head = o.playhead == null ? null : o.playhead * n
  for (let i = 0; i < n; i++) {
    const h = Math.max(minBar, (values[i] / 100) * maxHalf * 2)
    const x = i * slot + gap / 2
    const inActive = o.activeRange ? i >= o.activeRange[0] && i < o.activeRange[1] : true
    let fill = color
    if (head != null && i > head) fill = dim
    if (!inActive) fill = head != null && i > head ? dim : rgba(color, 0.34)
    ctx.fillStyle = fill
    bar(ctx, x, mid - h / 2, w, h)
  }

  if (head != null) {
    const x = head * slot
    ctx.fillStyle = rgba(PALETTE.bone, 0.75)
    ctx.fillRect(Math.round(x), 0, 1, height)
  }
}

export interface CircleOptions extends Omit<StripOptions, 'width' | 'height'> {
  size: number
  /** Ring + tick colour. */
  frame?: string
  /** Draw the 64 radial ticks around the rim. */
  ticks?: boolean
}

/**
 * The hero instrument: a scope ring with the mirrored strip inscribed across
 * its middle, plus one rim tick per column so the 64-value grid is visible.
 */
export function drawCircle(ctx: CanvasRenderingContext2D, o: CircleOptions) {
  const { size } = o
  const cx = size / 2
  const cy = size / 2
  const r = size / 2 - 1.5
  const frame = o.frame ?? rgba(PALETTE.line, 0.75)

  ctx.clearRect(0, 0, size, size)

  // Well
  ctx.fillStyle = rgba(PALETTE.inkDeep, 0.72)
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()

  // Rim ticks, one per column
  if (o.ticks !== false) {
    const n = o.values.length || COLUMNS
    const head = o.playhead == null ? null : o.playhead * n
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (i / n) * Math.PI * 2
      const major = i % 8 === 0
      const lit = head != null && i <= head
      const len = major ? 7 : 4
      ctx.strokeStyle = lit ? rgba(o.color, 0.8) : rgba(PALETTE.line, major ? 0.95 : 0.5)
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx + Math.cos(a) * (r - len), cy + Math.sin(a) * (r - len))
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r)
      ctx.stroke()
    }
  }

  // Ring
  ctx.strokeStyle = frame
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.stroke()

  // Centre line — the axis every bar mirrors around
  const fieldW = r * 1.62
  ctx.strokeStyle = rgba(PALETTE.line, 0.55)
  ctx.setLineDash([2, 4])
  ctx.beginPath()
  ctx.moveTo(cx - fieldW / 2, cy)
  ctx.lineTo(cx + fieldW / 2, cy)
  ctx.stroke()
  ctx.setLineDash([])

  const fieldH = r * 1.0
  ctx.save()
  ctx.translate(cx - fieldW / 2, cy - fieldH / 2)
  drawStrip(ctx, { ...o, width: fieldW, height: fieldH })
  ctx.restore()
}

/** The five-bar W of the logo, drawn with the same renderer as everything else. */
export const LOGO_W = [100, 40, 80, 40, 100]

export function drawLogo(ctx: CanvasRenderingContext2D, size: number, t = 0, color = PALETTE.signal) {
  const cx = size / 2
  const r = size / 2 - size * 0.06
  ctx.clearRect(0, 0, size, size)
  ctx.strokeStyle = color
  ctx.lineWidth = Math.max(1, size * 0.05)
  ctx.beginPath()
  ctx.arc(cx, cx, r, 0, Math.PI * 2)
  ctx.stroke()

  const w = size * 0.075
  const slot = size * 0.115
  const fieldW = slot * 5
  const startX = cx - fieldW / 2 + (slot - w) / 2
  ctx.fillStyle = color
  for (let i = 0; i < 5; i++) {
    // t animates a travelling wobble through the bars on hover.
    const wob = 1 + 0.22 * Math.sin(t * 4 - i * 0.9)
    const h = Math.min(size * 0.62, (LOGO_W[i] / 100) * size * 0.5 * (t > 0 ? wob : 1))
    bar(ctx, startX + i * slot, cx - h / 2, w, h)
  }
}

export { rgba }
