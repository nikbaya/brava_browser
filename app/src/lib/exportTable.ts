import { fmtPLog3 } from './format'

/**
 * Client-side table export ("download exactly what I'm looking at").
 *
 * Every page has already fetched and parsed the rows it shows, so serialising
 * them in the browser costs **zero extra requests** — no R2 reads (which are a
 * metered free-tier resource, see CLAUDE.md), no pipeline change, and it works
 * offline. That is also the better product: the bulk files on GCS are whole
 * phenotype × ancestry tables, and cannot offer "the rows I filtered to, in the
 * order I sorted them".
 *
 * **TSV, not CSV**, deliberately: phenotype names, categories and mask labels
 * contain commas ("pLoF or damaging missense", "Endocrine/Metabolic"), which in
 * CSV would force quoting and a quote-escaping path. Tabs never occur in this
 * data, so a tab-delimited file needs no escaping at all and still opens in
 * Excel/Sheets and loads with `read.delim` / `pd.read_csv(sep='\t')`. It also
 * matches the upstream BRaVa summary-stat files, which are TSV.
 */

/** One exported column: a header and a machine-readable cell value. */
export interface ExportColumn<T> {
  header: string
  value: (row: T) => string | number | null | undefined
}

/** What a table needs to declare to get a download button. */
export interface TableExport<T> {
  /** Suggested file name, including the `.tsv` extension. */
  filename: string
  columns: ExportColumn<T>[]
  /** Plural noun for the rows, used in the button's tooltip ("42 genes"). */
  noun: string
}

/** Tabs/newlines would break the row/column structure; nothing else can. */
const CELL_BREAK = /[\t\r\n]+/g

function cell(v: string | number | null | undefined): string {
  if (v == null) return '' // blank = missing, the convention R and pandas read as NA
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : ''
  return v.replace(CELL_BREAK, ' ')
}

/** Serialise rows to a tab-delimited file body (header row + trailing newline). */
export function toTSV<T>(columns: ExportColumn<T>[], rows: T[]): string {
  const out: string[] = [columns.map((c) => c.header).join('\t')]
  for (const r of rows) out.push(columns.map((c) => cell(c.value(r))).join('\t'))
  return out.join('\n') + '\n'
}

/** Save `text` to the user's downloads as `filename`, via an object URL. */
export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(
    new Blob([text], { type: 'text/tab-separated-values;charset=utf-8' }),
  )
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  // Must be in the document for the click to count as user-initiated in Firefox.
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking synchronously cancels the download in Safari; yield a task first.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

/** Filename-safe fragment: keeps letters, digits, `.`, `_`, `-`. */
export function slug(s: string): string {
  return s.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'brava'
}

/**
 * P-value cell rebuilt from the stored −log10(p). Going through the log avoids
 * float underflow for the extreme tail (p ≈ 1e-300 would otherwise export as 0),
 * and the output ("1.17e-205", "0.0100") parses as numeric everywhere. Exports
 * also carry the raw −log10(p) column, so nothing is lost to this reconstruction.
 */
export const exportP = (lp: number | null | undefined): string =>
  lp == null ? '' : fmtPLog3(lp)
