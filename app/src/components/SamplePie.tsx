import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { ANCESTRY_META, type Ancestry } from '../lib/constants'

// Shared sample-size pie used by the phenotype page (interactive ancestry
// selector) and the About page (static diversity view), so both look identical.

const TAU = Math.PI * 2
export const VIEW = 88 // svg viewBox size
export const R_MAX = 38 // largest pie radius (viewBox units)
export const R_MIN = 20 // smallest, so a tiny stratum stays legible
export const NON_EUR = ['AFR', 'AMR', 'EAS', 'SAS'] as const

function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const x0 = cx + r * Math.cos(a0)
  const y0 = cy + r * Math.sin(a0)
  const x1 = cx + r * Math.cos(a1)
  const y1 = cy + r * Math.sin(a1)
  const large = a1 - a0 > Math.PI ? 1 : 0
  return `M${cx},${cy} L${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1} Z`
}

/** Lighten a #rrggbb hex toward white by `amt` ∈ [0,1]. */
export function lighten(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16)
  const mix = (c: number) => Math.round(c + (255 - c) * amt)
  return `rgb(${mix((n >> 16) & 255)},${mix((n >> 8) & 255)},${mix(n & 255)})`
}

export const fmtN = (n: number) => n.toLocaleString()
export const fmtPct = (frac: number) => {
  const p = frac * 100
  return `${p >= 1 ? p.toFixed(1) : p.toFixed(2)}%`
}

/** Radius scaled by √(total / max) so big strata visibly dwarf small ones. */
export const scaledRadius = (total: number, max: number) =>
  R_MIN + (R_MAX - R_MIN) * Math.sqrt(total / max)

export interface Slice {
  key: string
  n: number
  fill: string
  title: string
  /** Short label for the side legend; omit to keep the slice legend-less. */
  label?: string
}

/** Legend rows per pie — beyond this the tail is summarised as "+N more". */
export const LEGEND_MAX = 5

export interface PieTipState {
  x: number
  y: number
  text: string
}

/**
 * Hover state for pie-slice tooltips. Paired with `PieTip` so that every pie in
 * the browser — phenotype page, About overview, participating biobanks — shares
 * one tooltip implementation and cannot drift apart in style.
 *
 * Coordinates are viewport (`clientX/Y`) and `PieTip` portals to the body, so a
 * tooltip is never clipped by a card or a scrolling ancestor and no call site
 * needs a `relative` wrapper or its own bounding-rect maths.
 */
export function usePieTip() {
  const [tip, setTip] = useState<PieTipState | null>(null)
  return {
    tip,
    show: (e: ReactMouseEvent, text: string) =>
      setTip({ x: e.clientX, y: e.clientY, text }),
    hide: () => setTip(null),
  }
}

/** The one and only pie tooltip: sits to the right of the cursor, vertically
 *  centred on it, so it never covers the slice being pointed at. */
export function PieTip({ tip }: { tip: PieTipState | null }) {
  if (!tip) return null
  return createPortal(
    <div
      style={{ position: 'fixed', left: tip.x + 14, top: tip.y }}
      className="pointer-events-none z-[100] -translate-y-1/2 rounded-md border border-line bg-surface px-2 py-1 text-[11px] whitespace-nowrap text-ink shadow-lg"
    >
      {tip.text}
    </div>,
    document.body,
  )
}

/**
 * The biggest slices, named, beside a pie. A pie this size can't label its own
 * slices, and hover only ever reveals one at a time — so the composition (who
 * contributes, and roughly how much) is invisible until you go looking for it.
 * The list makes it readable at a glance where the layout has the width to
 * spare; the tooltip stays the place for exact counts.
 *
 * Capped at `LEGEND_MAX` with a "+N more" tail so a pie of eight biobanks can't
 * outgrow the pie beside it, and sorted by size independently of slice order
 * (which is drawing order, not necessarily rank).
 */
function SliceLegend({
  slices,
  total,
  onHover,
  onLeave,
}: {
  slices: Slice[]
  total: number
  onHover: (e: ReactMouseEvent, text: string) => void
  onLeave: () => void
}) {
  const ranked = slices.filter((s) => s.label).sort((a, b) => b.n - a.n)
  if (ranked.length === 0) return null
  const shown = ranked.slice(0, LEGEND_MAX)
  const rest = ranked.length - shown.length

  return (
    // Only from `xl` up: below that the pies already fill their row, and a
    // legend per pie would push them into extra rows to say what a hover
    // already says. This is the one width test — a pie asked for a legend
    // renders in row layout at every width, so hiding the list here collapses
    // it back to exactly the legend-less pie.
    // w-36 is set by the longest name kept in full (`biobankShort`'s 18-char
    // cut-off, i.e. "Genomics England") plus the swatch and the percentage.
    // Five of these units still fit one row at the `xl` breakpoint itself.
    <ul className="hidden w-36 shrink-0 space-y-px text-left text-[10px] leading-tight xl:block">
      {shown.map((s) => (
        <li
          key={s.key}
          className="flex items-center gap-1"
          onMouseMove={(e) => onHover(e, s.title)}
          onMouseLeave={onLeave}
        >
          <span
            className="h-2 w-2 shrink-0 rounded-[2px]"
            style={{ backgroundColor: s.fill }}
            aria-hidden="true"
          />
          <span className="truncate text-ink-soft">{s.label}</span>
          <span className="tnum ml-auto pl-1 text-ink-faint">
            {Math.round((100 * s.n) / total)}%
          </span>
        </li>
      ))}
      {rest > 0 && (
        <li className="pl-3 text-ink-faint">
          +{rest} more
        </li>
      )}
    </ul>
  )
}

/**
 * A pie of pre-computed slices. When `interactive`, it renders as a clickable
 * selector button with hover/selected affordances; otherwise as a static
 * figure. Slices report hover text via `onHover`/`onLeave`.
 */
export default function SamplePie({
  anc,
  slices,
  total,
  radius,
  interactive = true,
  selected = false,
  disabled = false,
  legend = false,
  onSelect,
  onHover,
  onLeave,
}: {
  anc: Ancestry
  slices: Slice[]
  total: number
  radius: number
  interactive?: boolean
  selected?: boolean
  /** Stratum has sample size but no association results — shown faded and not
   *  clickable. */
  disabled?: boolean
  /** Name the biggest slices beside the pie (needs `label` on the slices). */
  legend?: boolean
  onSelect?: () => void
  onHover: (e: ReactMouseEvent, text: string) => void
  onLeave: () => void
}) {
  const c = VIEW / 2
  let a = -Math.PI / 2 // start at 12 o'clock
  const arcs = slices.map((s) => {
    const a0 = a
    const a1 = a + (s.n / total) * TAU
    a = a1
    return { s, a0, a1 }
  })
  const hov = (s: Slice) => ({
    onMouseMove: (e: ReactMouseEvent) => onHover(e, s.title),
    onMouseLeave: onLeave,
  })

  const inner = (
    <>
      <svg width={72} height={72} viewBox={`0 0 ${VIEW} ${VIEW}`}>
        {arcs.length === 1 ? (
          <circle cx={c} cy={c} r={radius} fill={arcs[0].s.fill} stroke="#fff" strokeWidth={0.75} {...hov(arcs[0].s)} />
        ) : (
          arcs.map(({ s, a0, a1 }) => (
            <path key={s.key} d={arc(c, c, radius, a0, a1)} fill={s.fill} stroke="#fff" strokeWidth={0.75} {...hov(s)} />
          ))
        )}
      </svg>
      <span className={`text-[11px] font-semibold ${selected ? 'text-brand' : 'text-ink'}`}>
        {ANCESTRY_META[anc].label}
      </span>
      <span className="tnum text-[10px] text-ink-faint">{fmtN(total)}</span>
    </>
  )

  // With a legend the unit is a row (pie column, then the list); without one it
  // is the column alone. A row holding only the column lays out identically, so
  // the legend can drop out at narrow widths without a second layout.
  const body = legend ? (
    <>
      <div className="flex flex-col items-center gap-1">{inner}</div>
      <SliceLegend
        slices={slices}
        total={total}
        onHover={onHover}
        onLeave={onLeave}
      />
    </>
  ) : (
    inner
  )
  const layout = legend
    ? 'flex items-center gap-2'
    : 'flex flex-col items-center gap-1'

  if (!interactive)
    return <div className={`${layout} px-2 py-1.5`}>{body}</div>

  // Sample size exists but no association results for this stratum: keep it
  // visible (it still conveys N) but faded and clearly not clickable.
  if (disabled)
    return (
      <div
        aria-disabled
        title={`No association results for ${ANCESTRY_META[anc].long}`}
        className={`${layout} cursor-not-allowed rounded-lg px-2 py-1.5 opacity-40 grayscale`}
      >
        {body}
      </div>
    )

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Show ${ANCESTRY_META[anc].long} results`}
      className={`${layout} rounded-lg px-2 py-1.5 transition ${
        selected ? 'bg-brand-light ring-1 ring-brand/40' : 'hover:bg-surface-soft'
      }`}
    >
      {body}
    </button>
  )
}
