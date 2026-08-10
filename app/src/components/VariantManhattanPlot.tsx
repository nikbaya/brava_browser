import { useEffect, useMemo, useRef, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import type { GeneIndex, PhenotypeMeta, VariantOverview } from '../data/types'
import { chrColor, genomeLayout, VARIANT_CHR_LABELS } from '../lib/genome'
import { fmtPLog3, fmtPos } from '../lib/format'
import { effectInfo } from '../lib/effect'

interface Plotted {
  idx: number // index into the overview's parallel arrays
  x: number // global genome coordinate
  y: number // -log10 p
  chr: string
  bp: number
  dir: number
  geneIdx: number // -1 if no overlapping gene
}

interface Hover {
  px: number
  py: number
  row: Plotted
}

const M = { top: 12, right: 16, bottom: 18, left: 46 }
const HEIGHT = 240
const R = 1.6
const HIGHLIGHT_R = R + 4.5
const HIGHLIGHT_COLOR = '#15202b' // ink — matches LocusZoom's selected-variant ring

/**
 * Canvas Manhattan plot over a pixel-decimated genome-wide variant overview
 * (variant/overview/{PHENO}.json — see docs/variant-v2-design.md item 7).
 * Shares its genome layout with the gene-level ManhattanPlot so both axes
 * line up when toggling between the two. Clicking a point with a resolved
 * gene calls onSelect; intergenic points (no gene overlap) aren't clickable.
 */
export interface VariantPick {
  geneIdx: number
  chr: string
  pos: number
  lp: number
}

export default function VariantManhattanPlot({
  overview,
  geneIndex,
  traitType,
  onSelect,
  highlightIdx,
}: {
  overview: VariantOverview
  geneIndex: GeneIndex
  traitType: PhenotypeMeta['type']
  onSelect: (pick: VariantPick) => void
  /** Draw a subtle dashed ring around this overview index (e.g. a hovered
   *  table row), independent of the canvas's own mouse-driven hover state. */
  highlightIdx?: number | null
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(900)
  const [hover, setHover] = useState<Hover | null>(null)

  const layout = useMemo(() => genomeLayout(geneIndex), [geneIndex])

  const points = useMemo<Plotted[]>(() => {
    const out: Plotted[] = []
    for (let i = 0; i < overview.n; i++) {
      const chr = VARIANT_CHR_LABELS[overview.chr[i]]
      const bp = overview.pos[i]
      const x = layout.posAt(chr, bp)
      if (x == null) continue
      out.push({
        idx: i,
        x,
        y: overview.lp[i],
        chr,
        bp,
        dir: overview.dir[i],
        geneIdx: overview.gene_idx[i],
      })
    }
    return out
  }, [overview, layout])

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
    for (let t = 0; t <= maxY; t += maxY > 40 ? 10 : 5) {
      const y = yScale(t)
      ctx.beginPath()
      ctx.moveTo(M.left, y)
      ctx.lineTo(width - M.right, y)
      ctx.stroke()
      ctx.textAlign = 'right'
      ctx.fillText(String(t), M.left - 6, y + 3)
    }

    for (const p of points) {
      ctx.beginPath()
      ctx.fillStyle = chrColor(p.chr)
      ctx.arc(xScale(p.x), yScale(p.y), R, 0, Math.PI * 2)
      ctx.fill()
    }

    // Highlight ring for a row hovered outside the canvas (e.g. the table).
    if (highlightIdx != null) {
      const hp = points.find((p) => p.idx === highlightIdx)
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
  }, [points, width, maxY, xScale, yScale, layout, highlightIdx])

  // Hit-test on hover (linear scan; tens of thousands of decimated points).
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

  const hoverPick: VariantPick | null =
    hover && hover.row.geneIdx >= 0
      ? { geneIdx: hover.row.geneIdx, chr: hover.row.chr, pos: hover.row.bp, lp: hover.row.y }
      : null
  const hoverEffect = hover ? effectInfo(hover.row.dir, traitType) : null

  return (
    <div ref={wrapRef} className="relative w-full">
      <canvas
        ref={canvasRef}
        style={{ width, height: HEIGHT }}
        className={hoverPick ? 'cursor-pointer' : 'cursor-default'}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onClick={() => hoverPick && onSelect(hoverPick)}
      />
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
          style={{
            left: Math.min(hover.px + 12, width - 170),
            top: hover.py + 12,
          }}
        >
          <div className="font-semibold text-ink">
            {hoverPick
              ? geneIndex.symbols[hoverPick.geneIdx] || geneIndex.ids[hoverPick.geneIdx]
              : 'No overlapping gene'}
          </div>
          <div className="tnum text-ink-soft">
            chr{hover.row.chr}:{fmtPos(hover.row.bp)} · p = {fmtPLog3(hover.row.y)}
          </div>
          {hoverEffect && <div className="text-ink-faint">{hoverEffect.label}</div>}
        </div>
      )}
    </div>
  )
}
