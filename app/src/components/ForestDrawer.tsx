import { useMemo } from 'react'
import { fetchGene } from '../data/client'
import { useAsync } from '../lib/useAsync'
import { forestSeries } from '../lib/select'
import type { PhenotypeMeta } from '../data/types'
import { Notice, Spinner } from './ui'
import ForestPlot from './ForestPlot'

/**
 * Slide-over showing one gene × phenotype's cross-ancestry forest plot.
 * Fetches the gene file itself (not passed in) since the caller — the
 * phenotype page, the gene page's own per-ancestry grid, or the all-results
 * page — usually only has the gene's identity (ensg/symbol) and the
 * phenotype/mask/maf context, not its full variant data already loaded.
 * Shared so the three call sites can't drift apart.
 */
export default function ForestDrawer({
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
            <p className="text-xs text-ink-faint">Effect across ancestries</p>
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
              symbol={symbol}
              maskIndex={maskIndex}
              mafIndex={mafIndex}
            />
          )}
        </div>
      </aside>
    </div>
  )
}
