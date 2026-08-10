import type { ReactNode } from 'react'

/**
 * Grey sub-header that pins directly beneath the main Header (top-14), keeping
 * the page title AND the filter controls visible (and editable) while the
 * results scroll. Full-bleed like the Header, with a centered max-w-7xl column
 * so its contents align with the bar above. Children stack vertically — pass a
 * title row, then the FilterBar. Uses the page background shade (surface-soft)
 * so it merges seamlessly into the page.
 */
export default function StickyTitle({ children }: { children: ReactNode }) {
  return (
    // `data-sticky-title` is what lib/scroll.ts measures to offset in-page jumps
    // past this bar (see stickyOffset).
    <div
      data-sticky-title
      className="sticky top-14 z-20 border-b border-line bg-surface-soft/95 backdrop-blur"
    >
      <div className="mx-auto flex max-w-7xl flex-col gap-1.5 px-4 py-1.5">
        {children}
      </div>
    </div>
  )
}
