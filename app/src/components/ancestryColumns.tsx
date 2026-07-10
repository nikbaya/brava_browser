import type { ColumnDef } from '@tanstack/react-table'
import { ANCESTRIES, ANCESTRY_META } from '../lib/constants'
import { fmtBeta, fmtPCompact, fmtPLog } from '../lib/format'
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
    meta: i === 0 ? { divider: true } : undefined,
    size: 68, // room for bold 3-digit exponents, e.g. "2e-156"
    cell: (c) => {
      const lp = c.getValue() as number | null | undefined
      if (lp == null && pending?.(c.row.original, a))
        return <span className="text-ink-faint/50">…</span>
      return (
        <span
          className={`tnum ${sigTextClass(lp)}`}
          title={lp != null ? `P = ${fmtPLog(lp)}` : 'no data'}
        >
          {fmtPCompact(lp)}
        </span>
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
    meta: i === 0 ? { divider: true } : undefined,
    size: 52,
    cell: (c) => {
      const b = c.row.original.beta[a]
      if (b == null && pending?.(c.row.original, a))
        return <span className="text-ink-faint/50">…</span>
      // Tie the β to its p-value: β's whose association clears the gene-level
      // significance line stay vivid; the rest fade back so the eye lands on
      // the significant hits (mirrors the p-value column's fade).
      const sig = isSig(c.row.original.lp[a])
      return (
        <Tip
          label={b != null ? `β = ${fmtBeta(b)}` : 'no data'}
          className="flex w-full justify-center"
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
