import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { useIndex } from '../data/IndexContext'
import { fetchGene, fetchPhenotype } from '../data/client'
import { useAsync } from '../lib/useAsync'
import { forestSeries, phenoRows, type PhenoRow } from '../lib/select'
import {
  ANCESTRY_META,
  DEFAULTS,
  MAF_META,
  MASK_META,
  SIG_GENE_CAUCHY,
  type Ancestry,
} from '../lib/constants'
import { fmtBeta, fmtPLog, fmtPos } from '../lib/format'
import type { PhenotypeMeta } from '../data/types'
import { Notice, Spinner } from '../components/ui'
import { DirDot, SigDot } from '../components/indicators'
import FilterBar, { type FilterState } from '../components/FilterBar'
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

  const rows = useMemo<PhenoRow[]>(
    () => (data ? phenoRows(data, filters) : []),
    [data, filters],
  )
  const nSig = useMemo(
    () => rows.filter((r) => r.lp != null && r.lp >= -Math.log10(SIG_GENE_CAUCHY)).length,
    [rows],
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
    <div className="mx-auto max-w-7xl px-4 py-4">
      <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h1 className="text-xl font-semibold text-ink">{pheno.name}</h1>
        <span className="rounded bg-surface-soft px-1.5 py-0.5 text-[11px] font-medium text-ink-soft">
          {pheno.category}
        </span>
        <span className="text-[11px] text-ink-faint">
          {pheno.id} · {pheno.type === 'binary' ? 'binary' : 'quantitative'} ·{' '}
          <span className="tnum">{nSig}</span> genes past significance (P &lt;
          2.5×10⁻⁶) here
        </span>
      </div>

      <div className="mb-3">
        <FilterBar
          value={{ ...filters, ancestry }}
          onChange={setFilters}
          ancestries={available}
        />
      </div>

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
            <p className="mt-0.5 px-2 text-[11px] text-ink-faint">
              {MASK_META[filters.maskIndex].label} · {filters.test} · red line =
              gene-level, amber = gene-mask significance · click a gene for its
              cross-ancestry forest
            </p>
          </section>

          <div className="mb-1.5">
            <p className="text-[11px] text-ink-faint">
              {rows.length.toLocaleString()} genes · click a row for the forest
            </p>
          </div>
          <ResultsTable
            rows={rows}
            traitType={pheno.type}
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

interface TableRow extends PhenoRow {
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
  traitType,
  filters,
  ancestry,
  ancestryN,
  onOpenForest,
}: {
  rows: PhenoRow[]
  traitType: PhenotypeMeta['type']
  filters: FilterState
  ancestry: Ancestry
  ancestryN?: { n: number; case?: number; ctrl?: number }
  onOpenForest: (g: { ensg: string; symbol: string }) => void
}) {
  const { geneIndex } = useIndex()
  const [sorting, setSorting] = useState<SortingState>([{ id: 'lp', desc: true }])

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

  // Column max |β| for the magnitude-scaled direction dots (all rows share the
  // selected ancestry → one trait type, so a single max is valid here).
  const maxAbsBeta = useMemo(() => {
    let m = 0
    for (const r of tableRows) if (r.beta != null) m = Math.max(m, Math.abs(r.beta))
    return m
  }, [tableRows])

  const columns = useMemo<ColumnDef<TableRow, any>[]>(
    () => [
      {
        accessorKey: 'symbol',
        header: 'Gene',
        size: 140,
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
        size: 170,
        cell: (c) => (
          <span className="tnum text-ink-soft">
            chr{c.row.original.chr}:{fmtPos(c.row.original.start)}
          </span>
        ),
      },
      {
        accessorKey: 'lp',
        header: 'P-value',
        size: 120,
        sortUndefined: 'last',
        cell: (c) => (
          <span className="tnum inline-flex items-center gap-1.5">
            <SigDot lp={c.getValue<number | null>()} />
            {fmtPLog(c.getValue<number | null>())}
          </span>
        ),
      },
      {
        accessorKey: 'beta',
        header: 'Beta (Burden)',
        size: 120,
        cell: (c) => {
          const b = c.getValue<number | null>()
          return (
            <span className="tnum inline-flex items-center gap-1.5">
              <DirDot
                beta={b}
                type={traitType}
                intensity={b != null && maxAbsBeta > 0 ? Math.abs(b) / maxAbsBeta : undefined}
              />
              {fmtBeta(b)}
            </span>
          )
        },
      },
    ],
    [traitType, maxAbsBeta],
  )

  const caption = (
    <span>
      <span className="font-semibold text-ink-soft">Filters</span> ·{' '}
      {ANCESTRY_META[ancestry].long}
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
      · {MASK_META[filters.maskIndex].label} · MAF {MAF_META[filters.mafIndex].label} ·{' '}
      {filters.test}
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
    />
  )
}
