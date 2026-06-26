import type { GeneData, PhenotypeData } from '../data/types'
import type { Test } from './constants'

/** Pick the -log10(p) array for a given test from a columnar payload. */
export function lpArray(
  d: GeneData | PhenotypeData,
  test: Test,
): (number | null)[] {
  return test === 'Burden'
    ? d.lp_burden
    : test === 'SKAT'
      ? d.lp_skat
      : d.lp_skato
}

export interface Filters {
  maskIndex: number
  mafIndex: number
  test: Test
}

/** One row of the phenotype table / Manhattan point. */
export interface PhenoRow {
  geneIdx: number
  lp: number | null
  beta: number | null
  se: number | null
}

/** Filter a phenotype payload to the selected mask + maf, with the test's lp. */
export function phenoRows(d: PhenotypeData, f: Filters): PhenoRow[] {
  const lp = lpArray(d, f.test)
  const out: PhenoRow[] = []
  for (let i = 0; i < d.n; i++) {
    if (d.mask[i] !== f.maskIndex || d.maf[i] !== f.mafIndex) continue
    out.push({
      geneIdx: d.gene_idx[i],
      lp: lp[i] ?? null,
      beta: d.beta[i] ?? null,
      se: d.se[i] ?? null,
    })
  }
  return out
}

/** One ancestry stratum of a forest plot. */
export interface ForestRow {
  ancIdx: number
  beta: number | null
  se: number | null
  lpBurden: number | null
  lpSkato: number | null
}
export interface ForestSeries {
  rows: ForestRow[]
  /** -log10 heterogeneity p from the cross-ancestry (All) meta, if present. */
  hetLp: number | null
}

/**
 * Per-ancestry IVW Burden effect sizes for one gene × phenotype × mask × maf,
 * for the forest plot. Strata are returned in canonical ancestry order.
 */
export function forestSeries(
  d: GeneData,
  opts: { phenoIdx: number; maskIndex: number; mafIndex: number },
): ForestSeries {
  const byAnc = new Map<number, ForestRow>()
  let hetLp: number | null = null
  for (let i = 0; i < d.n; i++) {
    if (
      d.pheno[i] !== opts.phenoIdx ||
      d.mask[i] !== opts.maskIndex ||
      d.maf[i] !== opts.mafIndex
    )
      continue
    byAnc.set(d.anc[i], {
      ancIdx: d.anc[i],
      beta: d.beta[i] ?? null,
      se: d.se[i] ?? null,
      lpBurden: d.lp_burden[i] ?? null,
      lpSkato: d.lp_skato[i] ?? null,
    })
    if (d.anc[i] === 0) hetLp = d.lp_het[i] ?? null // anc 0 = All (meta)
  }
  const rows = [...byAnc.values()].sort((a, b) => a.ancIdx - b.ancIdx)
  return { rows, hetLp }
}

/** One row of the gene table / PheWAS point. */
export interface GeneRow {
  phenoIdx: number
  ancIdx: number
  maskIndex: number
  mafIndex: number
  lp: number | null
  beta: number | null
  se: number | null
}

/** Filter a gene payload; pass null for a dimension to leave it unconstrained. */
export function geneRows(
  d: GeneData,
  opts: {
    test: Test
    ancIdx?: number | null
    maskIndex?: number | null
    mafIndex?: number | null
  },
): GeneRow[] {
  const lp = lpArray(d, opts.test)
  const out: GeneRow[] = []
  for (let i = 0; i < d.n; i++) {
    if (opts.ancIdx != null && d.anc[i] !== opts.ancIdx) continue
    if (opts.maskIndex != null && d.mask[i] !== opts.maskIndex) continue
    if (opts.mafIndex != null && d.maf[i] !== opts.mafIndex) continue
    out.push({
      phenoIdx: d.pheno[i],
      ancIdx: d.anc[i],
      maskIndex: d.mask[i],
      mafIndex: d.maf[i],
      lp: lp[i] ?? null,
      beta: d.beta[i] ?? null,
      se: d.se[i] ?? null,
    })
  }
  return out
}
