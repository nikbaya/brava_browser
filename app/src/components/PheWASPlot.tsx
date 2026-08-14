import { useEffect, useMemo, useRef, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import type { PhenotypeMeta } from '../data/types'
import { fmtBeta3, fmtPLog3 } from '../lib/format'
import { SIG_GENE_CAUCHY, SIG_GENE_MASK_BONFERRONI } from '../lib/constants'
import { CATEGORY_PALETTE, categoryColors } from '../lib/categoryColor'
import { bodyFont, textWidth } from '../lib/textWidth'
import { THRESH_GENE, THRESH_GENE_MASK, ThresholdLegend } from './ui'

export interface PheWASPoint {
  phenoIdx: number
  lp: number | null
  beta: number | null
}

// Purely a display shortcut for the rotated x-axis tick labels below — never
// touches `PhenotypeMeta.id` itself, which is load-bearing (data-file names,
// routes, search index, TSV/figure export filenames).
const SHORT_LABEL: Record<string, string> = {
  NonRheuValv: 'NonRheu',
  RheumHeaDis: 'RhemHeart',
  ColonRectCanc: 'ColonRect',
  BenCervUterNeo_F: 'BenCervUter_F',
}
const tickLabel = (id: string) => SHORT_LABEL[id] ?? id

const M_TOP = 12
const M_RIGHT = 16
const M_LEFT = 46
const PLOT_HEIGHT = 174 // vertical space for gridlines/points, independent of label length
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

  // Built from every category in the index, not just the ones this gene has
  // points for, so a category is the same colour on every gene page — and the
  // same colour the search dropdown gives it.
  const catColorMap = useMemo(
    () => categoryColors(phenotypes.map((p) => p.category)),
    [phenotypes],
  )
  const catColor = (cat: string) => catColorMap.get(cat) ?? CATEGORY_PALETTE[0]

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

  // Bottom margin sized to the longest rotated label, not guessed from a fixed
  // constant: a <text> that overruns its reserved space is simply clipped at
  // the SVG's bottom edge (default SVG overflow is hidden), and character
  // counts don't reliably predict rendered width (see lib/textWidth.ts).
  const bottomMargin = useMemo(() => {
    const font = bodyFont(11)
    const maxW = Math.max(
      0,
      ...ordered.map((p) => textWidth(tickLabel(p.meta.id), font)),
    )
    // rotate(45): the label runs down-right from its anchor, so its vertical
    // drop is width·sin(45°); +12 for the anchor's own offset below the axis,
    // +8 buffer for descenders (e.g. the "_" in BenCervUter_F).
    return Math.max(62, Math.ceil(maxW * Math.SQRT1_2) + 12 + 8)
  }, [ordered])
  const M = useMemo(
    () => ({ top: M_TOP, right: M_RIGHT, bottom: bottomMargin, left: M_LEFT }),
    [bottomMargin],
  )
  const HEIGHT = PLOT_HEIGHT + M.top + M.bottom

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
      <div className="flex flex-wrap gap-x-3 gap-y-1 px-1 pb-2 text-xs text-ink-soft">
        {bands.map((b) => (
          <span key={b.category} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2.5 w-2.5 rounded-sm"
              style={{ background: catColor(b.category) }}
            />
            {b.category}
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
              className="fill-ink-faint text-xs"
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
                className={`text-[11px] ${isHover ? 'fill-ink font-semibold' : 'fill-ink-faint'}`}
                style={{ cursor: 'pointer' }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelect(p.phenoIdx)}
              >
                {tickLabel(p.meta.id)}
              </text>
            </g>
          )
        })}
        <text
          transform={`translate(14 ${HEIGHT / 2}) rotate(-90)`}
          textAnchor="middle"
          className="fill-ink-soft text-xs"
        >
          -log₁₀(p)
        </text>
      </svg>
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-1 pt-1 text-xs text-ink-faint">
        <ThresholdLegend />
      </div>

      {hover != null && ordered[hover] && (
        <div className="pointer-events-none absolute top-2 right-2 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg">
          <div className="font-semibold text-ink">{ordered[hover].meta.name}</div>
          <div className="tnum text-ink-soft">
            p = {fmtPLog3(ordered[hover].lp)} · β = {fmtBeta3(ordered[hover].beta)}
          </div>
        </div>
      )}
    </div>
  )
}
