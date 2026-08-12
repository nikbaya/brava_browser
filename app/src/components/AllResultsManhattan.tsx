import { useEffect, useMemo, useRef, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import type { GeneIndex, PhenotypeMeta } from '../data/types'
import { chrColor, genomeLayout } from '../lib/genome'
import { fmtPLog3 } from '../lib/format'
import { SIG_GENE_CAUCHY, SIG_GENE_MASK_BONFERRONI } from '../lib/constants'
import type { AllResultsRow } from '../lib/select'

interface Plotted extends AllResultsRow {
  x: number // global genome coordinate
  y: number // -log10 p
}

interface Hover {
  px: number
  py: number
  row: Plotted
}

const M = { top: 12, right: 16, bottom: 18, left: 46 }
const HEIGHT = 320
const R = 2.2
const HIGHLIGHT_R = R + 4.5
const HIGHLIGHT_COLOR = '#15202b'

/**
 * Canvas Manhattan plot for the all-results page: every significant
 * (gene, phenotype) hit at the selected mask + maf + test, across every
 * trait, on one genome-wide axis. Sibling of ManhattanPlot (which plots one
 * phenotype's every gene) rather than a shared component, because the row
 * shape and click target both carry a phenotype dimension ManhattanPlot has
 * no use for.
 *
 * Points are still colored by chromosome, not phenotype: with 44 traits able
 * to land on the same gene, a 44-way categorical legend would be noisier than
 * useful, and x-position (genomic location) is already the plot's own axis of
 * meaning. The tooltip and click target disambiguate which trait a point is.
 */
export default function AllResultsManhattan({
  rows,
  geneIndex,
  phenotypes,
  onSelect,
  highlight,
}: {
  rows: AllResultsRow[]
  geneIndex: GeneIndex
  phenotypes: PhenotypeMeta[]
  onSelect: (geneIdx: number, phenoIdx: number) => void
  /** Draw a subtle dashed ring around this point (e.g. a hovered table row). */
  highlight?: { geneIdx: number; phenoIdx: number } | null
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(900)
  const [hover, setHover] = useState<Hover | null>(null)

  const layout = useMemo(() => genomeLayout(geneIndex), [geneIndex])

  const points = useMemo<Plotted[]>(() => {
    const out: Plotted[] = []
    for (const r of rows) {
      const x = layout.pos(r.geneIdx)
      if (x == null) continue
      out.push({ ...r, x, y: r.lp })
    }
    return out
  }, [rows, layout])

  const maxY = useMemo(
    () => Math.max(8, ...points.map((p) => p.y)) * 1.05,
    [points],
  )

  const xScale = useMemo(
    () => scaleLinear().domain([0, layout.total]).range([M.left, width - M.right]),
    [layout.total, width],
  )
  const yScale = useMemo(
    () => scaleLinear().domain([0, maxY]).range([HEIGHT - M.bottom, M.top]),
    [maxY],
  )

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((e) => setWidth(e[0].contentRect.width))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = HEIGHT * dpr
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, HEIGHT)

    ctx.strokeStyle = '#e3e8ee'
    ctx.fillStyle = '#8794a1'
    ctx.font = '11px system-ui'
    ctx.lineWidth = 1
    // d3's "nice" tick algorithm, not a fixed 5/10 step: this plot's y-range
    // spans anywhere from ~8 (a quiet ancestry/mask combo) to 330+ (the
    // underflow floor), and a fixed step crowds the axis at the high end.
    for (const t of yScale.ticks(7)) {
      const y = yScale(t)
      ctx.beginPath()
      ctx.moveTo(M.left, y)
      ctx.lineTo(width - M.right, y)
      ctx.stroke()
      ctx.textAlign = 'right'
      ctx.fillText(String(t), M.left - 6, y + 3)
    }

    const drawThresh = (p: number, color: string, dash: number[]) => {
      const y = yScale(-Math.log10(p))
      if (y < M.top || y > HEIGHT - M.bottom) return
      ctx.save()
      ctx.strokeStyle = color
      ctx.setLineDash(dash)
      ctx.beginPath()
      ctx.moveTo(M.left, y)
      ctx.lineTo(width - M.right, y)
      ctx.stroke()
      ctx.restore()
    }
    drawThresh(SIG_GENE_CAUCHY, '#d55e00', [7, 4])
    drawThresh(SIG_GENE_MASK_BONFERRONI, '#0072b2', [2, 4])

    for (const p of points) {
      ctx.beginPath()
      ctx.fillStyle = chrColor(geneIndex.chr[p.geneIdx])
      ctx.arc(xScale(p.x), yScale(p.y), R, 0, Math.PI * 2)
      ctx.fill()
    }

    if (highlight) {
      const hp = points.find(
        (p) => p.geneIdx === highlight.geneIdx && p.phenoIdx === highlight.phenoIdx,
      )
      if (hp) {
        ctx.beginPath()
        ctx.strokeStyle = HIGHLIGHT_COLOR
        ctx.lineWidth = 1.5
        ctx.arc(xScale(hp.x), yScale(hp.y), HIGHLIGHT_R, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    ctx.fillStyle = '#51606e'
    ctx.textAlign = 'center'
    for (const tk of layout.ticks) {
      ctx.fillText(tk.chr, xScale(tk.center), HEIGHT - 5)
    }

    ctx.save()
    ctx.translate(12, HEIGHT / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillStyle = '#51606e'
    ctx.fillText('-log₁₀(p)', 0, 0)
    ctx.restore()
  }, [points, width, maxY, xScale, yScale, layout, geneIndex, highlight])

  const onMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    let best: Plotted | null = null
    let bestD = 64 // px²
    for (const p of points) {
      const dx = xScale(p.x) - mx
      const dy = yScale(p.y) - my
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = p
      }
    }
    setHover(best ? { px: mx, py: my, row: best } : null)
  }

  return (
    <div ref={wrapRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        style={{ width, height: HEIGHT }}
        className="cursor-pointer"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onClick={() => hover && onSelect(hover.row.geneIdx, hover.row.phenoIdx)}
      />
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
          style={{
            left: Math.min(hover.px + 12, width - 200),
            top: hover.py + 12,
          }}
        >
          <div className="font-semibold text-ink">
            {geneIndex.symbols[hover.row.geneIdx] || geneIndex.ids[hover.row.geneIdx]}
          </div>
          <div className="text-ink-soft">
            {phenotypes[hover.row.phenoIdx]?.name ?? `pheno ${hover.row.phenoIdx}`}
          </div>
          <div className="tnum text-ink-soft">
            chr{geneIndex.chr[hover.row.geneIdx]} · p = {fmtPLog3(hover.row.y)}
          </div>
        </div>
      )}
    </div>
  )
}
