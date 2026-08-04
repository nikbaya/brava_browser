import { dataUrl, metaUrl, variantUrl } from './config'
import type {
  BiobankIndex,
  ExonShard,
  GeneData,
  GeneIndex,
  GeneVariantAncData,
  GeneVariantData,
  PhenoSizes,
  PhenotypeData,
  PhenotypeIndex,
  VariantOverview,
  VariantSplit,
} from './types'

// In-memory cache keyed by URL. Files are immutable per data release, so once
// fetched they are reused for the session. Gzip is handled transparently by the
// browser (GCS / Pages serve Content-Encoding: gzip).
const cache = new Map<string, Promise<unknown>>()

async function getJSON<T>(url: string): Promise<T> {
  let p = cache.get(url) as Promise<T> | undefined
  if (!p) {
    p = fetch(url).then((r) => {
      if (!r.ok) throw new HttpError(r.status, url)
      return r.json() as Promise<T>
    })
    cache.set(url, p)
    // Don't cache rejections — allow retry on transient failure.
    p.catch(() => cache.delete(url))
  }
  return p
}

export class HttpError extends Error {
  status: number
  constructor(status: number, url: string) {
    super(`HTTP ${status} for ${url}`)
    this.status = status
  }
}

export const fetchGeneIndex = () =>
  getJSON<GeneIndex>(metaUrl('meta/genes.json'))
export const fetchPhenotypeIndex = () =>
  getJSON<PhenotypeIndex>(metaUrl('meta/phenotypes.json'))
export const fetchBiobankIndex = () =>
  getJSON<BiobankIndex>(metaUrl('meta/biobanks.json'))
export const fetchPhenoSizes = () =>
  getJSON<PhenoSizes>(metaUrl('meta/pheno_sizes.json'))

/**
 * Gene models (exon structure) for one chromosome. Sharded so the gene page
 * pulls ~50–150 KB gzipped instead of the whole 1.4 MB index; bundled with the
 * app, so no remote dependency.
 */
export const fetchExonShard = (chr: string) =>
  getJSON<ExonShard>(metaUrl(`meta/exons/chr${chr}.json`))

export const fetchGene = (ensg: string) =>
  getJSON<GeneData>(dataUrl(`gene/${ensg}.json`))

export const fetchPhenotype = (pheno: string, ancestrySuffix: string) =>
  getJSON<PhenotypeData>(dataUrl(`phenotype/${pheno}.${ancestrySuffix || 'All'}.json`))

// --- variant-level (v2) -------------------------------------------------------

export const fetchVariantSplit = () =>
  getJSON<VariantSplit>(metaUrl('meta/variant_split.json'))

/**
 * All-meta variants for a gene. Small genes have one file with every phenotype
 * (fetched once, reused as the user switches phenotype); oversized genes (in the
 * variant_split manifest) are fetched per-phenotype, so pass `phenoIdx`+`split`.
 */
export const fetchGeneVariants = (
  ensg: string,
  phenoIdx?: number,
  split = false,
) =>
  getJSON<GeneVariantData>(
    variantUrl(
      split ? `variant/gene/${ensg}.${phenoIdx}.json` : `variant/gene/${ensg}.json`,
    ),
  )

/** Non-meta ancestry data for a gene (lazy; powers the per-variant forest). */
export const fetchGeneVariantsAnc = (
  ensg: string,
  phenoIdx?: number,
  split = false,
) =>
  getJSON<GeneVariantAncData>(
    variantUrl(
      split
        ? `variant/gene/${ensg}.${phenoIdx}.anc.json`
        : `variant/gene/${ensg}.anc.json`,
    ),
  )

export const fetchVariantOverview = (pheno: string) =>
  getJSON<VariantOverview>(variantUrl(`variant/overview/${pheno}.json`))
