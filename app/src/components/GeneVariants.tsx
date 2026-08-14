import { useEffect, useMemo, useRef, useState } from 'react'
import type { CellContext, ColumnDef, SortingState } from '@tanstack/react-table'
import {
  fetchExonShard,
  fetchGeneVariants,
  fetchGeneVariantsAnc,
  HttpError,
} from '../data/client'
import type { PhenotypeMeta } from '../data/types'
import { useAsync } from '../lib/useAsync'
import {
  variantAncRows,
  variantForest,
  variantRows,
  type VariantRow,
} from '../lib/select'
import { ANCESTRIES, ANCESTRY_META, SIG_VARIANT } from '../lib/constants'
import { fmtBeta, fmtCount, fmtP, fmtPLog, fmtPos } from '../lib/format'
import {
  exportP,
  slug,
  type ExportColumn,
  type TableExport,
} from '../lib/exportTable'
import { Notice, Spinner } from './ui'
import { DirDot, MagnitudeBar, SigDot } from './indicators'
import { FilterRow } from './TableFilters'
import Tip from './Tip'
import VirtualTable from './VirtualTable'
import LocusZoom from './LocusZoom'
import VariantForest from './VariantForest'

/** Threshold filter for the gene-page variant section — shared by the locus
 *  plot and the table below it, so filtering one filters both. N (eff.) and
 *  I² only exist in the cross-ancestry meta (see the module doc comment
 *  below), so those two thresholds are inert in stratum mode. */
interface VariantFilter {
  minLp: number
  minAbsBeta: number
  minNe: number
  minI2: number
}
const NO_VARIANT_FILTER: VariantFilter = { minLp: 0, minAbsBeta: 0, minNe: 0, minI2: 0 }
const SIG_LP_VARIANT = -Math.log10(SIG_VARIANT)

function passesVariantFilter(f: VariantFilter, r: VariantRow): boolean {
  if (f.minLp > 0 && !(r.lp != null && r.lp >= f.minLp)) return false
  if (f.minAbsBeta > 0 && !(r.beta != null && Math.abs(r.beta) >= f.minAbsBeta))
    return false
  if (f.minNe > 0 && !(r.ne != null && r.ne >= f.minNe)) return false
  if (f.minI2 > 0 && !(r.i2 != null && r.i2 >= f.minI2)) return false
  return true
}

/**
 * Variant-level (v2) view for a gene × selected phenotype: a locuszoom of every
 * variant in the gene region, a sortable table, and — on selecting a variant —
 * its multi-ancestry forest. Variant→gene is by position overlap; there are no
 * per-variant functional annotations in the data.
 *
 * `ancIdx` follows the page's ancestry filter: 0 (`All`) reads the cross-ancestry
 * meta from the main file, any other stratum reads the per-ancestry file (also
 * used by the forest, so the two share one cached fetch). Per-ancestry slices
 * carry only beta/se/lp, so the N (eff.) and I² columns are dropped for strata.
 *
 * In meta mode N (eff.) carries a `MagnitudeBar` normalised to the largest N in
 * the table, so uneven biobank contribution is scannable down the column. A
 * stratum has no per-variant N in the data at all — extending the meter to
 * strata, or to a per-ancestry breakdown, needs a variant ETL re-run; see
 * docs/ui-followups.md.
 */
export default function GeneVariants({
  ensg,
  symbol,
  phenoIdx,
  ancIdx,
  trait,
  split,
  start,
  end,
  chr,
  seekVariant,
}: {
  ensg: string
  symbol: string
  phenoIdx: number
  ancIdx: number
  trait: PhenotypeMeta
  split: boolean
  start?: number
  end?: number
  chr?: string | null
  /**
   * Deep-linked variant to auto-select once its row loads (e.g. from the
   * phenotype page's variant table, which only has chr/pos + an approximate
   * lp — no ref/alt — so the match is by position, breaking multi-allelic
   * ties by nearest lp). Only resolved against the cross-ancestry meta rows:
   * that's the stratum the phenotype page's overview data is drawn from.
   */
  seekVariant?: { pos: number; lp: number } | null
}) {
  const { data, loading, error } = useAsync(
    () => fetchGeneVariants(ensg, phenoIdx, split),
    [ensg, phenoIdx, split],
  )

  // Exon structure for the gene model track / exon-collapsed axis. Bundled and
  // chromosome-sharded, so this resolves well before the variant fetch; a miss
  // just means the plot falls back to a plain genomic axis.
  const exons = useAsync(
    () => (chr ? fetchExonShard(chr) : Promise.resolve(null)),
    [chr],
  )
  const model = (chr && exons.data?.genes[ensg]) || null

  const [selected, setSelected] = useState<VariantRow | null>(null)
  useEffect(() => setSelected(null), [ensg, phenoIdx])
  // A variant present in the meta may be absent from the chosen stratum, so drop
  // the selection when the ancestry changes rather than showing a stale forest.
  useEffect(() => setSelected(null), [ancIdx])

  // Resolve a deep-linked variant once, the first time its row is available —
  // a ref (not state) so it doesn't refight the user's own later selections
  // when `rows` is recomputed for an unrelated reason (e.g. a re-fetch).
  const seekedVariant = useRef(false)
  useEffect(() => {
    seekedVariant.current = false
  }, [ensg, phenoIdx])

  // Per-ancestry file: needed up front when a stratum is selected (it backs the
  // table), otherwise lazily once a variant is clicked (it backs the forest).
  const needAnc = ancIdx !== 0 || selected != null
  const anc = useAsync(
    () =>
      needAnc ? fetchGeneVariantsAnc(ensg, phenoIdx, split) : Promise.resolve(null),
    [ensg, phenoIdx, split, needAnc],
  )

  const rows = useMemo(() => {
    if (ancIdx === 0) return data ? variantRows(data, phenoIdx) : []
    return anc.data ? variantAncRows(anc.data, ancIdx, phenoIdx) : []
  }, [data, anc.data, ancIdx, phenoIdx])

  useEffect(() => {
    if (seekedVariant.current || !seekVariant || ancIdx !== 0 || rows.length === 0) return
    let best: VariantRow | null = null
    let bestD = Infinity
    for (const r of rows) {
      if (r.pos !== seekVariant.pos) continue
      const d = r.lp != null ? Math.abs(r.lp - seekVariant.lp) : Infinity
      if (d < bestD) {
        bestD = d
        best = r
      }
    }
    if (best) {
      seekedVariant.current = true
      setSelected(best)
    }
  }, [seekVariant, ancIdx, rows])

  const forestRows = useMemo(
    () =>
      data && selected
        ? variantForest(
            data,
            anc.data,
            phenoIdx,
            selected.pos,
            selected.ref,
            selected.alt,
          )
        : [],
    [data, anc.data, selected, phenoIdx],
  )

  const isMeta = ancIdx === 0
  const stratum = ANCESTRY_META[ANCESTRIES[ancIdx]]

  const [filter, setFilter] = useState<VariantFilter>(NO_VARIANT_FILTER)

  // Slider domains, from the unfiltered rows so they don't shrink as the user
  // narrows the filter (a slider whose own max keeps dropping is disorienting).
  const { maxLp, maxAbsBeta, maxNe } = useMemo(() => {
    let lp = 0
    let b = 0
    let n = 0
    for (const r of rows) {
      if (r.lp != null) lp = Math.max(lp, r.lp)
      if (r.beta != null) b = Math.max(b, Math.abs(r.beta))
      if (r.ne != null) n = Math.max(n, r.ne)
    }
    return { maxLp: lp, maxAbsBeta: b, maxNe: n }
  }, [rows])

  // Shared by the locus plot and the table below it, so filtering one filters
  // both — matches the phenotype page's Manhattan/table linkage.
  const filteredRows = useMemo(
    () => rows.filter((r) => passesVariantFilter(filter, r)),
    [rows, filter],
  )

  // In stratum mode the table's rows come from the ancestry file, so wait on it
  // too — otherwise it flashes the "no variants" state while that fetch is open.
  if (loading || (!isMeta && anc.loading)) return <Spinner label="Loading variants…" />
  if (error)
    return error instanceof HttpError && error.status === 404 ? (
      <Notice title="No variant data for this gene">
        {trait.name} variants aren’t in the current (sample) data release.
      </Notice>
    ) : (
      <Notice title="Could not load variants">{String(error.message)}</Notice>
    )
  if (!isMeta && anc.error)
    return (
      <Notice title={`Could not load ${stratum.label} variants`}>
        {String(anc.error.message)}
      </Notice>
    )
  if (!data || rows.length === 0)
    return (
      <p className="py-6 text-center text-sm text-ink-faint">
        No variants tested in this gene for {trait.name}
        {isMeta ? '' : ` in ${stratum.long}`}.
        {!isMeta && ' Try the All-ancestry meta.'}
      </p>
    )

  return (
    <div className="space-y-3">
      <LocusZoom
        variants={filteredRows}
        start={start}
        end={end}
        chr={chr}
        type={trait.type}
        onSelect={setSelected}
        selected={selected}
        model={model}
      />

      {selected && (
        <div className="rounded-lg border border-line bg-surface-alt p-2">
          <div className="flex items-baseline justify-between px-1 pb-1">
            <h3 className="tnum text-[13px] font-semibold text-ink">
              {chr ? `chr${chr}:` : ''}
              {fmtPos(selected.pos)} {selected.ref}›{selected.alt}
            </h3>
            <button
              onClick={() => setSelected(null)}
              className="text-xs text-ink-faint hover:text-ink"
            >
              close ✕
            </button>
          </div>
          <VariantForest
            rows={forestRows}
            trait={trait}
            loading={anc.loading}
            label={`${chr ? `chr${chr}-` : ''}${selected.pos}-${selected.ref}-${selected.alt}`}
            symbol={symbol}
          />
        </div>
      )}

      <VariantFilterBar
        filter={filter}
        onChange={setFilter}
        isMeta={isMeta}
        maxLp={maxLp}
        maxAbsBeta={maxAbsBeta}
        maxNe={maxNe}
      />

      <VariantTable
        rows={filteredRows}
        totalCount={rows.length}
        maxAbsBeta={maxAbsBeta}
        maxNe={maxNe}
        ensg={ensg}
        symbol={symbol}
        trait={trait}
        chr={chr}
        ancIdx={ancIdx}
        selected={selected}
        onSelect={setSelected}
      />
    </div>
  )
}

/**
 * gnomAD variant page for a BRaVa variant. Both are GRCh38 and gnomAD's variant
 * id is the same `chrom-pos-ref-alt` we store, so no liftover or lookup is
 * needed — this is a plain outbound link, NOT the rate-limited gnomAD API.
 * Deliberately no `?dataset=` param: the bare URL follows whatever gnomAD's
 * current default release is, so these links survive future gnomAD versions.
 */
export function gnomadVariantUrl(
  chr: string,
  pos: number,
  ref: string,
  alt: string,
): string {
  return `https://gnomad.broadinstitute.org/variant/${chr}-${pos}-${ref}-${alt}`
}

/**
 * Small "open in gnomAD" affordance beside a variant id. Ultra-rare variants
 * may not exist in gnomAD (it then shows its own not-found page), so this stays
 * visually quiet — faint until hovered. Clicks are stopped from bubbling so
 * following the link doesn't also open the row's ancestry forest.
 */
function GnomadLink({ chr, row }: { chr: string; row: VariantRow }) {
  return (
    // shrink-0 on the Tip wrapper, not just the anchor: the wrapper span is the
    // flex item here, so without it the icon squeezes to nothing on long indels.
    <Tip label="View in gnomAD" className="inline-flex shrink-0 items-center">
      <a
        href={gnomadVariantUrl(chr, row.pos, row.ref, row.alt)}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        aria-label={`View chr${chr}:${row.pos} ${row.ref}>${row.alt} in gnomAD`}
        className="shrink-0 text-ink-faint transition-colors hover:text-brand"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-3 w-3"
          aria-hidden="true"
        >
          <path d="M14 4h6v6" />
          <path d="M20 4l-8.5 8.5" />
          <path d="M18 14.5V19a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h4.5" />
        </svg>
      </a>
    </Tip>
  )
}

/**
 * Tooltip text for an N (eff.) cell: the exact count the cell abbreviates, plus
 * the meter's denominator spelled out — a bar normalised to the table's own max
 * is a *relative* read, so a full bar means "best-supported variant here", not
 * "well powered". Phrasing follows the gene table's grid tooltips ("P = …",
 * "no data" for a null) in [ancestryColumns.tsx].
 */
function neLabel(ne: number | undefined, max: number): string {
  if (ne == null) return 'no data'
  const exact = `N (eff.) = ${Math.round(ne).toLocaleString()}`
  if (max <= 0) return exact
  return `${exact} · ${Math.round((100 * ne) / max)}% of max (${Math.round(max).toLocaleString()})`
}

/**
 * Threshold strip between the locus plot and the table: P/β always apply
 * (both are present in every stratum), N (eff.)/I² only in meta mode (see
 * `VariantFilter`'s doc comment). Filters both — it sits above the table but
 * `filteredRows` (computed from the same `filter` state) is also what feeds
 * the plot above it. Bespoke rather than the shared `TableFilters` default
 * export — that component is hardcoded to two axes and the gene-level
 * significance threshold, whereas this needs up to four axes and the
 * variant-level one.
 */
function VariantFilterBar({
  filter,
  onChange,
  isMeta,
  maxLp,
  maxAbsBeta,
  maxNe,
}: {
  filter: VariantFilter
  onChange: (next: VariantFilter) => void
  isMeta: boolean
  maxLp: number
  maxAbsBeta: number
  maxNe: number
}) {
  const active =
    filter.minLp > 0 || filter.minAbsBeta > 0 || filter.minNe > 0 || filter.minI2 > 0
  const betaMax = maxAbsBeta > 0 ? Math.ceil(maxAbsBeta * 20) / 20 : 1
  const lpMax = Math.max(Math.ceil(maxLp), Math.ceil(SIG_LP_VARIANT))
  const neMax = maxNe > 0 ? Math.ceil(maxNe / 100) * 100 : 100
  const sigOn = filter.minLp >= SIG_LP_VARIANT - 1e-9

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface px-3 py-1.5">
      <FilterRow
        label="P ≤"
        kind="p"
        min={0}
        max={lpMax}
        step={0.1}
        stored={filter.minLp}
        onChange={(minLp) => onChange({ ...filter, minLp })}
      />
      <FilterRow
        // normal-case: see the matching comment on the gene table's own β row
        // in TableFilters.tsx — uppercase turns β (U+03B2) into a Greek
        // capital Β, a dead ringer for Latin "B".
        label={
          <>
            |<span className="normal-case">β</span>| ≥
          </>
        }
        kind="beta"
        min={0}
        max={betaMax}
        step={betaMax / 100}
        stored={filter.minAbsBeta}
        onChange={(minAbsBeta) => onChange({ ...filter, minAbsBeta })}
      />
      {isMeta && (
        <>
          <FilterRow
            // normal-case: matches the table's own "N (eff.)" column header —
            // uppercase turned "(eff.)" into a shouty "(EFF.)".
            label={
              <>
                N <span className="normal-case">(eff.)</span> ≥
              </>
            }
            kind="n"
            min={0}
            max={neMax}
            step={Math.max(1, Math.round(neMax / 100))}
            stored={filter.minNe}
            onChange={(minNe) => onChange({ ...filter, minNe })}
          />
          <FilterRow
            label="I² ≥"
            kind="i2"
            min={0}
            max={100}
            step={1}
            stored={filter.minI2}
            onChange={(minI2) => onChange({ ...filter, minI2 })}
          />
        </>
      )}
      <button
        type="button"
        onClick={() => onChange({ ...filter, minLp: sigOn ? 0 : SIG_LP_VARIANT })}
        aria-pressed={sigOn}
        title={`Variant-level significance · P < ${fmtP(SIG_VARIANT)}`}
        className={`rounded-md border px-2 py-0.5 text-xs font-medium transition ${
          sigOn
            ? 'border-brand bg-brand/10 text-brand'
            : 'border-line text-ink-soft hover:border-brand hover:text-brand'
        }`}
      >
        genome-wide
      </button>
      {active && (
        <button
          type="button"
          onClick={() => onChange(NO_VARIANT_FILTER)}
          className="text-xs text-ink-faint hover:text-ink hover:underline"
        >
          reset
        </button>
      )}
    </div>
  )
}

/**
 * Header tooltip text for the variant-table columns. Deliberately terse — one
 * sentence saying what the number is, no restating of what the dots and bars in
 * the cells already show. Two are context-dependent: p-value reads differently
 * for the meta than for one stratum, and β's units follow the trait type.
 */
function columnHelp(
  isMeta: boolean,
  ancLong: string,
  type: PhenotypeMeta['type'],
): Record<'variant' | 'lp' | 'beta' | 'ne' | 'i2', string> {
  // GWAS-VCF convention (these files' ES/SE/LP/NE keys): the effect allele is ALT.
  const units = type === 'binary' ? 'log-odds units (log OR)' : 'trait SD units'
  return {
    variant: 'GRCh38 position and alleles (reference›alternate).',
    lp: isMeta
      ? 'Association p-value from the cross-ancestry meta-analysis.'
      : `Association p-value within the ${ancLong} stratum.`,
    beta: `Effect size for the alternate allele, in ${units}.`,
    // Verified against the raw VCFs: per stratum NE = 4 / (1/N_case + 1/N_ctrl),
    // summed over the strata that contributed to the variant. So for a binary
    // trait it tracks the rarer class, not the headcount.
    ne:
      type === 'binary'
        ? 'Effective sample size, set by the case/control balance — far below the total N when cases are rare.'
        : 'Effective sample size contributing to this variant.',
    i2: "Cochran's I²: how much of the effect-size variation between strata is real disagreement rather than chance. Blank when only one stratum contributes.",
  }
}

function VariantTable({
  rows,
  totalCount,
  maxAbsBeta,
  maxNe,
  ensg,
  symbol,
  trait,
  chr,
  ancIdx,
  selected,
  onSelect,
}: {
  rows: VariantRow[]
  /** Unfiltered row count, for the caption's "N of M variants" when the
   *  filter bar above has narrowed `rows`. */
  totalCount: number
  /**
   * Direction-dot / N-meter normalisation, computed by the caller over every
   * loaded row (see the module doc comment) — not over `rows` here, which may
   * be the filter bar's narrowed subset. Bars must keep a fixed meaning as the
   * filter changes rather than rescaling under the cursor, same reasoning as
   * the previous "not the sorted row model" note this replaces.
   */
  maxAbsBeta: number
  maxNe: number
  ensg: string
  symbol: string
  trait: PhenotypeMeta
  chr?: string | null
  ancIdx: number
  /** The variant currently shown in the forest panel above, if any. */
  selected: VariantRow | null
  onSelect: (v: VariantRow) => void
}) {
  const isMeta = ancIdx === 0
  const [sorting, setSorting] = useState<SortingState>([{ id: 'lp', desc: true }])

  const columns = useMemo<ColumnDef<VariantRow, any>[]>(() => {
    const help = columnHelp(isMeta, ANCESTRY_META[ANCESTRIES[ancIdx]].long, trait.type)
    return [
      {
        id: 'variant',
        header: 'Variant',
        accessorFn: (r) => r.pos,
        size: 205,
        // `fill` (own layout, no wrapping truncate span) so the gnomAD link
        // keeps its pixels: long indel alleles overflow this column, and inside
        // the default truncating wrapper a trailing icon would be clipped away.
        meta: { fill: true, help: help.variant },
        cell: (c) => {
          const r = c.row.original
          return (
            <div className="flex w-full min-w-0 items-center gap-1 px-2 whitespace-nowrap">
              <span className="tnum truncate text-ink">
                {chr ? `chr${chr}:` : ''}
                {fmtPos(r.pos)}{' '}
                <span className="text-ink-soft">
                  {r.ref}›{r.alt}
                </span>
              </span>
              {chr && <GnomadLink chr={chr} row={r} />}
            </div>
          )
        },
      },
      // Nullable numerics go through `?? undefined` + sortUndefined: TanStack
      // only special-cases `undefined`, and `null` falls through to its
      // compareBasic, where `null === 0`, `null > 0` and `0 > null` are all
      // false — an inconsistent comparator that interleaves blanks with 0.
      {
        id: 'lp',
        header: 'P-value',
        accessorFn: (r) => r.lp ?? undefined,
        sortUndefined: 'last',
        size: 120,
        meta: { help: help.lp },
        cell: (c) => (
          <span className="tnum inline-flex items-center gap-1.5">
            <SigDot lp={c.getValue<number | undefined>()} kind="variant" />
            {fmtPLog(c.getValue<number | undefined>())}
          </span>
        ),
      },
      {
        id: 'beta',
        header: 'Beta',
        accessorFn: (r) => r.beta ?? undefined,
        sortUndefined: 'last',
        size: 110,
        meta: { help: help.beta },
        cell: (c) => {
          const b = c.getValue<number | undefined>()
          return (
            <span className="tnum inline-flex items-center gap-1.5">
              <DirDot
                beta={b}
                type={trait.type}
                intensity={
                  b != null && maxAbsBeta > 0 ? Math.abs(b) / maxAbsBeta : undefined
                }
              />
              {fmtBeta(b)}
            </span>
          )
        },
      },
      // N (eff.) and I² exist only in the cross-ancestry meta slices, so they're
      // dropped for a single stratum rather than shown as a column of dashes.
      ...(isMeta
        ? [
            {
              id: 'ne',
              header: 'N (eff.)',
              accessorFn: (r: VariantRow) => r.ne ?? undefined,
              sortUndefined: 'last' as const,
              size: 134,
              // `fill` (own layout, no truncating wrapper) so the meter keeps its
              // pixels, and the count sits in a fixed-width span so every bar
              // starts at the same x — bars only compare from a shared origin.
              meta: { fill: true, help: help.ne },
              cell: (c: CellContext<VariantRow, any>) => {
                const v = c.getValue<number | undefined>()
                return (
                  // Tip (not a native title) for the same snappy reveal as the
                  // gene table's grid, and it claims the whole cell — h-full
                  // w-full, which meta.fill makes possible — because a 2px
                  // sliver bar would otherwise be an awful hover target. Same
                  // reasoning as CELL_HIT in [ancestryColumns.tsx].
                  <Tip
                    label={neLabel(v, maxNe)}
                    className="flex h-full w-full min-w-0 items-center gap-2 px-2 whitespace-nowrap"
                  >
                    <span className="tnum w-[46px] shrink-0">{fmtCount(v)}</span>
                    <MagnitudeBar value={v} max={maxNe} />
                  </Tip>
                )
              },
            },
            {
              id: 'i2',
              header: 'I²',
              accessorFn: (r: VariantRow) => r.i2 ?? undefined,
              sortUndefined: 'last' as const,
              size: 70,
              meta: { help: help.i2 },
              cell: (c: CellContext<VariantRow, any>) => {
                // i2 is Cochran's I² already in percent (0–100); '—' when a single
                // biobank contributes (heterogeneity undefined for one study), which
                // sorts apart from a genuine 0% thanks to sortUndefined.
                const v = c.getValue<number | undefined>()
                return (
                  <span className="tnum text-ink-soft">
                    {v == null ? '—' : `${Math.round(v)}%`}
                  </span>
                )
              },
            },
          ]
        : []),
    ]
  }, [chr, trait.type, maxAbsBeta, maxNe, isMeta, ancIdx])

  // The meta-only fields (N, I², Cochran's Q) are exported only in meta mode —
  // in a stratum the pipeline doesn't emit them, so the columns would be a wall
  // of blanks, which is also why the table itself drops them (see the note on
  // this component). `se` and `n_cases` aren't table columns but are already
  // loaded and are what a reader needs to recompute a CI, so they ship too.
  const exportSpec = useMemo<TableExport<VariantRow>>(() => {
    const anc = ANCESTRIES[ancIdx]
    const metaOnly: ExportColumn<VariantRow>[] = isMeta
      ? [
          { header: 'n_cases', value: (r) => r.nc },
          { header: 'n_eff', value: (r) => r.ne },
          { header: 'i2', value: (r) => r.i2 },
          { header: 'cochran_q', value: (r) => r.cq },
        ]
      : []
    return {
      noun: 'variants',
      filename: `brava_${slug(symbol)}_${slug(trait.id)}_${slug(anc)}_variants.tsv`,
      columns: [
        { header: 'gene', value: () => symbol },
        { header: 'ensembl_gene_id', value: () => ensg },
        { header: 'phenotype_id', value: () => trait.id },
        { header: 'phenotype', value: () => trait.name },
        { header: 'ancestry', value: () => anc },
        { header: 'chrom', value: () => chr ?? null },
        { header: 'pos', value: (r) => r.pos },
        { header: 'ref', value: (r) => r.ref },
        { header: 'alt', value: (r) => r.alt },
        { header: 'P', value: (r) => exportP(r.lp) },
        { header: 'neglog10P', value: (r) => r.lp },
        { header: 'beta', value: (r) => r.beta },
        { header: 'se', value: (r) => r.se },
        ...metaOnly,
      ],
    }
  }, [symbol, ensg, trait.id, trait.name, chr, ancIdx, isMeta])

  const caption = (
    <span>
      <span className="font-semibold text-ink-soft">{rows.length.toLocaleString()}</span>
      {rows.length !== totalCount && ` of ${totalCount.toLocaleString()}`}{' '}
      variants · {trait.name} ·{' '}
      {isMeta
        ? 'cross-ancestry meta'
        : `${ANCESTRY_META[ANCESTRIES[ancIdx]].long} only`}{' '}
      · position-based (no functional annotation) · click a row for the ancestry
      forest
      {!isMeta && ' · N (eff.) and I² are only available for All ancestries'}
    </span>
  )

  return (
    <VirtualTable
      data={rows}
      columns={columns}
      sorting={sorting}
      onSortingChange={setSorting}
      onRowClick={onSelect}
      isRowSelected={(r) =>
        selected != null &&
        r.pos === selected.pos &&
        r.ref === selected.ref &&
        r.alt === selected.alt
      }
      caption={caption}
      exportSpec={exportSpec}
    />
  )
}
