import { useEffect, useMemo, useRef, useState } from 'react'
import { scaleLinear } from 'd3-scale'
import { fmtBeta, fmtPLog, fmtPos } from '../lib/format'
import type { VariantRow } from '../lib/select'

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

const M = { top: 12, right: 16, bottom: 30, left: 46 }
const HEIGHT = 240
const R = 2.6

// Direction colors (distinct from the bold ancestry palette): risk↑ vs down.
const C_UP = '#c0392b' // beta > 0
const C_DOWN = '#2f6f9f' // beta < 0
const C_NULL = '#9aa7b4'

/**
 * Gene-region "locuszoom": one point per variant, x = genomic position, y =
 * -log10 p, colored by effect direction. Canvas so it stays smooth for the
 * biggest genes (TTN ≈ 7k variants). Click a point to select the variant.
 */
export default function LocusZoom({
  variants,
  start,
  end,
  chr,
  type,
  onSelect,
  selected,
}: {
  variants: VariantRow[]
  start?: number
  end?: number
  chr?: string | null
  type: 'binary' | 'quantitative'
  onSelect: (v: VariantRow) => void
  selected?: VariantRow | null
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [width, setWidth] = useState(900)
  const [hover, setHover] = useState<Hover | null>(null)

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

  const xScale = useMemo(
    () => scaleLinear().domain([xLo, xHi]).range([M.left, width - M.right]),
    [xLo, xHi, width],
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

    // y gridlines + labels
    ctx.strokeStyle = '#e3e8ee'
    ctx.fillStyle = '#8794a1'
    ctx.font = '11px system-ui'
    ctx.lineWidth = 1
    const step = maxY > 40 ? 10 : maxY > 16 ? 5 : 2
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

    // x ticks (genomic position, Mb)
    ctx.fillStyle = '#51606e'
    ctx.textAlign = 'center'
    for (const t of xScale.ticks(6)) {
      ctx.fillText((t / 1e6).toFixed(2), xScale(t), HEIGHT - 14)
    }
    ctx.fillText(
      chr ? `chr${chr} position (Mb)` : 'position (Mb)',
      width / 2,
      HEIGHT - 2,
    )

    ctx.save()
    ctx.translate(12, HEIGHT / 2)
    ctx.rotate(-Math.PI / 2)
    ctx.fillStyle = '#51606e'
    ctx.fillText('-log₁₀(p)', 0, 0)
    ctx.restore()
  }, [points, width, maxY, xScale, yScale, chr, selected])

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
      <div className="flex items-center justify-end gap-3 px-1 pb-1 text-[11px] text-ink-soft">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: C_UP }} />
          {upLabel}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: C_DOWN }} />
          {downLabel}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width, height: HEIGHT }}
        className="cursor-pointer"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        onClick={() => hover && onSelect(hover.p.row)}
      />
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
            p = {fmtPLog(hover.p.row.lp)} · β = {fmtBeta(hover.p.row.beta)}
          </div>
        </div>
      )}
    </div>
  )
}
