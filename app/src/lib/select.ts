import type {
  GeneData,
  GeneVariantAncData,
  GeneVariantData,
  PhenotypeData,
} from '../data/types'
import { ANCESTRIES, type Test } from './constants'

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

// --- variant-level (v2) -------------------------------------------------------

/** One variant's meta association for a phenotype (a table row / Manhattan pt). */
export interface VariantRow {
  pos: number
  ref: string
  alt: string
  beta: number | null
  se: number | null
  lp: number | null
  nc: number | null
  ne: number | null
  i2: number | null
  cq: number | null
  ed: string | null
}

/** Reconstruct the All-meta variants for one phenotype from a gene variant file. */
export function variantRows(d: GeneVariantData, phenoIdx: number): VariantRow[] {
  const sl = d.by_pheno[String(phenoIdx)]
  if (!sl) return []
  const out: VariantRow[] = new Array(sl.idx.length)
  for (let i = 0; i < sl.idx.length; i++) {
    const v = sl.idx[i]
    out[i] = {
      pos: d.pos[v],
      ref: d.ref[v],
      alt: d.alt[v],
      beta: sl.beta[i] ?? null,
      se: sl.se[i] ?? null,
      lp: sl.lp[i] ?? null,
      nc: sl.nc[i] ?? null,
      ne: sl.ne[i] ?? null,
      i2: sl.i2[i] ?? null,
      cq: sl.cq[i] ?? null,
      ed: sl.ed[i] ?? null,
    }
  }
  return out
}

/** Effect estimate for one variant in one ancestry, for the forest plot. */
export interface VariantForestRow {
  ancIdx: number
  beta: number | null
  se: number | null
  lp: number | null
}

/**
 * Per-ancestry effect sizes for a single variant (matched by pos/ref/alt) for a
 * phenotype: `All` (index 0) from the meta file, the rest from the lazy anc
 * file. Returned in canonical ancestry order.
 */
export function variantForest(
  meta: GeneVariantData,
  anc: GeneVariantAncData | null,
  phenoIdx: number,
  pos: number,
  ref: string,
  alt: string,
): VariantForestRow[] {
  const rows: VariantForestRow[] = []
  const key = `${pos}\t${ref}\t${alt}`

  const metaSl = meta.by_pheno[String(phenoIdx)]
  if (metaSl) {
    for (let i = 0; i < metaSl.idx.length; i++) {
      const v = metaSl.idx[i]
      if (`${meta.pos[v]}\t${meta.ref[v]}\t${meta.alt[v]}` === key) {
        rows.push({
          ancIdx: 0,
          beta: metaSl.beta[i] ?? null,
          se: metaSl.se[i] ?? null,
          lp: metaSl.lp[i] ?? null,
        })
        break
      }
    }
  }

  if (anc) {
    for (const [ancIdxStr, byPheno] of Object.entries(anc.by_anc)) {
      const sl = byPheno[String(phenoIdx)]
      if (!sl) continue
      for (let i = 0; i < sl.idx.length; i++) {
        const v = sl.idx[i]
        if (`${anc.pos[v]}\t${anc.ref[v]}\t${anc.alt[v]}` === key) {
          rows.push({
            ancIdx: Number(ancIdxStr),
            beta: sl.beta[i] ?? null,
            se: sl.se[i] ?? null,
            lp: sl.lp[i] ?? null,
          })
          break
        }
      }
    }
  }

  return rows.sort((a, b) => a.ancIdx - b.ancIdx)
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

// --- per-ancestry grid (the P + β table) -------------------------------------

const N_ANC = ANCESTRIES.length

/**
 * One table row of the per-ancestry grid: a p-value (for the chosen test) and
 * an IVW Burden β per ancestry, indexed by the canonical ancestry order
 * (0 = All meta … 6 = non_EUR). Missing strata are null.
 */
export interface GridRow {
  /** Row key: phenotype index (gene page) or gene index (phenotype page). */
  key: number
  lp: (number | null)[]
  beta: (number | null)[]
}

const emptyGridRow = (key: number): GridRow => ({
  key,
  lp: new Array(N_ANC).fill(null),
  beta: new Array(N_ANC).fill(null),
})

/**
 * Gene page: pivot one gene's payload into per-phenotype rows carrying every
 * ancestry's p-value + β for the selected mask + maf + test. All ancestries are
 * already in the gene file, so this needs no extra fetch.
 */
export function geneAncestryGrid(
  d: GeneData,
  f: Filters,
): GridRow[] {
  const lp = lpArray(d, f.test)
  const byPheno = new Map<number, GridRow>()
  for (let i = 0; i < d.n; i++) {
    if (d.mask[i] !== f.maskIndex || d.maf[i] !== f.mafIndex) continue
    const p = d.pheno[i]
    let row = byPheno.get(p)
    if (!row) {
      row = emptyGridRow(p)
      byPheno.set(p, row)
    }
    const a = d.anc[i]
    if (a >= 0 && a < N_ANC) {
      row.lp[a] = lp[i] ?? null
      row.beta[a] = d.beta[i] ?? null
    }
  }
  return [...byPheno.values()]
}

/**
 * Phenotype page: build a geneIdx → {lp, β} lookup for one ancestry's payload
 * (selected mask + maf + test). The page fetches each ancestry file separately,
 * then merges these lookups column-by-column into the grid.
 */
export function phenoLookup(
  d: PhenotypeData,
  f: Filters,
): Map<number, { lp: number | null; beta: number | null }> {
  const lp = lpArray(d, f.test)
  const m = new Map<number, { lp: number | null; beta: number | null }>()
  for (let i = 0; i < d.n; i++) {
    if (d.mask[i] !== f.maskIndex || d.maf[i] !== f.mafIndex) continue
    m.set(d.gene_idx[i], { lp: lp[i] ?? null, beta: d.beta[i] ?? null })
  }
  return m
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
