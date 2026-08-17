import { useMemo } from 'react'
import { fetchBiobankIndex, fetchPhenoSizes } from '../data/client'
import { useAsync } from '../lib/useAsync'
import { biobankShort } from '../lib/format'
import { ANCESTRY_COLOR, ANCESTRY_META, SUPERPOPS, type Ancestry } from '../lib/constants'
import type { BiobankN, PhenotypeMeta } from '../data/types'
import { Spinner } from './ui'
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
 * Per-ancestry sample-size pies for one phenotype. The per-stratum pies (slice =
 * contributing biobank, shaded within the ancestry's colour) sit left; the two
 * meta-analysis pies — "All" and "non-EUR" — sit right of a separator, their
 * slices coloured by the forest-plot ancestry scheme. Every pie doubles as the
 * ancestry selector; the active stratum is
 * subtly highlighted. Biobank / ancestry names + N appear on hover.
 */
const SUPERPOP_SET = new Set<string>(SUPERPOPS)

export default function AncestryPies({
  pheno,
  available,
  variantAvailable,
  selected,
  onSelect,
}: {
  pheno: PhenotypeMeta
  available: Ancestry[]
  /**
   * When viewing variant-level results, some ancestries with gene-level
   * sample size still have zero variants in the overview (e.g. LDL
   * cholesterol has none in EAS) — pass the set of superpops that DO have
   * variant data so those pies grey out too, same "faded and non-clickable"
   * treatment as `available`. `null`/omitted (gene-level view) applies no
   * extra restriction. Only ever checked against the 5 superpop pies — `All`
   * and `non_EUR` aren't in a variant `anc_mask` (see `decodeAncMask`), so
   * they're exempt.
   */
  variantAvailable?: Set<Ancestry> | null
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
        label: biobankShort(r.id, name(r.id)),
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
          // A meta pie's slices are ancestries, not biobanks — so its legend
          // reads EUR / AFR / …, the same codes the forest plot uses.
          label: ANCESTRY_META[a as Ancestry].label,
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
  const { tip, show, hide } = usePieTip()

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
      legend
      // A stratum can have sample size but no association results — those are
      // shown faded and non-clickable rather than leading to an empty table.
      // Same treatment when viewing variant-level results and this superpop
      // has zero variants in the overview (variantAvailable), even though it
      // has gene-level results — but that's a materially different reason,
      // so it gets its own tooltip rather than the generic one.
      disabled={
        !available.includes(p.anc) ||
        (variantAvailable != null &&
          SUPERPOP_SET.has(p.anc) &&
          !variantAvailable.has(p.anc))
      }
      disabledReason={
        !available.includes(p.anc)
          ? undefined // generic "no association results" default
          : variantAvailable != null &&
              SUPERPOP_SET.has(p.anc) &&
              !variantAvailable.has(p.anc)
            ? `No variant-level results for ${ANCESTRY_META[p.anc].long}`
            : undefined
      }
      onSelect={() => onSelect(p.anc)}
      onHover={show}
      onLeave={hide}
    />
  )

  return (
    <section className="mt-4 mb-6 rounded-lg border border-line bg-surface p-3">
      <h2 className="mb-2 text-[13px] font-semibold text-ink">
        Sample size by ancestry
        <span className="ml-1.5 font-normal text-ink-faint">
          · slices are contributing biobanks (hover for exact N) · click to view
          that stratum
        </span>
      </h2>

      {/* Two layouts, swapped by CSS display (not conditional render, so both
          mount — cheap for 7 small pies, and it means every pie's hover/select
          state stays wired up regardless of which is visible).
          >=1120px: CSS grid with the meta pies in a `subgrid` box. A subgrid
          item inherits its parent's *resolved* track sizes and gutters — so
          when the outer grid's `justify-between` pads out the gaps between
          columns, the box's internal All↔non-EUR gap (which subgrid maps onto
          that same shared gutter) grows by the same amount, not just the gaps
          around the box. That's the one thing plain flex couldn't do: a
          flex-item box has no way to reach into a sibling's distributed
          spacing. Column count is data-driven (a phenotype can be missing an
          ancestry), hence the inline `gridTemplateColumns`/`gridColumn`
          instead of a static Tailwind class.
          <1120px: back to flex-wrap with a tinted chip per meta pie (see the
          mobile-safe reasoning below) — grid has no equivalent of flex-wrap,
          so a box spanning two grid columns has nothing sensible to do once
          pies start dropping onto separate lines. */}
      <div
        className="hidden items-start justify-between gap-1 min-[1120px]:grid"
        style={{ gridTemplateColumns: `repeat(${built.stratumPies.length + built.metaPies.length}, auto)` }}
      >
        {built.stratumPies.map(render)}
        {built.metaPies.length > 0 && (
          <div
            title="Meta-analyses"
            className="grid items-start gap-1 rounded-lg border border-line p-1"
            style={{ gridColumn: `span ${built.metaPies.length}`, gridTemplateColumns: 'subgrid' }}
          >
            {built.metaPies.map(render)}
          </div>
        )}
      </div>

      {/* Each pie's legend fades in over two steps (see SliceLegend): swatches
          + percentages from 1120px, names from `xl`.
          Each meta pie gets its own outlined chip rather than a shared left
          divider between them — a divider only reads as a boundary when "All"
          lands mid-row; on a phone, flex-wrap puts every pie on its own line
          (or two per line) and a stray vertical tick in front of a lone pie
          looks like a rendering glitch, not a label. A per-pie chip carries its
          own meaning regardless of where it wraps to. */}
      <div className="flex flex-wrap items-start justify-between gap-1 min-[1120px]:hidden">
        {built.stratumPies.map(render)}
        {built.metaPies.map((p) => (
          <div
            key={p.anc}
            title="Meta-analyses"
            className="rounded-lg border border-line p-1"
          >
            {render(p)}
          </div>
        ))}
      </div>

      <PieTip tip={tip} />
    </section>
  )
}
