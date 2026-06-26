import { useEffect, useMemo, useRef, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import {
  ANCESTRY_COLOR,
  ANCESTRIES,
  ANCESTRY_META,
  type Ancestry,
} from '../lib/constants'
import { fmtBeta, fmtPLog } from '../lib/format'
import type { ForestSeries } from '../lib/select'
import type { PhenotypeMeta } from '../data/types'

const ML = 78 // left: ancestry labels
const MR = 138 // right: β [lo, hi]
const MT = 6
const MB = 26
const ROW_H = 26

interface Props {
  series: ForestSeries
  trait: PhenotypeMeta
  maskLabel: string
  mafLabel: string
}

/**
 * Meta-analysis forest plot: IVW Burden β with 95% CI for each ancestry stratum,
 * with the cross-ancestry meta ("All") drawn last as a diamond. Reference line
 * at β = 0; heterogeneity p shown in the header.
 */
export default function ForestPlot({ series, trait, maskLabel, mafLabel }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null)
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

  const height = MT + rows.length * ROW_H + MB
  const x = scaleLinear().domain(domain).range([ML, width - MR])

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
        <span className="text-[11px] text-ink-faint">
          {maskLabel} · {mafLabel} · IVW Burden {axisLabel} ± 95% CI
        </span>
        {series.hetLp != null && (
          <span
            className={`text-[11px] ${heterogeneous ? 'text-risk' : 'text-ink-faint'}`}
            title="Cochran's Q heterogeneity test across contributing strata"
          >
            P_het = {fmtPLog(series.hetLp)}
            {heterogeneous ? ' · heterogeneous' : ''}
          </span>
        )}
      </div>

      <svg width={width} height={height}>
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
              className="fill-ink-faint text-[10px] tabular-nums"
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
              {hover === i && (
                <rect
                  x={0}
                  y={cy - ROW_H / 2}
                  width={width}
                  height={ROW_H}
                  className="fill-brand-light/60"
                />
              )}
              <text
                x={ML - 8}
                y={cy}
                textAnchor="end"
                dominantBaseline="central"
                className={`text-[11px] ${isMeta ? 'fill-ink font-semibold' : 'fill-ink-soft'}`}
              >
                {ANCESTRY_META[r.anc].label}
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
                x={width - MR + 8}
                y={cy}
                dominantBaseline="central"
                className={`text-[11px] tabular-nums ${isMeta ? 'fill-ink font-semibold' : 'fill-ink-soft'}`}
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

      {hover != null && rows[hover] && (
        <Tooltip row={rows[hover]} />
      )}
    </div>
  )
}

function Tooltip({
  row,
}: {
  row: {
    anc: Ancestry
    beta: number | null
    se: number | null
    lpBurden: number | null
    lpSkato: number | null
  }
}) {
  return (
    <div className="pointer-events-none absolute top-0 right-0 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
      <div className="font-semibold text-ink">{ANCESTRY_META[row.anc].long}</div>
      <div className="tnum text-ink-soft">
        β = {fmtBeta(row.beta)}
        {row.se != null && <> ± {fmtBeta(row.se)}</>}
      </div>
      <div className="tnum text-ink-soft">
        Burden p = {fmtPLog(row.lpBurden)} · SKAT-O p = {fmtPLog(row.lpSkato)}
      </div>
    </div>
  )
}

function diamond(cx: number, cy: number, r: number): string {
  return `M${cx} ${cy - r} L${cx + r} ${cy} L${cx} ${cy + r} L${cx - r} ${cy} Z`
}
