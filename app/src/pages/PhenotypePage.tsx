import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { useIndex } from '../data/IndexContext'
import StickyTitle from '../components/StickyTitle'
import { fetchGene, fetchPhenotype } from '../data/client'
import { useAsync } from '../lib/useAsync'
import {
  forestSeries,
  phenoLookup,
  phenoRows,
  type GridRow,
  type PhenoRow,
} from '../lib/select'
import {
  ANCESTRIES,
  ANCESTRY_INDEX,
  ANCESTRY_META,
  DEFAULTS,
  MAF_META,
  MASK_META,
  SIG_GENE_CAUCHY,
  type Ancestry,
} from '../lib/constants'
import { fmtPos } from '../lib/format'
import type { PhenotypeData, PhenotypeMeta } from '../data/types'
import { Notice, Spinner, ThresholdLegend } from '../components/ui'
import { ancestryGridColumns, BetaLegend } from '../components/ancestryColumns'
import FilterBar, { type FilterState } from '../components/FilterBar'
import TableFilters, {
  NO_TABLE_FILTER,
  passesTableFilter,
  type TableFilter,
} from '../components/TableFilters'
import ManhattanPlot from '../components/ManhattanPlot'
import ForestPlot from '../components/ForestPlot'
import VirtualTable from '../components/VirtualTable'
import AncestryPies from '../components/AncestryPies'

export default function PhenotypePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { geneIndex, phenotypes, loading: idxLoading } = useIndex()

  const phenoIdx = phenotypes.findIndex((p) => p.id === id)
  const pheno = phenoIdx >= 0 ? phenotypes[phenoIdx] : undefined
  const available = (pheno?.ancestries ?? ['All']) as Ancestry[]

  const [filters, setFilters] = useState<FilterState>({
    ancestry: DEFAULTS.ancestry,
    maskIndex: DEFAULTS.maskIndex,
    mafIndex: DEFAULTS.mafIndex,
    test: DEFAULTS.test,
  })
  const ancestry = available.includes(filters.ancestry)
    ? filters.ancestry
    : available[0]

  // Gene whose cross-ancestry forest is shown in the drawer (null = closed).
  const [drawer, setDrawer] = useState<{ ensg: string; symbol: string } | null>(
    null,
  )

  const { data, loading, error } = useAsync(
    () =>
      id
        ? fetchPhenotype(id, ANCESTRY_META[ancestry].suffix)
        : Promise.reject(new Error('no id')),
    [id, ancestry],
  )

  const [tableFilter, setTableFilter] = useState<TableFilter>(NO_TABLE_FILTER)
  const ancIdx = ANCESTRY_INDEX[ancestry]

  // Lazy-load every available ancestry file so the table can show a P + β
  // column per ancestry. The selected ancestry (already fetched above for the
  // Manhattan) fills immediately; the rest arrive in the background. getJSON
  // caches, so switching ancestry re-uses these.
  const [ancData, setAncData] = useState<Record<number, PhenotypeData>>({})
  const availKey = available.join(',')
  useEffect(() => {
    setAncData({})
    if (!id) return
    let alive = true
    for (const a of available) {
      fetchPhenotype(id, ANCESTRY_META[a].suffix)
        .then((d) => {
          if (alive) setAncData((prev) => ({ ...prev, [ANCESTRY_INDEX[a]]: d }))
        })
        .catch(() => {})
    }
    return () => {
      alive = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, availKey])

  // Selected-ancestry rows drive the Manhattan plot + significance count.
  const rows = useMemo<PhenoRow[]>(
    () => (data ? phenoRows(data, filters) : []),
    [data, filters],
  )
  const nSig = useMemo(
    () => rows.filter((r) => r.lp != null && r.lp >= -Math.log10(SIG_GENE_CAUCHY)).length,
    [rows],
  )
  // The P/β threshold + slider domains apply to the selected ancestry column.
  const { maxLp, maxAbsBeta } = useMemo(() => {
    let lp = 0
    let b = 0
    for (const r of rows) {
      if (r.lp != null) lp = Math.max(lp, r.lp)
      if (r.beta != null) b = Math.max(b, Math.abs(r.beta))
    }
    return { maxLp: lp, maxAbsBeta: b }
  }, [rows])

  // geneIdx → {lp, β} per loaded ancestry, for the selected mask/maf/test.
  const lookups = useMemo(() => {
    const m: Record<number, ReturnType<typeof phenoLookup>> = {}
    for (const [aStr, d] of Object.entries(ancData))
      m[Number(aStr)] = phenoLookup(d, filters)
    return m
  }, [ancData, filters])

  // Grid rows: one per gene (from the selected ancestry), a P + β per ancestry.
  const gridRows = useMemo<PhenoGridRow[]>(() => {
    return rows.map((br) => {
      const lp = new Array(ANCESTRIES.length).fill(null)
      const beta = new Array(ANCESTRIES.length).fill(null)
      for (const aStr in lookups) {
        const a = Number(aStr)
        const hit = lookups[a].get(br.geneIdx)
        if (hit) {
          lp[a] = hit.lp
          beta[a] = hit.beta
        }
      }
      return { key: br.geneIdx, geneIdx: br.geneIdx, lp, beta }
    })
  }, [rows, lookups])

  const tableRows = useMemo(
    () =>
      gridRows.filter((r) =>
        passesTableFilter(tableFilter, r.lp[ancIdx], r.beta[ancIdx]),
      ),
    [gridRows, tableFilter, ancIdx],
  )
  // Ancestry columns to render (all available), and which have loaded.
  const ancIdxs = useMemo(
    () => available.map((a) => ANCESTRY_INDEX[a]).sort((x, y) => x - y),
    [availKey], // eslint-disable-line react-hooks/exhaustive-deps
  )
  const loadedAnc = useMemo(
    () => new Set(Object.keys(ancData).map(Number)),
    [ancData],
  )

  if (idxLoading) return <Spinner label="Loading…" />
  if (!pheno)
    return (
      <div className="px-4 py-16">
        <Notice title="Unknown phenotype">
          “{id}” is not in the BRaVa release.
        </Notice>
      </div>
    )

  return (
    <>
      <StickyTitle>
        <div className="flex items-start justify-between gap-x-4">
          <div className="flex min-w-0 flex-col gap-1">
            <h1 className="text-xl font-semibold text-ink">{pheno.name}</h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
              <span className="rounded bg-surface px-1.5 py-0.5 font-medium text-ink-soft">
                {pheno.category}
              </span>
              <span className="text-ink-faint">
                {pheno.id} · {pheno.type === 'binary' ? 'binary' : 'quantitative'} ·{' '}
                <span className="tnum">{nSig}</span> genes past significance (P &lt;
                2.5×10⁻⁶) here
              </span>
            </div>
          </div>
          <FilterBar
            value={{ ...filters, ancestry }}
            onChange={setFilters}
            ancestries={available}
          />
        </div>
      </StickyTitle>

      <div className="mx-auto max-w-7xl px-4 py-4">

      {loading && <Spinner label="Loading association results…" />}
      {error && (
        <Notice title="Could not load results">{String(error.message)}</Notice>
      )}

      {data && !loading && (
        <>
          <section className="mb-3 rounded-lg border border-line bg-surface p-2">
            <ManhattanPlot
              rows={rows}
              geneIndex={geneIndex!}
              onSelect={(gi) =>
                setDrawer({
                  ensg: geneIndex!.ids[gi],
                  symbol: geneIndex!.symbols[gi] || geneIndex!.ids[gi],
                })
              }
            />
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-[11px] text-ink-faint">
              <span>
                {MASK_META[filters.maskIndex].label} · {filters.test}
              </span>
              <ThresholdLegend />
              <span>· click a gene for its cross-ancestry forest</span>
            </div>
          </section>

          <div className="mb-1.5">
            <TableFilters
              value={tableFilter}
              onChange={setTableFilter}
              maxLp={maxLp}
              maxAbsBeta={maxAbsBeta}
            >
              {tableRows.length.toLocaleString()}
              {tableRows.length !== rows.length &&
                ` of ${rows.length.toLocaleString()}`}{' '}
              genes · click a row for the forest
            </TableFilters>
          </div>
          <ResultsTable
            rows={tableRows}
            reservedRows={gridRows.length}
            ancIdxs={ancIdxs}
            selAncIdx={ancIdx}
            loadedAnc={loadedAnc}
            filters={filters}
            ancestry={ancestry}
            ancestryN={pheno.n?.[ancestry]}
            onOpenForest={setDrawer}
          />

          <AncestryPies
            pheno={pheno}
            available={available}
            selected={ancestry}
            onSelect={(a) => setFilters({ ...filters, ancestry: a })}
          />
        </>
      )}

      {drawer && (
        <ForestDrawer
          ensg={drawer.ensg}
          symbol={drawer.symbol}
          phenoIdx={phenoIdx}
          trait={pheno}
          maskIndex={filters.maskIndex}
          mafIndex={filters.mafIndex}
          onClose={() => setDrawer(null)}
          onOpenGene={() => navigate(`/gene/${drawer.ensg}`)}
        />
      )}
      </div>
    </>
  )
}

function ForestDrawer({
  ensg,
  symbol,
  phenoIdx,
  trait,
  maskIndex,
  mafIndex,
  onClose,
  onOpenGene,
}: {
  ensg: string
  symbol: string
  phenoIdx: number
  trait: PhenotypeMeta
  maskIndex: number
  mafIndex: number
  onClose: () => void
  onOpenGene: () => void
}) {
  const { data, loading, error } = useAsync(() => fetchGene(ensg), [ensg])
  const series = useMemo(
    () => (data ? forestSeries(data, { phenoIdx, maskIndex, mafIndex }) : null),
    [data, phenoIdx, maskIndex, mafIndex],
  )

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-ink/20" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-y-auto bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="text-base font-semibold text-ink">
              {symbol} × {trait.name}
            </h2>
            <p className="text-[11px] text-ink-faint">Effect across ancestries</p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onOpenGene}
              className="text-[12px] text-brand hover:underline"
            >
              open gene page →
            </button>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded p-1 text-ink-faint hover:bg-surface-soft hover:text-ink"
            >
              ✕
            </button>
          </div>
        </div>
        <div className="p-4">
          {loading && <Spinner label="Loading…" />}
          {error && <Notice title="Could not load gene" />}
          {series && (
            <ForestPlot
              series={series}
              trait={trait}
              maskLabel={MASK_META[maskIndex].label}
              mafLabel={MAF_META[mafIndex].label}
            />
          )}
        </div>
      </aside>
    </div>
  )
}

interface PhenoGridRow extends GridRow {
  geneIdx: number
}

interface TableRow extends PhenoGridRow {
  symbol: string
  ensg: string
  chr: string
  start: number
}

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

/** Sortable genomic key: chromosome dominates, then base-pair position. */
const locusKey = (chr: string, start: number) => chromRank(chr) * 1e9 + start

function ResultsTable({
  rows,
  reservedRows,
  ancIdxs,
  selAncIdx,
  loadedAnc,
  filters,
  ancestry,
  ancestryN,
  onOpenForest,
}: {
  rows: PhenoGridRow[]
  reservedRows?: number
  ancIdxs: number[]
  selAncIdx: number
  loadedAnc: Set<number>
  filters: FilterState
  ancestry: Ancestry
  ancestryN?: { n: number; case?: number; ctrl?: number }
  onOpenForest: (g: { ensg: string; symbol: string }) => void
}) {
  const { geneIndex } = useIndex()
  const [sorting, setSorting] = useState<SortingState>([
    { id: `p${selAncIdx}`, desc: true },
  ])

  const tableRows = useMemo<TableRow[]>(() => {
    if (!geneIndex) return []
    return rows.map((r) => ({
      ...r,
      symbol: geneIndex.symbols[r.geneIdx] || geneIndex.ids[r.geneIdx],
      ensg: geneIndex.ids[r.geneIdx],
      chr: geneIndex.chr[r.geneIdx],
      start: geneIndex.start[r.geneIdx],
    }))
  }, [rows, geneIndex])

  // Largest |β| across every ancestry cell — scales the effect triangles.
  const betaGridMax = useMemo(() => {
    let m = 0
    for (const r of rows)
      for (const bt of r.beta) if (bt != null) m = Math.max(m, Math.abs(bt))
    return m
  }, [rows])

  const columns = useMemo<ColumnDef<TableRow, any>[]>(
    () => [
      {
        accessorKey: 'symbol',
        header: 'Gene',
        size: 120,
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
        // Invert so the down arrow (the default first-click for a numeric
        // column) reads top-down through the genome: chr1 → chrX, not chrX → chr1.
        invertSorting: true,
        size: 150,
        cell: (c) => (
          <span className="tnum text-ink-soft">
            chr{c.row.original.chr}:{fmtPos(c.row.original.start)}
          </span>
        ),
      },
      ...ancestryGridColumns<TableRow>(ancIdxs, {
        highlight: selAncIdx,
        pending: (_r, a) => !loadedAnc.has(a),
        betaMax: betaGridMax,
        test: filters.test,
      }),
    ],
    [ancIdxs, selAncIdx, loadedAnc, betaGridMax, filters.test],
  )

  const caption = (
    <span>
      <span className="font-semibold text-ink-soft">
        {MASK_META[filters.maskIndex].label}
      </span>{' '}
      · MAF {MAF_META[filters.mafIndex].label} · {filters.test} · filter on{' '}
      {ANCESTRY_META[ancestry].label}
      {ancestryN && (
        <>
          {' '}
          (N&nbsp;=&nbsp;<span className="tnum">{ancestryN.n.toLocaleString()}</span>
          {ancestryN.case != null && (
            <>
              ;{' '}
              <span className="tnum">{ancestryN.case.toLocaleString()}</span> cases /{' '}
              <span className="tnum">{ancestryN.ctrl!.toLocaleString()}</span> controls
            </>
          )}
          )
        </>
      )}{' '}
      · <BetaLegend />
    </span>
  )

  return (
    <VirtualTable
      data={tableRows}
      columns={columns}
      sorting={sorting}
      onSortingChange={setSorting}
      onRowClick={(r) => onOpenForest({ ensg: r.ensg, symbol: r.symbol })}
      caption={caption}
      reservedRows={reservedRows}
    />
  )
}
