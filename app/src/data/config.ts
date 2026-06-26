// Where the browser loads data from.
//
// The small search indexes (meta/*.json) are always bundled with the app so
// search is instant and works with no external dependency. The large per-gene
// and per-phenotype files are fetched from VITE_DATA_BASE_URL when set (the
// public GCS prefix, requires CORS — see infra/cors.json), otherwise from the
// bundled sample data in public/data.
//
// Production example:
//   VITE_DATA_BASE_URL=https://storage.googleapis.com/brava-meta-analysis-public/browser

const bundled = `${import.meta.env.BASE_URL}data`.replace(/\/$/, '')
const envBase = (import.meta.env.VITE_DATA_BASE_URL as string | undefined)?.replace(
  /\/$/,
  '',
)

/** Base for bulky per-gene / per-phenotype files (GCS in prod, local in dev). */
export const DATA_BASE = envBase && envBase.length > 0 ? envBase : bundled

/** Base for the bundled metadata indexes — always shipped with the app. */
export const META_BASE = bundled

export const dataUrl = (path: string) => `${DATA_BASE}/${path.replace(/^\//, '')}`
export const metaUrl = (path: string) => `${META_BASE}/${path.replace(/^\//, '')}`
