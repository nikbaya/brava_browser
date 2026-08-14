import type { FilterState } from '../components/FilterBar'
import {
  ANCESTRY_INDEX,
  DEFAULTS,
  MAF_META,
  MASK_META,
  TESTS,
  type Ancestry,
  type Test,
} from './constants'

/**
 * Shared query-param contract for the gene page <-> phenotype page links, so
 * the ancestry/mask/MAF/test a user has dialed in on one page survives a
 * click into the other (rather than resetting to DEFAULTS). Only non-default
 * fields are written, keeping a plain `/gene/PCSK9` link untouched.
 */
export function filterParams(
  filters: FilterState,
  extra?: Record<string, string>,
): URLSearchParams {
  const q = new URLSearchParams(extra)
  if (filters.ancestry !== DEFAULTS.ancestry) q.set('anc', filters.ancestry)
  if (filters.maskIndex !== DEFAULTS.maskIndex) q.set('mask', String(filters.maskIndex))
  if (filters.mafIndex !== DEFAULTS.mafIndex) q.set('maf', String(filters.mafIndex))
  if (filters.test !== DEFAULTS.test) q.set('test', filters.test)
  return q
}

/** Reverse of `filterParams`: reads anc/mask/maf/test off the URL, falling
 *  back to DEFAULTS for anything absent or out of range. */
export function parseFilterParams(search: URLSearchParams): FilterState {
  const anc = search.get('anc')
  // `Number(null)` is 0, not NaN, so a missing param must be checked for
  // explicitly — otherwise an absent `mask`/`maf` silently resolves to index
  // 0 instead of falling through to DEFAULTS below.
  const maskStr = search.get('mask')
  const mafStr = search.get('maf')
  const mask = maskStr != null ? Number(maskStr) : NaN
  const maf = mafStr != null ? Number(mafStr) : NaN
  const test = search.get('test')
  return {
    ancestry: anc && anc in ANCESTRY_INDEX ? (anc as Ancestry) : DEFAULTS.ancestry,
    maskIndex:
      Number.isInteger(mask) && mask >= 0 && mask < MASK_META.length
        ? mask
        : DEFAULTS.maskIndex,
    mafIndex:
      Number.isInteger(maf) && maf >= 0 && maf < MAF_META.length ? maf : DEFAULTS.mafIndex,
    test: test && (TESTS as readonly string[]).includes(test) ? (test as Test) : DEFAULTS.test,
  }
}

/** In-app path to a gene page, seeding its forest to `phenoId` and carrying
 *  the current ancestry/mask/MAF/test filters along. */
export function geneLinkPath(geneParam: string, phenoId: string, filters: FilterState): string {
  const q = filterParams(filters, { pheno: phenoId })
  return `/gene/${encodeURIComponent(geneParam)}?${q}`
}

/** In-app path to a phenotype page, carrying the current ancestry/mask/MAF/
 *  test filters along. */
export function phenotypeLinkPath(phenoId: string, filters: FilterState): string {
  const q = filterParams(filters)
  const qs = q.toString()
  return `/phenotype/${encodeURIComponent(phenoId)}${qs ? `?${qs}` : ''}`
}
