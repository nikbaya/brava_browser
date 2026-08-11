import { useMemo, type MouseEvent as ReactMouseEvent } from 'react'
import { ANCESTRY_GROUP_COLOR, ANCESTRY_GROUP_LABEL } from '../lib/constants'
import { PieTip, fmtN, fmtPct, usePieTip } from './SamplePie'

const OTHER = '#94a3b8'

function color(anc: string): string {
  return ANCESTRY_GROUP_COLOR[anc] ?? OTHER
}

/** Wedge from the centre out to `r` — a pie slice, not a ring segment. */
function pieSlice(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
): string {
  const pt = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0, y0] = pt(a0)
  const [x1, y1] = pt(a1)
  return `M${cx} ${cy} L${x0} ${y0} A${r} ${r} 0 ${large} 1 ${x1} ${y1} Z`
}

/**
 * Pie chart of ancestry composition with an inline legend (% of total).
 * `data` maps ancestry code -> N; slices are ordered by descending N.
 *
 * Hovering a slice names the ancestry in full and gives its exact count — the
 * legend only has room for the short code and a rounded percentage, and thin
 * slivers are too small to label in place.
 */
export default function AncestryPie({
  data,
  size = 72,
  showLegend = true,
}: {
  data: Record<string, number>
  size?: number
  showLegend?: boolean
}) {
  const slices = useMemo(() => {
    const entries = Object.entries(data).filter(([, n]) => n > 0)
    entries.sort((a, b) => b[1] - a[1])
    const total = entries.reduce((s, [, n]) => s + n, 0)
    let a = -Math.PI / 2
    return entries.map(([anc, n]) => {
      const frac = n / total
      const a0 = a
      const a1 = a + frac * 2 * Math.PI
      a = a1
      return { anc, n, frac, a0, a1 }
    })
  }, [data])

  const { tip, show, hide } = usePieTip()

  const r = size / 2
  const single = slices.length === 1

  // Same "Label: N (pct)" phrasing the other pies use, via the shared tooltip.
  const hov = (s: { anc: string; n: number; frac: number }) => ({
    onMouseMove: (e: ReactMouseEvent) =>
      show(
        e,
        `${ANCESTRY_GROUP_LABEL[s.anc] ?? s.anc}: ${fmtN(s.n)} (${fmtPct(s.frac)})`,
      ),
    onMouseLeave: hide,
  })

  return (
    <div className="flex items-center gap-3">
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="shrink-0"
      >
        {single ? (
          <circle
            cx={r}
            cy={r}
            r={r}
            fill={color(slices[0].anc)}
            {...hov(slices[0])}
          />
        ) : (
          slices.map((s) => (
            <path
              key={s.anc}
              d={pieSlice(r, r, r, s.a0, s.a1)}
              fill={color(s.anc)}
              stroke="#fff"
              strokeWidth={0.75}
              {...hov(s)}
            />
          ))
        )}
      </svg>
      {showLegend && (
        <ul className="grid grid-cols-1 gap-x-3 gap-y-0.5 text-xs sm:grid-cols-2">
          {slices.map((s) => (
            <li
              key={s.anc}
              className="flex items-center gap-1.5 whitespace-nowrap"
              {...hov(s)}
            >
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-sm"
                style={{ backgroundColor: color(s.anc) }}
              />
              <span className="text-ink-soft">{s.anc}</span>
              <span className="tabular-nums text-ink-faint">
                {(s.frac * 100).toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      )}
      <PieTip tip={tip} />
    </div>
  )
}
