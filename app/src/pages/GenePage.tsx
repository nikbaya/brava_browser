import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
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
} from '../lib/constants'
import { fmtPos } from '../lib/format'
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
} from '../components/ancestryColumns'
import PheWASPlot, { type PheWASPoint } from '../components/PheWASPlot'
import ForestPlot from '../components/ForestPlot'
import PhenoPicker from '../components/PhenoPicker'
import VirtualTable from '../components/VirtualTable'
import GeneVariants from '../components/GeneVariants'

export default function GenePage() {
  const { id } = useParams()
  const { geneIndex, phenotypes, resolveGene, loading: idxLoading } = useIndex()

  const resolved = id ? resolveGene(id) : null
  // Fall back to treating the param as an ENSG if it isn't in the index.
  const ensg = resolved?.ensg ?? (id?.startsWith('ENSG') ? id : null)
  const gi = resolved?.idx ?? null

  const [filters, setFilters] = useState<FilterState>({
    ancestry: DEFAULTS.ancestry,
    maskIndex: DEFAULTS.maskIndex,
    mafIndex: DEFAULTS.mafIndex,
    test: DEFAULTS.test,
  })
  // Which phenotype the forest plot is focused on (null = auto = top hit).
  const [forestPheno, setForestPheno] = useState<number | null>(null)

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

  // Seed the forest to the gene's top hit once its data loads, then keep that
  // phenotype fixed. Otherwise `topHitIdx` (filter-derived) would hijack the
  // forest whenever the user changed a mask/MAF/test/ancestry filter — the
  // filters should update the shown phenotype's numbers, not swap phenotypes.
  useEffect(() => {
    if (data && topHitIdx != null) setForestPheno(topHitIdx)
    // Runs once per gene load (data changes only when the gene does); filter
    // changes must NOT re-seed, so they're intentionally excluded from deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

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
              <span className="tnum text-[11px] text-ink-faint">
                {ensg}
                {chr && start && end && (
                  <>
                    {' · '}chr{chr}:{fmtPos(start)}–{fmtPos(end)}
                  </>
                )}
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
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
              <span className="text-[11px] text-ink-faint">
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
                  className="text-[11px] text-brand hover:underline"
                >
                  open {forestTrait.name} →
                </Link>
              </div>
              <ForestPlot
                series={forest}
                trait={forestTrait}
                symbol={symbol}
                maskLabel={MASK_META[filters.maskIndex].label}
                mafLabel={MAF_META[filters.mafIndex].label}
              />
            </section>
          )}

          <GeneTable
            data={data}
            symbol={symbol}
            ensg={ensg}
            filters={filters}
            ancIdx={ancIdx}
            onFocus={setForestPheno}
          />

          {forestIdx != null && forestTrait && (
            <section className="mb-3 rounded-lg border border-line bg-surface p-2">
              <div className="flex flex-wrap items-center justify-between gap-2 px-1 pb-1">
                <div className="flex items-center gap-2">
                  <h2 className="text-[13px] font-semibold text-ink">
                    Variants
                  </h2>
                  <PhenoPicker
                    value={forestIdx}
                    options={availablePhenos}
                    onChange={setForestPheno}
                  />
                </div>
                <span className="text-[11px] text-ink-faint">
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
  onFocus,
}: {
  data: GeneData
  symbol: string
  ensg: string
  filters: FilterState
  ancIdx: number
  onFocus: (phenoIdx: number) => void
}) {
  const { phenotypes } = useIndex()
  const [sorting, setSorting] = useState<SortingState>([{ id: 'p0', desc: true }])
  const [tableFilter, setTableFilter] = useState<TableFilter>(NO_TABLE_FILTER)

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

  const rows = useMemo(
    () =>
      allRows.filter((r) =>
        passesTableFilter(tableFilter, r.lp[ancIdx], r.beta[ancIdx]),
      ),
    [allRows, tableFilter, ancIdx],
  )

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
        caption={caption}
        exportSpec={exportSpec}
        reservedRows={allRows.length}
      />
    </>
  )
}
