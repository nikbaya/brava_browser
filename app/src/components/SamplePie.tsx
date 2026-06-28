import type { MouseEvent as ReactMouseEvent } from 'react'
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

  if (!interactive)
    return <div className="flex flex-col items-center gap-1 px-2 py-1.5">{inner}</div>

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`Show ${ANCESTRY_META[anc].long} results`}
      className={`flex flex-col items-center gap-1 rounded-lg px-2 py-1.5 transition ${
        selected ? 'bg-brand-light ring-1 ring-brand/40' : 'hover:bg-surface-soft'
      }`}
    >
      {inner}
    </button>
  )
}
