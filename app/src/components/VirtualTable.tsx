import { useRef } from 'react'
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

declare module '@tanstack/react-table' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Draw a left border on this column (header + body) to start a block. */
    divider?: boolean
  }
}

/**
 * Sortable, row-virtualized table. Header and body share a div/flex layout so
 * columns line up exactly; each column's `size` acts as a flex weight, filling
 * the container proportionally. Only the visible row window is rendered, so it
 * scales to tens of thousands of rows.
 */
export default function VirtualTable<T>({
  data,
  columns,
  sorting,
  onSortingChange,
  rowHeight = 30,
  onRowClick,
  caption,
  reservedRows,
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
   * Unfiltered row count. When a table can be filtered, pass the pre-filter
   * count so the scroll region reserves a stable height: filtering rows out
   * then no longer collapses the container and yanks the page scroll upward.
   */
  reservedRows?: number
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

  // Reserve height for the unfiltered set (capped) so filtering doesn't shrink
  // the container. Below the cap, height stays content-driven (compact) and any
  // filter-induced shift is small enough not to fling the page scroll.
  const CAP = 600
  const reserve = Math.max(reservedRows ?? data.length, data.length)
  const fixedHeight = reserve * rowHeight >= CAP - 60 ? CAP : undefined

  return (
    <div
      ref={containerRef}
      style={{ maxHeight: CAP, height: fixedHeight }}
      className="overflow-auto rounded-lg border border-line bg-surface text-[13px]"
    >
      {/* Pinned caption + column headers stick together. Header groups render
          one flex row per level, so spanning group labels (e.g. "P-value" over
          the ancestry sub-columns) line up over their children. */}
      <div className="sticky top-0 z-10">
        {caption && (
          <div className="border-b border-line bg-surface-soft px-2.5 py-1 text-[11px] text-ink-faint">
            {caption}
          </div>
        )}
        {table.getHeaderGroups().map((hg) => {
          return (
            <div
              key={hg.id}
              className="flex border-b border-line bg-surface-soft"
            >
              {hg.headers.map((h) => {
                const isLeaf = h.subHeaders.length === 0
                const canSort = isLeaf && h.column.getCanSort()
                // A group header (spanning ≥1 leaf) marks a block; so does a
                // leaf flagged with meta.divider. Both draw a left rule that
                // lines up with the body cell dividers below.
                const divider =
                  !isLeaf || h.column.columnDef.meta?.divider
                return (
                  // Padding lives on the inner wrapper, never the flex item:
                  // group and leaf rows have different cell counts, and per-cell
                  // padding on a flex-basis:0 item would skew each row's width
                  // distribution, so the two header rows wouldn't line up.
                  <div
                    key={h.id}
                    onClick={canSort ? h.column.getToggleSortingHandler() : undefined}
                    style={cellBasis(h.getSize())}
                    className={`flex min-w-0 select-none ${
                      divider ? 'border-l border-line' : ''
                    } ${canSort ? 'cursor-pointer' : ''}`}
                  >
                    {h.isPlaceholder ? null : (
                      <div
                        className={`flex w-full min-w-0 items-center gap-0.5 px-2 py-1 text-[11px] font-semibold tracking-wide ${
                          isLeaf
                            ? 'text-ink-soft uppercase'
                            : 'justify-center text-ink normal-case'
                        } ${canSort ? 'hover:text-ink' : ''}`}
                      >
                        <span className="truncate">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                        </span>
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
              className={`absolute flex w-full border-b border-line/50 ${
                vi.index % 2 ? 'bg-surface-soft/40' : ''
              } ${onRowClick ? 'cursor-pointer hover:bg-brand-light' : ''}`}
            >
              {row.getVisibleCells().map((cell) => (
                // Padding on the inner wrapper (not the flex item) so body
                // columns line up with the header rows — see header note above.
                <div
                  key={cell.id}
                  style={cellBasis(cell.column.getSize())}
                  className={`flex min-w-0 ${
                    cell.column.columnDef.meta?.divider
                      ? 'border-l border-line/70'
                      : ''
                  }`}
                >
                  <div className="flex w-full min-w-0 items-center px-2 whitespace-nowrap">
                    <span className="truncate">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </span>
                  </div>
                </div>
              ))}
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
  )
}
