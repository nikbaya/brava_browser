import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import StickyTitle from '../components/StickyTitle'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { useIndex } from '../data/IndexContext'
import { fetchGene, fetchVariantSplit, HttpError } from '../data/client'
import type { GeneData, PhenotypeMeta } from '../data/types'
import { useAsync } from '../lib/useAsync'
import { forestSeries, geneAncestryGrid, geneRows, type GridRow } from '../lib/select'
import {
  ANCESTRY_INDEX,
  ANCESTRY_META,
  DEFAULTS,
  MASK_META,
  MAF_META,
  type Ancestry,
} from '../lib/constants'
import { fmtPos } from '../lib/format'
import { pinToTop } from '../lib/scroll'
import { slug, type ExportColumn, type TableExport } from '../lib/exportTable'
import { Notice, Spinner } from '../components/ui'
import FilterBar, { type FilterState } from '../components/FilterBar'
import TableFilters, {
  NO_TABLE_FILTER,
  passesTableFilter,
  type TableFilter,
} from '../components/TableFilters'
import {
  ancestryExportColumns,
  ancestryGridColumns,
  BetaLegend,
  hetColumn,
  hetExportColumn,
} from '../components/ancestryColumns'
import PheWASPlot, { type PheWASPoint } from '../components/PheWASPlot'
import ForestPlot from '../components/ForestPlot'
import PhenoPicker from '../components/PhenoPicker'
import VirtualTable from '../components/VirtualTable'
import GeneVariants from '../components/GeneVariants'
import CopyLinkButton from '../components/CopyLinkButton'

/**
 * Deep link to the variant-level section: `#/gene/PCSK9?section=variants&…`.
 *
 * Only what that section actually depends on is carried — the phenotype it is
 * showing and the ancestry stratum. Mask/MAF/test qualify the *gene-level*
 * numbers; single-variant results have no mask, so pinning them in the link
 * would suggest they narrow what the recipient sees. `variant` additionally
 * seeks a specific row (see GeneVariants' `seekVariant` doc) — pos + an
 * approximate lp, since that's all a caller like the phenotype page's
 * pixel-decimated overview table has (no ref/alt there).
 */
const VARIANTS_SECTION = 'variants'

function variantSectionQuery(
  phenoId: string,
  ancestry: Ancestry,
  variant?: { pos: number; lp: number },
): URLSearchParams {
  const q = new URLSearchParams({ section: VARIANTS_SECTION, pheno: phenoId })
  if (ancestry !== DEFAULTS.ancestry) q.set('anc', ancestry)
  if (variant) {
    q.set('pos', String(variant.pos))
    q.set('lp', variant.lp.toFixed(2))
  }
  return q
}

function variantShareUrl(
  geneParam: string,
  phenoId: string,
  ancestry: Ancestry,
): string {
  const q = variantSectionQuery(phenoId, ancestry)
  // HashRouter: everything after `#` is the route, so the shared URL is the
  // current document URL with a freshly built hash.
  return `${window.location.href.split('#')[0]}#/gene/${encodeURIComponent(geneParam)}?${q}`
}

/**
 * In-app (React Router `to`) path to a gene's variant section, optionally
 * seeking a specific variant. Unlike `variantShareUrl` (an absolute URL for
 * copy-to-clipboard sharing), this is router-relative — for a plain in-app
 * `<Link>`, e.g. from the phenotype page's variant table. Always the
 * cross-ancestry meta: that's the only stratum the overview table's rows
 * are drawn from.
 */
export function variantSectionPath(
  geneParam: string,
  phenoId: string,
  variant?: { pos: number; lp: number },
): string {
  const q = variantSectionQuery(phenoId, DEFAULTS.ancestry, variant)
  return `/gene/${encodeURIComponent(geneParam)}?${q}`
}

export default function GenePage() {
  const { id } = useParams()
  const { geneIndex, phenotypes, resolveGene, loading: idxLoading } = useIndex()

  const resolved = id ? resolveGene(id) : null
  // Fall back to treating the param as an ENSG if it isn't in the index.
  const ensg = resolved?.ensg ?? (id?.startsWith('ENSG') ? id : null)
  const gi = resolved?.idx ?? null

  // Shared-link parameters (see variantShareUrl). Read once, at mount: they seed
  // the view rather than driving it, so the user's later filter changes aren't
  // fighting the URL.
  const [search] = useSearchParams()
  const [filters, setFilters] = useState<FilterState>(() => {
    const anc = search.get('anc')
    return {
      ancestry: anc && anc in ANCESTRY_INDEX ? (anc as Ancestry) : DEFAULTS.ancestry,
      maskIndex: DEFAULTS.maskIndex,
      mafIndex: DEFAULTS.mafIndex,
      test: DEFAULTS.test,
    }
  })
  // Which phenotype the forest plot is focused on (null = auto = top hit).
  const [forestPheno, setForestPheno] = useState<number | null>(null)

  // Deep-linked variant to auto-select (see GeneVariants' `seekVariant` doc).
  // `lp` is optional context for disambiguating a multi-allelic position;
  // absent it just falls back to the first match at that position.
  const seekVariant = useMemo(() => {
    const posStr = search.get('pos')
    if (!posStr) return null
    const pos = Number(posStr)
    const lp = Number(search.get('lp') ?? 0)
    return Number.isFinite(pos) ? { pos, lp: Number.isFinite(lp) ? lp : 0 } : null
  }, [search])

  const { data, loading, error } = useAsync(
    () => (ensg ? fetchGene(ensg) : Promise.reject(new Error('unknown gene'))),
    [ensg],
  )

  // Manifest of genes whose variant data is split per-phenotype (tiny, cached).
  // Absent in releases without variant data -> treat as no genes split.
  const { data: variantSplit } = useAsync(
    () => fetchVariantSplit().catch(() => ({ split: [] })),
    [],
  )
  const splitSet = useMemo(
    () => new Set(variantSplit?.split ?? []),
    [variantSplit],
  )

  const ancIdx = ANCESTRY_INDEX[filters.ancestry]
  const phewasPoints = useMemo<PheWASPoint[]>(() => {
    if (!data) return []
    return geneRows(data, {
      test: filters.test,
      ancIdx,
      maskIndex: filters.maskIndex,
      mafIndex: filters.mafIndex,
    }).map((r) => ({ phenoIdx: r.phenoIdx, lp: r.lp, beta: r.beta }))
  }, [data, filters, ancIdx])

  // Phenotypes that have any data for this gene (forest dropdown options).
  const availablePhenos = useMemo(() => {
    if (!data) return []
    return [...new Set(data.pheno)]
      .map((i) => ({ idx: i, name: phenotypes[i]?.name ?? '' }))
      .filter((p) => p.name)
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [data, phenotypes])

  const topHitIdx = useMemo(() => {
    let best = -1
    let bestLp = -Infinity
    for (const p of phewasPoints)
      if (p.lp != null && p.lp > bestLp) {
        bestLp = p.lp
        best = p.phenoIdx
      }
    return best >= 0 ? best : (availablePhenos[0]?.idx ?? null)
  }, [phewasPoints, availablePhenos])

  // Seed the forest to the shared link's phenotype if there is one, else to the
  // gene's top hit, once its data loads — then keep that phenotype fixed. The
  // `seeded` latch is what pins it: `topHitIdx` is filter-derived, so without it
  // the forest would be hijacked whenever the user changed a mask/MAF/test/
  // ancestry filter. Filters should update the shown phenotype's numbers, not
  // swap phenotypes.
  const seeded = useRef(false)
  useEffect(() => {
    seeded.current = false
  }, [ensg])
  useEffect(() => {
    if (seeded.current || !data) return
    const want = search.get('pheno')
    if (want) {
      // Resolving the id needs the phenotype index, which may still be in
      // flight. Wait for it rather than seeding the top hit and silently
      // dropping the link's phenotype a moment later.
      if (!phenotypes.length) return
      const hit = availablePhenos.find((p) => phenotypes[p.idx]?.id === want)
      if (hit) {
        seeded.current = true
        setForestPheno(hit.idx)
        return
      }
    }
    if (topHitIdx != null) {
      seeded.current = true
      setForestPheno(topHitIdx)
    }
  }, [data, phenotypes, availablePhenos, topHitIdx, search, ensg])

  // Deep link / in-page jump to the variant section.
  const variantsRef = useRef<HTMLElement>(null)
  const jumped = useRef(false)
  /** Cancels the in-flight scroll pin (see pinToTop). */
  const unpin = useRef<(() => void) | null>(null)
  const wantVariants = search.get('section') === VARIANTS_SECTION || seekVariant != null

  const forestIdx = forestPheno ?? topHitIdx
  const forest = useMemo(
    () =>
      data && forestIdx != null
        ? forestSeries(data, {
            phenoIdx: forestIdx,
            maskIndex: filters.maskIndex,
            mafIndex: filters.mafIndex,
          })
        : null,
    [data, forestIdx, filters.maskIndex, filters.mafIndex],
  )

  // Land a shared link on the variant section as soon as it exists, and hold it
  // there while the plot and table stream in (see pinToTop — until they arrive
  // the page is too short for the heading to reach the top). Instant rather than
  // smooth: an animated glide down a freshly loaded page reads as a glitch, not
  // as navigation.
  useEffect(() => {
    if (!wantVariants || jumped.current || !variantsRef.current) return
    jumped.current = true
    requestAnimationFrame(() => {
      unpin.current?.()
      unpin.current = pinToTop(variantsRef.current, { behavior: 'auto' })
    })
  }, [wantVariants, data, loading, forestIdx])

  // Release the pin if the page goes away mid-load — it listens on `window`.
  useEffect(() => () => unpin.current?.(), [])

  const jumpToVariants = () => {
    unpin.current?.()
    unpin.current = pinToTop(variantsRef.current, { behavior: 'smooth' })
  }

  if (idxLoading) return <Spinner label="Loading…" />

  if (!ensg)
    return (
      <div className="px-4 py-16">
        <Notice title="Gene not found">
          “{id}” didn’t match a gene symbol or Ensembl ID.
        </Notice>
      </div>
    )

  const symbol = (gi != null && geneIndex?.symbols[gi]) || ensg
  const chr = gi != null ? geneIndex?.chr[gi] : undefined
  const start = gi != null ? geneIndex?.start[gi] : undefined
  const end = gi != null ? geneIndex?.end[gi] : undefined
  const forestTrait = forestIdx != null ? phenotypes[forestIdx] : undefined

  return (
    <>
      <StickyTitle>
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h1 className="text-xl font-semibold text-ink">{symbol}</h1>
              <span className="tnum text-xs text-ink-faint">
                {ensg}
                {chr && start && end && (
                  <>
                    {' · '}chr{chr}:{fmtPos(start)}–{fmtPos(end)}
                  </>
                )}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {/* Single-variant results sit below three gene-level sections, so
                  they were being missed entirely. This jump chip advertises them
                  from the header; it's rendered only once the section it targets
                  exists, so it can never scroll to nothing. Brand-tinted and
                  separated from the external-database chips beside it — those
                  leave the site, this one moves within the page. */}
              {data && !loading && forestIdx != null && (
                <>
                  <button
                    type="button"
                    onClick={jumpToVariants}
                    className="rounded-md border border-brand/40 bg-brand/10 px-2.5 py-1 font-medium text-brand transition hover:border-brand hover:bg-brand/15"
                  >
                    Variants ↓
                  </button>
                  <span className="mx-0.5 h-4 w-px bg-line" aria-hidden="true" />
                </>
              )}
              {/* No `?dataset=` param: the bare URL follows gnomAD's current
                  default release, so this keeps working past r4 instead of
                  pinning a version that ages out. Matches `gnomadVariantUrl`
                  in GeneVariants.tsx. */}
              <Ext href={`https://gnomad.broadinstitute.org/gene/${ensg}`}>gnomAD</Ext>
              <Ext href={`https://app.genebass.org/gene/${ensg}`}>Genebass</Ext>
              {/* Open Targets keys targets by Ensembl gene ID, so `ensg` drops
                  straight in — no symbol lookup or cross-reference needed. Deep
                  link to /associations (the disease-association table) rather
                  than the target overview: it's the closest analogue to what
                  this page shows. */}
              <Ext href={`https://platform.opentargets.org/target/${ensg}/associations`}>
                Open Targets
              </Ext>
              {symbol !== ensg && (
                <Ext href={`https://www.genecards.org/cgi-bin/carddisp.pl?gene=${symbol}`}>
                  GeneCards
                </Ext>
              )}
            </div>
          </div>
          <FilterBar value={filters} onChange={setFilters} />
        </div>
      </StickyTitle>

      <div className="mx-auto max-w-7xl px-4 py-4">

      {loading && <Spinner label="Loading associations…" />}
      {error &&
        (error instanceof HttpError && error.status === 404 ? (
          <Notice title="No results for this gene">
            {symbol} isn’t in the current (sample) data release. The full release
            covers all ~20,000 genes.
          </Notice>
        ) : (
          <Notice title="Could not load gene">{String(error.message)}</Notice>
        ))}

      {data && !loading && (
        <>
          <section className="mb-3 rounded-lg border border-line bg-surface p-2">
            <div className="flex flex-wrap items-baseline gap-x-2 px-1 pb-1">
              <h2 className="text-[13px] font-semibold text-ink">
                Phenome-wide associations
              </h2>
              <span className="text-xs text-ink-faint">
                {ANCESTRY_META[filters.ancestry].long} ·{' '}
                {MASK_META[filters.maskIndex].label} ·{' '}
                {MAF_META[filters.mafIndex].label} · {filters.test}
              </span>
            </div>
            <PheWASPlot
              points={phewasPoints}
              phenotypes={phenotypes}
              onSelect={setForestPheno}
            />
          </section>

          {forest && forestTrait && (
            <section className="mb-3 rounded-lg border border-line bg-surface p-2">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-[13px] font-semibold text-ink">
                    Effect across ancestries
                  </h2>
                  <PhenoPicker
                    value={forestIdx}
                    options={availablePhenos}
                    onChange={setForestPheno}
                  />
                </div>
                <Link
                  to={`/phenotype/${forestTrait.id}`}
                  className="text-xs text-brand hover:underline"
                >
                  open {forestTrait.name} →
                </Link>
              </div>
              <ForestPlot
                series={forest}
                trait={forestTrait}
                symbol={symbol}
                maskIndex={filters.maskIndex}
                mafIndex={filters.mafIndex}
              />
            </section>
          )}

          <GeneTable
            data={data}
            symbol={symbol}
            ensg={ensg}
            filters={filters}
            ancIdx={ancIdx}
            focusedPhenoIdx={forestIdx}
            onFocus={setForestPheno}
          />

          {forestIdx != null && forestTrait && (
            <section
              ref={variantsRef}
              id={VARIANTS_SECTION}
              className="mb-3 rounded-lg border border-line bg-surface p-2"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[13px] font-semibold text-ink">
                    Variants
                  </h2>
                  <PhenoPicker
                    value={forestIdx}
                    options={availablePhenos}
                    onChange={setForestPheno}
                  />
                  <CopyLinkButton
                    getUrl={() =>
                      variantShareUrl(symbol, forestTrait.id, filters.ancestry)
                    }
                    help={`Copy a link that opens ${symbol} at these single-variant results — same phenotype (${forestTrait.name}) and ancestry (${ANCESTRY_META[filters.ancestry].label})`}
                  />
                </div>
                <span className="text-xs text-ink-faint">
                  {ANCESTRY_META[filters.ancestry].long} · single-variant
                  {filters.ancestry === 'All' ? ' meta' : ''} · overlapping this gene by
                  position
                </span>
              </div>
              <GeneVariants
                ensg={ensg}
                symbol={symbol}
                phenoIdx={forestIdx}
                ancIdx={ancIdx}
                trait={forestTrait}
                split={splitSet.has(ensg)}
                start={start}
                end={end}
                chr={chr}
                seekVariant={seekVariant}
              />
            </section>
          )}
        </>
      )}
      </div>
    </>
  )
}

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="rounded-md border border-line px-2.5 py-1 font-medium text-ink-soft transition hover:border-brand hover:text-brand"
    >
      {children} ↗
    </a>
  )
}

interface GTGridRow extends GridRow {
  phenoId: string
  phenoName: string
  category: string
  traitType: PhenotypeMeta['type']
}

function GeneTable({
  data,
  symbol,
  ensg,
  filters,
  ancIdx,
  focusedPhenoIdx,
  onFocus,
}: {
  data: GeneData
  symbol: string
  ensg: string
  filters: FilterState
  ancIdx: number
  /** The phenotype whose forest plot is currently on screen (default or clicked). */
  focusedPhenoIdx: number | null
  onFocus: (phenoIdx: number) => void
}) {
  const { phenotypes } = useIndex()
  const [sorting, setSorting] = useState<SortingState>([{ id: 'p0', desc: true }])
  const [tableFilter, setTableFilter] = useState<TableFilter>(NO_TABLE_FILTER)
  const [phenoQuery, setPhenoQuery] = useState('')

  // One row per phenotype, carrying every ancestry's P + β (mask/maf/test).
  const allRows = useMemo<GTGridRow[]>(() => {
    return geneAncestryGrid(data, {
      test: filters.test,
      maskIndex: filters.maskIndex,
      mafIndex: filters.mafIndex,
    })
      .map((r) => {
        const meta = phenotypes[r.key]
        return meta
          ? {
              ...r,
              phenoId: meta.id,
              phenoName: meta.name,
              category: meta.category,
              traitType: meta.type,
            }
          : null
      })
      .filter((r): r is GTGridRow => r != null)
  }, [data, filters.test, filters.maskIndex, filters.mafIndex, phenotypes])

  // Ancestries actually present for this gene (canonical order, All first).
  const ancIdxs = useMemo(() => {
    const present = new Set<number>()
    for (const r of allRows)
      r.lp.forEach((v, a) => {
        if (v != null || r.beta[a] != null) present.add(a)
      })
    return [...present].sort((a, b) => a - b)
  }, [allRows])

  // Slider domains + the P/β threshold apply to the selected ancestry column.
  const { maxLp, maxAbsBeta } = useMemo(() => {
    let lp = 0
    let b = 0
    for (const r of allRows) {
      const l = r.lp[ancIdx]
      const bt = r.beta[ancIdx]
      if (l != null) lp = Math.max(lp, l)
      if (bt != null) b = Math.max(b, Math.abs(bt))
    }
    return { maxLp: lp, maxAbsBeta: b }
  }, [allRows, ancIdx])

  // Largest |β| across every ancestry cell — scales the effect triangles.
  const betaGridMax = useMemo(() => {
    let m = 0
    for (const r of allRows)
      for (const bt of r.beta) if (bt != null) m = Math.max(m, Math.abs(bt))
    return m
  }, [allRows])

  const rows = useMemo(() => {
    const q = phenoQuery.trim().toLowerCase()
    return allRows.filter((r) => {
      if (!passesTableFilter(tableFilter, r.lp[ancIdx], r.beta[ancIdx])) return false
      if (!q) return true
      // Name, id and category — the same three fields the header search matches
      // a phenotype on, so a query that finds a trait up there finds it here.
      return (
        r.phenoName.toLowerCase().includes(q) ||
        r.phenoId.toLowerCase().includes(q) ||
        r.category.toLowerCase().includes(q)
      )
    })
  }, [allRows, tableFilter, ancIdx, phenoQuery])

  const columns = useMemo<ColumnDef<GTGridRow, any>[]>(
    () => [
      {
        accessorKey: 'phenoName',
        header: 'Phenotype',
        size: 200,
        cell: (c) => (
          <Link
            to={`/phenotype/${c.row.original.phenoId}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-brand hover:underline"
          >
            {c.getValue<string>()}
          </Link>
        ),
      },
      {
        accessorKey: 'category',
        header: 'Category',
        size: 130,
        cell: (c) => <span className="text-ink-soft">{c.getValue<string>()}</span>,
      },
      ...ancestryGridColumns<GTGridRow>(ancIdxs, {
        highlight: ancIdx,
        betaMax: betaGridMax,
        test: filters.test,
      }),
      hetColumn<GTGridRow>(),
    ],
    [ancIdxs, ancIdx, betaGridMax, filters.test],
  )

  // Every constant that qualifies the numbers (gene, mask, MAF, test) is written
  // into each row rather than a comment header, so the file is self-describing
  // and still loads with a plain `read.delim` / `pd.read_csv(sep='\t')`.
  const exportSpec = useMemo<TableExport<GTGridRow>>(() => {
    const mask = MASK_META[filters.maskIndex]
    return {
      noun: 'phenotypes',
      filename: `brava_${slug(symbol)}_${slug(mask.short)}_maf${MAF_META[filters.mafIndex].value}_${slug(filters.test)}.tsv`,
      columns: [
        { header: 'gene', value: () => symbol },
        { header: 'ensembl_gene_id', value: () => ensg },
        { header: 'phenotype_id', value: (r) => r.phenoId },
        { header: 'phenotype', value: (r) => r.phenoName },
        { header: 'category', value: (r) => r.category },
        { header: 'trait_type', value: (r) => r.traitType },
        { header: 'variant_mask', value: () => mask.raw },
        { header: 'max_maf', value: () => MAF_META[filters.mafIndex].value },
        { header: 'test', value: () => filters.test },
        ...ancestryExportColumns<GTGridRow>(ancIdxs),
        ...hetExportColumn<GTGridRow>(),
      ] satisfies ExportColumn<GTGridRow>[],
    }
  }, [symbol, ensg, filters.maskIndex, filters.mafIndex, filters.test, ancIdxs])

  const caption = (
    <span>
      <span className="font-semibold text-ink-soft">{MASK_META[filters.maskIndex].label}</span> · MAF{' '}
      {MAF_META[filters.mafIndex].label} · {filters.test} · filter on{' '}
      {ANCESTRY_META[filters.ancestry].label} · <BetaLegend />
    </span>
  )

  return (
    <>
      <div className="mb-1.5">
        <TableFilters
          value={tableFilter}
          onChange={setTableFilter}
          maxLp={maxLp}
          maxAbsBeta={maxAbsBeta}
          search={phenoQuery}
          onSearchChange={setPhenoQuery}
          searchLabel="Phenotype"
        >
          {rows.length.toLocaleString()}
          {rows.length !== allRows.length &&
            ` of ${allRows.length.toLocaleString()}`}{' '}
          phenotypes · click a row to focus the forest
        </TableFilters>
      </div>
      <VirtualTable
        data={rows}
        columns={columns}
        sorting={sorting}
        onSortingChange={setSorting}
        onRowClick={(r) => onFocus(r.key)}
        isRowSelected={(r) => r.key === focusedPhenoIdx}
        caption={caption}
        exportSpec={exportSpec}
        reservedRows={allRows.length}
      />
    </>
  )
}
