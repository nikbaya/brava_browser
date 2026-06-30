import { useEffect, useMemo, useRef, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import type { PhenotypeMeta } from '../data/types'
import { fmtBeta, fmtPLog } from '../lib/format'
import { SIG_GENE_CAUCHY, SIG_GENE_MASK_BONFERRONI } from '../lib/constants'
import { THRESH_GENE, THRESH_GENE_MASK, ThresholdLegend } from './ui'

export interface PheWASPoint {
  phenoIdx: number
  lp: number | null
  beta: number | null
}

// Stable category palette.
const PALETTE = [
  '#1f6f8b', '#e08a1e', '#2f7d4f', '#c0392b', '#7d5ba6', '#0e7c86',
  '#b5651d', '#8a8d3a', '#a83f6b', '#3b6ea5', '#5c8a3a', '#9c6b30', '#566573',
]

const M = { top: 12, right: 16, bottom: 62, left: 46 }
const HEIGHT = 248
const MIN_WIDTH = 640

/**
 * Gene PheWAS: one point per phenotype, height = -log10(p). SVG is fine here
 * (≈40 points). Points are grouped/colored by trait category and clickable.
 */
export default function PheWASPlot({
  points,
  phenotypes,
  onSelect,
}: {
  points: PheWASPoint[]
  phenotypes: PhenotypeMeta[]
  onSelect: (phenoIdx: number) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<number | null>(null)
  const [measured, setMeasured] = useState(920)

  // Track container width so the plot fills it (no fixed-width whitespace).
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w) setMeasured(w)
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Order by category then -log10(p) desc within category.
  const ordered = useMemo(() => {
    return points
      .filter((p) => p.lp != null)
      .map((p) => ({ ...p, meta: phenotypes[p.phenoIdx] }))
      .filter((p) => p.meta)
      .sort(
        (a, b) =>
          a.meta.category.localeCompare(b.meta.category) ||
          (b.lp ?? 0) - (a.lp ?? 0),
      )
  }, [points, phenotypes])

  // Index-based color map over the sorted unique categories: guarantees
  // distinct, stable colors for the legend (a string hash could collide).
  const catColorMap = useMemo(() => {
    const cats = Array.from(new Set(ordered.map((p) => p.meta.category))).sort(
      (a, b) => a.localeCompare(b),
    )
    const m = new Map<string, string>()
    cats.forEach((c, i) => m.set(c, PALETTE[i % PALETTE.length]))
    return m
  }, [ordered])
  const catColor = (cat: string) => catColorMap.get(cat) ?? PALETTE[0]

  // Contiguous runs of each category (points are already category-sorted).
  const bands = useMemo(() => {
    const out: { category: string; i0: number; i1: number }[] = []
    for (let i = 0; i < ordered.length; i++) {
      const cat = ordered[i].meta.category
      const last = out[out.length - 1]
      if (last && last.category === cat) last.i1 = i
      else out.push({ category: cat, i0: i, i1: i })
    }
    return out
  }, [ordered])

  const width = Math.max(MIN_WIDTH, measured)
  const maxY = Math.max(8, ...ordered.map((p) => p.lp ?? 0)) * 1.08
  const x = scaleLinear()
    .domain([0, Math.max(1, ordered.length)])
    .range([M.left, width - M.right])
  const y = scaleLinear().domain([0, maxY]).range([HEIGHT - M.bottom, M.top])

  if (ordered.length === 0)
    return (
      <p className="py-10 text-center text-sm text-ink-faint">
        No associations for this gene under the selected filters.
      </p>
    )

  const sigY = y(-Math.log10(SIG_GENE_CAUCHY))
  const maskY = y(-Math.log10(SIG_GENE_MASK_BONFERRONI))

  return (
    <div ref={wrapRef} className="relative w-full">
      {/* category legend (key for point colors + bands) */}
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 pb-2 text-[11px] text-ink-soft">
        {Array.from(catColorMap).map(([cat, color]) => (
          <span key={cat} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: color }}
            />
            {cat}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto">
      <svg width={width} height={HEIGHT}>
        {/* category bands (behind everything) */}
        {bands.map((b) => (
          <rect
            key={b.category}
            x={x(b.i0)}
            y={M.top}
            width={x(b.i1 + 1) - x(b.i0)}
            height={HEIGHT - M.bottom - M.top}
            fill={catColor(b.category)}
            fillOpacity={0.07}
          />
        ))}
        {/* y gridlines */}
        {y.ticks(6).map((t) => (
          <g key={t}>
            <line
              x1={M.left}
              x2={width - M.right}
              y1={y(t)}
              y2={y(t)}
              stroke="#e3e8ee"
            />
            <text
              x={M.left - 6}
              y={y(t) + 3}
              textAnchor="end"
              className="fill-ink-faint text-[11px]"
            >
              {t}
            </text>
          </g>
        ))}
        {/* significance lines (gene-level + gene-mask) */}
        {sigY > M.top && sigY < HEIGHT - M.bottom && (
          <line
            x1={M.left}
            x2={width - M.right}
            y1={sigY}
            y2={sigY}
            stroke={THRESH_GENE.color}
            strokeDasharray={THRESH_GENE.dash}
          />
        )}
        {maskY > M.top && maskY < HEIGHT - M.bottom && (
          <line
            x1={M.left}
            x2={width - M.right}
            y1={maskY}
            y2={maskY}
            stroke={THRESH_GENE_MASK.color}
            strokeDasharray={THRESH_GENE_MASK.dash}
          />
        )}
        {/* points + labels */}
        {ordered.map((p, i) => {
          const cx = x(i + 0.5)
          const cy = y(p.lp ?? 0)
          const isHover = hover === i
          return (
            <g key={p.phenoIdx} className="cursor-pointer">
              <line
                x1={cx}
                x2={cx}
                y1={HEIGHT - M.bottom}
                y2={cy}
                stroke="#e3e8ee"
              />
              <circle
                cx={cx}
                cy={cy}
                r={isHover ? 6 : 4}
                fill={catColor(p.meta.category)}
                stroke="#fff"
                strokeWidth={1}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect(p.phenoIdx)}
              />
              <text
                x={cx}
                y={HEIGHT - M.bottom + 12}
                transform={`rotate(45 ${cx} ${HEIGHT - M.bottom + 12})`}
                className={`text-[10px] ${isHover ? 'fill-ink font-semibold' : 'fill-ink-faint'}`}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect(p.phenoIdx)}
              >
                {p.meta.id}
              </text>
            </g>
          )
        })}
        <text
          transform={`translate(14 ${HEIGHT / 2}) rotate(-90)`}
          textAnchor="middle"
          className="fill-ink-soft text-[11px]"
        >
          -log₁₀(p)
        </text>
      </svg>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-1 text-[11px] text-ink-faint">
        <ThresholdLegend />
      </div>

      {hover != null && ordered[hover] && (
        <div className="pointer-events-none absolute top-2 right-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
          <div className="font-semibold text-ink">{ordered[hover].meta.name}</div>
          <div className="tnum text-ink-soft">
            p = {fmtPLog(ordered[hover].lp)} · β = {fmtBeta(ordered[hover].beta)}
          </div>
        </div>
      )}
    </div>
  )
}
