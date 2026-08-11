import { downloadText, toTSV, type TableExport } from '../lib/exportTable'
import Tip from './Tip'

/**
 * "Download what I'm looking at" button for a result table. Lives in the table's
 * caption bar and is handed the **sorted, filtered** rows straight out of
 * VirtualTable's row model, so the file matches the screen exactly — same rows,
 * same order, same columns as the visible ones (plus identifier columns, so the
 * file stands on its own once it leaves the page).
 *
 * Both extracting the rows (`getRows`) and serialising them happen on click, not
 * on render: this button sits in a caption bar that repaints on every scroll
 * frame, and a 20k-row table would otherwise rebuild its whole TSV each time.
 */
export default function DownloadButton<T>({
  count,
  getRows,
  spec,
}: {
  /** Number of rows the export would contain (drives the label and disabling). */
  count: number
  getRows: () => T[]
  spec: TableExport<T>
}) {
  const n = count
  const help =
    n === 0
      ? 'Nothing to download — no rows match the current filters'
      : `Download these ${n.toLocaleString()} ${spec.noun} as a tab-delimited file: the rows and columns shown here, in the current sort order`

  return (
    <Tip label={help} wide className="shrink-0">
      <button
        type="button"
        disabled={n === 0}
        onClick={() => downloadText(spec.filename, toTSV(spec.columns, getRows()))}
        aria-label={`Download ${spec.noun} as TSV`}
        className="flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-xs font-medium text-ink-soft transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-line disabled:hover:text-ink-soft"
      >
        {/* Tray-with-arrow download glyph, sized to the 11px caption text. */}
        <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M8 1.5v8m0 0L4.75 6.25M8 9.5l3.25-3.25M2 11.5v1.75A1.25 1.25 0 003.25 14.5h9.5A1.25 1.25 0 0014 13.25V11.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        TSV
      </button>
    </Tip>
  )
}
