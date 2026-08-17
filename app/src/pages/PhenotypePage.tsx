import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import type { ColumnDef, SortingState } from '@tanstack/react-table'
import { useIndex } from '../data/IndexContext'
import StickyTitle from '../components/StickyTitle'
import {
  fetchGeneVariants,
  fetchGeneVariantsAnc,
  fetchPhenotype,
  fetchVariantOverview,
  fetchVariantSplit,
  HttpError,
} from '../data/client'
import { useAsync } from '../lib/useAsync'
import {
  phenoLookup,
  phenoRows,
  variantForest,
  variantOverviewRows,
  type GridRow,
  type PhenoRow,
  type VariantOverviewRow,
} from '../lib/select'
import {
  ANCESTRIES,
  ANCESTRY_INDEX,
  ANCESTRY_META,
  decodeAncMask,
  MAF_META,
  MASK_META,
  SIG_GENE_CAUCHY,
  SUPERPOP_IDXS,
  type Ancestry,
} from '../lib/constants'
import { fmtBeta, fmtP, fmtPLog, fmtPos } from '../lib/format'
import { exportP, slug, type ExportColumn, type TableExport } from '../lib/exportTable'
import { geneLinkPath, parseFilterParams } from '../lib/filterLink'
import type { GeneIndex, PhenotypeData, PhenotypeMeta, VariantOverview } from '../data/types'
import { Notice, Spinner, ThresholdLegend, VariantThresholdLegend } from '../components/ui'
import {
  ancestryExportColumns,
  ancestryGridColumns,
  BetaLegend,
  hetColumn,
  hetExportColumn,
} from '../components/ancestryColumns'
import { AncestryChips, DirDot, SigDot } from '../components/indicators'
import FilterBar, { type FilterState } from '../components/FilterBar'
import TableFilters, {
  AncestryFilterChips,
  FilterRow,
  matchesAncFilter,
  NO_TABLE_FILTER,
  passesTableFilter,
  SearchInput,
  type TableFilter,
} from '../components/TableFilters'
import ManhattanPlot from '../components/ManhattanPlot'
import VariantManhattanPlot, { type VariantPick } from '../components/VariantManhattanPlot'
import ForestDrawer from '../components/ForestDrawer'
import VariantForest from '../components/VariantForest'
import VirtualTable from '../components/VirtualTable'
import AncestryPies from '../components/AncestryPies'
import Tip from '../components/Tip'
import { variantSectionPath } from './GenePage'

// Stable empty-set fallback for `ancAvailable` before the overview loads —
// avoids handing VariantOverviewTable a fresh `new Set()` every render.
const EMPTY_ANC_AVAILABLE: Set<number> = new Set()

export default function PhenotypePage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { geneIndex, phenotypes, loading: idxLoading } = useIndex()

  const phenoIdx = phenotypes.findIndex((p) => p.id === id)
  const pheno = phenoIdx >= 0 ? phenotypes[phenoIdx] : undefined
  const available = (pheno?.ancestries ?? ['All']) as Ancestry[]

  // Shared-link / cross-page filter carry-over (see filterLink.ts). Read once,
  // at mount: they seed the view rather than driving it, so the user's later
  // filter changes aren't fighting the URL — same pattern as the gene page.
  const [search] = useSearchParams()
  const [filters, setFilters] = useState<FilterState>(() => parseFilterParams(search))
  const ancestry = available.includes(filters.ancestry)
    ? filters.ancestry
    : available[0]

  // Gene whose cross-ancestry forest is shown in the drawer (null = closed).
  const [drawer, setDrawer] = useState<{ ensg: string; symbol: string } | null>(
    null,
  )

  // Variant clicked in the variant Manhattan, whose own (not the gene's)
  // cross-ancestry forest is shown in a separate drawer.
  const [variantDrawer, setVariantDrawer] = useState<
    (VariantPick & { ensg: string; symbol: string }) | null
  >(null)

  // Row hovered in a results table, mirrored as a highlight ring on the
  // matching Manhattan point (gene_idx for the gene table, overview array
  // index for the variant table).
  const [hoverGeneIdx, setHoverGeneIdx] = useState<number | null>(null)
  const [hoverVariantIdx, setHoverVariantIdx] = useState<number | null>(null)

  // One toggle drives both the Manhattan and the table beneath it, so the two
  // never show mismatched levels of data.
  const [manhattanMode, setManhattanMode] = useState<'gene' | 'variant'>('gene')

  // Genome-wide variant overview (pixel-decimated Manhattan + the exhaustive
  // P ≤ 0.01 tail for the table below). Built only for the cross-ancestry meta
  // (see pipeline/build_variants.py), so this section always shows `All`
  // regardless of the page's ancestry filter.
  const { data: overview, error: overviewError } = useAsync(
    () => (id ? fetchVariantOverview(id) : Promise.resolve(null)),
    [id],
  )

  // Which superpops have ANY variant in this phenotype's overview — the same
  // resolved/gene-matched rows the linked table shows (recomputes what
  // VariantOverviewTable computes internally; cheap, sub-millisecond, and
  // keeps the two in agreement). Feeds three things: AncestryPies greys out
  // a superpop with zero variant-level results while viewing variant mode
  // (e.g. LDL cholesterol has none in EAS, despite having gene-level
  // results); the exact-match ("exclusive") filter must not count a
  // never-observed superpop toward the ticked-set size (see
  // matchesAncFilter); and it's passed to VariantOverviewTable so both places
  // share one computation.
  const variantAncAvailable = useMemo(() => {
    if (!overview || !geneIndex) return null
    const avail = new Set<number>()
    for (const r of variantOverviewRows(overview, geneIndex)) {
      for (const a of decodeAncMask(r.ancMask)) avail.add(a)
    }
    return avail
  }, [overview, geneIndex])

  const variantAncAvailableNames = useMemo(
    () =>
      variantAncAvailable
        ? new Set([...variantAncAvailable].map((a) => ANCESTRIES[a]))
        : null,
    [variantAncAvailable],
  )

  const { data, loading, error } = useAsync(
    () =>
      id
        ? fetchPhenotype(id, ANCESTRY_META[ancestry].suffix)
        : Promise.reject(new Error('no id')),
    [id, ancestry],
  )

  const [tableFilter, setTableFilter] = useState<TableFilter>(NO_TABLE_FILTER)
  const [geneQuery, setGeneQuery] = useState('')
  const ancIdx = ANCESTRY_INDEX[ancestry]

  // Filter state for the variant-overview table, lifted up (rather than kept
  // local to VariantOverviewTable) so the linked Manhattan can drop down to
  // the same subset once a filter is active — see `variantManhattanIdx`.
  const [variantQuery, setVariantQuery] = useState('')
  const [variantMinLp, setVariantMinLp] = useState(0)
  const [variantMinAbsBeta, setVariantMinAbsBeta] = useState(0)
  // All 5 ticked by default (no filtering). Unavailable ancestries (no
  // variants in this phenotype's overview) are greyed out in the UI, not
  // removed from this set — see VariantOverviewTable's `ancAvailable`.
  const [variantAncSel, setVariantAncSel] = useState<Set<number>>(
    () => new Set(SUPERPOP_IDXS),
  )
  // See `matchesAncFilter` — OR (matches-any) by default, subset when true.
  const [variantAncExclusive, setVariantAncExclusive] = useState(false)

  // The page-level ancestry selector (top dropdown + clicking a pie) also
  // narrows the variant view: picking a single superpop shows variants
  // available in it, `non_EUR` shows variants available in any of the 4
  // non-EUR superpops — the same "only"/multi-tick actions the detailed
  // dropdown offers, just driven from the coarser page-wide control.
  // One-directional (this drives the tick-list, not the reverse): most
  // tick-list combinations don't correspond to any single top-level value.
  useEffect(() => {
    if (manhattanMode !== 'variant') return
    if (ancestry === 'All') {
      setVariantAncSel(new Set(SUPERPOP_IDXS))
    } else if (ancestry === 'non_EUR') {
      setVariantAncSel(new Set(SUPERPOP_IDXS.filter((a) => ANCESTRIES[a] !== 'EUR')))
    } else {
      setVariantAncSel(new Set([ANCESTRY_INDEX[ancestry]]))
    }
    setVariantAncExclusive(false)
  }, [ancestry, manhattanMode])

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

  // Same predicate as the gene table below (tableRows), applied directly to
  // `rows` so the Manhattan always shows exactly what the table shows.
  const manhattanRows = useMemo<PhenoRow[]>(() => {
    const q = geneQuery.trim().toLowerCase()
    return rows.filter((r) => {
      if (!passesTableFilter(tableFilter, r.lp, r.beta)) return false
      if (!q) return true
      const symbol = geneIndex?.symbols[r.geneIdx] || geneIndex?.ids[r.geneIdx] || ''
      return symbol.toLowerCase().includes(q)
    })
  }, [rows, tableFilter, geneQuery, geneIndex])

  // Same predicate as VariantOverviewTable's own filteredRows, so its linked
  // Manhattan can show exactly the matching subset once a filter is active —
  // and fall back to the full pixel-decimated overview (including the null
  // band) the rest of the time. Recomputing this over the ~20-50k overview
  // rows on every keystroke is still sub-millisecond, same as the all-results
  // and gene-level Manhattans.
  const variantFilterActive =
    variantQuery.trim() !== '' ||
    variantMinLp > 0 ||
    variantMinAbsBeta > 0 ||
    variantAncSel.size < SUPERPOP_IDXS.length ||
    variantAncExclusive
  const variantManhattanIdx = useMemo(() => {
    if (!overview || !geneIndex || !variantFilterActive) return null
    const q = variantQuery.trim().toLowerCase()
    const avail = variantAncAvailable ?? new Set<number>()
    const idx = new Set<number>()
    for (const r of variantOverviewRows(overview, geneIndex)) {
      if (variantMinLp > 0 && r.lp < variantMinLp) continue
      if (variantMinAbsBeta > 0 && !(r.beta != null && Math.abs(r.beta) >= variantMinAbsBeta))
        continue
      if (!matchesAncFilter(r.ancMask, variantAncSel, variantAncExclusive, avail)) continue
      if (q && !r.symbol.toLowerCase().includes(q) && !r.ensg.toLowerCase().includes(q)) continue
      idx.add(r.idx)
    }
    return idx
  }, [
    overview,
    geneIndex,
    variantFilterActive,
    variantQuery,
    variantMinLp,
    variantMinAbsBeta,
    variantAncSel,
    variantAncExclusive,
    variantAncAvailable,
  ])

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
      let hetLp: number | null = null
      for (const aStr in lookups) {
        const a = Number(aStr)
        const hit = lookups[a].get(br.geneIdx)
        if (hit) {
          lp[a] = hit.lp
          beta[a] = hit.beta
          if (a === 0) hetLp = hit.hetLp // anc 0 = All (meta)
        }
      }
      return { key: br.geneIdx, geneIdx: br.geneIdx, lp, beta, hetLp }
    })
  }, [rows, lookups])

  const tableRows = useMemo(() => {
    const q = geneQuery.trim().toLowerCase()
    return gridRows.filter((r) => {
      if (!passesTableFilter(tableFilter, r.lp[ancIdx], r.beta[ancIdx])) return false
      if (!q) return true
      const symbol = geneIndex?.symbols[r.geneIdx] || geneIndex?.ids[r.geneIdx] || ''
      return symbol.toLowerCase().includes(q)
    })
  }, [gridRows, tableFilter, ancIdx, geneQuery, geneIndex])
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
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          {/* shrink-[3]: outweighs FilterBar's default shrink (1) so this
              column (and its own wrapping subtitle line) gives up width
              first — matches GenePage/AllResultsPage. */}
          <div className="flex min-w-0 shrink-[3] flex-col gap-1">
            <h1 className="text-xl font-semibold text-ink">{pheno.name}</h1>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
              <span className="rounded bg-surface px-1.5 py-0.5 font-medium text-ink-soft">
                {pheno.category}
              </span>
              <span className="text-ink-faint">
                {pheno.id} · {pheno.type === 'binary' ? 'binary' : 'quantitative'} ·{' '}
                <span className="tnum">{nSig}</span> genes past significance (P &lt;{' '}
                {fmtP(SIG_GENE_CAUCHY)}) here
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

      <AncestryPies
        pheno={pheno}
        available={available}
        variantAvailable={manhattanMode === 'variant' ? variantAncAvailableNames : null}
        selected={ancestry}
        onSelect={(a) => setFilters({ ...filters, ancestry: a })}
      />

      {loading && <Spinner label="Loading association results…" />}
      {error && (
        <Notice title="Could not load results">{String(error.message)}</Notice>
      )}

      {data && !loading && (
        <>
          <section className="mb-3 rounded-lg border border-line bg-surface p-2">
            <div className="mb-1 flex items-center gap-1.5 px-2">
              <span className="text-xs font-semibold text-ink-soft">Manhattan</span>
              <div className="inline-flex overflow-hidden rounded border border-line">
                <ManhattanModeButton
                  active={manhattanMode === 'gene'}
                  onClick={() => setManhattanMode('gene')}
                >
                  Gene
                </ManhattanModeButton>
                <ManhattanModeButton
                  active={manhattanMode === 'variant'}
                  onClick={() => {
                    setManhattanMode('variant')
                    // Variant-level data is cross-ancestry meta only (see the
                    // caption below), so keep the ancestry selector honest
                    // about what's actually shown instead of leaving it on
                    // whatever stratum the gene-level view had picked.
                    setFilters((f) => ({ ...f, ancestry: 'All' }))
                  }}
                >
                  Variant
                </ManhattanModeButton>
              </div>
            </div>
            {manhattanMode === 'gene' ? (
              <ManhattanPlot
                rows={manhattanRows}
                geneIndex={geneIndex!}
                highlightGeneIdx={hoverGeneIdx}
                onSelect={(gi) =>
                  setDrawer({
                    ensg: geneIndex!.ids[gi],
                    symbol: geneIndex!.symbols[gi] || geneIndex!.ids[gi],
                  })
                }
              />
            ) : overviewError ? (
              <Notice title="Could not load variant overview">
                {String(overviewError.message)}
              </Notice>
            ) : overview ? (
              <VariantManhattanPlot
                overview={overview}
                geneIndex={geneIndex!}
                traitType={pheno.type}
                onlyIdx={variantManhattanIdx}
                highlightIdx={hoverVariantIdx}
                onSelect={(pick) =>
                  setVariantDrawer({
                    ...pick,
                    ensg: geneIndex!.ids[pick.geneIdx],
                    symbol: geneIndex!.symbols[pick.geneIdx] || geneIndex!.ids[pick.geneIdx],
                  })
                }
              />
            ) : (
              <div className="flex h-[240px] items-center justify-center">
                <Spinner label="Loading genome-wide variants…" />
              </div>
            )}
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-xs text-ink-faint">
              {manhattanMode === 'gene' ? (
                <>
                  <span>
                    {MASK_META[filters.maskIndex].label} · {filters.test}
                  </span>
                  <ThresholdLegend />
                  <span>· click a gene for its cross-ancestry forest</span>
                </>
              ) : (
                <>
                  <span>
                    Effect sizes are the cross-ancestry meta · filtering by ancestry
                    narrows which variants are shown, not their values
                  </span>
                  <VariantThresholdLegend />
                  <span>· click a variant for its cross-ancestry forest plot</span>
                </>
              )}
            </div>
          </section>

          {manhattanMode === 'gene' ? (
            <>
              <div className="mb-1.5">
                <TableFilters
                  value={tableFilter}
                  onChange={setTableFilter}
                  maxLp={maxLp}
                  maxAbsBeta={maxAbsBeta}
                  search={geneQuery}
                  onSearchChange={setGeneQuery}
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
                pheno={pheno}
                ancestry={ancestry}
                ancestryN={pheno.n?.[ancestry]}
                focusedEnsg={drawer?.ensg ?? null}
                onOpenForest={setDrawer}
                onHoverRow={setHoverGeneIdx}
              />
            </>
          ) : (
            overview &&
            !overviewError && (
              <VariantOverviewTable
                overview={overview}
                geneIndex={geneIndex!}
                pheno={pheno}
                filters={filters}
                query={variantQuery}
                onQueryChange={setVariantQuery}
                minLp={variantMinLp}
                onMinLpChange={setVariantMinLp}
                minAbsBeta={variantMinAbsBeta}
                onMinAbsBetaChange={setVariantMinAbsBeta}
                ancSel={variantAncSel}
                onAncSelChange={setVariantAncSel}
                ancExclusive={variantAncExclusive}
                onAncExclusiveChange={setVariantAncExclusive}
                ancAvailable={variantAncAvailable ?? EMPTY_ANC_AVAILABLE}
                focusedVariant={variantDrawer}
                onOpenForest={(pick) =>
                  setVariantDrawer({
                    ...pick,
                    ensg: geneIndex!.ids[pick.geneIdx],
                    symbol: geneIndex!.symbols[pick.geneIdx] || geneIndex!.ids[pick.geneIdx],
                  })
                }
                onHoverRow={setHoverVariantIdx}
              />
            )
          )}
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
          onOpenGene={() => navigate(geneLinkPath(drawer.ensg, pheno.id, filters))}
        />
      )}

      {variantDrawer && (
        <VariantForestDrawer
          ensg={variantDrawer.ensg}
          symbol={variantDrawer.symbol}
          chr={variantDrawer.chr}
          pos={variantDrawer.pos}
          approxLp={variantDrawer.lp}
          phenoIdx={phenoIdx}
          trait={pheno}
          onClose={() => setVariantDrawer(null)}
          onOpenGene={() => navigate(geneLinkPath(variantDrawer.ensg, pheno.id, filters))}
        />
      )}
      </div>
    </>
  )
}

/**
 * Cross-ancestry forest for a single variant clicked in the variant Manhattan
 * — distinct from ForestDrawer's gene-level Burden/SKAT-O forest above.
 * The overview point carries only chr/pos (+ an approximate lp for
 * disambiguation), not ref/alt, so the exact variant is resolved from the
 * gene's variant file by matching position within the current phenotype's
 * slice, breaking multi-allelic ties by nearest lp.
 */
function VariantForestDrawer({
  ensg,
  symbol,
  chr,
  pos,
  approxLp,
  phenoIdx,
  trait,
  onClose,
  onOpenGene,
}: {
  ensg: string
  symbol: string
  chr: string
  pos: number
  approxLp: number
  phenoIdx: number
  trait: PhenotypeMeta
  onClose: () => void
  onOpenGene: () => void
}) {
  const { data: variantSplit } = useAsync(
    () => fetchVariantSplit().catch(() => ({ split: [] as string[] })),
    [],
  )
  const split = variantSplit?.split.includes(ensg) ?? false

  const { data, loading, error } = useAsync(
    () => fetchGeneVariants(ensg, phenoIdx, split),
    [ensg, phenoIdx, split],
  )

  const variant = useMemo(() => {
    if (!data) return null
    const sl = data.by_pheno[String(phenoIdx)]
    if (!sl) return null
    let best: { ref: string; alt: string; d: number } | null = null
    for (let i = 0; i < sl.idx.length; i++) {
      const v = sl.idx[i]
      if (data.pos[v] !== pos) continue
      const d = Math.abs((sl.lp[i] ?? 0) - approxLp)
      if (!best || d < best.d) best = { ref: data.ref[v], alt: data.alt[v], d }
    }
    return best
  }, [data, phenoIdx, pos, approxLp])

  const anc = useAsync(
    () =>
      variant
        ? fetchGeneVariantsAnc(ensg, phenoIdx, split)
        : Promise.resolve(null),
    [ensg, phenoIdx, split, variant != null],
  )

  const forestRows = useMemo(
    () =>
      data && variant
        ? variantForest(data, anc.data, phenoIdx, pos, variant.ref, variant.alt)
        : [],
    [data, anc.data, variant, phenoIdx, pos],
  )

  const label = variant ? `chr${chr}-${pos}-${variant.ref}-${variant.alt}` : undefined

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-ink/20" onClick={onClose} />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-y-auto bg-surface shadow-2xl">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <div>
            <h2 className="tnum text-base font-semibold text-ink">
              chr{chr}:{fmtPos(pos)}
              {variant && ` ${variant.ref}›${variant.alt}`}
            </h2>
            <p className="text-xs text-ink-faint">
              {symbol} · {trait.name} · effect across ancestries
            </p>
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
          {error &&
            (error instanceof HttpError && error.status === 404 ? (
              <Notice title="No variant data for this gene">
                {trait.name} variants aren’t in the current data release.
              </Notice>
            ) : (
              <Notice title="Could not load variant">{String(error.message)}</Notice>
            ))}
          {data && !variant && (
            <Notice title="Variant not found">
              This position couldn’t be matched to a variant in {symbol}’s data
              for {trait.name}.
            </Notice>
          )}
          {variant && (
            <VariantForest
              rows={forestRows}
              trait={trait}
              loading={anc.loading}
              label={label}
              symbol={symbol}
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

function ManhattanModeButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`px-1.5 py-px text-xs ${
        active ? 'bg-ink-soft text-white' : 'bg-surface text-ink-soft hover:bg-surface-alt'
      }`}
    >
      {children}
    </button>
  )
}

function ResultsTable({
  rows,
  reservedRows,
  ancIdxs,
  selAncIdx,
  loadedAnc,
  filters,
  pheno,
  ancestry,
  ancestryN,
  focusedEnsg,
  onOpenForest,
  onHoverRow,
}: {
  rows: PhenoGridRow[]
  reservedRows?: number
  ancIdxs: number[]
  selAncIdx: number
  loadedAnc: Set<number>
  filters: FilterState
  pheno: PhenotypeMeta
  ancestry: Ancestry
  ancestryN?: { n: number; case?: number; ctrl?: number }
  /** The gene whose forest drawer is currently open, if any. */
  focusedEnsg: string | null
  onOpenForest: (g: { ensg: string; symbol: string }) => void
  onHoverRow?: (geneIdx: number | null) => void
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
            to={geneLinkPath(c.row.original.ensg, pheno.id, filters)}
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
      hetColumn<TableRow>({ pending: () => !loadedAnc.has(0) }),
    ],
    [ancIdxs, selAncIdx, loadedAnc, betaGridMax, filters, pheno.id],
  )

  // Mirrors the gene page's export: the qualifying constants (trait, mask, MAF,
  // test) become columns, so a row means the same thing outside the page.
  // Columns not yet loaded export blank, exactly as they render ("…").
  const exportSpec = useMemo<TableExport<TableRow>>(() => {
    const mask = MASK_META[filters.maskIndex]
    return {
      noun: 'genes',
      filename: `brava_${slug(pheno.id)}_${slug(mask.short)}_maf${MAF_META[filters.mafIndex].value}_${slug(filters.test)}.tsv`,
      columns: [
        { header: 'phenotype_id', value: () => pheno.id },
        { header: 'phenotype', value: () => pheno.name },
        { header: 'category', value: () => pheno.category },
        { header: 'trait_type', value: () => pheno.type },
        { header: 'gene', value: (r) => r.symbol },
        { header: 'ensembl_gene_id', value: (r) => r.ensg },
        { header: 'chrom', value: (r) => r.chr },
        { header: 'gene_start', value: (r) => r.start },
        { header: 'variant_mask', value: () => mask.raw },
        { header: 'max_maf', value: () => MAF_META[filters.mafIndex].value },
        { header: 'test', value: () => filters.test },
        ...ancestryExportColumns<TableRow>(ancIdxs),
        ...hetExportColumn<TableRow>(),
      ] satisfies ExportColumn<TableRow>[],
    }
  }, [pheno, filters.maskIndex, filters.mafIndex, filters.test, ancIdxs])

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
      · <BetaLegend test={filters.test} />
    </span>
  )

  return (
    <VirtualTable
      data={tableRows}
      columns={columns}
      sorting={sorting}
      onSortingChange={setSorting}
      onRowClick={(r) => onOpenForest({ ensg: r.ensg, symbol: r.symbol })}
      onRowHover={(r) => onHoverRow?.(r ? r.geneIdx : null)}
      isRowSelected={(r) => r.ensg === focusedEnsg}
      caption={caption}
      exportSpec={exportSpec}
      reservedRows={reservedRows}
    />
  )
}

/**
 * Small quiet icon-link beside a variant's location, to that exact variant
 * pre-selected on the gene page's variant table (see GeneVariants'
 * `seekVariant` + GenePage's `variantSectionPath`). `variantSectionPath` only
 * takes pos + this row's (decimated) lp — not ref/alt, even though the
 * overview carries them too now — so the gene page still resolves the precise
 * variant by matching position and, for a multi-allelic site, nearest lp.
 * Styled like GeneVariants' own `GnomadLink`: faint until hover, since it's a
 * secondary affordance beside the primary cell text. Click is stopped from
 * bubbling so it doesn't also open the row's forest.
 */
function OnGenePageLink({
  ensg,
  phenoId,
  pos,
  lp,
}: {
  ensg: string
  phenoId: string
  pos: number
  lp: number
}) {
  return (
    <Tip label="View this variant on the gene page" className="inline-flex shrink-0 items-center">
      <Link
        to={variantSectionPath(ensg, phenoId, { pos, lp })}
        onClick={(e) => e.stopPropagation()}
        aria-label="View this variant on the gene page"
        className="shrink-0 text-ink-faint transition-colors hover:text-brand"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          className="h-3 w-3"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="7" />
          <line x1="12" y1="2" x2="12" y2="5" />
          <line x1="12" y1="19" x2="12" y2="22" />
          <line x1="2" y1="12" x2="5" y2="12" />
          <line x1="19" y1="12" x2="22" y2="12" />
        </svg>
      </Link>
    </Tip>
  )
}

/**
 * Table for the variant-level section: the exhaustive P ≤ overview.keep_lp
 * tail of the genome-wide overview (the thinned null band below that isn't a
 * complete list — one decorative point per pixel bin — so it's excluded here,
 * unlike the Manhattan plot above which draws it for visual density). Rows
 * without a resolved gene are dropped too: there's no gene file to open a
 * forest from, so they'd be inert in a clickable table.
 */
function VariantOverviewTable({
  overview,
  geneIndex,
  pheno,
  filters,
  query,
  onQueryChange,
  minLp,
  onMinLpChange,
  minAbsBeta,
  onMinAbsBetaChange,
  ancSel,
  onAncSelChange,
  ancExclusive,
  onAncExclusiveChange,
  ancAvailable,
  focusedVariant,
  onOpenForest,
  onHoverRow,
}: {
  overview: VariantOverview
  geneIndex: GeneIndex
  pheno: PhenotypeMeta
  filters: FilterState
  /** Lifted to the page so the linked Manhattan can show the same subset
   *  once a filter narrows this table (see `variantManhattanIdx`). */
  query: string
  onQueryChange: (v: string) => void
  minLp: number
  onMinLpChange: (v: number) => void
  /** Same |β| ≥ filter as the gene page's per-gene variant table. */
  minAbsBeta: number
  onMinAbsBetaChange: (v: number) => void
  /** Ticked superpop ANCESTRY_INDEX values to include — see `AncestryFilterChips`. */
  ancSel: Set<number>
  onAncSelChange: (next: Set<number>) => void
  /** See `matchesAncFilter` — OR (matches-any) by default, subset when true. */
  ancExclusive: boolean
  onAncExclusiveChange: (next: boolean) => void
  /** Which superpops have any variant here at all — computed once at the page
   *  level (shared with AncestryPies and the linked Manhattan) so this and
   *  `variantManhattanIdx` can't disagree. Greys out a checkbox in the
   *  dropdown and anchors `matchesAncFilter`'s exact-match size comparison. */
  ancAvailable: Set<number>
  /** The variant currently shown in the forest drawer, if any. */
  focusedVariant: VariantPick | null
  onOpenForest: (pick: VariantPick) => void
  onHoverRow?: (idx: number | null) => void
}) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'lp', desc: true }])

  const rows = useMemo(() => variantOverviewRows(overview, geneIndex), [overview, geneIndex])

  // Slider domain: every row already clears `overview.keep_lp` by construction
  // (see `rows` above), so `maxLp` is really the ceiling of an already-
  // significant range, not 0..max — same idea as the gene table's `maxLp`.
  const { maxLp, maxAbsBeta } = useMemo(() => {
    let lp = overview.keep_lp
    let b = 0
    for (const r of rows) {
      lp = Math.max(lp, r.lp)
      if (r.beta != null) b = Math.max(b, Math.abs(r.beta))
    }
    return { maxLp: lp, maxAbsBeta: b }
  }, [rows, overview.keep_lp])

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return rows.filter(
      (r) =>
        (!q || r.symbol.toLowerCase().includes(q) || r.ensg.toLowerCase().includes(q)) &&
        (minLp <= 0 || r.lp >= minLp) &&
        (minAbsBeta <= 0 || (r.beta != null && Math.abs(r.beta) >= minAbsBeta)) &&
        matchesAncFilter(r.ancMask, ancSel, ancExclusive, ancAvailable),
    )
  }, [rows, query, minLp, minAbsBeta, ancSel, ancExclusive, ancAvailable])

  const columns = useMemo<ColumnDef<VariantOverviewRow, any>[]>(
    () => [
      {
        id: 'variant',
        header: 'Variant',
        // Mirrors the gene page's per-gene variant table's Variant column
        // (GeneVariants.tsx): position + ref›alt in one cell, leading the row
        // the same way it does there.
        accessorFn: (r) => locusKey(r.chr, r.pos),
        invertSorting: true,
        size: 195,
        // `fill` (own layout, no truncating wrapper) so the link icon keeps
        // its pixels — same reasoning as GeneVariants' Variant column.
        meta: { fill: true, help: 'GRCh38 position and alleles (reference›alternate).' },
        cell: (c) => {
          const r = c.row.original
          return (
            <div className="flex w-full min-w-0 items-center gap-1 px-2 whitespace-nowrap">
              <span className="tnum truncate text-ink">
                chr{r.chr}:{fmtPos(r.pos)}{' '}
                <span className="text-ink-soft">
                  {r.ref}›{r.alt}
                </span>
              </span>
              <OnGenePageLink ensg={r.ensg} phenoId={pheno.id} pos={r.pos} lp={r.lp} />
            </div>
          )
        },
      },
      {
        id: 'ancestries',
        header: 'Ancestries',
        // Sorts by mask value, not "how many" — fine, since this column is
        // mostly scanned/filtered, not sorted (no natural order on which set
        // of ancestries "comes first").
        accessorFn: (r) => r.ancMask,
        size: 150,
        // `fill` (own layout, no truncating wrapper) — a row of chips isn't a
        // single truncatable string, same reasoning as the Variant column.
        meta: {
          fill: true,
          help: 'Which populations (EUR/AFR/AMR/EAS/SAS) contributed to this variant’s meta-analysis.',
        },
        cell: (c) => (
          <div className="flex w-full min-w-0 items-center px-2">
            <AncestryChips mask={c.getValue<number>()} />
          </div>
        ),
      },
      {
        accessorKey: 'symbol',
        header: 'Gene',
        size: 120,
        cell: (c) => (
          <Link
            to={geneLinkPath(c.row.original.ensg, pheno.id, filters)}
            onClick={(e) => e.stopPropagation()}
            className="font-medium text-brand hover:underline"
          >
            {c.getValue<string>()}
          </Link>
        ),
      },
      {
        id: 'lp',
        header: 'P-value',
        accessorFn: (r) => r.lp,
        size: 120,
        meta: { help: 'Association p-value from the cross-ancestry meta-analysis.' },
        cell: (c) => (
          <span className="tnum inline-flex items-center gap-1.5">
            <SigDot lp={c.getValue<number>()} kind="variant" />
            {fmtPLog(c.getValue<number>())}
          </span>
        ),
      },
      {
        id: 'beta',
        header: 'Beta',
        // Matches the gene page's variant table's Beta column exactly (same
        // DirDot + fmtBeta) — the overview carries the real cross-ancestry
        // meta β, not just its sign; see `sortUndefined` note on other
        // nullable columns in this file.
        accessorFn: (r) => r.beta ?? undefined,
        sortUndefined: 'last',
        size: 110,
        meta: {
          help: `Effect size for the alternate allele, in ${
            pheno.type === 'binary' ? 'log-odds units (log OR)' : 'trait SD units'
          }.`,
        },
        cell: (c) => {
          const b = c.getValue<number | undefined>()
          return (
            <span className="tnum inline-flex items-center gap-1.5">
              <DirDot
                beta={b}
                type={pheno.type}
                intensity={b != null && maxAbsBeta > 0 ? Math.abs(b) / maxAbsBeta : undefined}
              />
              {fmtBeta(b)}
            </span>
          )
        },
      },
    ],
    [pheno.type, pheno.id, filters, maxAbsBeta],
  )

  const exportSpec = useMemo<TableExport<VariantOverviewRow>>(
    () => ({
      noun: 'variants',
      filename: `brava_${slug(pheno.id)}_variants.tsv`,
      columns: [
        { header: 'phenotype_id', value: () => pheno.id },
        { header: 'phenotype', value: () => pheno.name },
        { header: 'gene', value: (r) => r.symbol },
        { header: 'ensembl_gene_id', value: (r) => r.ensg },
        { header: 'chrom', value: (r) => r.chr },
        { header: 'pos', value: (r) => r.pos },
        { header: 'ref', value: (r) => r.ref },
        { header: 'alt', value: (r) => r.alt },
        { header: 'P', value: (r) => exportP(r.lp) },
        { header: 'neglog10P', value: (r) => r.lp },
        { header: 'beta', value: (r) => r.beta },
        {
          header: 'ancestries',
          value: (r) => decodeAncMask(r.ancMask).map((a) => ANCESTRIES[a]).join(','),
        },
      ] satisfies ExportColumn<VariantOverviewRow>[],
    }),
    [pheno],
  )

  const caption = (
    <span>
      Variants with P &gt; {fmtP(Math.pow(10, -overview.keep_lp))} excluded ·
      cross-ancestry meta
    </span>
  )
  const filterActive =
    query.trim() !== '' ||
    minLp > 0 ||
    minAbsBeta > 0 ||
    ancSel.size < SUPERPOP_IDXS.length ||
    ancExclusive
  const betaMax = maxAbsBeta > 0 ? Math.ceil(maxAbsBeta * 20) / 20 : 1

  return (
    <>
      <div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface px-3 py-1.5">
        <SearchInput label="Gene" value={query} onChange={onQueryChange} />
        <FilterRow
          label="P ≤"
          kind="p"
          min={0}
          max={maxLp}
          step={0.1}
          stored={minLp}
          onChange={onMinLpChange}
        />
        <FilterRow
          // normal-case: see the matching comment on the gene page's own β
          // filter row — uppercase turns β (U+03B2) into a Greek capital Β,
          // a dead ringer for Latin "B".
          label={
            <>
              |<span className="normal-case">β</span>| ≥
            </>
          }
          kind="beta"
          min={0}
          max={betaMax}
          step={betaMax / 100}
          stored={minAbsBeta}
          onChange={onMinAbsBetaChange}
        />
        <AncestryFilterChips
          sel={ancSel}
          onChange={onAncSelChange}
          available={ancAvailable}
          exclusive={ancExclusive}
          onExclusiveChange={onAncExclusiveChange}
        />
        {filterActive && (
          <button
            type="button"
            onClick={() => {
              onQueryChange('')
              onMinLpChange(0)
              onMinAbsBetaChange(0)
              onAncSelChange(new Set(SUPERPOP_IDXS))
              onAncExclusiveChange(false)
            }}
            className="text-xs text-ink-faint hover:text-ink hover:underline"
          >
            reset
          </button>
        )}
        <span className="ml-auto text-xs text-ink-faint">
          {filteredRows.length.toLocaleString()}
          {filteredRows.length !== rows.length &&
            ` of ${rows.length.toLocaleString()}`}{' '}
          variants · click a row for its forest
        </span>
      </div>
      <VirtualTable
        data={filteredRows}
        columns={columns}
        sorting={sorting}
        onSortingChange={setSorting}
        onRowClick={(r) =>
          onOpenForest({ geneIdx: r.geneIdx, chr: r.chr, pos: r.pos, lp: r.lp })
        }
        onRowHover={(r) => onHoverRow?.(r ? r.idx : null)}
        isRowSelected={(r) =>
          focusedVariant != null &&
          r.chr === focusedVariant.chr &&
          r.pos === focusedVariant.pos
        }
        caption={caption}
        exportSpec={exportSpec}
        fixedRows={15}
      />
    </>
  )
}
