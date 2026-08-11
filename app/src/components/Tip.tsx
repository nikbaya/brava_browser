import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/** Gap kept between the tooltip and the viewport edge, in px. */
const EDGE = 8

/** Anchor geometry captured on hover: the element's centre-x, top and bottom. */
type Anchor = { x: number; top: number; bottom: number }

/**
 * Lightweight hover tooltip with a short, snappy reveal (~120ms — far faster
 * than the browser's native `title` delay). Rendered into a body-level portal
 * so it's never clipped by the scrolling table container.
 *
 * The tooltip is centred on its anchor, then **clamped to the viewport**: a
 * right-hand column's tooltip would otherwise run off the page, which is easy to
 * miss during development because it only bites on the last column or in a
 * narrow window. Clamping needs the rendered size, so it happens in a layout
 * effect (before paint, so there's no visible jump) and is derived only from the
 * anchor — never from the clamped value — so it cannot feed back on itself.
 */
export default function Tip({
  label,
  children,
  className,
  wide = false,
}: {
  label: string
  children: ReactNode
  className?: string
  /**
   * Let the tooltip wrap to a fixed max width instead of staying on one line.
   * Value tooltips ("P = 1.17e-205") are short and read better unwrapped; a
   * sentence or two of column help would otherwise run off the viewport.
   */
  wide?: boolean
}) {
  const [anchor, setAnchor] = useState<Anchor | null>(null)
  /** Viewport-clamped placement, measured from the rendered tooltip. */
  const [place, setPlace] = useState<{ x: number; below: boolean } | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const tip = useRef<HTMLSpanElement | null>(null)

  useLayoutEffect(() => {
    const el = tip.current
    if (!anchor || !el) {
      setPlace(null)
      return
    }
    // offsetWidth/Height are content-driven (w-max + max-w), so they don't
    // depend on where we place the element — measuring is safe to repeat.
    const half = el.offsetWidth / 2
    const min = EDGE + half
    const max = window.innerWidth - EDGE - half
    setPlace({
      // A tooltip wider than the viewport can't satisfy both bounds; centre it.
      x: max < min ? window.innerWidth / 2 : Math.min(Math.max(anchor.x, min), max),
      // Flip below the anchor when there isn't room above it — e.g. a sticky
      // table header scrolled up against the top of the window.
      below: anchor.top - el.offsetHeight - EDGE < 0,
    })
  }, [anchor, label, wide])

  return (
    <span
      className={className}
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const next: Anchor = { x: r.left + r.width / 2, top: r.top, bottom: r.bottom }
        timer.current = window.setTimeout(() => setAnchor(next), 120)
      }}
      onMouseLeave={() => {
        window.clearTimeout(timer.current)
        setAnchor(null)
      }}
    >
      {children}
      {anchor &&
        createPortal(
          <span
            ref={tip}
            style={{
              position: 'fixed',
              left: place?.x ?? anchor.x,
              top: place?.below ? anchor.bottom + 6 : anchor.top - 6,
            }}
            className={`pointer-events-none z-[100] block -translate-x-1/2 rounded-md bg-ink px-2 py-1 text-xs leading-snug font-medium text-surface shadow-lg ${
              place?.below ? '' : '-translate-y-full'
            } ${
              wide
                ? 'w-max max-w-[min(300px,calc(100vw-16px))] text-left whitespace-normal'
                : 'whitespace-nowrap'
            }`}
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  )
}
