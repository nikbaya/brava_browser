import { useEffect, useMemo, useRef, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import {
  ANCESTRY_COLOR,
  ANCESTRIES,
  ANCESTRY_META,
  MAF_META,
  MASK_META,
  type Ancestry,
} from '../lib/constants'
import { fmtBeta, fmtBeta3, fmtCount, fmtPLog3, fmtPos } from '../lib/format'
import { figureFilename } from '../lib/exportImage'
import { bodyFont, textWidth } from '../lib/textWidth'
import type { ForestSeries } from '../lib/select'
import type { AncestryN, PhenotypeMeta } from '../data/types'
import SaveFigureButton from './SaveFigureButton'

const ML = 128 // left: ancestry label + N columns
const LABEL_R = 56 // right edge of the ancestry-label column
const LABEL_GAP = 8 // plot area → "β [lo, hi]" label
const LABEL_PAD = 8 // label → right edge of the svg
const MT = 6
const MB = 26
const ROW_H = 26
// Narrowest plot area worth drawing; below it the wrapper scrolls sideways
// rather than squeezing the CIs into nothing (the phenotype page renders this
// in a max-w-xl drawer).
const MIN_PLOT = 170

interface Props {
  series: ForestSeries
  trait: PhenotypeMeta
  /**
   * Mask / MAF as **indices**, not pre-formatted labels: the header wants the
   * long display label while the exported filename wants the same `short` and
   * numeric `value` the TSV exports use, so the component needs the whole record.
   */
  maskIndex: number
  mafIndex: number
  /** Gene symbol, used only to label and name the exported figure. */
  symbol?: string
}

/**
 * Meta-analysis forest plot: IVW Burden β with 95% CI for each ancestry stratum,
 * with the cross-ancestry meta ("All") drawn last as a diamond. Reference line
 * at β = 0; heterogeneity p shown in the header.
 */
export default function ForestPlot({ series, trait, maskIndex, mafIndex, symbol }: Props) {
  const mask = MASK_META[maskIndex]
  const maf = MAF_META[mafIndex]
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const [width, setWidth] = useState(720)
  const [hover, setHover] = useState<number | null>(null)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((e) => setWidth(e[0].contentRect.width))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // Non-meta strata first, the All meta last (forest convention).
  const rows = useMemo(() => {
    const named = series.rows
      .filter((r) => r.beta != null)
      .map((r) => ({ ...r, anc: ANCESTRIES[r.ancIdx] }))
    const strata = named.filter((r) => r.anc !== 'All')
    const meta = named.filter((r) => r.anc === 'All')
    return [...strata, ...meta]
  }, [series])

  const ci = (b: number, se: number | null): [number, number] =>
    se == null ? [b, b] : [b - 1.96 * se, b + 1.96 * se]

  const domain = useMemo(() => {
    let lo = 0
    let hi = 0
    for (const r of rows) {
      const [a, b] = ci(r.beta!, r.se)
      lo = Math.min(lo, a)
      hi = Math.max(hi, b)
    }
    const pad = (hi - lo || 1) * 0.08
    return [lo - pad, hi + pad] as [number, number]
  }, [rows])

  // Right gutter sized from the widest label actually drawn: β and its CI
  // bounds switch to "-1.23e-4" form for small effects, which a fixed gutter
  // clipped at the svg edge (nothing reflows in SVG).
  const labels = useMemo(
    () =>
      rows.map((r) => {
        const [lo, hi] = ci(r.beta!, r.se)
        return r.se == null
          ? fmtBeta(r.beta)
          : `${fmtBeta(r.beta)}  [${fmtBeta(lo)}, ${fmtBeta(hi)}]`
      }),
    [rows],
  )
  const MR = useMemo(() => {
    // 600 (font-semibold) matches the meta ("All") row, rendered bold.
    const font = bodyFont(12, 600)
    const widest = labels.reduce((m, l) => Math.max(m, textWidth(l, font)), 0)
    return Math.ceil(LABEL_GAP + widest + LABEL_PAD)
  }, [labels])

  const w = Math.max(width, ML + MR + MIN_PLOT)
  const height = MT + rows.length * ROW_H + MB
  const x = scaleLinear().domain(domain).range([ML, w - MR])

  if (rows.length === 0)
    return (
      <p className="py-6 text-center text-sm text-ink-faint">
        No effect-size estimates for this selection.
      </p>
    )

  const axisLabel =
    trait.type === 'binary' ? 'β (log OR)' : 'β (SD units)'
  const hetP = series.hetLp == null ? null : Math.pow(10, -series.hetLp)
  const heterogeneous = hetP != null && hetP < 0.05

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-1 pb-1">
        <span className="text-xs text-ink-faint">
          {mask.label} · {maf.label} · IVW Burden {axisLabel} ± 95% CI
        </span>
        <div className="flex items-center gap-2">
          {series.hetLp != null && (
            <span
              className={`text-xs ${heterogeneous ? 'text-risk' : 'text-ink-faint'}`}
              title="Cochran's Q heterogeneity test across contributing strata"
            >
              P_het = {fmtPLog3(series.hetLp)}
              {heterogeneous ? ' · heterogeneous' : ''}
            </span>
          )}
          <SaveFigureButton
            svgRef={svgRef}
            what="forest plot"
            // Same fragments, in the same order, as this selection's TSV export
            // (`brava_{gene}_{mask}_maf{value}_…`) so the figure and the numbers
            // behind it sit together in a download folder.
            filename={figureFilename([
              symbol,
              trait.id,
              mask.short,
              `maf${maf.value}`,
              'forest',
            ])}
            caption={{
              // The on-page context lives in HTML around the plot, so the export
              // restates it: subject, then the selection that produced it.
              title: `${symbol ? `${symbol} × ` : ''}${trait.name}`,
              subtitle: [
                mask.label,
                maf.label,
                `IVW Burden ${axisLabel} ± 95% CI`,
                series.hetLp == null ? null : `P_het = ${fmtPLog3(series.hetLp)}`,
                'BRaVa',
              ]
                .filter(Boolean)
                .join(' · '),
            }}
          />
        </div>
      </div>

      {/* The svg, not the wrapper, is what scrolls: the header above keeps its
          P_het chip and Figure ▾ button in view when the plot pans sideways. */}
      <div className="overflow-x-auto">
        <svg ref={svgRef} width={w} height={height}>
          {/* zero reference line */}
          <line
            x1={x(0)}
            x2={x(0)}
            y1={MT}
            y2={MT + rows.length * ROW_H}
            stroke="#cbd3dc"
            strokeDasharray="3 3"
          />
          {/* x ticks */}
          {x.ticks(5).map((t) => (
            <g key={t}>
              <text
                x={x(t)}
                y={height - 8}
                textAnchor="middle"
                className="fill-ink-faint text-[11px] tabular-nums"
              >
                {t}
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
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
                {/* full-row transparent hit target so hovering anywhere in the
                    row (not just over text/markers) highlights it. Both this and
                    the highlight below are interaction chrome, so they carry
                    `data-png-skip` (= PNG_SKIP_ATTR) and are stripped from
                    exported figures. */}
                <rect
                  x={0}
                  y={cy - ROW_H / 2}
                  width={w}
                  height={ROW_H}
                  fill="transparent"
                  data-png-skip=""
                />
                {hover === i && (
                  <rect
                    x={0}
                    y={cy - ROW_H / 2}
                    width={w}
                    height={ROW_H}
                    className="fill-brand-light/60"
                    pointerEvents="none"
                    data-png-skip=""
                  />
                )}
                <text
                  x={LABEL_R}
                  y={cy}
                  textAnchor="end"
                  dominantBaseline="central"
                  className={`text-xs ${isMeta ? 'fill-ink font-semibold' : 'fill-ink-soft'}`}
                >
                  {ANCESTRY_META[r.anc].label}
                </text>
                {/* N column */}
                <text
                  x={ML - 10}
                  y={cy}
                  textAnchor="end"
                  dominantBaseline="central"
                  className="fill-ink-faint text-[11px] tabular-nums"
                >
                  {trait.n?.[r.anc] ? `N=${fmtCount(trait.n[r.anc].n)}` : ''}
                </text>
                {/* CI bar */}
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
                {/* marker */}
                {isMeta ? (
                  <path
                    d={diamond(x(r.beta!), cy, 6)}
                    fill={color}
                    stroke="#fff"
                    strokeWidth={0.5}
                  />
                ) : (
                  <circle cx={x(r.beta!)} cy={cy} r={4} fill={color} />
                )}
                {/* numeric */}
                <text
                  x={w - MR + LABEL_GAP}
                  y={cy}
                  dominantBaseline="central"
                  className={`text-xs tabular-nums ${isMeta ? 'fill-ink font-semibold' : 'fill-ink-soft'}`}
                >
                  {fmtBeta(r.beta)}
                  {r.se != null && (
                    <tspan className="fill-ink-faint">
                      {'  '}[{fmtBeta(lo)}, {fmtBeta(hi)}]
                    </tspan>
                  )}
                </text>
              </g>
            )
          })}
        </svg>
      </div>

      {hover != null && rows[hover] && (
        <Tooltip row={rows[hover]} n={trait.n?.[rows[hover].anc]} />
      )}
    </div>
  )
}

function Tooltip({
  row,
  n,
}: {
  row: {
    anc: Ancestry
    beta: number | null
    se: number | null
    lpBurden: number | null
    lpSkato: number | null
  }
  n?: AncestryN
}) {
  return (
    <div className="pointer-events-none absolute top-0 right-0 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold text-ink">{ANCESTRY_META[row.anc].long}</div>
      <div className="tnum text-ink-soft">
        β = {fmtBeta3(row.beta)}
        {row.se != null && <> ± {fmtBeta3(row.se)}</>}
      </div>
      <div className="tnum text-ink-soft">
        Burden p = {fmtPLog3(row.lpBurden)} · SKAT-O p = {fmtPLog3(row.lpSkato)}
      </div>
      {n && (
        <div className="tnum text-ink-faint">
          N = {fmtPos(n.n)}
          {n.case != null && n.ctrl != null && (
            <> ({fmtPos(n.case)} cases / {fmtPos(n.ctrl)} controls)</>
          )}
        </div>
      )}
    </div>
  )
}

function diamond(cx: number, cy: number, r: number): string {
  return `M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z`
}
