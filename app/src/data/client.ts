import { dataUrl, metaUrl } from './config'
import type {
  BiobankIndex,
  GeneData,
  GeneIndex,
  PhenoSizes,
  PhenotypeData,
  PhenotypeIndex,
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

export const fetchGene = (ensg: string) =>
  getJSON<GeneData>(dataUrl(`gene/${ensg}.json`))

export const fetchPhenotype = (pheno: string, ancestrySuffix: string) =>
  getJSON<PhenotypeData>(dataUrl(`phenotype/${pheno}.${ancestrySuffix || 'All'}.json`))
