import type { ColumnDef } from '@tanstack/react-table'
import { ANCESTRIES, ANCESTRY_META } from '../lib/constants'
import { fmtBeta3, fmtPCompact, fmtPLog3 } from '../lib/format'
import { DIR_NEG, DIR_POS, EffectTriangle, isSig, sigTextClass } from './indicators'
import Tip from './Tip'

/** Inline key for the Burden β triangles, for a table caption. */
export function BetaLegend() {
  return (
    <span className="whitespace-nowrap">
      β{' '}
      <span style={{ color: DIR_POS }}>▲</span> risk{' '}
      <span style={{ color: DIR_NEG }}>▼</span> protective, size ∝ |effect| —
      hover for value
    </span>
  )
}

/** Any row carrying per-ancestry p-value + β arrays (canonical ancestry order). */
export interface GridRowLike {
  lp: (number | null)[]
  beta: (number | null)[]
}

/**
 * Hover target for a grid cell. `Tip` attaches its listeners to this element,
 * so it must NOT be sized by its contents: a small-|β| triangle is only ~5px
 * tall and a few px wide, which would make its tooltip far harder to hit than a
 * large one's. `h-full w-full` claims the entire cell instead — identical for
 * every value — which only works because these columns set `meta.fill`, giving
 * the cell renderer the whole box (see VirtualTable). Padding moves in here so
 * contents still sit where they did.
 */
const CELL_HIT = 'flex h-full w-full min-w-0 items-center px-2'

/**
 * Column width for one ancestry. Driven by the HEADER, not the data: labels
 * render uppercase at 11px with `tracking-wide`, inside the header's own `px-2`,
 * next to a sort-arrow slot. "NON-EUR" needs ~62px of text box for that, so its
 * columns get 80 — at 68 it clipped to "NON-EU…" once sorted. Every other label
 * ("All", "EUR", "AFR", …) is three characters and fits `base`, which is set by
 * the cell contents instead (p-values need more room than a triangle).
 */
const ancSize = (a: number, base: number) =>
  ANCESTRY_META[ANCESTRIES[a]].label.length > 4 ? 80 : base

function ancHeader(a: number, highlight?: number, center = false) {
  const label = ANCESTRY_META[ANCESTRIES[a]].label
  const cls = [center ? 'w-full text-center' : '', a === highlight ? 'text-brand' : '']
    .filter(Boolean)
    .join(' ')
  return () => <span className={cls || undefined}>{label}</span>
}

/**
 * Grouped columns for the per-ancestry grid: a "P-value" block and a "Burden β"
 * block, each with one narrow column per ancestry in `ancIdxs` (canonical
 * order). P cells are tinted by significance tier; β cells by effect direction.
 * The selected ancestry's headers are highlighted. `emptyHint` (e.g. "…") shows
 * for not-yet-loaded cells so lazy-loading reads as pending, not "no data".
 */
export function ancestryGridColumns<T extends GridRowLike>(
  ancIdxs: number[],
  opts: {
    highlight?: number
    pending?: (row: T, ancIdx: number) => boolean
    /** Largest |β| across the table, for scaling the effect triangles. */
    betaMax?: number
  } = {},
): ColumnDef<T, any>[] {
  const { highlight, pending, betaMax = 0 } = opts

  const pCols: ColumnDef<T, any>[] = ancIdxs.map((a, i) => ({
    id: `p${a}`,
    header: ancHeader(a, highlight),
    accessorFn: (r: T) => r.lp[a] ?? undefined,
    sortUndefined: 'last',
    meta: { divider: i === 0, fill: true },
    size: ancSize(a, 68), // 68 = room for bold 3-digit exponents, e.g. "2e-156"
    cell: (c) => {
      const lp = c.getValue() as number | null | undefined
      if (lp == null && pending?.(c.row.original, a))
        return <span className={`${CELL_HIT} text-ink-faint/50`}>…</span>
      // Full-precision p in the tooltip; the cell itself is abbreviated to
      // keep the grid dense. Uses Tip, not a native `title`, for a fast reveal.
      return (
        <Tip
          label={lp != null ? `P = ${fmtPLog3(lp)}` : 'no data'}
          className={CELL_HIT}
        >
          <span className={`truncate tnum ${sigTextClass(lp)}`}>
            {fmtPCompact(lp)}
          </span>
        </Tip>
      )
    },
  }))

  const bCols: ColumnDef<T, any>[] = ancIdxs.map((a, i) => ({
    id: `b${a}`,
    header: ancHeader(a, highlight, true),
    // Sort by |β| so both risk & protective extremes sort to the top.
    accessorFn: (r: T) => {
      const v = r.beta[a]
      return v == null ? undefined : Math.abs(v)
    },
    sortUndefined: 'last',
    meta: { divider: i === 0, fill: true },
    size: ancSize(a, 52), // a triangle needs no more than 52
    cell: (c) => {
      const b = c.row.original.beta[a]
      if (b == null && pending?.(c.row.original, a))
        return (
          <span className={`${CELL_HIT} justify-center text-ink-faint/50`}>…</span>
        )
      // Tie the β to its p-value: β's whose association clears the gene-level
      // significance line stay vivid; the rest fade back so the eye lands on
      // the significant hits (mirrors the p-value column's fade).
      const sig = isSig(c.row.original.lp[a])
      return (
        <Tip
          label={b != null ? `β = ${fmtBeta3(b)}` : 'no data'}
          className={`${CELL_HIT} justify-center`}
        >
          <EffectTriangle beta={b} max={betaMax} dim={!sig} />
        </Tip>
      )
    },
  }))

  return [
    { id: 'pval', header: 'P-value', columns: pCols },
    { id: 'burden', header: 'Burden β', columns: bCols },
  ]
}
