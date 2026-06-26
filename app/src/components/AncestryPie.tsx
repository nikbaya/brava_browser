import { useMemo } from 'react'
import { ANCESTRY_GROUP_COLOR, ANCESTRY_GROUP_LABEL } from '../lib/constants'

const OTHER = '#94a3b8'

function color(anc: string): string {
  return ANCESTRY_GROUP_COLOR[anc] ?? OTHER
}

function donutSlice(
  cx: number,
  cy: number,
  rO: number,
  rI: number,
  a0: number,
  a1: number,
): string {
  const pt = (r: number, a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]
  const large = a1 - a0 > Math.PI ? 1 : 0
  const [x0, y0] = pt(rO, a0)
  const [x1, y1] = pt(rO, a1)
  const [x2, y2] = pt(rI, a1)
  const [x3, y3] = pt(rI, a0)
  return `M${x0} ${y0} A${rO} ${rO} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${rI} ${rI} 0 ${large} 0 ${x3} ${y3} Z`
}

/**
 * Donut chart of ancestry composition with an inline legend (% of total).
 * `data` maps ancestry code -> N; slices are ordered by descending N.
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

  const r = size / 2
  const rI = r * 0.58
  const single = slices.length === 1

  return (
    <div className="flex items-center gap-3">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        {single ? (
          <>
            <circle cx={r} cy={r} r={r} fill={color(slices[0].anc)} />
            <circle cx={r} cy={r} r={rI} fill="#fff" />
          </>
        ) : (
          slices.map((s) => (
            <path key={s.anc} d={donutSlice(r, r, r, rI, s.a0, s.a1)} fill={color(s.anc)} />
          ))
        )}
      </svg>
      {showLegend && (
        <ul className="grid grid-cols-1 gap-x-3 gap-y-0.5 text-[11px] sm:grid-cols-2">
          {slices.map((s) => (
            <li key={s.anc} className="flex items-center gap-1.5 whitespace-nowrap">
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-sm"
                style={{ backgroundColor: color(s.anc) }}
              />
              <span className="text-ink-soft" title={ANCESTRY_GROUP_LABEL[s.anc] ?? s.anc}>
                {s.anc}
              </span>
              <span className="tabular-nums text-ink-faint">
                {(s.frac * 100).toFixed(0)}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
