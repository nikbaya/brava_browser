import { useEffect, useMemo, useRef, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import { ANCESTRIES, ANCESTRY_COLOR, ANCESTRY_META, type Ancestry } from '../lib/constants'
import { fmtBeta, fmtBeta3, fmtCount, fmtPLog, fmtPLog3, fmtPos } from '../lib/format'
import { figureFilename } from '../lib/exportImage'
import { bodyFont, textWidth } from '../lib/textWidth'
import type { PhenotypeMeta } from '../data/types'
import type { VariantForestRow } from '../lib/select'
import SaveFigureButton from './SaveFigureButton'

const ML = 92
const LABEL_GAP = 8 // plot area → "β [lo, hi] · p=…" label
const LABEL_PAD = 8 // label → right edge of the svg
const MT = 4
const MB = 24
const ROW_H = 24
// Narrowest plot area worth drawing; below it the wrapper scrolls sideways
// instead of squeezing the CIs into nothing.
const MIN_PLOT = 250

/** " · N=228k · I²=0%" appended to the meta row's label; "" for a stratum row
 *  (`ne`/`i2` are meta-only, see `VariantForestRow`). Shared by the label-width
 *  measurement and the actual SVG text so the two can't drift apart. */
function metaSuffix(r: VariantForestRow & { anc: Ancestry }): string {
  if (r.anc !== 'All' || r.ne == null) return ''
  const i2 = r.i2 != null ? `  · I²=${Math.round(r.i2)}%` : ''
  return `  · N=${fmtCount(r.ne)}${i2}`
}

/**
 * Per-variant multi-ancestry forest: single-variant meta β with 95% CI for each
 * ancestry, `All` last as a diamond. Distinct from the gene-level ForestPlot
 * (which shows Burden/SKAT-O); here there is one p-value per stratum.
 *
 * Hovering a row highlights it and opens a tooltip with the full-precision
 * numbers. The per-ancestry variant slices carry only beta/se/lp — no N or
 * I² — so unlike the gene-level forest there's no dedicated N column; the
 * meta ("All") row's own slice does carry both, though, so they're appended
 * to just that row's label instead (see `VariantForestRow.ne`/`.i2`).
 */
export default function VariantForest({
  rows,
  trait,
  loading,
  label,
  symbol,
}: {
  rows: VariantForestRow[]
  trait: PhenotypeMeta
  loading?: boolean
  /** Variant identifier (e.g. `chr1-55039974-G-T`), for the figure export. */
  label?: string
  /** Enclosing gene symbol, for the figure export. */
  symbol?: string
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  // 0 until the ResizeObserver reports: `width` below floors it at the minimum.
  const [measured, setMeasured] = useState(0)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((e) => setMeasured(e[0].contentRect.width))
    ro.observe(el)
    setMeasured(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  const ordered = useMemo(() => {
    const named = rows
      .filter((r) => r.beta != null)
      .map((r) => ({ ...r, anc: ANCESTRIES[r.ancIdx] }))
    const strata = named.filter((r) => r.anc !== 'All')
    const meta = named.filter((r) => r.anc === 'All')
    return [...strata, ...meta]
  }, [rows])

  const ci = (b: number, se: number | null): [number, number] =>
    se == null ? [b, b] : [b - 1.96 * se, b + 1.96 * se]

  const domain = useMemo(() => {
    let lo = 0
    let hi = 0
    for (const r of ordered) {
      const [a, b] = ci(r.beta!, r.se)
      lo = Math.min(lo, a)
      hi = Math.max(hi, b)
    }
    const pad = (hi - lo || 1) * 0.08
    return [lo - pad, hi + pad] as [number, number]
  }, [ordered])

  // Right gutter sized from the widest label actually drawn — "β  [lo, hi] ·
  // p=1.17e-205" runs long, and longer still when β formats as "-1.23e-4", so a
  // fixed gutter clipped it at the svg edge (nothing reflows in SVG).
  const labels = useMemo(
    () =>
      ordered.map((r) => {
        const [lo, hi] = ci(r.beta!, r.se)
        const base =
          r.se == null
            ? fmtBeta(r.beta)
            : `${fmtBeta(r.beta)}  [${fmtBeta(lo)}, ${fmtBeta(hi)}] · p=${fmtPLog(r.lp)}`
        return r.anc === 'All' ? base + metaSuffix(r) : base
      }),
    [ordered],
  )
  const MR = useMemo(() => {
    // 600 (font-semibold) matches the meta row, which is both the widest
    // label (it alone carries the N/I² suffix) and the boldest.
    const font = bodyFont(12, 600)
    const widest = labels.reduce((m, l) => Math.max(m, textWidth(l, font)), 0)
    return Math.ceil(LABEL_GAP + widest + LABEL_PAD)
  }, [labels])

  if (loading)
    return <p className="py-4 text-center text-xs text-ink-faint">Loading ancestries…</p>
  if (ordered.length === 0)
    return (
      <p className="py-4 text-center text-xs text-ink-faint">
        No per-ancestry estimates for this variant.
      </p>
    )

  const width = Math.max(measured, ML + MR + MIN_PLOT)
  const height = MT + ordered.length * ROW_H + MB
  const x = scaleLinear().domain(domain).range([ML, width - MR])
  const axisLabel = trait.type === 'binary' ? 'β (log OR)' : 'β (SD units)'

  return (
    <div ref={wrapRef} className="relative w-full overflow-x-auto">
      <div className="flex items-baseline justify-between gap-x-3 px-1 pb-1">
        <span className="text-xs text-ink-faint">
          Single-variant meta {axisLabel} ± 95% CI · hover a stratum for detail
        </span>
        <SaveFigureButton
          svgRef={svgRef}
          what="forest plot"
          // Fragment order mirrors the variant table's TSV name
          // (`brava_{gene}_{trait}_…`), with the variant as the discriminator.
          filename={figureFilename([symbol, trait.id, label, 'forest'])}
          caption={{
            // No mask here: the variant-level data carries no functional
            // annotation, so a variant has no mask to name (see CLAUDE.md).
            title: [symbol, label].filter(Boolean).join(' ') + ` × ${trait.name}`,
            subtitle: `Single-variant meta ${axisLabel} ± 95% CI · BRaVa`,
          }}
        />
      </div>
      <svg ref={svgRef} width={width} height={height}>
        <line
          x1={x(0)}
          x2={x(0)}
          y1={MT}
          y2={MT + ordered.length * ROW_H}
          stroke="#cbd3dc"
          strokeDasharray="3 3"
        />
        {x.ticks(5).map((t) => (
          <text
            key={t}
            x={x(t)}
            y={height - 8}
            textAnchor="middle"
            className="fill-ink-faint text-[11px] tabular-nums"
          >
            {t}
          </text>
        ))}
        {ordered.map((r, i) => {
          const cy = MT + i * ROW_H + ROW_H / 2
          const [lo, hi] = ci(r.beta!, r.se)
          const isMeta = r.anc === 'All'
          const color = ANCESTRY_COLOR[r.anc]
          return (
            <g
              key={r.ancIdx}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              className="cursor-default"
            >
              {/* full-row transparent hit target, so hovering anywhere in the
                  row (not just over text/markers) highlights it. Interaction
                  chrome: `data-png-skip` (= PNG_SKIP_ATTR) keeps this and the
                  highlight out of exported figures. */}
              <rect
                x={0}
                y={cy - ROW_H / 2}
                width={width}
                height={ROW_H}
                fill="transparent"
                data-png-skip=""
              />
              {hover === i && (
                <rect
                  x={0}
                  y={cy - ROW_H / 2}
                  width={width}
                  height={ROW_H}
                  className="fill-brand-light/60"
                  pointerEvents="none"
                  data-png-skip=""
                />
              )}
              <text
                x={ML - 10}
                y={cy}
                textAnchor="end"
                dominantBaseline="central"
                className={`text-xs ${isMeta ? 'fill-ink font-semibold' : 'fill-ink-soft'}`}
              >
                {ANCESTRY_META[r.anc].label}
              </text>
              {r.se != null && (
                <line
                  x1={x(lo)}
                  x2={x(hi)}
                  y1={cy}
                  y2={cy}
                  stroke={color}
                  strokeWidth={1.5}
                />
              )}
              {isMeta ? (
                <path
                  d={`M${x(r.beta!)} ${cy - 6} L${x(r.beta!) + 6} ${cy} L${x(r.beta!)} ${cy + 6} L${x(r.beta!) - 6} ${cy} Z`}
                  fill={color}
                  stroke="#fff"
                  strokeWidth={0.5}
                />
              ) : (
                <circle cx={x(r.beta!)} cy={cy} r={4} fill={color} />
              )}
              <text
                x={width - MR + LABEL_GAP}
                y={cy}
                dominantBaseline="central"
                className={`text-xs tabular-nums ${isMeta ? 'fill-ink font-semibold' : 'fill-ink-soft'}`}
              >
                {fmtBeta(r.beta)}
                {r.se != null && (
                  <tspan className="fill-ink-faint">
                    {'  '}[{fmtBeta(lo)}, {fmtBeta(hi)}] · p={fmtPLog(r.lp)}
                  </tspan>
                )}
                {isMeta && <tspan className="fill-ink-faint">{metaSuffix(r)}</tspan>}
              </text>
            </g>
          )
        })}
      </svg>

      {hover != null && ordered[hover] && (
        <Tooltip row={ordered[hover]} ci={ci(ordered[hover].beta!, ordered[hover].se)} />
      )}
    </div>
  )
}

function Tooltip({
  row,
  ci,
}: {
  row: {
    anc: Ancestry
    beta: number | null
    se: number | null
    lp: number | null
    ne?: number | null
    i2?: number | null
  }
  ci: [number, number]
}) {
  return (
    <div className="pointer-events-none absolute top-0 right-0 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold text-ink">{ANCESTRY_META[row.anc].long}</div>
      <div className="tnum text-ink-soft">
        β = {fmtBeta3(row.beta)}
        {row.se != null && <> ± {fmtBeta3(row.se)}</>}
      </div>
      {row.ne != null && (
        <div className="tnum text-ink-faint">
          N (eff.) = {fmtPos(row.ne)}
          {row.i2 != null && <> · I² = {Math.round(row.i2)}%</>}
        </div>
      )}
      {row.se != null && (
        <div className="tnum text-ink-faint">
          95% CI [{fmtBeta3(ci[0])}, {fmtBeta3(ci[1])}]
        </div>
      )}
      <div className="tnum text-ink-soft">p = {fmtPLog3(row.lp)}</div>
    </div>
  )
}
