import { useRef } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'

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
}: {
  data: T[]
  columns: ColumnDef<T, any>[]
  sorting: SortingState
  onSortingChange: (s: SortingState) => void
  rowHeight?: number
  onRowClick?: (row: T) => void
  /** Pinned summary (e.g. active filters) shown above the column headers. */
  caption?: React.ReactNode
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

  return (
    <div
      ref={containerRef}
      className="max-h-[600px] overflow-auto rounded-lg border border-line bg-surface text-[13px]"
    >
      {/* Pinned caption + column headers stick together. */}
      <div className="sticky top-0 z-10">
        {caption && (
          <div className="border-b border-line bg-surface-soft px-2.5 py-1 text-[11px] text-ink-faint">
            {caption}
          </div>
        )}
        <div className="flex border-b border-line bg-surface-soft">
          {table.getFlatHeaders().map((h) => (
          <div
            key={h.id}
            onClick={h.column.getToggleSortingHandler()}
            style={cellBasis(h.getSize())}
            className={`flex items-center gap-0.5 px-2.5 py-1.5 text-[11px] font-semibold tracking-wide text-ink-soft uppercase select-none ${
              h.column.getCanSort() ? 'cursor-pointer hover:text-ink' : ''
            }`}
          >
            <span className="truncate">
              {flexRender(h.column.columnDef.header, h.getContext())}
            </span>
              <span className="text-[9px]">
                {{ asc: '▲', desc: '▼' }[h.column.getIsSorted() as string] ?? ''}
              </span>
            </div>
          ))}
        </div>
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
                <div
                  key={cell.id}
                  style={cellBasis(cell.column.getSize())}
                  className="flex items-center px-2.5 whitespace-nowrap"
                >
                  <span className="truncate">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </span>
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
