import { useEffect, useMemo, useRef, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import { fmtBeta3, fmtPLog3, fmtPos } from '../lib/format'
import type { VariantRow } from '../lib/select'
import type { GeneModel } from '../data/types'
import { collapsedRegions, regionScale, type Span } from '../lib/exonScale'
import GeneTrack from './GeneTrack'

interface Plotted {
  row: VariantRow
  x: number // genomic position
  y: number // -log10 p
}
interface Hover {
  px: number
  py: number
  p: Plotted
}

/** Minimal shape shared by d3's linear scale and our exon-collapsed scale. */
type XScale = ((pos: number) => number) & { invert(px: number): number }

const M = { top: 12, right: 16, bottom: 30, left: 46 }
const HEIGHT = 240
const R = 2.6

// Direction colors (distinct from the bold ancestry palette): risk↑ vs down.
const C_UP = '#c0392b' // beta > 0
const C_DOWN = '#2f6f9f' // beta < 0
const C_NULL = '#9aa7b4'
const C_EXON_BAND = '#eef2f6'

/** Mb decimals needed for tick labels to differ across a span of `bp`. */
function mbDecimals(bp: number): number {
  const d = Math.ceil(-Math.log10(Math.max(bp, 1) / 1e6)) + 2
  return Math.min(6, Math.max(2, d))
}

/**
 * Gene-region "locuszoom": one point per variant, x = genomic position, y =
 * -log10 p, colored by effect direction. Canvas so it stays smooth for the
 * biggest genes (TTN ≈ 7k variants). Click a point to select the variant.
 *
 * The x axis defaults to exon-collapsed coordinates — pixel width allocated only
 * to exons ±75 bp, gaps excised (gnomAD's `regionViewerScale`) — since that's the
 * only way coding variants in a mostly-intronic gene become resolvable (the
 * median gene in our index spends ~13% of its span in exons). A toggle switches
 * back to true genomic position, which shades the exons behind the points
 * instead. Genes with no gene model fall back to the genomic axis.
 */
export default function LocusZoom({
  variants,
  start,
  end,
  chr,
  type,
  onSelect,
  selected,
  model,
}: {
  variants: VariantRow[]
  start?: number
  end?: number
  chr?: string | null
  type: 'binary' | 'quantitative'
  onSelect: (v: VariantRow) => void
  selected?: VariantRow | null
  model?: GeneModel | null
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(900)
  const [hover, setHover] = useState<Hover | null>(null)
  // Exon-collapsed by default; `collapsed` below degrades to genomic when the
  // gene has no model (or no exon regions), so this is safe without a model.
  const [collapse, setCollapse] = useState(true)

  const points = useMemo<Plotted[]>(() => {
    const out: Plotted[] = []
    for (const row of variants) {
      if (row.lp == null) continue
      out.push({ row, x: row.pos, y: row.lp })
    }
    return out
  }, [variants])

  const [xLo, xHi] = useMemo<[number, number]>(() => {
    if (start != null && end != null && end > start) return [start, end]
    let lo = Infinity
    let hi = -Infinity
    for (const p of points) {
      if (p.x < lo) lo = p.x
      if (p.x > hi) hi = p.x
    }
    if (!Number.isFinite(lo)) return [0, 1]
    const pad = (hi - lo || 1) * 0.02
    return [lo - pad, hi + pad]
  }, [points, start, end])

  const maxY = useMemo(
    () => Math.max(6, ...points.map((p) => p.y)) * 1.06,
    [points],
  )

  // Padded exon regions: the collapsed axis domain, and the shading in genomic
  // mode. Null when we have no gene model for this gene.
  const regions = useMemo<Span[] | null>(
    () => (model ? collapsedRegions(model) : null),
    [model],
  )
  const collapsed = collapse && regions != null && regions.length > 0

  const xRange = useMemo<[number, number]>(
    () => [M.left, width - M.right],
    [width],
  )
  const xScale = useMemo<XScale>(() => {
    if (collapsed) return regionScale(regions!, xRange) as XScale
    return scaleLinear().domain([xLo, xHi]).range(xRange) as unknown as XScale
  }, [collapsed, regions, xLo, xHi, xRange])

  const blocks = useMemo(
    () => (collapsed ? (xScale as unknown as { blocks: [number, number][] }).blocks : undefined),
    [collapsed, xScale],
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

    // Exon shading (genomic mode only — when collapsed the exons *are* the axis).
    if (!collapsed && regions) {
      ctx.fillStyle = C_EXON_BAND
      for (const r of regions) {
        const x0 = xScale(r.start)
        const x1 = xScale(r.stop)
        if (x1 < M.left || x0 > width - M.right) continue
        ctx.fillRect(
          Math.max(M.left, x0),
          M.top,
          Math.max(0.75, Math.min(width - M.right, x1) - Math.max(M.left, x0)),
          HEIGHT - M.bottom - M.top,
        )
      }
    }

    // y gridlines + labels
    ctx.strokeStyle = '#e3e8ee'
    ctx.fillStyle = '#8794a1'
    ctx.font = '11px system-ui'
    ctx.lineWidth = 1
    const step = maxY > 500 ? 50 : maxY > 200 ? 20 : maxY > 40 ? 10 : maxY > 16 ? 5 : 2
    for (let t = 0; t <= maxY; t += step) {
      const y = yScale(t)
      ctx.beginPath()
      ctx.moveTo(M.left, y)
      ctx.lineTo(width - M.right, y)
      ctx.stroke()
      ctx.textAlign = 'right'
      ctx.fillText(String(t), M.left - 6, y + 3)
    }

    // points
    for (const p of points) {
      ctx.beginPath()
      ctx.fillStyle =
        p.row.beta == null ? C_NULL : p.row.beta > 0 ? C_UP : C_DOWN
      ctx.arc(xScale(p.x), yScale(p.y), R, 0, Math.PI * 2)
      ctx.fill()
    }
    // selected ring
    if (selected) {
      const sp = points.find(
        (p) =>
          p.row.pos === selected.pos &&
          p.row.ref === selected.ref &&
          p.row.alt === selected.alt,
      )
      if (sp) {
        ctx.beginPath()
        ctx.strokeStyle = '#15202b'
        ctx.lineWidth = 1.5
        ctx.arc(xScale(sp.x), yScale(sp.y), R + 3, 0, Math.PI * 2)
        ctx.stroke()
      }
    }

    // x ticks. Genomic mode uses d3's nice round positions; collapsed mode has a
    // non-linear axis, so we place ticks at even pixel intervals and invert them
    // to get the (still exact) genomic position at that point.
    ctx.fillStyle = '#51606e'
    // Nudge the outermost labels inward so they can't overflow the canvas.
    const tick = (label: string, px: number) => {
      ctx.textAlign =
        px < xRange[0] + 16 ? 'left' : px > xRange[1] - 16 ? 'right' : 'center'
      ctx.fillText(label, px, HEIGHT - 14)
    }
    if (collapsed) {
      const dec = mbDecimals(xScale.invert(xRange[1]) - xScale.invert(xRange[0]))
      const n = Math.max(2, Math.min(6, Math.floor((xRange[1] - xRange[0]) / 90)))
      for (let i = 0; i <= n; i++) {
        const px = xRange[0] + ((xRange[1] - xRange[0]) * i) / n
        tick((xScale.invert(px) / 1e6).toFixed(dec), px)
      }
    } else {
      const ticks = (
        xScale as unknown as { ticks(n: number): number[] }
      ).ticks(6)
      const dec = mbDecimals(xHi - xLo)
      for (const t of ticks) tick((t / 1e6).toFixed(dec), xScale(t))
    }
    ctx.textAlign = 'center'
    ctx.fillText(
      `${chr ? `chr${chr}` : ''} position (Mb)${collapsed ? ' — introns removed' : ''}`.trim(),
      width / 2,
      HEIGHT - 2,
    )

    ctx.save()
    ctx.translate(12, HEIGHT / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillStyle = '#51606e'
    ctx.fillText('-log₁₀(p)', 0, 0)
    ctx.restore()
  }, [
    points,
    width,
    maxY,
    xScale,
    xRange,
    yScale,
    chr,
    selected,
    collapsed,
    regions,
    xLo,
    xHi,
  ])

  const onMove = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    let best: Plotted | null = null
    let bestD = 64
    for (const p of points) {
      const dx = xScale(p.x) - mx
      const dy = yScale(p.y) - my
      const d = dx * dx + dy * dy
      if (d < bestD) {
        bestD = d
        best = p
      }
    }
    setHover(best ? { px: mx, py: my, p: best } : null)
  }

  const upLabel = type === 'binary' ? 'risk ↑ (β > 0)' : 'higher ↑ (β > 0)'
  const downLabel = type === 'binary' ? 'protective ↓ (β < 0)' : 'lower ↓ (β < 0)'

  return (
    <div ref={wrapRef} className="relative w-full">
      <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1 text-xs text-ink-soft">
        {model ? (
          <div className="inline-flex items-center gap-1.5">
            <span className="text-ink-faint">Axis</span>
            <div className="inline-flex overflow-hidden rounded border border-line">
              <AxisButton active={!collapse} onClick={() => setCollapse(false)}>
                Genomic
              </AxisButton>
              <AxisButton active={collapse} onClick={() => setCollapse(true)}>
                Exons
              </AxisButton>
            </div>
            <span className="tnum text-ink-faint">
              {model.tx}
              {model.src === 'mane_select' ? ' (MANE Select)' : ' (Ensembl canonical)'}
            </span>
          </div>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: C_UP }} />
            {upLabel}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: C_DOWN }} />
            {downLabel}
          </span>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width, height: HEIGHT }}
        className="cursor-pointer"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onClick={() => hover && onSelect(hover.p.row)}
      />
      {model && (
        <GeneTrack
          model={model}
          xScale={xScale}
          width={width}
          left={M.left}
          right={M.right}
          blocks={blocks}
        />
      )}
      {hover && (
        <div
          className="pointer-events-none absolute z-10 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-lg"
          style={{ left: Math.min(hover.px + 12, width - 180), top: hover.py + 12 }}
        >
          <div className="tnum font-semibold text-ink">
            {chr ? `chr${chr}:` : ''}
            {fmtPos(hover.p.row.pos)} {hover.p.row.ref}›{hover.p.row.alt}
          </div>
          <div className="tnum text-ink-soft">
            p = {fmtPLog3(hover.p.row.lp)} · β = {fmtBeta3(hover.p.row.beta)}
          </div>
        </div>
      )}
    </div>
  )
}

function AxisButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-1.5 py-px text-xs ${
        active ? 'bg-ink-soft text-white' : 'bg-surface text-ink-soft hover:bg-surface-alt'
      }`}
    >
      {children}
    </button>
  )
}
