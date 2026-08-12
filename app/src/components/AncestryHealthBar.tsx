import { useState } from 'react'
import { createPortal } from 'react-dom'
import { fmtN, NON_EUR } from './SamplePie'
import {
  ANCESTRY_COLOR,
  ANCESTRY_GROUP_LABEL,
  ANCESTRY_META,
  SUPERPOPS,
  type Ancestry,
} from '../lib/constants'
import type { AncestryN } from '../data/types'

/**
 * Stacked-segment "health bar": how much sample size backs one row, and which
 * ancestries it's made of. Both meta strata are shown *stratified*, matching
 * what they actually are: `All` breaks into the 5 superpops, and `non_EUR`
 * — itself a meta-analysis of the 4 non-European superpops (see `NON_EUR` /
 * `AncestryPies`) — breaks into just those 4, not one opaque grey segment. A
 * single concrete stratum (EUR, AFR, AMR, EAS, SAS) has nothing left to
 * stratify, so it draws one solid segment for just that stratum's N —
 * matching what the rest of the row already reflects (that stratum's
 * p-value), rather than silently continuing to show the full cross-ancestry
 * composition regardless of the ancestry filter.
 *
 * The bar's length is always relative to `maxN` (the largest total among the
 * rows currently on screen for the *selected* stratum) — same normalisation
 * idea as `MagnitudeBar`, so a full-width bar reads "best-supported row here",
 * not an absolute power claim. The hover tooltip always shows the full
 * per-ancestry breakdown (for context, even when one stratum is selected),
 * with the selected one bolded. Colors reuse the forest-plot `ANCESTRY_COLOR`
 * palette (already load-bearing for "ancestry" elsewhere) and the per-ancestry
 * N already lives in the bundled meta/phenotypes.json, so this needed no new
 * semantic color and no pipeline change.
 *
 * The tooltip is a `position: fixed` div portaled to `document.body` — same
 * fix as `Tip`/`PieTip`. This cell lives inside VirtualTable's virtualized
 * rows, each positioned with `transform: translateY(...)`; a `transform` on
 * any ancestor makes `position: fixed` descendants fixed *to that ancestor*
 * instead of the viewport (per spec), which is why an earlier version of this
 * tooltip rendered far from the cursor and could paint behind a later,
 * separately-transformed row instead of always on top.
 */
export default function AncestryHealthBar({
  n,
  selected,
  maxN,
  width = 100,
}: {
  n: Record<string, AncestryN> | undefined
  /** The page's current ancestry filter — 'All' shows the full composition. */
  selected: Ancestry
  maxN: number
  width?: number
}) {
  const [hover, setHover] = useState<{ x: number; y: number } | null>(null)
  if (!n || maxN <= 0) return <span className="text-ink-faint">—</span>

  const breakdown = SUPERPOPS.map((a) => ({ a, val: n[a]?.n ?? 0 })).filter(
    (s) => s.val > 0,
  )
  const grandTotal = breakdown.reduce((s, x) => s + x.val, 0) || (n.All?.n ?? 0)
  if (grandTotal <= 0) return <span className="text-ink-faint">—</span>

  // What the bar itself draws: the 5-superpop composition for `All`, the
  // 4-superpop composition for `non_EUR`, or one solid segment for a single
  // concrete stratum.
  const barKeys: readonly string[] =
    selected === 'All' ? SUPERPOPS : selected === 'non_EUR' ? NON_EUR : [selected]
  const segments = barKeys
    .map((a) => ({ a, val: n[a]?.n ?? 0 }))
    .filter((s) => s.val > 0)
  const shownTotal = segments.reduce((s, x) => s + x.val, 0)
  if (shownTotal <= 0) return <span className="text-ink-faint">—</span>

  // Which of the *always-shown* SUPERPOPS breakdown rows actually feed the
  // bar above. All 5 for `All` (nothing is excluded from a full meta), the 4
  // non-European ones for `non_EUR`, or just the one concrete stratum.
  const included = new Set<string>(
    selected === 'All' ? SUPERPOPS : selected === 'non_EUR' ? NON_EUR : [selected],
  )

  const barW = Math.max(4, Math.round((shownTotal / maxN) * width))

  return (
    <span
      className="relative inline-flex items-center gap-1.5"
      onMouseMove={(e) => setHover({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setHover(null)}
    >
      <span
        className="relative inline-flex h-[9px] shrink-0 overflow-hidden rounded-full bg-line"
        style={{ width }}
      >
        <span className="flex h-full" style={{ width: barW }}>
          {segments.map((s) => (
            <span
              key={s.a}
              className="h-full"
              style={{
                width: `${(s.val / shownTotal) * 100}%`,
                backgroundColor: ANCESTRY_COLOR[s.a as Ancestry],
              }}
            />
          ))}
        </span>
      </span>
      <span className="tnum text-ink-faint">{fmtN(shownTotal)}</span>
      {hover &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[100] rounded-md border border-line bg-surface px-2 py-1.5 text-xs shadow-lg"
            style={{ left: hover.x + 12, top: hover.y + 12 }}
          >
            {breakdown.map((s) => {
              // selected === 'All' includes every row, so nothing is excluded
              // there; a concrete stratum or non_EUR excludes the rest, which
              // read fully greyed (label, dot and N alike) rather than merely
              // un-bolded, since they play no part in the shown bar/total.
              const isIncluded = included.has(s.a)
              const bold = selected !== 'All' && isIncluded
              return (
                <div key={s.a} className="flex items-center gap-1.5">
                  <span
                    className="inline-block h-2 w-2 shrink-0 rounded-full"
                    style={{
                      backgroundColor: ANCESTRY_COLOR[s.a as Ancestry],
                      opacity: isIncluded ? 1 : 0.35,
                    }}
                  />
                  <span
                    className={
                      bold
                        ? 'font-semibold text-ink'
                        : isIncluded
                          ? 'text-ink-soft'
                          : 'text-ink-faint'
                    }
                  >
                    {ANCESTRY_GROUP_LABEL[s.a] ?? s.a}
                  </span>
                  <span
                    className={`tnum ml-auto pl-2 ${
                      isIncluded ? 'font-medium text-ink' : 'text-ink-faint'
                    }`}
                  >
                    {fmtN(s.val)}
                  </span>
                </div>
              )
            })}
            <div className="mt-1 flex items-center gap-1.5 border-t border-line pt-1 font-medium text-ink">
              <span>
                {selected === 'All' ? 'Total' : `${ANCESTRY_META[selected].label} total`}
              </span>
              <span className="tnum ml-auto pl-2">{fmtN(shownTotal)}</span>
            </div>
          </div>,
          document.body,
        )}
    </span>
  )
}
