import { useEffect, useState, type ReactNode } from 'react'
import { fmtBeta, fmtPLog } from '../lib/format'
import { SIG_GENE_CAUCHY } from '../lib/constants'

/** Threshold filter applied to result-table rows (not the plots). */
export interface TableFilter {
  /** Keep rows with -log10(p) ≥ this. 0 = no p-value constraint. */
  minLp: number
  /** Keep rows with |β| ≥ this. 0 = no effect-size constraint. */
  minAbsBeta: number
}

export const NO_TABLE_FILTER: TableFilter = { minLp: 0, minAbsBeta: 0 }

/** Does a row pass the active thresholds? Nulls fail whenever a threshold is on. */
export function passesTableFilter(
  f: TableFilter,
  lp: number | null | undefined,
  beta: number | null | undefined,
): boolean {
  if (f.minLp > 0 && !(lp != null && lp >= f.minLp)) return false
  if (f.minAbsBeta > 0 && !(beta != null && Math.abs(beta) >= f.minAbsBeta))
    return false
  return true
}

const SIG_LP = -Math.log10(SIG_GENE_CAUCHY) // gene-level significance in -log10 units

/**
 * Editable readout for a threshold. Shows the value in human units (a p-value
 * for `kind='p'`, a β magnitude for `kind='beta'`) and lets the user type an
 * exact value. Empty commits clear the threshold. `stored` is the domain-native
 * value (−log10 p, or |β|); `onCommit` reports back in those same units.
 */
function ThresholdInput({
  kind,
  stored,
  onCommit,
}: {
  kind: 'p' | 'beta'
  stored: number
  onCommit: (v: number) => void
}) {
  const shown = (v: number) =>
    v > 0 ? (kind === 'p' ? fmtPLog(v) : fmtBeta(v)) : ''
  const [text, setText] = useState(shown(stored))
  const [editing, setEditing] = useState(false)

  // Keep the field in sync when the slider (or a preset) moves the value.
  useEffect(() => {
    if (!editing) setText(shown(stored))
  }, [stored, editing]) // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (raw: string) => {
    const s = raw.trim()
    if (!s) return onCommit(0)
    const num = Number(s)
    if (!Number.isFinite(num)) return setText(shown(stored)) // reject garbage
    if (kind === 'p') {
      // Field takes a p-value; store −log10(p). Out-of-range clears the filter.
      onCommit(num > 0 && num < 1 ? -Math.log10(num) : 0)
    } else {
      onCommit(Math.max(0, Math.abs(num)))
    }
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder="any"
      aria-label={kind === 'p' ? 'P-value threshold' : 'Minimum |β|'}
      onFocus={() => setEditing(true)}
      onChange={(e) => setText(e.target.value)}
      onBlur={(e) => {
        setEditing(false)
        commit(e.target.value)
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          commit(e.currentTarget.value)
          e.currentTarget.blur()
        } else if (e.key === 'Escape') {
          setText(shown(stored))
          e.currentTarget.blur()
        }
      }}
      className="tnum w-[84px] rounded-md border border-line bg-surface px-1.5 py-0.5 text-right text-[12px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
    />
  )
}

/** A labelled row: uppercase caption, filled-track slider, editable readout. */
function FilterRow({
  label,
  kind,
  min,
  max,
  step,
  stored,
  onChange,
}: {
  label: string
  kind: 'p' | 'beta'
  min: number
  max: number
  step: number
  stored: number
  onChange: (v: number) => void
}) {
  const sliderVal = Math.min(stored, max)
  const pct = max > min ? ((sliderVal - min) / (max - min)) * 100 : 0
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] font-medium tracking-wide text-ink-faint uppercase whitespace-nowrap">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={sliderVal}
        onChange={(e) => onChange(Number(e.target.value))}
        className="brava-range w-28"
        style={{
          background: `linear-gradient(to right, var(--color-brand) ${pct}%, var(--color-line) ${pct}%)`,
        }}
      />
      <ThresholdInput kind={kind} stored={stored} onCommit={onChange} />
    </div>
  )
}

/**
 * Compact threshold-filter strip for a result table. Two controls (P-value and
 * effect size), each a slider paired with an editable numeric field, plus a
 * one-click genome-wide significance preset. `children` is rendered flush-right
 * (typically the visible/total row count).
 */
export default function TableFilters({
  value,
  onChange,
  maxLp,
  maxAbsBeta,
  children,
}: {
  value: TableFilter
  onChange: (next: TableFilter) => void
  maxLp: number
  maxAbsBeta: number
  children?: ReactNode
}) {
  const active = value.minLp > 0 || value.minAbsBeta > 0
  // Round the beta domain up so the slider's max is a clean-ish bound.
  const betaMax = maxAbsBeta > 0 ? Math.ceil(maxAbsBeta * 20) / 20 : 1
  const lpMax = Math.max(Math.ceil(maxLp), Math.ceil(SIG_LP))
  const sigOn = value.minLp >= SIG_LP - 1e-9

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface px-3 py-1.5">
      <FilterRow
        label="P ≤"
        kind="p"
        min={0}
        max={lpMax}
        step={0.1}
        stored={value.minLp}
        onChange={(minLp) => onChange({ ...value, minLp })}
      />
      <FilterRow
        label="|β| ≥"
        kind="beta"
        min={0}
        max={betaMax}
        step={betaMax / 100}
        stored={value.minAbsBeta}
        onChange={(minAbsBeta) => onChange({ ...value, minAbsBeta })}
      />
      <button
        type="button"
        onClick={() => onChange({ ...value, minLp: sigOn ? 0 : SIG_LP })}
        aria-pressed={sigOn}
        title="Gene-level significance · P < 2.5×10⁻⁶"
        className={`rounded-md border px-2 py-0.5 text-[11px] font-medium transition ${
          sigOn
            ? 'border-brand bg-brand/10 text-brand'
            : 'border-line text-ink-soft hover:border-brand hover:text-brand'
        }`}
      >
        genome-wide
      </button>
      {active && (
        <button
          type="button"
          onClick={() => onChange(NO_TABLE_FILTER)}
          className="text-[11px] text-ink-faint hover:text-ink hover:underline"
        >
          reset
        </button>
      )}
      {children && (
        <span className="ml-auto text-[11px] text-ink-faint">{children}</span>
      )}
    </div>
  )
}
