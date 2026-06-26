import { useEffect, useMemo, useRef, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import type { GeneIndex } from '../data/types'
import { chrColor, genomeLayout } from '../lib/genome'
import { fmtPLog } from '../lib/format'
import { SIG_GENE_CAUCHY, SIG_GENE_MASK_BONFERRONI } from '../lib/constants'
import type { PhenoRow } from '../lib/select'

interface Plotted extends PhenoRow {
  x: number // global genome coordinate
  y: number // -log10 p
}

interface Hover {
  px: number
  py: number
  row: Plotted
}

const M = { top: 12, right: 16, bottom: 18, left: 46 }
const HEIGHT = 240
const R = 2.2

/**
 * Canvas Manhattan plot. Renders up to ~20k points smoothly and hit-tests on
 * hover with a linear scan (fast at this point count). Clicking a point calls
 * onSelect with the gene index.
 */
export default function ManhattanPlot({
  rows,
  geneIndex,
  onSelect,
}: {
  rows: PhenoRow[]
  geneIndex: GeneIndex
  onSelect: (geneIdx: number) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(900)
  const [hover, setHover] = useState<Hover | null>(null)

  const layout = useMemo(() => genomeLayout(geneIndex), [geneIndex])

  // Project rows into plot space once per data change.
  const points = useMemo<Plotted[]>(() => {
    const out: Plotted[] = []
    for (const r of rows) {
      if (r.lp == null) continue
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

  // Track container width.
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver((e) => setWidth(e[0].contentRect.width))
    ro.observe(el)
    setWidth(el.clientWidth)
    return () => ro.disconnect()
  }, [])

  // Draw.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = window.devicePixelRatio || 1
    canvas.width = width * dpr
    canvas.height = HEIGHT * dpr
    const ctx = canvas.getContext('2d')!
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, width, HEIGHT)

    // Axes + gridlines
    ctx.strokeStyle = '#e3e8ee'
    ctx.fillStyle = '#8794a1'
    ctx.font = '11px system-ui'
    ctx.lineWidth = 1
    for (let t = 0; t <= maxY; t += maxY > 40 ? 10 : 5) {
      const y = yScale(t)
      ctx.beginPath()
      ctx.moveTo(M.left, y)
      ctx.lineTo(width - M.right, y)
      ctx.stroke()
      ctx.textAlign = 'right'
      ctx.fillText(String(t), M.left - 6, y + 3)
    }

    // Significance thresholds
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
    drawThresh(SIG_GENE_CAUCHY, '#c0392b', [4, 3])
    drawThresh(SIG_GENE_MASK_BONFERRONI, '#e08a1e', [2, 3])

    // Points
    for (const p of points) {
      ctx.beginPath()
      ctx.fillStyle = chrColor(geneIndex.chr[p.geneIdx])
      ctx.arc(xScale(p.x), yScale(p.y), R, 0, Math.PI * 2)
      ctx.fill()
    }

    // Chromosome tick labels
    ctx.fillStyle = '#51606e'
    ctx.textAlign = 'center'
    for (const tk of layout.ticks) {
      ctx.fillText(tk.chr, xScale(tk.center), HEIGHT - 5)
    }

    // y-axis label
    ctx.save()
    ctx.translate(12, HEIGHT / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillStyle = '#51606e'
    ctx.fillText('-log₁₀(p)', 0, 0)
    ctx.restore()
  }, [points, width, maxY, xScale, yScale, layout, geneIndex])

  // Hit-test on hover (linear scan; ~20k pts is fine).
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
        onClick={() => hover && onSelect(hover.row.geneIdx)}
      />
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
          style={{
            left: Math.min(hover.px + 12, width - 160),
            top: hover.py + 12,
          }}
        >
          <div className="font-semibold text-ink">
            {geneIndex.symbols[hover.row.geneIdx] || geneIndex.ids[hover.row.geneIdx]}
          </div>
          <div className="tnum text-ink-soft">
            chr{geneIndex.chr[hover.row.geneIdx]} · p = {fmtPLog(hover.row.y)}
          </div>
        </div>
      )}
    </div>
  )
}
