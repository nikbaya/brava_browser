// Exon-collapsed coordinates for the gene-region variant view.
//
// Most genes are mostly intron: across the 20,033 genes in our index the median
// transcript spends just 12.6% of its span in exons (p25 = 6%, and 42% of genes
// are under 10%). On a plain genomic axis the coding variants — which is all
// BRaVa tests — collapse into slivers a pixel or two wide. gnomAD solves this by
// building the axis only from exon regions padded by 75 bp and giving the gaps
// between them zero width — see `regionViewerScale` in @gnomad/region-viewer.
// We reproduce that mapping, with two differences:
//
//   * cumulative offsets + binary search instead of a filter/reduce per call,
//     because LocusZoom scales thousands of points per frame and again on hover;
//   * the region boundaries are exposed so the plot can draw a break marker,
//     making the discontinuity visible rather than silent.
//
// Positions inside an excised gap map to the preceding region's right edge
// (identical to gnomAD's behaviour), so intronic variants stack on the exon
// boundary instead of vanishing.

import type { GeneModel } from '../data/types'

/** 1-based inclusive interval, matching GTF/gnomAD conventions. */
export interface Span {
  start: number
  stop: number
}

/** Flanking bp kept around each exon (gnomAD uses 75; keeps splice sites visible). */
export const EXON_PAD = 75

/** Decode the pipeline's flat [offset, length, …] pairs into absolute spans. */
export function spansFromFlat(flat: number[], origin: number): Span[] {
  const out: Span[] = []
  for (let i = 0; i + 1 < flat.length; i += 2) {
    const start = origin + flat[i]
    out.push({ start, stop: start + flat[i + 1] - 1 })
  }
  return out
}

export const exonSpans = (m: GeneModel) => spansFromFlat(m.exons, m.start)
export const cdsSpans = (m: GeneModel) => spansFromFlat(m.cds, m.start)

/** Union of overlapping/adjacent spans; input need not be sorted. */
export function mergeSpans(spans: Span[]): Span[] {
  if (spans.length === 0) return []
  const sorted = [...spans].sort((a, b) => a.start - b.start)
  const merged: Span[] = [{ ...sorted[0] }]
  for (let i = 1; i < sorted.length; i++) {
    const prev = merged[merged.length - 1]
    const next = sorted[i]
    // `<= stop + 1` merges abutting spans too, so exons that touch after
    // padding become one block rather than two with a zero-width gap.
    if (next.start <= prev.stop + 1) {
      if (next.stop > prev.stop) prev.stop = next.stop
    } else {
      merged.push({ ...next })
    }
  }
  return merged
}

/** Padded, merged exon regions — the domain of the collapsed axis. */
export function collapsedRegions(m: GeneModel, pad = EXON_PAD): Span[] {
  return mergeSpans(
    exonSpans(m).map((s) => ({
      start: Math.max(1, s.start - pad),
      stop: s.stop + pad,
    })),
  )
}

export interface RegionScale {
  (pos: number): number
  invert(px: number): number
  /** The (merged, sorted) domain regions. */
  regions: Span[]
  /** Pixel extent [x0, x1] of each region, aligned with `regions`. */
  blocks: [number, number][]
  /** Total bp covered by the domain. */
  domainSize: number
}

/**
 * Piecewise-linear scale over a set of genomic regions: each region gets pixel
 * width proportional to its length and the gaps between them get none.
 */
export function regionScale(regions: Span[], range: [number, number]): RegionScale {
  const merged = mergeSpans(regions)
  const [r0, r1] = range
  const span = r1 - r0

  // cum[i] = bp preceding region i within the domain.
  const cum = new Array<number>(merged.length + 1)
  cum[0] = 0
  for (let i = 0; i < merged.length; i++) {
    cum[i + 1] = cum[i] + (merged[i].stop - merged[i].start + 1)
  }
  const domainSize = cum[merged.length] || 1
  const px = (bp: number) => r0 + (span * bp) / domainSize

  const blocks = merged.map(
    (_, i) => [px(cum[i]), px(cum[i + 1])] as [number, number],
  )

  /** Index of the last region starting at or before `pos` (-1 if none). */
  const findRegion = (pos: number): number => {
    let lo = 0
    let hi = merged.length - 1
    let found = -1
    while (lo <= hi) {
      const mid = (lo + hi) >> 1
      if (merged[mid].start <= pos) {
        found = mid
        lo = mid + 1
      } else {
        hi = mid - 1
      }
    }
    return found
  }

  const scale = ((pos: number): number => {
    if (merged.length === 0) return r0
    const i = findRegion(pos)
    if (i < 0) return r0 // before the first region
    const region = merged[i]
    // Inside the region: interpolate. In the gap after it: pin to the block's
    // trailing edge — i.e. consume the region's full length, which is what
    // gnomAD's reduce does for any region ending before `pos`. The mapping is
    // therefore discontinuous by 1 bp at each block edge, by design.
    return pos > region.stop
      ? px(cum[i + 1])
      : px(cum[i] + pos - region.start)
  }) as RegionScale

  scale.invert = (x: number): number => {
    if (merged.length === 0) return 0
    const clamped = Math.max(r0, Math.min(r1, x))
    let bp = Math.floor((domainSize * (clamped - r0)) / span)
    for (let i = 0; i < merged.length; i++) {
      const size = merged[i].stop - merged[i].start + 1
      if (bp < size) return merged[i].start + bp
      bp -= size
    }
    return merged[merged.length - 1].stop
  }

  scale.regions = merged
  scale.blocks = blocks
  scale.domainSize = domainSize
  return scale
}
