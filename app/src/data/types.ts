// Wire formats for the static JSON the ETL pipeline emits. All categorical
// dimensions are stored as integer indices into the canonical arrays in
// lib/constants.ts (ancestry, mask, maf) or into the genes/phenotypes indexes.

/** meta/genes.json — canonical gene table; array position is the `gene_idx`. */
export interface GeneIndex {
  ids: string[] // Ensembl gene IDs (ENSG…)
  symbols: string[] // gene symbols ('' if unknown)
  chr: string[] // chromosome ('1'..'22','X','Y')
  start: number[] // GRCh38 start (bp)
  end: number[]
}

/** Sample size for one (phenotype × ancestry); case/ctrl present for binary. */
export interface AncestryN {
  n: number
  case?: number
  ctrl?: number
}

/** meta/phenotypes.json — phenotype catalogue; array position is `pheno_idx`. */
export interface PhenotypeMeta {
  id: string // abbreviation used in filenames (e.g. 'LDLC')
  name: string // full display name
  category: string // grouping (e.g. 'Lipids')
  type: 'binary' | 'quantitative'
  ancestries: string[] // available ancestry strata
  n?: Record<string, AncestryN> // sample size keyed by ancestry name
  sex?: 'female' // present for female-specific analyses
}
export interface PhenotypeIndex {
  phenotypes: PhenotypeMeta[]
}

/** meta/biobanks.json — contributing biobanks (for the About / info page). */
export interface Biobank {
  id: string
  name: string
  country: string
  iso2: string
  flag: string
  lat: number
  lng: number
  sample_size: number
  ascertainment: string
  sequencing: string
  ancestries: string[]
  ancestry_n: Record<string, number>
}
export interface BiobankIndex {
  biobanks: Biobank[]
}

/**
 * gene/{ENSG}.json — every result row for one gene, columnar. Indices align
 * across the parallel arrays. `pheno` indexes phenotypes.json; `anc`/`mask`
 * index the constants arrays; `maf` is 0 (<0.1%) or 1 (<0.01%).
 * lp_* are -log10(p) (2 dp); beta/se are from the IVW Burden test.
 */
export interface GeneData {
  id: string
  symbol: string
  n: number // number of result rows
  pheno: number[]
  anc: number[]
  mask: number[]
  maf: number[]
  // lp_* / beta / se are null for cells where that test/estimate is missing or
  // non-finite (e.g. a degenerate SAIGE stratum); the pipeline emits JSON null.
  lp_burden: (number | null)[]
  lp_skat: (number | null)[]
  lp_skato: (number | null)[]
  lp_het: (number | null)[]
  beta: (number | null)[]
  se: (number | null)[]
}

/**
 * phenotype/{PHENO}.{ANCESTRY}.json — every gene result for one phenotype ×
 * ancestry, columnar. `gene_idx` indexes genes.json. Drives both the Manhattan
 * plot and the results table; the client filters by mask/maf/test.
 */
export interface PhenotypeData {
  pheno: string
  anc: string
  n: number
  gene_idx: number[]
  mask: number[]
  maf: number[]
  lp_burden: (number | null)[]
  lp_skat: (number | null)[]
  lp_skato: (number | null)[]
  lp_het: (number | null)[]
  beta: (number | null)[]
  se: (number | null)[]
}
