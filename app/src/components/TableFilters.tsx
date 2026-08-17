import { useEffect, useRef, useState, type ReactNode } from 'react'
import { fmtBeta, fmtCount, fmtP, fmtPLog } from '../lib/format'
import {
  ANCESTRIES,
  ANCESTRY_META,
  decodeAncMask,
  SIG_GENE_CAUCHY,
  SUPERPOP_IDXS,
} from '../lib/constants'
import { AncestryChip } from './indicators'
import Tip from './Tip'

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
  kind: 'p' | 'beta' | 'n' | 'i2'
  stored: number
  onCommit: (v: number) => void
}) {
  const shown = (v: number) =>
    v > 0
      ? kind === 'p'
        ? fmtPLog(v)
        : kind === 'beta'
          ? fmtBeta(v)
          : kind === 'i2'
            ? `${Math.round(v)}%`
            : fmtCount(v)
      : ''
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
    } else if (kind === 'n' || kind === 'i2') {
      onCommit(Math.max(0, Math.round(num)))
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
      aria-label={
        kind === 'p'
          ? 'P-value threshold'
          : kind === 'n'
            ? 'Minimum sample size'
            : kind === 'i2'
              ? 'Minimum I²'
              : 'Minimum |β|'
      }
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
      className="tnum w-[72px] rounded-md border border-line bg-surface px-1.5 py-0.5 text-right text-[12px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
    />
  )
}

/**
 * Labelled free-text search box, styled to match `ThresholdInput`. Exported
 * (like `FilterRow` below) so a table that isn't wired through the full
 * `TableFilters` strip — e.g. the phenotype page's variant table, which has
 * no `|β|` axis — can still drop in the same search control.
 */
export function SearchInput({
  label,
  value,
  onChange,
  placeholder = 'any',
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium tracking-wide text-ink-faint uppercase whitespace-nowrap">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={`Filter by ${label.toLowerCase()}`}
        className="w-32 rounded-md border border-line bg-surface px-1.5 py-0.5 text-[12px] text-ink outline-none focus:border-brand focus:ring-2 focus:ring-brand/20"
      />
    </div>
  )
}

/**
 * A labelled row: uppercase caption, filled-track slider, editable readout.
 * Exported so a table without a `|β|` axis to filter on (e.g. the phenotype
 * page's variant table, which only has β's sign) can reuse just the P-value
 * row instead of the whole two-axis `TableFilters` strip below.
 */
export function FilterRow({
  label,
  kind,
  min,
  max,
  step,
  stored,
  onChange,
}: {
  label: ReactNode
  kind: 'p' | 'beta' | 'n' | 'i2'
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
      <span className="text-sm font-medium tracking-wide text-ink-faint uppercase whitespace-nowrap">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={sliderVal}
        onChange={(e) => onChange(Number(e.target.value))}
        className="brava-range w-[76px]"
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
 * (typically the visible/total row count). `search`/`onSearchChange` are
 * optional — pass both to add a gene-name search box as the first control.
 */
export default function TableFilters({
  value,
  onChange,
  maxLp,
  maxAbsBeta,
  search,
  onSearchChange,
  searchLabel = 'Gene',
  children,
}: {
  value: TableFilter
  onChange: (next: TableFilter) => void
  maxLp: number
  maxAbsBeta: number
  search?: string
  onSearchChange?: (v: string) => void
  searchLabel?: string
  children?: ReactNode
}) {
  const active = value.minLp > 0 || value.minAbsBeta > 0 || !!search
  // Round the beta domain up so the slider's max is a clean-ish bound.
  const betaMax = maxAbsBeta > 0 ? Math.ceil(maxAbsBeta * 20) / 20 : 1
  const lpMax = Math.max(Math.ceil(maxLp), Math.ceil(SIG_LP))
  const sigOn = value.minLp >= SIG_LP - 1e-9

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface px-3 py-1.5">
      {onSearchChange && (
        <SearchInput label={searchLabel} value={search ?? ''} onChange={onSearchChange} />
      )}
      <FilterRow
        label="P ≤"
        kind="p"
        min={0}
        max={lpMax}
        step={0.1}
        stored={value.minLp}
        onChange={(minLp) => onChange({ ...value, minLp })}
      />
      <button
        type="button"
        onClick={() => onChange({ ...value, minLp: sigOn ? 0 : SIG_LP })}
        aria-pressed={sigOn}
        title={`Gene-level significance · P < ${fmtP(SIG_GENE_CAUCHY)}`}
        className={`rounded-md border px-2 py-0.5 text-xs font-medium transition ${
          sigOn
            ? 'border-brand bg-brand/10 text-brand'
            : 'border-line text-ink-soft hover:border-brand hover:text-brand'
        }`}
      >
        genome-wide
      </button>
      <FilterRow
        // The label span is CSS `uppercase` (see FilterRow) so every other
        // caption in this strip can stay written in plain case. That
        // transform maps lowercase β (U+03B2) to Greek capital Β (U+0392),
        // which is a dead ringer for Latin "B" — so this one glyph opts out
        // with `normal-case` to render as the real β, matching the "Burden
        // β" column it filters.
        label={
          <>
            |<span className="normal-case">β</span>| ≥
          </>
        }
        kind="beta"
        min={0}
        max={betaMax}
        step={betaMax / 100}
        stored={value.minAbsBeta}
        onChange={(minAbsBeta) => onChange({ ...value, minAbsBeta })}
      />
      {active && (
        <button
          type="button"
          onClick={() => {
            onChange(NO_TABLE_FILTER)
            onSearchChange?.('')
          }}
          className="text-xs text-ink-faint hover:text-ink hover:underline"
        >
          reset
        </button>
      )}
      {children && (
        <span className="ml-auto text-xs text-ink-faint">{children}</span>
      )}
    </div>
  )
}

/**
 * Does a variant's `ancMask` pass the ancestry filter? Two modes:
 *  - default (OR / matches-any): the variant touches at least one ticked
 *    ancestry. Ticking more boxes only ever widens the result — the standard
 *    checkbox-list behaviour (Gmail labels, spreadsheet filters, ...).
 *  - `exclusive` (exact set): the variant's full ancestry composition is
 *    *precisely* the ticked-and-available set, no more and no less —
 *    "AMR + SAS ticked" matches only variants observed in both AMR and SAS
 *    and nowhere else, not AMR-only, SAS-only, or AMR+SAS+EUR. With one
 *    ancestry ticked this is "private to exactly that ancestry". Unlike the
 *    default mode this is deliberately non-monotonic (ticking a second box
 *    can *remove* matches the first box alone had) — expected for an
 *    exact-combination query, and why it's an explicit opt-in rather than
 *    how ticking a box behaves by default.
 *
 * `available` (the same set `AncestryFilterChips` greys checkboxes from)
 * matters only for `exclusive`: the default "everything ticked" state
 * includes superpops with zero data (shown unticked+disabled in the UI, but
 * still members of `sel` — see its caller's default-state comment), and a
 * real `tags` list can never contain one of those, so comparing sizes
 * against raw `sel` would make exact-match impossible whenever an
 * unavailable superpop is sitting in `sel`. Restricting the size comparison
 * to `sel ∩ available` fixes that without needing `sel` itself to track
 * availability.
 *
 * No superpop bits set ("composition unknown" — see Overview.mark_ancestry in
 * build_variants.py) always passes either way: we can't confidently say it
 * doesn't match. This is checked via `decodeAncMask`, not `mask === 0` — a
 * variant that only reached the pooled non-EUR meta's threshold has the
 * separate non_EUR display bit set (see `hasNonEurMask`) but no superpop
 * bits, and must still always-pass here exactly like a truly all-zero mask;
 * that bit is display-only and never enters this filter.
 */
export function matchesAncFilter(
  mask: number,
  sel: Set<number>,
  exclusive: boolean,
  available: Set<number>,
): boolean {
  const tags = decodeAncMask(mask)
  if (tags.length === 0) return true
  if (!exclusive) return tags.some((a) => sel.has(a))
  let n = 0
  for (const a of sel) if (available.has(a)) n++
  return tags.length === n && tags.every((a) => sel.has(a))
}

/**
 * "Tick which ancestries to include" filter, as a dropdown of checkboxes (one
 * per superpop) rather than always-visible chips — keeps the filter bar from
 * growing by 5 buttons on every visit. Each row has an "only" shortcut (ticks
 * just that ancestry, unticks the rest) — the standard "isolate one facet"
 * action in faceted filters (Datadog/Honeycomb-style). An "exclusive" toggle
 * at the bottom switches match semantics — see `matchesAncFilter`. Shared by
 * the phenotype page's genome-wide variant table and the gene page's
 * per-gene variant table — both filter on the same `ancMask` bitmask.
 */
export function AncestryFilterChips({
  sel,
  onChange,
  available,
  exclusive,
  onExclusiveChange,
}: {
  sel: Set<number>
  onChange: (next: Set<number>) => void
  available: Set<number>
  exclusive: boolean
  onExclusiveChange: (next: boolean) => void
}) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = (a: number) => {
    const next = new Set(sel)
    if (next.has(a)) next.delete(a)
    else next.add(a)
    onChange(next)
  }

  // Scoped to *available* ancestries, not all 5: an unavailable one can sit in
  // `sel` (e.g. the default "everything ticked" state, or non_EUR's 4-way
  // tick including a superpop with zero data) without ever being visibly
  // ticked (see the checkbox's `checked` below) or changing what matches
  // (see matchesAncFilter) — so it shouldn't count in the numerator or
  // denominator either, or "4/5" would read as narrowed when nothing a user
  // could act on actually is.
  const availableIdxs = SUPERPOP_IDXS.filter((a) => available.has(a))
  const selectedAvailable = availableIdxs.filter((a) => sel.has(a)).length
  const narrowed = selectedAvailable < availableIdxs.length
  const summary =
    selectedAvailable === 0 ? 'none' : narrowed ? `${selectedAvailable}/${availableIdxs.length}` : 'all'
  const active = narrowed || exclusive
  const allSelected = availableIdxs.length > 0 && availableIdxs.every((a) => sel.has(a))

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium transition ${
          open || active
            ? 'border-brand bg-brand/10 text-brand'
            : 'border-line text-ink-soft hover:border-brand hover:text-brand'
        }`}
      >
        Ancestries{' '}
        <span className={active ? '' : 'text-ink-faint'}>({summary})</span>
        <span className="text-ink-faint">▾</span>
      </button>

      {open && (
        <ul
          role="menu"
          className="absolute z-30 mt-1 min-w-full overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-xl"
        >
          <li
            role="none"
            className="mb-1 flex items-center gap-2 border-b border-line px-2.5 py-1 whitespace-nowrap"
          >
            <label className="flex flex-1 cursor-pointer items-center gap-2 text-[13px] font-medium text-ink">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={() => onChange(allSelected ? new Set() : new Set(availableIdxs))}
              />
              All ancestries
            </label>
          </li>
          {SUPERPOP_IDXS.map((a) => {
            const anc = ANCESTRIES[a]
            const isAvailable = available.has(a)
            const isOn = sel.has(a)
            const label = (
              <label
                className={`flex flex-1 items-center gap-2 text-[13px] ${
                  isAvailable ? 'cursor-pointer text-ink' : 'cursor-default text-ink-faint/50'
                }`}
              >
                <input
                  type="checkbox"
                  // A disabled row is inert either way (its ancestry never
                  // appears in any ancMask, so ticking/unticking it can't
                  // change results) — but `sel` still carries it by default
                  // (see the default-state comment on AncestryFilterChips'
                  // caller), so show it as unticked rather than a
                  // disabled-yet-checked box, which reads as a mistake.
                  checked={isAvailable && isOn}
                  disabled={!isAvailable}
                  onChange={() => toggle(a)}
                />
                <AncestryChip anc={anc} dim={!isAvailable} />
                {ANCESTRY_META[anc].long}
              </label>
            )
            return (
              <li
                key={a}
                role="none"
                className="flex items-center gap-2 px-2.5 py-1 whitespace-nowrap"
              >
                {isAvailable ? (
                  label
                ) : (
                  // Tip (not the native `title`) for a fast reveal — the
                  // native tooltip's ~1s delay made this easy to miss.
                  <Tip
                    label={`No variant-level results for ${ANCESTRY_META[anc].long}`}
                    className="flex flex-1 items-center gap-2"
                  >
                    {label}
                  </Tip>
                )}
                <button
                  type="button"
                  disabled={!isAvailable}
                  onClick={() => onChange(new Set([a]))}
                  className="shrink-0 text-xs text-ink-faint hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-ink-faint"
                >
                  only
                </button>
              </li>
            )
          })}
          <li role="none" className="mt-1 border-t border-line px-2.5 pt-1.5">
            <label className="flex cursor-pointer items-center gap-2 text-[12px] text-ink-soft">
              <input
                type="checkbox"
                checked={exclusive}
                onChange={(e) => onExclusiveChange(e.target.checked)}
              />
              Exclusive — only variants found in just the ticked ancestries
            </label>
          </li>
        </ul>
      )}
    </div>
  )
}
