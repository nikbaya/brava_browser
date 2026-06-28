import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { ANCESTRY_COLOR, ANCESTRY_META, SUPERPOPS, type Ancestry } from '../lib/constants'
import type { Biobank } from '../data/types'
import SamplePie, {
  NON_EUR,
  fmtN,
  fmtPct,
  lighten,
  scaledRadius,
  type Slice,
} from './SamplePie'

/**
 * Ancestral-diversity view for the About page — visually identical to the
 * phenotype-page sample-size pies, but driven by the global biobank ancestry
 * composition rather than one phenotype. Per-ancestry strata pies (slice =
 * contributing biobank, shaded within the ancestry hue) sit left of a separator;
 * the "All" / "non-EUR" meta pies sit right. Static (non-interactive); biobank
 * / ancestry names + N appear on hover.
 */
export default function DiversityPies({ biobanks }: { biobanks: Biobank[] }) {
  const sectionRef = useRef<HTMLDivElement>(null)
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const showTip = (e: ReactMouseEvent, text: string) => {
    const r = sectionRef.current?.getBoundingClientRect()
    if (r) setTip({ x: e.clientX - r.left, y: e.clientY - r.top, text })
  }

  const { stratumPies, metaPies } = useMemo(() => {
    // ancestry -> [{ id, name, n }] across biobanks.
    const byAnc = new Map<string, { id: string; name: string; n: number }[]>()
    for (const b of biobanks)
      for (const [anc, n] of Object.entries(b.ancestry_n))
        if (n > 0) {
          if (!byAnc.has(anc)) byAnc.set(anc, [])
          byAnc.get(anc)!.push({ id: b.id, name: b.name, n })
        }
    const ancTotal = (a: string) =>
      (byAnc.get(a) ?? []).reduce((s, r) => s + r.n, 0)

    // Per-stratum pies: biobank slices shaded within the ancestry hue.
    const present = SUPERPOPS.filter((a) => byAnc.get(a)?.length)
    const strataMax = Math.max(...present.map(ancTotal), 1)
    const stratumPies = present.map((a) => {
      const rows = (byAnc.get(a) ?? []).slice().sort((x, y) => y.n - x.n)
      const base = ANCESTRY_COLOR[a as Ancestry]
      const total = ancTotal(a)
      const slices: Slice[] = rows.map((r, i) => ({
        key: r.id,
        n: r.n,
        fill: lighten(base, rows.length > 1 ? (i / (rows.length - 1)) * 0.62 : 0),
        title: `${r.name}: ${fmtN(r.n)} (${fmtPct(r.n / total)})`,
      }))
      return { anc: a as Ancestry, slices, total, radius: scaledRadius(total, strataMax) }
    })

    // Meta pies: ancestry slices in the forest-plot colours.
    const metaSlice = (keys: readonly string[]): Slice[] =>
      keys
        .filter((a) => byAnc.get(a)?.length)
        .map((a) => ({ key: a, n: ancTotal(a), fill: ANCESTRY_COLOR[a as Ancestry], title: '' }))
        .sort((x, y) => y.n - x.n)
    const metaDefs: { anc: Ancestry; keys: readonly string[] }[] = [
      { anc: 'All', keys: SUPERPOPS },
      { anc: 'non_EUR', keys: NON_EUR },
    ]
    const rawMeta = metaDefs
      .map((d) => {
        const slices = metaSlice(d.keys)
        const total = slices.reduce((s, x) => s + x.n, 0)
        // fill titles now that we know the pie total
        for (const s of slices)
          s.title = `${ANCESTRY_META[s.key as Ancestry].long}: ${fmtN(s.n)} (${fmtPct(s.n / total)})`
        return { anc: d.anc, slices, total }
      })
      .filter((m) => m.slices.length > 0)
    const metaMax = Math.max(...rawMeta.map((m) => m.total), 1)
    const metaPies = rawMeta.map((m) => ({ ...m, radius: scaledRadius(m.total, metaMax) }))

    return { stratumPies, metaPies }
  }, [biobanks])

  const render = (p: { anc: Ancestry; slices: Slice[]; total: number; radius: number }) => (
    <SamplePie
      key={p.anc}
      anc={p.anc}
      slices={p.slices}
      total={p.total}
      radius={p.radius}
      interactive={false}
      onHover={showTip}
      onLeave={() => setTip(null)}
    />
  )

  return (
    <div ref={sectionRef} className="relative">
      <div className="flex flex-wrap items-stretch gap-x-1 gap-y-2">
        <div className="flex flex-col">
          <span className="mb-0.5 pl-2 text-[10px] font-medium tracking-wide text-ink-faint uppercase">
            Per-ancestry strata
          </span>
          <div className="flex flex-wrap items-end gap-1">{stratumPies.map(render)}</div>
        </div>

        {metaPies.length > 0 && (
          <div className="flex flex-col border-l border-line pl-2">
            <span className="mb-0.5 pl-2 text-[10px] font-medium tracking-wide text-ink-faint uppercase">
              Meta-analyses
            </span>
            <div className="flex flex-wrap items-end gap-1">{metaPies.map(render)}</div>
          </div>
        )}
      </div>

      {tip && (
        <div
          className="pointer-events-none absolute z-30 -translate-y-1/2 rounded-md border border-line bg-surface px-2 py-1 text-[11px] whitespace-nowrap text-ink shadow-lg"
          style={{ left: tip.x + 14, top: tip.y }}
        >
          {tip.text}
        </div>
      )}
    </div>
  )
}
