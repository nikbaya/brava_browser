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

/**
 * One gene's model: the MANE Select transcript (or Ensembl canonical where no
 * MANE Select exists), as emitted by pipeline/build_exons.py. `exons` and `cds`
 * are flat [offset, length, offset, length, …] pairs relative to `start`, sorted
 * ascending by position. CDS spans are a subset of the exons — the difference is
 * UTR, which is drawn shorter (gnomAD convention).
 */
export interface GeneModel {
  tx: string // Ensembl transcript ID (no version suffix)
  src: 'mane_select' | 'ensembl_canonical'
  strand: 1 | -1
  start: number // GRCh38 bp of the transcript's first exon
  exons: number[]
  cds: number[]
}

/** meta/exons/chr{N}.json — gene models for one chromosome, keyed by ENSG. */
export interface ExonShard {
  chr: string
  genes: Record<string, GeneModel>
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

/** One biobank's contribution to a (phenotype × ancestry); a pie slice. */
export interface BiobankN {
  id: string
  n: number
  case?: number
  ctrl?: number
}
/**
 * meta/pheno_sizes.json — per-biobank sample sizes for each phenotype × super-
 * population (EUR/AFR/AMR/EAS/SAS only). Keyed by the phenotype base id.
 */
export type PhenoSizes = Record<string, Record<string, BiobankN[]>>

/**
 * meta/changelog.json — snapshot of `git log` on `main`, generated at
 * dev/build time by scripts/generate-changelog.js (not committed — see
 * .gitignore). `date` is the commit's author date, ISO 8601.
 */
export interface ChangelogEntry {
  sha: string
  date: string
  message: string
}
export interface ChangelogData {
  commits: ChangelogEntry[]
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

// --- variant-level (v2) -------------------------------------------------------
// See docs/variant-v2-design.md. These files live under the versioned v2/ data
// prefix; coordinates are stored once per file (shared table) and each slice
// references them by integer index. Numbers are aggressively rounded for
// display: beta/se to 3 sig figs, lp (=-log10 p) to 2 dp.

/** Sparse All-meta slice for one phenotype within a gene variant file. */
export interface VariantMetaSlice {
  idx: number[] // indices into the file's pos/ref/alt coord table
  beta: (number | null)[]
  se: (number | null)[]
  lp: (number | null)[]
  nc: (number | null)[] // n cases (binary traits)
  ne: (number | null)[] // effective sample size
  i2: (number | null)[] // Cochran's I^2 (heterogeneity)
  cq: (number | null)[] // Cochran's Q, -log10 p
  ed: (string | null)[] // per-biobank effect-direction string (+/-/?)
  anc_mask: number[] // 5-bit superpop presence bitmask — see decodeAncMask
}

/**
 * variant/gene/{ENSG}.json — All-meta variants overlapping a gene, keyed by
 * phenotype index. For oversized genes (see meta/variant_split.json) this is
 * instead served per-phenotype as {ENSG}.{pheno_idx}.json holding a single key.
 */
export interface GeneVariantData {
  id: string
  chr: string | null
  nv: number // number of variants in the coord table
  pos: number[]
  ref: string[]
  alt: string[]
  by_pheno: Record<string, VariantMetaSlice> // key = pheno_idx (stringified)
}

/** Per-ancestry slice for the forest plot and stratum-filtered variant table. */
export interface VariantAncSlice {
  idx: number[]
  beta: (number | null)[]
  se: (number | null)[]
  lp: (number | null)[]
  nc: (number | null)[]
  ne: (number | null)[]
  i2: (number | null)[]
  cq: (number | null)[]
}

/**
 * variant/gene/{ENSG}.anc.json — the 6 non-meta ancestries for a gene, lazy.
 * by_anc[ancestry_idx][pheno_idx] -> slice. Powers per-variant forest plots.
 */
export interface GeneVariantAncData {
  id: string
  nv: number
  pos: number[]
  ref: string[]
  alt: string[]
  by_anc: Record<string, Record<string, VariantAncSlice>>
}

/**
 * variant/overview/{PHENO}.json — pixel-decimated genome-wide Manhattan for a
 * phenotype (meta). All variants with lp >= keep_lp retained at full res; the
 * null band thinned to one point per (chrom, position-bin, lp-bin).
 */
export interface VariantOverview {
  pheno: string
  n: number
  keep_lp: number
  chr: number[] // chromosome index 0..23
  pos: number[]
  ref: string[]
  alt: string[]
  lp: number[]
  beta: (number | null)[] // cross-ancestry meta β for the alternate allele
  dir: number[] // sign(beta): 1 (risk↑) / -1 (protective) / 0
  anc_mask: number[] // 5-bit superpop presence bitmask — see decodeAncMask
  gene_idx: number[] // gene for click-through, -1 if none
}

/** meta/variant_split.json — ENSG ids whose variant data is split per-phenotype. */
export interface VariantSplit {
  split: string[]
}

/**
 * meta/all_results.{ANC}.json — every (gene, phenotype, mask, maf, test) row
 * for one ancestry that clears the gene-level Cauchy significance threshold
 * (see pipeline/build_all_results.py), columnar. Sharded per ancestry (like
 * meta/exons/) so a page only pays for the stratum it's showing; each shard is
 * small enough to bundle with the app rather than host on R2. `test_idx`
 * indexes TESTS (0=Burden, 1=SKAT, 2=SKAT-O); `beta` is null outside Burden.
 */
export interface AllResultsData {
  anc: string
  n: number
  pheno_idx: number[]
  gene_idx: number[]
  mask_idx: number[]
  maf_idx: number[]
  test_idx: number[]
  lp: number[]
  beta: (number | null)[]
}
