import type { ReactNode } from 'react'

export function Panel({
  label,
  index,
  children,
  className = '',
  right,
}: {
  label: string
  index?: string
  children: ReactNode
  className?: string
  right?: ReactNode
}) {
  return (
    <section className={`u-panel u-tick p-4 sm:p-6 ${className}`}>
      <div className="mb-5 flex items-baseline justify-between gap-4 border-b border-line/35 pb-3">
        <h2 className="u-label m-0">
          {index && <span className="text-signal/80">{index} · </span>}
          {label}
        </h2>
        {right}
      </div>
      {children}
    </section>
  )
}

export function Tabs<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
  label: string
}) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex border border-line/60 bg-ink-deep/50 p-1">
      {options.map((o) => {
        const on = o.value === value
        return (
          <button
            key={o.value}
            role="tab"
            type="button"
            aria-selected={on}
            onClick={() => onChange(o.value)}
            className={`u-data px-3 py-1.5 text-[11px] uppercase tracking-[0.12em] transition-colors sm:px-4 ${
              on ? 'bg-signal text-ink' : 'text-bone/55 hover:text-bone'
            }`}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

export function Slider({
  id,
  label,
  value,
  min,
  max,
  step,
  unit,
  hint,
  onChange,
  disabled,
}: {
  id: string
  label: string
  value: number
  min: number
  max: number
  step: number
  unit: string
  hint?: string
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <div className={disabled ? 'opacity-45' : undefined}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="u-label">
          {label}
        </label>
        <output htmlFor={id} className="u-data text-[11px] text-signal">
          {value % 1 === 0 ? value : value.toFixed(2)}
          {unit}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p className="-mt-1 text-[12px] leading-snug text-bone/40">{hint}</p>}
    </div>
  )
}

export function Stat({ k, v, tone = 'bone' }: { k: string; v: string; tone?: 'bone' | 'signal' | 'mint' }) {
  const color = tone === 'signal' ? 'text-signal' : tone === 'mint' ? 'text-mint' : 'text-bone/85'
  return (
    <div className="border-l border-line/50 pl-3">
      <div className="u-label mb-1">{k}</div>
      <div className={`u-data text-[13px] ${color}`}>{v}</div>
    </div>
  )
}

export function Caution({ children }: { children: ReactNode }) {
  return (
    <p className="flex gap-2 text-[13px] leading-relaxed text-signal/85">
      <span aria-hidden className="u-data mt-[3px] shrink-0 text-[10px]">
        [ ! ]
      </span>
      <span>{children}</span>
    </p>
  )
}
