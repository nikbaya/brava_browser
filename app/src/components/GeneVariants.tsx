import { useEffect, useMemo, useState } from 'react'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import {
  fetchExonShard,
  fetchGeneVariants,
  fetchGeneVariantsAnc,
  HttpError,
} from '../data/client'
import type { PhenotypeMeta } from '../data/types'
import { useAsync } from '../lib/useAsync'
import { variantForest, variantRows, type VariantRow } from '../lib/select'
import { fmtBeta, fmtCount, fmtOR, fmtPLog, fmtPos } from '../lib/format'
import { Notice, Spinner } from './ui'
import { DirDot, SigDot } from './indicators'
import VirtualTable from './VirtualTable'
import LocusZoom from './LocusZoom'
import VariantForest from './VariantForest'

/**
 * Variant-level (v2) view for a gene × selected phenotype: a locuszoom of every
 * variant in the gene region, a sortable table, and — on selecting a variant —
 * its multi-ancestry forest (lazy per-gene ancestry fetch). Variant→gene is by
 * position overlap; there are no per-variant functional annotations in the data.
 */
export default function GeneVariants({
  ensg,
  phenoIdx,
  trait,
  split,
  start,
  end,
  chr,
}: {
  ensg: string
  phenoIdx: number
  trait: PhenotypeMeta
  split: boolean
  start?: number
  end?: number
  chr?: string | null
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

  const rows = useMemo(
    () => (data ? variantRows(data, phenoIdx) : []),
    [data, phenoIdx],
  )

  const [selected, setSelected] = useState<VariantRow | null>(null)
  useEffect(() => setSelected(null), [ensg, phenoIdx])

  // Lazy non-meta ancestry data, fetched once a variant is selected (cached).
  const anc = useAsync(
    () =>
      selected
        ? fetchGeneVariantsAnc(ensg, phenoIdx, split)
        : Promise.resolve(null),
    [ensg, phenoIdx, split, selected != null],
  )
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

  if (loading) return <Spinner label="Loading variants…" />
  if (error)
    return error instanceof HttpError && error.status === 404 ? (
      <Notice title="No variant data for this gene">
        {trait.name} variants aren’t in the current (sample) data release.
      </Notice>
    ) : (
      <Notice title="Could not load variants">{String(error.message)}</Notice>
    )
  if (!data || rows.length === 0)
    return (
      <p className="py-6 text-center text-sm text-ink-faint">
        No variants tested in this gene for {trait.name}.
      </p>
    )

  return (
    <div className="space-y-3">
      <LocusZoom
        variants={rows}
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
              className="text-[11px] text-ink-faint hover:text-ink"
            >
              close ✕
            </button>
          </div>
          <VariantForest rows={forestRows} trait={trait} loading={anc.loading} />
        </div>
      )}

      <VariantTable
        rows={rows}
        trait={trait}
        chr={chr}
        onSelect={setSelected}
      />
    </div>
  )
}

function VariantTable({
  rows,
  trait,
  chr,
  onSelect,
}: {
  rows: VariantRow[]
  trait: PhenotypeMeta
  chr?: string | null
  onSelect: (v: VariantRow) => void
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'lp', desc: true }])

  const maxAbsBeta = useMemo(() => {
    let m = 0
    for (const r of rows) if (r.beta != null) m = Math.max(m, Math.abs(r.beta))
    return m
  }, [rows])

  const columns = useMemo<ColumnDef<VariantRow, any>[]>(
    () => [
      {
        id: 'variant',
        header: 'Variant',
        accessorFn: (r) => r.pos,
        size: 190,
        cell: (c) => {
          const r = c.row.original
          return (
            <span className="tnum text-ink">
              {chr ? `chr${chr}:` : ''}
              {fmtPos(r.pos)}{' '}
              <span className="text-ink-soft">
                {r.ref}›{r.alt}
              </span>
            </span>
          )
        },
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
        header: 'Beta',
        size: 110,
        cell: (c) => {
          const b = c.getValue<number | null>()
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
      {
        id: 'or',
        header: 'OR',
        accessorFn: (r) => r.beta,
        size: 90,
        cell: (c) => (
          <span className="tnum">
            {trait.type === 'binary' ? fmtOR(c.getValue<number | null>()) : '—'}
          </span>
        ),
      },
      {
        accessorKey: 'ne',
        header: 'N (eff.)',
        size: 90,
        cell: (c) => <span className="tnum">{fmtCount(c.getValue<number | null>())}</span>,
      },
      {
        accessorKey: 'i2',
        header: 'I²',
        size: 70,
        cell: (c) => {
          // i2 is Cochran's I² already in percent (0–100); '—' when a single
          // biobank contributes (heterogeneity undefined for one study).
          const v = c.getValue<number | null>()
          return (
            <span className="tnum text-ink-soft">
              {v == null ? '—' : `${Math.round(v)}%`}
            </span>
          )
        },
      },
    ],
    [chr, trait.type, maxAbsBeta],
  )

  const caption = (
    <span>
      <span className="font-semibold text-ink-soft">{rows.length.toLocaleString()}</span>{' '}
      variants · {trait.name} · position-based (no functional annotation) · click a
      row for the ancestry forest
    </span>
  )

  return (
    <VirtualTable
      data={rows}
      columns={columns}
      sorting={sorting}
      onSortingChange={setSorting}
      onRowClick={onSelect}
      caption={caption}
    />
  )
}
