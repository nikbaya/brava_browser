import { useMemo } from 'react'
import { scaleLinear } from 'd3-scale'
import { ANCESTRIES, ANCESTRY_COLOR, ANCESTRY_META } from '../lib/constants'
import { fmtBeta, fmtPLog } from '../lib/format'
import type { PhenotypeMeta } from '../data/types'
import type { VariantForestRow } from '../lib/select'

const ML = 92
const MR = 150
const MT = 4
const MB = 24
const ROW_H = 24

/**
 * Per-variant multi-ancestry forest: single-variant meta β with 95% CI for each
 * ancestry, `All` last as a diamond. Distinct from the gene-level ForestPlot
 * (which shows Burden/SKAT-O); here there is one p-value per stratum.
 */
export default function VariantForest({
  rows,
  trait,
  loading,
}: {
  rows: VariantForestRow[]
  trait: PhenotypeMeta
  loading?: boolean
}) {
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

  if (loading)
    return <p className="py-4 text-center text-xs text-ink-faint">Loading ancestries…</p>
  if (ordered.length === 0)
    return (
      <p className="py-4 text-center text-xs text-ink-faint">
        No per-ancestry estimates for this variant.
      </p>
    )

  const width = 560
  const height = MT + ordered.length * ROW_H + MB
  const x = scaleLinear().domain(domain).range([ML, width - MR])
  const axisLabel = trait.type === 'binary' ? 'β (log OR)' : 'β (SD units)'

  return (
    <div className="w-full overflow-x-auto">
      <div className="px-1 pb-1 text-[11px] text-ink-faint">
        Single-variant meta {axisLabel} ± 95% CI
      </div>
      <svg width={width} height={height}>
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
            className="fill-ink-faint text-[10px] tabular-nums"
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
            <g key={r.ancIdx}>
              <text
                x={ML - 10}
                y={cy}
                textAnchor="end"
                dominantBaseline="central"
                className={`text-[11px] ${isMeta ? 'fill-ink font-semibold' : 'fill-ink-soft'}`}
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
                x={width - MR + 8}
                y={cy}
                dominantBaseline="central"
                className={`text-[11px] tabular-nums ${isMeta ? 'fill-ink font-semibold' : 'fill-ink-soft'}`}
              >
                {fmtBeta(r.beta)}
                {r.se != null && (
                  <tspan className="fill-ink-faint">
                    {'  '}[{fmtBeta(lo)}, {fmtBeta(hi)}] · p={fmtPLog(r.lp)}
                  </tspan>
                )}
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
