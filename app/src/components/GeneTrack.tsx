import { useId, useMemo } from 'react'
import type { GeneModel } from '../data/types'
import { cdsSpans, exonSpans, type Span } from '../lib/exonScale'

const H = 30
const MID = 13 // vertical center of the exon boxes
const H_CDS = 11
const H_UTR = 5

const C_CDS = '#51606e'
const C_UTR = '#b9c2cc'
const C_LINE = '#c3cbd4'
const C_BREAK = '#93a1ae'

/**
 * Gene model track: the MANE Select (or Ensembl canonical) transcript drawn
 * under a variant plot, sharing its x scale so exons line up with the points.
 *
 * Coding exons are tall and dark, UTR thin and light (gnomAD's convention: CDS
 * height 10 / UTR 4). `blocks` is supplied in exon-collapsed mode — it marks the
 * pixel extents of the contiguous regions so the excised introns between them
 * get a visible break rather than silently disappearing.
 */
export default function GeneTrack({
  model,
  xScale,
  width,
  left,
  right,
  blocks,
}: {
  model: GeneModel
  xScale: (pos: number) => number
  width: number
  left: number
  right: number
  blocks?: [number, number][]
}) {
  const clipId = useId()

  const { exons, cds, lines, chevrons } = useMemo(() => {
    const exons = exonSpans(model)
    const cds = cdsSpans(model)
    // Intron line: one segment per contiguous block when collapsed, otherwise a
    // single line spanning the transcript.
    const lines: [number, number][] =
      blocks && blocks.length > 0
        ? blocks
        : exons.length > 0
          ? [[xScale(exons[0].start), xScale(exons[exons.length - 1].stop)]]
          : []
    // Strand arrows along the line, ~1 per 44px.
    const chevrons: string[] = []
    const step = 44
    const w = 3
    for (const [a, b] of lines) {
      for (let x = a + step / 2; x < b - 2; x += step) {
        chevrons.push(
          model.strand === 1
            ? `M${x - w},${MID - w} L${x},${MID} L${x - w},${MID + w}`
            : `M${x + w},${MID - w} L${x},${MID} L${x + w},${MID + w}`,
        )
      }
    }
    return { exons, cds, lines, chevrons }
  }, [model, xScale, blocks])

  // A rect at least 1px wide, so a 3 bp exon on a whole-gene axis still shows.
  const rect = (s: Span, h: number, fill: string, key: string) => {
    const x0 = xScale(s.start)
    const x1 = xScale(s.stop)
    return (
      <rect
        key={key}
        x={x0}
        y={MID - h / 2}
        width={Math.max(1, x1 - x0)}
        height={h}
        fill={fill}
      />
    )
  }

  return (
    <svg width={width} height={H} className="block" aria-hidden>
      <defs>
        <clipPath id={clipId}>
          <rect x={left} y={0} width={Math.max(0, width - right - left)} height={H} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        {lines.map(([a, b], i) => (
          <line
            key={`l${i}`}
            x1={a}
            y1={MID}
            x2={b}
            y2={MID}
            stroke={C_LINE}
            strokeWidth={1}
          />
        ))}
        {chevrons.map((d, i) => (
          <path key={`c${i}`} d={d} fill="none" stroke={C_LINE} strokeWidth={1} />
        ))}

        {/* UTR/non-coding first, CDS painted over it. */}
        {exons.map((s, i) => rect(s, H_UTR, C_UTR, `e${i}`))}
        {cds.map((s, i) => rect(s, H_CDS, C_CDS, `c${i}`))}

        {/* Break markers at the junctions between collapsed blocks. */}
        {blocks &&
          blocks
            .slice(0, -1)
            .map(([, x], i) => (
              <line
                key={`b${i}`}
                x1={x}
                y1={1}
                x2={x}
                y2={H - 1}
                stroke={C_BREAK}
                strokeWidth={1}
                strokeDasharray="2 2"
              />
            ))}
      </g>
    </svg>
  )
}
