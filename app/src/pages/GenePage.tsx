import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { useIndex } from '../data/IndexContext'
import { fetchGene, HttpError } from '../data/client'
import type { GeneData, PhenotypeMeta } from '../data/types'
import { useAsync } from '../lib/useAsync'
import { forestSeries, geneRows, type GeneRow } from '../lib/select'
import {
  ANCESTRY_INDEX,
  ANCESTRY_META,
  DEFAULTS,
  MASK_META,
  MAF_META,
} from '../lib/constants'
import { fmtBeta, fmtPLog, fmtPos } from '../lib/format'
import { Notice, Spinner } from '../components/ui'
import { DirDot, SigDot } from '../components/indicators'
import FilterBar, { type FilterState } from '../components/FilterBar'
import PheWASPlot, { type PheWASPoint } from '../components/PheWASPlot'
import ForestPlot from '../components/ForestPlot'
import PhenoPicker from '../components/PhenoPicker'
import VirtualTable from '../components/VirtualTable'

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
    <div className="mx-auto max-w-7xl px-4 py-4">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
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
          <Ext href={`https://gnomad.broadinstitute.org/gene/${ensg}?dataset=gnomad_r4`}>
            gnomAD
          </Ext>
          <Ext href={`https://app.genebass.org/gene/${ensg}`}>Genebass</Ext>
          <Ext href={`https://www.ensembl.org/Homo_sapiens/Gene/Summary?g=${ensg}`}>
            Ensembl
          </Ext>
          {symbol !== ensg && (
            <Ext href={`https://www.genecards.org/cgi-bin/carddisp.pl?gene=${symbol}`}>
              GeneCards
            </Ext>
          )}
        </div>
      </header>

      <div className="mb-3">
        <FilterBar value={filters} onChange={setFilters} />
      </div>

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
                maskLabel={MASK_META[filters.maskIndex].label}
                mafLabel={MAF_META[filters.mafIndex].label}
              />
            </section>
          )}

          <div className="mb-1.5">
            <p className="text-[11px] text-ink-faint">
              Click a row to focus the forest plot above
            </p>
          </div>
          <GeneTable
            data={data}
            filters={filters}
            ancIdx={ancIdx}
            onFocus={setForestPheno}
          />
        </>
      )}
    </div>
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

interface GTRow extends GeneRow {
  phenoId: string
  phenoName: string
  category: string
  traitType: PhenotypeMeta['type']
}

function GeneTable({
  data,
  filters,
  ancIdx,
  onFocus,
}: {
  data: GeneData
  filters: FilterState
  ancIdx: number
  onFocus: (phenoIdx: number) => void
}) {
  const { phenotypes } = useIndex()
  const [sorting, setSorting] = useState<SortingState>([{ id: 'lp', desc: true }])

  // One row per phenotype for the selected ancestry / mask / MAF.
  const rows = useMemo<GTRow[]>(() => {
    return geneRows(data, {
      test: filters.test,
      ancIdx,
      maskIndex: filters.maskIndex,
      mafIndex: filters.mafIndex,
    })
      .map((r) => {
        const meta = phenotypes[r.phenoIdx]
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
      .filter((r): r is GTRow => r != null)
  }, [data, filters.test, filters.maskIndex, filters.mafIndex, ancIdx, phenotypes])

  // Max |β| per trait type — this table mixes binary (log-OR) and quantitative
  // (SD) phenotypes, whose β scales aren't comparable, so normalise within type.
  const maxAbsByType = useMemo(() => {
    const m: Record<string, number> = { binary: 0, quantitative: 0 }
    for (const r of rows)
      if (r.beta != null) m[r.traitType] = Math.max(m[r.traitType] ?? 0, Math.abs(r.beta))
    return m
  }, [rows])

  const columns = useMemo<ColumnDef<GTRow, any>[]>(
    () => [
      {
        accessorKey: 'phenoName',
        header: 'Phenotype',
        size: 230,
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
        size: 170,
        cell: (c) => <span className="text-ink-soft">{c.getValue<string>()}</span>,
      },
      {
        accessorKey: 'lp',
        header: 'P-value',
        size: 120,
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
        size: 130,
        cell: (c) => {
          const b = c.getValue<number | null>()
          const t = c.row.original.traitType
          const mx = maxAbsByType[t] ?? 0
          return (
            <span className="tnum inline-flex items-center gap-1.5">
              <DirDot
                beta={b}
                type={t}
                intensity={b != null && mx > 0 ? Math.abs(b) / mx : undefined}
              />
              {fmtBeta(b)}
            </span>
          )
        },
      },
    ],
    [maxAbsByType],
  )

  const caption = (
    <span>
      <span className="font-semibold text-ink-soft">Filters</span> ·{' '}
      {ANCESTRY_META[filters.ancestry].long} ·{' '}
      {MASK_META[filters.maskIndex].label} · MAF{' '}
      {MAF_META[filters.mafIndex].label} · {filters.test}
    </span>
  )

  return (
    <VirtualTable
      data={rows}
      columns={columns}
      sorting={sorting}
      onSortingChange={setSorting}
      onRowClick={(r) => onFocus(r.phenoIdx)}
      caption={caption}
    />
  )
}
