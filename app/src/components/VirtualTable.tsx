import { useRef, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type RowData,
  type SortingState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { TableExport } from '../lib/exportTable'
import DownloadButton from './DownloadButton'
import Tip from './Tip'

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Draw a left border on this column (header + body) to start a block. */
    divider?: boolean
    /**
     * Render this column's cells edge-to-edge: no padding, and no truncating
     * wrapper. The cell renderer then owns the full cell box, which is what a
     * cell-sized tooltip hover target needs — the default wrapper's
     * `overflow: hidden` would clip anything reaching past its content box.
     * Cells opting in must supply their own padding.
     */
    fill?: boolean
    /**
     * Explanatory text for this column, shown as a tooltip on its header. A
     * dotted underline marks the header as having an explanation — without an
     * affordance nobody discovers a hover-only tooltip. Kept on the column def
     * (not baked into the `header` renderer) so the underline, the hover delay,
     * and the wrapped-tooltip width stay identical across every table.
     */
    help?: string
  }
}

/**
 * Sortable, row-virtualized table. Header and body share a div/flex layout so
 * columns line up exactly; each column's `size` acts as a flex weight, filling
 * the container proportionally. Only the visible row window is rendered, so it
 * scales to tens of thousands of rows.
 *
 * Narrow viewports (phones, split windows) scroll sideways instead of crushing
 * every column: an inner wrapper carries a `min-width` equal to the sum of the
 * leaf column sizes, so below that width the shared scroll container overflows
 * horizontally and header + body pan together. The first column stays frozen at
 * the left edge while the rest pans, so every row keeps its label (gene,
 * phenotype, or variant) in view.
 */
export default function VirtualTable<T>({
  data,
  columns,
  sorting,
  onSortingChange,
  rowHeight = 30,
  onRowClick,
  caption,
  exportSpec,
  reservedRows,
  minWidth,
}: {
  data: T[]
  columns: ColumnDef<T, any>[]
  sorting: SortingState
  onSortingChange: (s: SortingState) => void
  rowHeight?: number
  onRowClick?: (row: T) => void
  /** Pinned summary (e.g. active filters) shown above the column headers. */
  caption?: React.ReactNode
  /**
   * Declare this to get a download button in the caption bar. The export lives
   * here, rather than on the page, because this component owns the sorted row
   * model — so the file is exactly the rows on screen, in the order shown.
   */
  exportSpec?: TableExport<T>
  /**
   * Unfiltered row count. When a table can be filtered, pass the pre-filter
   * count so the scroll region reserves a stable height: filtering rows out
   * then no longer collapses the container and yanks the page scroll upward.
   */
  reservedRows?: number
  /**
   * Width (px) below which the table scrolls sideways rather than compressing.
   * Defaults to the sum of the leaf column sizes, which are already authored as
   * the narrowest legible width for each column.
   */
  minWidth?: number
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: (updater) =>
      onSortingChange(typeof updater === 'function' ? updater(sorting) : updater),
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })

  const rows = table.getRowModel().rows
  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => rowHeight,
    overscan: 12,
  })

  const cellBasis = (size: number) => ({ flex: `${size} 0 0`, minWidth: 0 })

  // Column sizes double as flex weights *and* as px minimums: when the
  // container is wider than their sum, the weights distribute the extra space;
  // when it's narrower, the wrapper holds this width and the container scrolls.
  const naturalWidth = table
    .getVisibleLeafColumns()
    .reduce((sum, c) => sum + c.getSize(), 0)
  const contentWidth = minWidth ?? naturalWidth

  // The frozen first column only needs its edge shadow once there's something
  // hidden behind it, so desktop (no overflow) looks exactly as before.
  const [panned, setPanned] = useState(false)
  const onScroll = () => {
    const left = (containerRef.current?.scrollLeft ?? 0) > 0
    if (left !== panned) setPanned(left)
  }
  // Drawn on the frozen cell's right edge: a hairline in the table's own border
  // colour, plus a short falloff so overtaken columns read as passing *under*.
  const frozenEdge = panned
    ? '1px 0 0 var(--color-line), 4px 0 5px -3px rgb(0 0 0 / 0.18)'
    : undefined

  // Reserve height for the unfiltered set (capped) so filtering doesn't shrink
  // the container. Below the cap, height stays content-driven (compact) and any
  // filter-induced shift is small enough not to fling the page scroll.
  const CAP = 600
  const reserve = Math.max(reservedRows ?? data.length, data.length)
  const fixedHeight = reserve * rowHeight >= CAP - 60 ? CAP : undefined

  return (
    <div
      ref={containerRef}
      onScroll={onScroll}
      style={{ maxHeight: CAP, height: fixedHeight }}
      className="overflow-auto rounded-lg border border-line bg-surface text-[13px]"
    >
      <div style={{ minWidth: contentWidth }}>
        {/* Pinned caption + column headers stick together. Header groups render
            one flex row per level, so spanning group labels (e.g. "P-value" over
            the ancestry sub-columns) line up over their children. */}
        <div className="sticky top-0 z-10">
          {(caption || exportSpec) && (
            <div className="flex items-center gap-2 border-b border-line bg-surface-soft px-2.5 py-1 text-[11px] text-ink-faint">
              <span className="min-w-0 flex-1">{caption}</span>
              {exportSpec && (
                // Row extraction is deferred to the click: this bar re-renders
                // on every scroll frame (the virtualizer drives it), and mapping
                // 20k rows each time would cost more than the download itself.
                <DownloadButton
                  count={rows.length}
                  getRows={() => rows.map((r) => r.original)}
                  spec={exportSpec}
                />
              )}
            </div>
          )}
          {table.getHeaderGroups().map((hg) => {
            return (
              <div
                key={hg.id}
                className="flex border-b border-line bg-surface-soft"
              >
                {hg.headers.map((h, i) => {
                  const isLeaf = h.subHeaders.length === 0
                  const canSort = isLeaf && h.column.getCanSort()
                  // A group header (spanning ≥1 leaf) marks a block; so does a
                  // leaf flagged with meta.divider. Both draw a left rule that
                  // lines up with the body cell dividers below.
                  const divider =
                    !isLeaf || h.column.columnDef.meta?.divider
                  // Freeze the first cell of every header level, so the frozen
                  // column reads as one continuous block down through the
                  // caption, the group row, and the leaf row.
                  const frozen = i === 0
                  return (
                    // Padding lives on the inner wrapper, never the flex item:
                    // group and leaf rows have different cell counts, and per-cell
                    // padding on a flex-basis:0 item would skew each row's width
                    // distribution, so the two header rows wouldn't line up.
                    <div
                      key={h.id}
                      onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                      style={{
                        ...cellBasis(h.getSize()),
                        boxShadow: frozen ? frozenEdge : undefined,
                      }}
                      className={`flex min-w-0 select-none ${
                        frozen ? 'sticky left-0 z-[1] bg-surface-soft' : ''
                      } ${divider ? 'border-l border-line' : ''} ${
                        canSort ? 'cursor-pointer' : ''
                      }`}
                    >
                      {h.isPlaceholder ? null : (
                        <div
                          className={`flex w-full min-w-0 items-center gap-0.5 px-2 py-1 text-[11px] font-semibold tracking-wide ${
                            isLeaf
                              ? 'text-ink-soft uppercase'
                              : 'justify-center text-ink normal-case'
                          } ${canSort ? 'hover:text-ink' : ''}`}
                        >
                          {h.column.columnDef.meta?.help ? (
                            <Tip
                              label={h.column.columnDef.meta.help}
                              wide
                              // `cursor-help` only where the header isn't also
                              // the sort control — a sortable header must keep
                              // the pointer cursor, so there the dotted
                              // underline carries the affordance on its own.
                              className={`min-w-0 truncate underline decoration-ink-faint/70 decoration-dotted underline-offset-[3px] ${
                                canSort ? '' : 'cursor-help'
                              }`}
                            >
                              {flexRender(h.column.columnDef.header, h.getContext())}
                            </Tip>
                          ) : (
                            <span className="truncate">
                              {flexRender(h.column.columnDef.header, h.getContext())}
                            </span>
                          )}
                          {canSort && (
                            <span className="text-[9px]">
                              {{ asc: '▲', desc: '▼' }[
                                h.column.getIsSorted() as string
                              ] ?? ''}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Body */}
        <div style={{ height: virt.getTotalSize(), position: 'relative' }}>
          {virt.getVirtualItems().map((vi) => {
            const row = rows[vi.index]
            return (
              <div
                key={row.id}
                onClick={() => onRowClick?.(row.original)}
                style={{
                  transform: `translateY(${vi.start}px)`,
                  height: rowHeight,
                }}
                className={`group absolute flex w-full border-b border-line/50 ${
                  vi.index % 2 ? 'bg-surface-soft/40' : ''
                } ${onRowClick ? 'cursor-pointer hover:bg-brand-light' : ''}`}
              >
                {row.getVisibleCells().map((cell, i) => {
                  // The frozen cell overlaps its neighbours, so it repaints the
                  // row's own background (see .frozen-cell* in index.css) —
                  // including the click-affordance hover, via group-hover.
                  const frozen = i === 0
                  return (
                    // Padding on the inner wrapper (not the flex item) so body
                    // columns line up with the header rows — see header note above.
                    <div
                      key={cell.id}
                      style={{
                        ...cellBasis(cell.column.getSize()),
                        boxShadow: frozen ? frozenEdge : undefined,
                      }}
                      className={`flex min-w-0 ${
                        frozen
                          ? `sticky left-0 z-[1] ${
                              vi.index % 2 ? 'frozen-cell-alt' : 'frozen-cell'
                            } ${onRowClick ? 'group-hover:bg-brand-light' : ''}`
                          : ''
                      } ${
                        cell.column.columnDef.meta?.divider
                          ? 'border-l border-line/70'
                          : ''
                      }`}
                    >
                      {cell.column.columnDef.meta?.fill ? (
                        flexRender(cell.column.columnDef.cell, cell.getContext())
                      ) : (
                        <div className="flex w-full min-w-0 items-center px-2 whitespace-nowrap">
                          <span className="truncate">
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </span>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {rows.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-ink-faint">
            No rows match the current filters.
          </p>
        )}
      </div>
    </div>
  )
}
