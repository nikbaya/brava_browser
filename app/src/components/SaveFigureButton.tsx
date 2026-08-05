import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  FIGURE_DPI,
  downloadFigure,
  withExtension,
  type FigureCaption,
  type FigureFormat,
} from '../lib/exportImage'
import Tip from './Tip'

const FORMATS: { format: FigureFormat; label: string; hint: string }[] = [
  { format: 'png', label: 'PNG', hint: `${FIGURE_DPI} dpi` },
  { format: 'svg', label: 'SVG', hint: 'vector' },
]

/**
 * "Save this plot" menu for an SVG figure — sibling of {@link DownloadButton}
 * (which saves the *numbers*; this saves the *picture*), and styled to match it.
 *
 * Both formats keep the plot's on-screen dimensions exactly; the PNG is
 * rasterised at 300 dpi and tagged as such, so it drops into a manuscript at the
 * size it appears here. Exporting reads the live DOM node on click, so whatever
 * ancestry / mask / phenotype the plot is currently showing is what gets saved —
 * there is no separate render path to keep in sync. `caption` is stamped above
 * the plot (in a band, so the plot itself is unchanged) to carry the gene,
 * phenotype and mask off the page with the file.
 */
export default function SaveFigureButton({
  svgRef,
  filename,
  caption,
  what = 'plot',
}: {
  svgRef: RefObject<SVGSVGElement | null>
  /** File stem (extension is swapped per format); see `figureFilename`. */
  filename: string
  /** Provenance printed above the plot in the exported file. */
  caption?: FigureCaption
  /** Noun for the tooltip, e.g. "forest plot". */
  what?: string
}) {
  const [open, setOpen] = useState(false)
  const [failed, setFailed] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const save = async (format: FigureFormat) => {
    setOpen(false)
    const svg = svgRef.current
    if (!svg) return
    try {
      setFailed(false)
      await downloadFigure(svg, filename, format, { caption })
    } catch {
      setFailed(true)
    }
  }

  return (
    <div ref={boxRef} className="relative shrink-0">
      <Tip
        label={
          failed
            ? 'Could not export the figure — try again'
            : `Save this ${what} as an image at the size shown, labelled with the current selection: PNG (${FIGURE_DPI} dpi) or SVG (vector)`
        }
        wide
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`Save ${what} as an image`}
          className={`flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-medium transition ${
            open
              ? 'border-brand text-brand'
              : 'border-line text-ink-soft hover:border-brand hover:text-brand'
          }`}
        >
          {/* Framed-picture glyph, sized to the 11px caption text. */}
          <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M2.25 2.75h11.5v10.5H2.25zM2.25 10.5l3.5-3.25 3 2.5 2-1.75 3 2.75"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          {failed ? 'Failed' : 'Figure'}
          <span className="text-ink-faint">▾</span>
        </button>
      </Tip>

      {open && (
        <ul
          role="menu"
          className="absolute right-0 z-30 mt-1 min-w-full overflow-hidden rounded-lg border border-line bg-surface py-1 shadow-xl"
        >
          {FORMATS.map(({ format, label, hint }) => (
            <li key={format} role="none">
              <button
                type="button"
                role="menuitem"
                onClick={() => save(format)}
                className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-[12px] whitespace-nowrap text-ink hover:bg-brand-light"
                title={withExtension(filename, format)}
              >
                <span className="font-semibold">{label}</span>
                <span className="text-[11px] text-ink-faint">{hint}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
