const W = [100, 72, 38, 10, 38, 72, 100]

/** The mark is the letter W in the bar system the app is built on. */
export function Logo({ size = 26 }: { size?: number }) {
  const slot = 100 / W.length
  const w = slot * 0.52
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden className="shrink-0">
      <circle cx="50" cy="50" r="46" fill="none" stroke="#FF7A45" strokeWidth="6" />
      {W.map((v, i) => {
        const h = (v / 100) * 54
        return (
          <rect
            key={i}
            x={i * slot + (slot - w) / 2 + 3}
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
