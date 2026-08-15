// Where the browser loads data from.
//
// The small search indexes (meta/*.json) are always bundled with the app so
// search is instant and works with no external dependency. The large per-gene
// and per-phenotype files are fetched from VITE_DATA_BASE_URL when set (the
// Cloudflare R2 prefix, requires CORS — see infra/cors.json), otherwise from
// the bundled sample data in public/data.
//
// Production value: see .github/workflows/deploy.yml.

const bundled = `${import.meta.env.BASE_URL}data`.replace(/\/$/, '')
const envBase = (import.meta.env.VITE_DATA_BASE_URL as string | undefined)?.replace(
  /\/$/,
  '',
)

/** Base for bulky per-gene / per-phenotype files (GCS in prod, local in dev). */
export const DATA_BASE = envBase && envBase.length > 0 ? envBase : bundled

/** Base for the bundled metadata indexes — always shipped with the app. */
export const META_BASE = bundled

/**
 * Base for the variant-level (v2) data. Controlled by its OWN env var
 * (VITE_VARIANT_BASE_URL) rather than VITE_DATA_BASE_URL, because variant data
 * ships/uploads independently of the v1 gene-level data: until it's uploaded to
 * the host (versioned `v2/` prefix, immutable caching — see
 * docs/variant-v2-design.md), this falls back to the bundled public/data so the
 * variant views work locally without a remote. In production set
 * VITE_VARIANT_BASE_URL to e.g. `${R2}/v2`.
 */
const envVariant = (
  import.meta.env.VITE_VARIANT_BASE_URL as string | undefined
)?.replace(/\/$/, '')
export const VARIANT_BASE =
  envVariant && envVariant.length > 0 ? envVariant : bundled

export const dataUrl = (path: string) => `${DATA_BASE}/${path.replace(/^\//, '')}`
export const metaUrl = (path: string) => `${META_BASE}/${path.replace(/^\//, '')}`
export const variantUrl = (path: string) =>
  `${VARIANT_BASE}/${path.replace(/^\//, '')}`
