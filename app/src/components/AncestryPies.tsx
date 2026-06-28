import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { fetchBiobankIndex, fetchPhenoSizes } from '../data/client'
import { useAsync } from '../lib/useAsync'
import { ANCESTRY_COLOR, ANCESTRY_META, SUPERPOPS, type Ancestry } from '../lib/constants'
import type { BiobankN, PhenotypeMeta } from '../data/types'
import { Spinner } from './ui'
import SamplePie, {
  NON_EUR,
  fmtN,
  fmtPct,
  lighten,
  scaledRadius,
  type Slice,
} from './SamplePie'

/**
 * Per-ancestry sample-size pies for one phenotype. The per-stratum pies (slice =
 * contributing biobank, shaded within the ancestry's colour) sit left; the two
 * meta-analysis pies — "All" and "non-EUR" — sit right of a separator, their
 * slices coloured by the forest-plot ancestry scheme. Every pie doubles as the
 * ancestry selector; the active stratum is
 * subtly highlighted. Biobank / ancestry names + N appear on hover.
 */
export default function AncestryPies({
  pheno,
  available,
  selected,
  onSelect,
}: {
  pheno: PhenotypeMeta
  available: Ancestry[]
  selected: Ancestry
  onSelect: (a: Ancestry) => void
}) {
  // pheno_sizes is keyed by the base id (female-specific _F traits fold in).
  const baseId = pheno.id.endsWith('_F') ? pheno.id.slice(0, -2) : pheno.id
  const sizes = useAsync(() => fetchPhenoSizes(), [])
  const biobanks = useAsync(() => fetchBiobankIndex(), [])

  const strata = sizes.data?.[baseId]
  const binary = pheno.type === 'binary'

  const name = useMemo(() => {
    const m = new Map<string, string>()
    for (const b of biobanks.data?.biobanks ?? []) m.set(b.id, b.name)
    return (id: string) => m.get(id) ?? id
  }, [biobanks.data])

  const built = useMemo(() => {
    if (!strata) return null
    const subtitle = (label: string, n: number, cases?: number) =>
      `${label}: ${fmtN(n)}${
        binary && cases != null
          ? ` (${fmtN(cases)} cases, ${fmtPct(cases / n)} prevalence)`
          : ''
      }`
    const ancTotal = (a: string) => strata[a].reduce((s, r) => s + r.n, 0)
    const ancCases = (a: string) =>
      strata[a].every((r) => r.case != null)
        ? strata[a].reduce((s, r) => s + (r.case ?? 0), 0)
        : undefined

    // Per-stratum pies: slices are biobanks, shaded within the ancestry hue.
    const present = SUPERPOPS.filter((a) => strata[a]?.length)
    const strataMax = Math.max(...present.map(ancTotal), 1)
    const stratumPies = present.map((a) => {
      const rows = strata[a]
      const base = ANCESTRY_COLOR[a as Ancestry]
      const slices: Slice[] = rows.map((r: BiobankN, i) => ({
        key: r.id,
        n: r.n,
        fill: lighten(base, rows.length > 1 ? (i / (rows.length - 1)) * 0.62 : 0),
        title: subtitle(name(r.id), r.n, r.case),
      }))
      return {
        anc: a as Ancestry,
        slices,
        total: ancTotal(a),
        radius: scaledRadius(ancTotal(a), strataMax),
      }
    })

    // Meta pies: slices are ancestries, coloured like the forest plot.
    const metaSlice = (keys: readonly string[]): Slice[] =>
      keys
        .filter((a) => strata[a]?.length)
        .map((a) => ({
          key: a,
          n: ancTotal(a),
          fill: ANCESTRY_COLOR[a as Ancestry],
          title: subtitle(ANCESTRY_META[a as Ancestry].long, ancTotal(a), ancCases(a)),
        }))
        .sort((x, y) => y.n - x.n)
    const metaDefs: { anc: Ancestry; keys: readonly string[] }[] = [
      { anc: 'All', keys: SUPERPOPS },
      { anc: 'non_EUR', keys: NON_EUR },
    ]
    const rawMeta = metaDefs
      .filter((d) => available.includes(d.anc))
      .map((d) => {
        const slices = metaSlice(d.keys)
        return { anc: d.anc, slices, total: slices.reduce((s, x) => s + x.n, 0) }
      })
      .filter((m) => m.slices.length > 0)
    const metaMax = Math.max(...rawMeta.map((m) => m.total), 1)
    const metaPies = rawMeta.map((m) => ({
      ...m,
      radius: scaledRadius(m.total, metaMax),
    }))

    return { stratumPies, metaPies }
  }, [strata, available, binary, name])

  // Custom hover tooltip — instant, unlike the native <title> delay.
  const sectionRef = useRef<HTMLElement>(null)
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null)
  const showTip = (e: ReactMouseEvent, text: string) => {
    const r = sectionRef.current?.getBoundingClientRect()
    if (!r) return
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top, text })
  }

  if (sizes.loading) return <Spinner label="Loading sample sizes…" />
  if (!built || built.stratumPies.length === 0) return null

  const render = (p: {
    anc: Ancestry
    slices: Slice[]
    total: number
    radius: number
  }) => (
    <SamplePie
      key={p.anc}
      anc={p.anc}
      slices={p.slices}
      total={p.total}
      radius={p.radius}
      selected={selected === p.anc}
      onSelect={() => onSelect(p.anc)}
      onHover={showTip}
      onLeave={() => setTip(null)}
    />
  )

  return (
    <section ref={sectionRef} className="relative mt-4 rounded-lg border border-line bg-surface p-3">
      <h2 className="mb-2 text-[13px] font-semibold text-ink">
        Sample size by ancestry
        <span className="ml-1.5 font-normal text-ink-faint">
          · slices are contributing biobanks (hover) · click to view that stratum
        </span>
      </h2>

      <div className="flex flex-wrap items-stretch gap-x-1 gap-y-2">
        <div className="flex flex-col">
          <span className="mb-0.5 pl-2 text-[10px] font-medium tracking-wide text-ink-faint uppercase">
            Per-ancestry strata
          </span>
          <div className="flex flex-wrap items-end gap-1">
            {built.stratumPies.map(render)}
          </div>
        </div>

        {built.metaPies.length > 0 && (
          <div className="flex flex-col border-l border-line pl-2">
            <span className="mb-0.5 pl-2 text-[10px] font-medium tracking-wide text-ink-faint uppercase">
              Meta-analyses
            </span>
            <div className="flex flex-wrap items-end gap-1">
              {built.metaPies.map(render)}
            </div>
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
    </section>
  )
}
