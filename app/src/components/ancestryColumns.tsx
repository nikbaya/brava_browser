import type { ColumnDef } from '@tanstack/react-table'
import { ANCESTRIES, ANCESTRY_META, type Test } from '../lib/constants'
import { fmtBeta3, fmtPCompact, fmtPLog3 } from '../lib/format'
import { exportP, type ExportColumn } from '../lib/exportTable'
import { DIR_NEG, DIR_POS, EffectTriangle, isSig, sigTextClass } from './indicators'
import Tip from './Tip'

/** −log10(0.05); below this the cross-ancestry Burden effect is heterogeneous. */
const HET_LP = -Math.log10(0.05)

/** Inline key for the Burden β triangles, for a table caption. */
export function BetaLegend() {
  return (
    <span className="whitespace-nowrap">
      β{' '}
      <span style={{ color: DIR_POS }}>▲</span> risk{' '}
      {/* "∝" (U+221D) isn't in Inter, so it falls back to a system font whose
          glyph renders far smaller than the surrounding text at this size —
          "~" reads the same ("size scales with |effect|") without the
          fallback-font trap. */}
      <span style={{ color: DIR_NEG }}>▼</span> protective, size ~ |effect| —
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
    /**
     * The test whose p-values these columns show, named in the group header.
     * Without it the header reads a bare "P-value" while the β block next to it
     * says "Burden", which invites reading both blocks as one test's output —
     * they aren't: the p-value follows the test selector, β is always Burden.
     */
    test?: Test
  } = {},
): ColumnDef<T, any>[] {
  const { highlight, pending, betaMax = 0, test } = opts

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
    {
      id: 'pval',
      header: test ? `${test} P-value` : 'P-value',
      meta: {
        help: test
          ? `Association p-value from the ${test} test.`
          : 'Association p-value.',
      },
      columns: pCols,
    },
    {
      id: 'burden',
      header: 'Burden β',
      meta: {
        help: 'Effect size from the Burden test — the only test that estimates β.',
      },
      columns: bCols,
    },
  ]
}

/**
 * Trailing single column: cross-ancestry Burden heterogeneity (from the
 * All-meta row), one value per row — unlike `ancestryGridColumns`' blocks,
 * this doesn't repeat per ancestry, so it isn't affected by which ancestry is
 * highlighted. `hetLp` is `undefined` for a row whose builder doesn't
 * populate it (see `GridRow`), which renders the same as no data.
 *
 * `pending` (the phenotype page's All-meta file may still be loading in the
 * background, same as any other ancestry column there) shows "…" instead of
 * "—" so a still-loading cell doesn't read as "no heterogeneity data".
 */
export function hetColumn<T extends { hetLp?: number | null }>(
  opts: { pending?: (row: T) => boolean } = {},
): ColumnDef<T, any> {
  const { pending } = opts
  return {
    id: 'phet',
    header: () => <span>P_het</span>,
    meta: {
      divider: true,
      fill: true,
      help: 'Heterogeneity of the Burden effect across ancestries (cross-ancestry meta).',
    },
    accessorFn: (r: T) => r.hetLp ?? undefined,
    sortUndefined: 'last',
    size: 80, // "P_HET" (uppercased) clips at 68, same as "NON-EUR" above

    cell: (c) => {
      const lp = c.getValue() as number | null | undefined
      if (lp == null && pending?.(c.row.original))
        return <span className={`${CELL_HIT} text-ink-faint/50`}>…</span>
      if (lp == null)
        return <span className={`${CELL_HIT} text-ink-faint/50`}>—</span>
      const heterogeneous = lp > HET_LP
      return (
        <Tip
          label={`P_het = ${fmtPLog3(lp)}${heterogeneous ? ' · heterogeneous' : ''}`}
          className={CELL_HIT}
        >
          <span
            className={`truncate tnum ${heterogeneous ? 'text-risk' : 'text-ink-faint'}`}
          >
            {fmtPCompact(lp)}
          </span>
        </Tip>
      )
    },
  }
}

/** The export counterpart of `hetColumn`. */
export function hetExportColumn<T extends { hetLp?: number | null }>(): ExportColumn<T>[] {
  return [
    { header: 'P_het', value: (r: T) => exportP(r.hetLp) },
    { header: 'neglog10P_het', value: (r: T) => r.hetLp ?? null },
  ]
}

/**
 * The export counterpart of `ancestryGridColumns`: three TSV columns per
 * ancestry — the p-value, its raw −log10 (lossless, and the only safe form deep
 * in the tail), and the IVW Burden β. Lives here, next to the on-screen columns
 * it mirrors, so the two can't drift: both pages' grids show exactly these
 * numbers, and both export them by calling this.
 *
 * Headers use the raw ancestry keys (`P_All`, `beta_burden_non_EUR`) rather than
 * the display labels, so they're valid identifiers in R and pandas.
 */
export function ancestryExportColumns<T extends GridRowLike>(
  ancIdxs: number[],
): ExportColumn<T>[] {
  return ancIdxs.flatMap((a) => {
    const k = ANCESTRIES[a]
    return [
      { header: `P_${k}`, value: (r: T) => exportP(r.lp[a]) },
      { header: `neglog10P_${k}`, value: (r: T) => r.lp[a] },
      { header: `beta_burden_${k}`, value: (r: T) => r.beta[a] },
    ]
  })
}
