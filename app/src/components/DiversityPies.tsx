import { useMemo } from 'react'
import { ANCESTRY_COLOR, ANCESTRY_META, SUPERPOPS, type Ancestry } from '../lib/constants'
import { biobankShort } from '../lib/format'
import type { Biobank } from '../data/types'
import SamplePie, {
  NON_EUR,
  PieTip,
  fmtN,
  fmtPct,
  lighten,
  scaledRadius,
  usePieTip,
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
  const { tip, show, hide } = usePieTip()

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
        label: biobankShort(r.id, r.name),
      }))
      return { anc: a as Ancestry, slices, total, radius: scaledRadius(total, strataMax) }
    })

    // Meta pies: ancestry slices in the forest-plot colours.
    const metaSlice = (keys: readonly string[]): Slice[] =>
      keys
        .filter((a) => byAnc.get(a)?.length)
        .map((a) => ({
          key: a,
          n: ancTotal(a),
          fill: ANCESTRY_COLOR[a as Ancestry],
          title: '',
          label: ANCESTRY_META[a as Ancestry].label,
        }))
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
      legend
      onHover={show}
      onLeave={hide}
    />
  )

  return (
    <div>
      {/* Two layouts, swapped by CSS display — see the matching (and more
          detailed) comment in AncestryPies.tsx. >=1120px: CSS grid with the
          meta pies in a `subgrid` box, so the box's internal All↔non-EUR gap
          inherits the same `justify-between`-distributed spacing as the rest
          of the row. <1120px: flex-wrap with a tinted chip per meta pie,
          since grid has no wrap and a box spanning columns has nothing
          sensible to do once pies drop onto separate lines on a phone. */}
      <div
        className="hidden items-start justify-between gap-1 min-[1120px]:grid"
        style={{ gridTemplateColumns: `repeat(${stratumPies.length + metaPies.length}, auto)` }}
      >
        {stratumPies.map(render)}
        {metaPies.length > 0 && (
          <div
            title="Meta-analyses"
            className="grid items-start gap-1 rounded-lg border border-line p-1"
            style={{ gridColumn: `span ${metaPies.length}`, gridTemplateColumns: 'subgrid' }}
          >
            {metaPies.map(render)}
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-start justify-between gap-1 min-[1120px]:hidden">
        {stratumPies.map(render)}
        {metaPies.map((p) => (
          <div key={p.anc} title="Meta-analyses" className="rounded-lg border border-line p-1">
            {render(p)}
          </div>
        ))}
      </div>

      <PieTip tip={tip} />
    </div>
  )
}
