import { useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Lightweight hover tooltip with a short, snappy reveal (~120ms — far faster
 * than the browser's native `title` delay). Rendered into a body-level portal
 * so it's never clipped by the scrolling table container.
 */
export default function Tip({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  const [xy, setXy] = useState<{ x: number; y: number } | null>(null)
  const timer = useRef<number | undefined>(undefined)

  return (
    <span
      className={className}
      onMouseEnter={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const x = r.left + r.width / 2
        const y = r.top
        timer.current = window.setTimeout(() => setXy({ x, y }), 120)
      }}
      onMouseLeave={() => {
        window.clearTimeout(timer.current)
        setXy(null)
      }}
    >
      {children}
      {xy &&
        createPortal(
          <span
            style={{ position: 'fixed', left: xy.x, top: xy.y - 6 }}
            className="pointer-events-none z-[100] block -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] leading-snug font-medium text-surface shadow-lg"
          >
            {label}
          </span>,
          document.body,
        )}
    </span>
  )
}
