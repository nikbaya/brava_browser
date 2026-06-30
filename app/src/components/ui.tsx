import type { ReactNode } from 'react'
import { SIG_GENE_CAUCHY, SIG_GENE_MASK_BONFERRONI } from '../lib/constants'
import { fmtP } from '../lib/format'

// Shared significance-threshold styling, mirrored by the Manhattan/PheWAS lines.
export const THRESH_GENE = { color: '#d55e00', dash: '7 4' }
export const THRESH_GENE_MASK = { color: '#0072b2', dash: '2 4' }

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

/**
 * Lightweight hover tooltip. Appears instantly (no browser `title` delay) via
 * CSS group-hover; the child is the trigger, `label` the floating content.
 */
export function Tooltip({
  label,
  align = 'center',
  children,
}: {
  label: ReactNode
  /** Which edge of the bubble anchors to the trigger (controls overflow dir). */
  align?: 'left' | 'center' | 'right'
  children: ReactNode
}) {
  const pos =
    align === 'left'
      ? 'left-0'
      : align === 'right'
        ? 'right-0'
        : 'left-1/2 -translate-x-1/2'
  return (
    <span className="group relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full z-50 mb-1 rounded-md bg-ink px-2 py-1 text-[11px] whitespace-nowrap text-surface opacity-0 shadow-lg transition-opacity duration-75 group-hover:opacity-100 ${pos}`}
      >
        {label}
      </span>
    </span>
  )
}

/** Small dashed-line swatch matching a Manhattan/PheWAS significance line. */
export function ThreshSwatch({ color, dash }: { color: string; dash: string }) {
  return (
    <svg width="16" height="6" aria-hidden className="shrink-0">
      <line
        x1="0"
        y1="3"
        x2="16"
        y2="3"
        stroke={color}
        strokeWidth="1.5"
        strokeDasharray={dash}
      />
    </svg>
  )
}

/**
 * Legend keys for the two significance thresholds (swatch + label + fast
 * tooltip with the exact p-value). Returns inline items for a flex parent.
 */
export function ThresholdLegend() {
  return (
    <>
      <Tooltip
        align="left"
        label={`Gene-level Bonferroni · P < ${fmtP(SIG_GENE_CAUCHY)}`}
      >
        <span className="inline-flex cursor-help items-center gap-1">
          <ThreshSwatch {...THRESH_GENE} />
          gene-level
        </span>
      </Tooltip>
      <Tooltip
        align="left"
        label={`Gene × Mask Bonferroni · P < ${fmtP(SIG_GENE_MASK_BONFERRONI)}`}
      >
        <span className="inline-flex cursor-help items-center gap-1">
          <ThreshSwatch {...THRESH_GENE_MASK} />
          gene-mask
        </span>
      </Tooltip>
    </>
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
