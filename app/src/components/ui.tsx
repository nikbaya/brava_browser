import type { ReactNode } from 'react'

/** Centered spinner with optional label. */
export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-ink-soft">
      <div className="h-8 w-8 animate-spin rounded-full border-3 border-line border-t-brand" />
      {label && <p className="text-sm">{label}</p>}
    </div>
  )
}

/** Inline error / empty state. */
export function Notice({
  title,
  children,
}: {
  title: string
  children?: ReactNode
}) {
  return (
    <div className="mx-auto max-w-lg rounded-2xl border border-line bg-surface px-6 py-12 text-center">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      {children && <p className="mt-2 text-sm text-ink-soft">{children}</p>}
    </div>
  )
}

/** A labelled dropdown used across filter bars. */
export function Select<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <label className="flex flex-col gap-0.5 text-[11px] font-medium tracking-wide text-ink-faint uppercase">
      {label && <span>{label}</span>}
      <select
        value={value}
        onChange={(e) => {
          const raw = e.target.value
          const match = options.find((o) => String(o.value) === raw)
          onChange((match ? match.value : raw) as T)
        }}
        className="rounded-md border border-line bg-surface px-2 py-1 text-[13px] font-normal tracking-normal normal-case text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      >
        {options.map((o) => (
          <option key={String(o.value)} value={String(o.value)}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/** Colored pill for effect direction, significance, etc. */
export function Pill({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'risk' | 'protective' | 'brand' | 'up' | 'down'
  children: ReactNode
}) {
  const tones = {
    neutral: 'bg-surface-soft text-ink-soft',
    risk: 'bg-risk/10 text-risk',
    protective: 'bg-protective/10 text-protective',
    brand: 'bg-brand/10 text-brand',
    up: 'bg-accent/10 text-accent',
    down: 'bg-brand/10 text-brand',
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tones[tone]}`}
    >
      {children}
    </span>
  )
}
