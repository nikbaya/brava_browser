import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { useIndex } from '../data/IndexContext'
import StickyTitle from '../components/StickyTitle'
import { fetchAllResults } from '../data/client'
import { useAsync } from '../lib/useAsync'
import { allResultsRows, type AllResultsRow } from '../lib/select'
import {
  ANCESTRY_META,
  DEFAULTS,
  MAF_META,
  MASK_META,
  SIG_SUGGEST,
  SUPERPOPS,
} from '../lib/constants'
import { fmtP, fmtPLog, fmtPos } from '../lib/format'
import { exportP, slug, type ExportColumn, type TableExport } from '../lib/exportTable'
import { categoryColors } from '../lib/categoryColor'
import { Notice, Spinner, ThresholdLegend } from '../components/ui'
import { DirDot, SigDot } from '../components/indicators'
import { effectInfo } from '../lib/effect'
import AllResultsManhattan from '../components/AllResultsManhattan'
import AncestryHealthBar from '../components/AncestryHealthBar'
import VirtualTable from '../components/VirtualTable'
import FilterBar, { type FilterState } from '../components/FilterBar'
import { FilterRow, SearchInput } from '../components/TableFilters'
import type { AncestryN } from '../data/types'

/** Karyotype order: 1..22, X, Y, M, then anything else. */
function chromRank(chr: string): number {
  const c = chr.toUpperCase().replace(/^CHR/, '')
  const n = parseInt(c, 10)
  if (!Number.isNaN(n)) return n
  if (c === 'X') return 23
  if (c === 'Y') return 24
  if (c === 'M' || c === 'MT') return 25
  return 99
}
const locusKey = (chr: string, start: number) => chromRank(chr) * 1e9 + start

interface TableRow extends AllResultsRow {
  symbol: string
  ensg: string
  chr: string
  start: number
  phenoId: string
  phenoName: string
  phenoType: 'binary' | 'quantitative'
  phenoCategory: string
  phenoN: Record<string, AncestryN> | undefined
  totalN: number
}

/**
 * Genome-wide view of every gene-level result, across every phenotype, that
 * clears the gene-level Cauchy significance threshold — the "what's
 * significant anywhere in BRaVa" page, vs. the phenotype page's "what's
 * significant for this one trait". Backed by pipeline/build_all_results.py's
 * bundled meta/all_results.{ANC}.json shards (one per ancestry, fetched lazily
 * on ancestry change), so switching mask/MAF/test/ancestry never hits R2.
 */
export default function AllResultsPage() {
  const navigate = useNavigate()
  const { geneIndex, phenotypes, loading: idxLoading } = useIndex()

  const [filters, setFilters] = useState<FilterState>({
    ancestry: DEFAULTS.ancestry,
    maskIndex: DEFAULTS.maskIndex,
    mafIndex: DEFAULTS.mafIndex,
    test: DEFAULTS.test,
  })
  const [query, setQuery] = useState('')
  const [minLp, setMinLp] = useState(0)
  const [minN, setMinN] = useState(0)
  const [hover, setHover] = useState<{ geneIdx: number; phenoIdx: number } | null>(null)
  const [sorting, setSorting] = useState<SortingState>([{ id: 'lp', desc: true }])

  const { data, loading, error } = useAsync(
    () => fetchAllResults(ANCESTRY_META[filters.ancestry].suffix),
    [filters.ancestry],
  )

  const rows = useMemo<AllResultsRow[]>(
    () => (data ? allResultsRows(data, filters) : []),
    [data, filters],
  )

  const tableRows = useMemo<TableRow[]>(() => {
    if (!geneIndex) return []
    return rows.map((r) => {
      const p = phenotypes[r.phenoIdx]
      // The bar (and its sort/normalisation) tracks whichever stratum the
      // page is filtered to — the "All" meta total otherwise.
      const totalN =
        filters.ancestry === 'All'
          ? p?.n?.All?.n ??
            SUPERPOPS.reduce((s, a) => s + (p?.n?.[a]?.n ?? 0), 0)
          : p?.n?.[filters.ancestry]?.n ?? 0
      return {
        ...r,
        symbol: geneIndex.symbols[r.geneIdx] || geneIndex.ids[r.geneIdx],
        ensg: geneIndex.ids[r.geneIdx],
        chr: geneIndex.chr[r.geneIdx],
        start: geneIndex.start[r.geneIdx],
        phenoId: p?.id ?? '',
        phenoName: p?.name ?? `pheno ${r.phenoIdx}`,
        phenoType: p?.type ?? 'quantitative',
        phenoCategory: p?.category ?? '',
        phenoN: p?.n,
        totalN,
      }
    })
  }, [rows, geneIndex, phenotypes, filters.ancestry])

  // Bar length in AncestryHealthBar is relative to the largest total N among
  // the mask/maf/test/ancestry-filtered rows (pre search/P narrowing), so it
  // stays a stable yardstick while the user types a query or moves the slider.
  const maxTotalN = useMemo(
    () => tableRows.reduce((m, r) => Math.max(m, r.totalN), 0),
    [tableRows],
  )

  const maxLp = useMemo(
    () => tableRows.reduce((m, r) => Math.max(m, r.lp), 0),
    [tableRows],
  )

  // Same input as the PheWAS plot / search dropdown, so a category's colour
  // is identical everywhere it shows up in the browser.
  const catColor = useMemo(
    () => categoryColors(phenotypes.map((p) => p.category)),
    [phenotypes],
  )

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tableRows.filter((r) => {
      if (minLp > 0 && r.lp < minLp) return false
      if (minN > 0 && r.totalN < minN) return false
      if (!q) return true
      return (
        r.symbol.toLowerCase().includes(q) ||
        r.ensg.toLowerCase().includes(q) ||
        r.phenoName.toLowerCase().includes(q) ||
        r.phenoId.toLowerCase().includes(q) ||
        r.phenoCategory.toLowerCase().includes(q)
      )
    })
  }, [tableRows, query, minLp, minN])

  const openGene = (ensg: string) => navigate(`/gene/${ensg}`)

  const columns = useMemo<ColumnDef<TableRow, any>[]>(
    () => [
      {
        accessorKey: 'phenoName',
        header: 'Phenotype',
        size: 180,
        cell: (c) => (
          <Link
            to={`/phenotype/${c.row.original.phenoId}`}
            onClick={(e) => e.stopPropagation()}
            className="text-brand hover:underline"
          >
            {c.getValue<string>()}
          </Link>
        ),
      },
      {
        accessorKey: 'phenoCategory',
        header: 'Category',
        size: 150,
        cell: (c) => {
          const cat = c.getValue<string>()
          return (
            <span className="inline-flex items-center gap-1.5">
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: catColor.get(cat) }}
              />
              <span className="text-ink-soft">{cat}</span>
            </span>
          )
        },
      },
      {
        accessorKey: 'symbol',
        header: 'Gene',
        size: 110,
        cell: (c) => (
          <Link
            to={`/gene/${c.row.original.ensg}`}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-brand hover:underline"
          >
            {c.getValue<string>()}
          </Link>
        ),
      },
      {
        id: 'loc',
        header: 'Location',
        accessorFn: (r) => locusKey(r.chr, r.start),
        invertSorting: true,
        size: 130,
        cell: (c) => (
          <span className="tnum text-ink-soft">
            chr{c.row.original.chr}:{fmtPos(c.row.original.start)}
          </span>
        ),
      },
      {
        id: 'lp',
        header: 'P-value',
        accessorFn: (r) => r.lp,
        size: 110,
        cell: (c) => (
          <span className="tnum inline-flex items-center gap-1.5">
            <SigDot lp={c.getValue<number>()} />
            {fmtPLog(c.getValue<number>())}
          </span>
        ),
      },
      {
        id: 'beta',
        header: 'Effect',
        accessorFn: (r) => r.beta ?? undefined,
        sortUndefined: 'last',
        size: 130,
        cell: (c) => {
          const r = c.row.original
          const e = effectInfo(r.beta, r.phenoType)
          return (
            <span className="inline-flex items-center gap-1.5">
              <DirDot beta={r.beta} type={r.phenoType} />
              <span className="text-ink-soft">{e?.label ?? '—'}</span>
            </span>
          )
        },
      },
      {
        id: 'n',
        header: 'Sample size',
        accessorFn: (r) => r.totalN || undefined,
        sortUndefined: 'last',
        size: 190,
        meta: {
          help: "This phenotype's sample size for the selected ancestry (or the full cross-ancestry composition when filtered to All). Hover for the exact breakdown.",
        },
        cell: (c) => (
          <AncestryHealthBar
            n={c.row.original.phenoN}
            selected={filters.ancestry}
            maxN={maxTotalN}
          />
        ),
      },
    ],
    [maxTotalN, filters.ancestry, catColor],
  )

  const exportSpec = useMemo<TableExport<TableRow>>(() => {
    const mask = MASK_META[filters.maskIndex]
    return {
      noun: 'results',
      filename: `brava_all_results_${slug(mask.short)}_maf${MAF_META[filters.mafIndex].value}_${slug(filters.test)}_${slug(filters.ancestry)}.tsv`,
      columns: [
        { header: 'gene', value: (r) => r.symbol },
        { header: 'ensembl_gene_id', value: (r) => r.ensg },
        { header: 'chrom', value: (r) => r.chr },
        { header: 'gene_start', value: (r) => r.start },
        { header: 'phenotype_id', value: (r) => r.phenoId },
        { header: 'phenotype', value: (r) => r.phenoName },
        { header: 'category', value: (r) => r.phenoCategory },
        { header: 'variant_mask', value: () => mask.raw },
        { header: 'max_maf', value: () => MAF_META[filters.mafIndex].value },
        { header: 'test', value: () => filters.test },
        { header: 'ancestry', value: () => filters.ancestry },
        { header: 'P', value: (r) => exportP(r.lp) },
        { header: 'neglog10P', value: (r) => r.lp },
        { header: 'beta', value: (r) => r.beta },
        { header: 'n_total', value: (r) => r.totalN || null },
      ] satisfies ExportColumn<TableRow>[],
    }
  }, [filters])

  if (idxLoading) return <Spinner label="Loading…" />

  return (
    <>
      <StickyTitle>
        <div className="flex items-start justify-between gap-x-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-xl font-semibold text-ink">All results</h1>
            <p className="text-xs text-ink-faint">
              P &lt; {fmtP(SIG_SUGGEST)} (suggestive threshold) · {phenotypes.length} traits
            </p>
          </div>
          <FilterBar value={filters} onChange={setFilters} />
        </div>
      </StickyTitle>

      <div className="mx-auto max-w-7xl px-4 py-4">
        {loading && <Spinner label="Loading results…" />}
        {error && (
          <Notice title="Could not load results">{String(error.message)}</Notice>
        )}

        {data && !loading && (
          <>
            <section className="mb-3 rounded-lg border border-line bg-surface p-2">
              <div className="mb-1 px-2 text-xs font-semibold text-ink-soft">
                Manhattan
              </div>
              <AllResultsManhattan
                rows={rows}
                geneIndex={geneIndex!}
                phenotypes={phenotypes}
                highlight={hover}
                onSelect={(gi) => openGene(geneIndex!.ids[gi])}
              />
              <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-xs text-ink-faint">
                <span>
                  {MASK_META[filters.maskIndex].label} · {filters.test} ·{' '}
                  {ANCESTRY_META[filters.ancestry].label}
                </span>
                <ThresholdLegend />
                <span>· click a point for its gene page</span>
              </div>
            </section>

            <div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface px-3 py-1.5">
              <SearchInput
                label="Search"
                value={query}
                onChange={setQuery}
                placeholder="gene or phenotype"
              />
              <FilterRow
                label="P ≤"
                kind="p"
                min={0}
                max={maxLp}
                step={0.1}
                stored={minLp}
                onChange={setMinLp}
              />
              <FilterRow
                label="N ≥"
                kind="n"
                min={0}
                max={maxTotalN}
                step={Math.max(1, Math.round(maxTotalN / 200))}
                stored={minN}
                onChange={setMinN}
              />
              {(query.trim() !== '' || minLp > 0 || minN > 0) && (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('')
                    setMinLp(0)
                    setMinN(0)
                  }}
                  className="text-xs text-ink-faint hover:text-ink hover:underline"
                >
                  reset
                </button>
              )}
              <span className="ml-auto text-xs text-ink-faint">
                {filteredRows.length.toLocaleString()}
                {filteredRows.length !== tableRows.length &&
                  ` of ${tableRows.length.toLocaleString()}`}{' '}
                results
              </span>
            </div>

            <VirtualTable
              data={filteredRows}
              columns={columns}
              sorting={sorting}
              onSortingChange={setSorting}
              onRowClick={(r) => openGene(r.ensg)}
              onRowHover={(r) =>
                setHover(r ? { geneIdx: r.geneIdx, phenoIdx: r.phenoIdx } : null)
              }
              exportSpec={exportSpec}
              reservedRows={tableRows.length}
            />
          </>
        )}
      </div>
    </>
  )
}
