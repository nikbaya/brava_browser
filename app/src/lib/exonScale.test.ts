import { describe, it, expect } from 'vitest'
import type { GeneModel } from '../data/types'
import {
  cdsSpans,
  collapsedRegions,
  exonSpans,
  mergeSpans,
  regionScale,
  spansFromFlat,
} from './exonScale'

// Two 100 bp exons separated by a 1 kb intron, on the minus strand.
const MODEL: GeneModel = {
  tx: 'ENST00000000001',
  src: 'mane_select',
  strand: -1,
  start: 1000,
  exons: [0, 100, 1100, 100], // 1000–1099, 2100–2199
  cds: [50, 50, 1100, 60], // 1050–1099, 2100–2159
}

describe('spansFromFlat', () => {
  it('decodes flat offset/length pairs to absolute inclusive spans', () => {
    expect(exonSpans(MODEL)).toEqual([
      { start: 1000, stop: 1099 },
      { start: 2100, stop: 2199 },
    ])
    expect(cdsSpans(MODEL)).toEqual([
      { start: 1050, stop: 1099 },
      { start: 2100, stop: 2159 },
    ])
  })

  it('ignores a trailing unpaired value', () => {
    expect(spansFromFlat([0, 10, 50], 1)).toEqual([{ start: 1, stop: 10 }])
  })
})

describe('mergeSpans', () => {
  it('merges overlapping and abutting spans, and sorts', () => {
    expect(
      mergeSpans([
        { start: 50, stop: 60 },
        { start: 1, stop: 10 },
        { start: 11, stop: 20 }, // abuts the previous -> merged
        { start: 15, stop: 25 }, // overlaps
      ]),
    ).toEqual([
      { start: 1, stop: 25 },
      { start: 50, stop: 60 },
    ])
  })

  it('does not mutate its input', () => {
    const input = [{ start: 1, stop: 10 }]
    mergeSpans(input)
    expect(input).toEqual([{ start: 1, stop: 10 }])
  })

  it('returns [] for no spans', () => {
    expect(mergeSpans([])).toEqual([])
  })
})

describe('collapsedRegions', () => {
  it('pads each exon by 75 bp and clamps to position 1', () => {
    expect(collapsedRegions(MODEL)).toEqual([
      { start: 925, stop: 1174 },
      { start: 2025, stop: 2274 },
    ])
    const atStart: GeneModel = { ...MODEL, start: 10, exons: [0, 20] }
    expect(collapsedRegions(atStart)[0].start).toBe(1)
  })

  it('merges exons whose padding makes them touch', () => {
    // 20 bp intron: padding of 75 on each side overlaps -> one block.
    const tight: GeneModel = { ...MODEL, exons: [0, 100, 120, 100] }
    expect(collapsedRegions(tight)).toHaveLength(1)
  })
})

describe('regionScale', () => {
  const regions = [
    { start: 1000, stop: 1099 }, // 100 bp
    { start: 2000, stop: 2099 }, // 100 bp
  ]
  const s = regionScale(regions, [0, 200])

  it('gives each region pixel width proportional to its length', () => {
    expect(s.domainSize).toBe(200)
    expect(s.blocks).toEqual([
      [0, 100],
      [100, 200],
    ])
  })

  it('excises the gap entirely — the intron gets no width', () => {
    // Last bp of exon 1 and first bp of exon 2 are 900 bp apart in the genome
    // but adjacent on this axis.
    expect(s(1099)).toBeCloseTo(99)
    expect(s(2000)).toBeCloseTo(100)
  })

  it('pins a position inside the gap to the preceding block edge', () => {
    // Matches gnomAD's regionViewerScale: intronic variants stack on the exon
    // boundary rather than disappearing.
    expect(s(1500)).toBeCloseTo(100)
    expect(s(1999)).toBeCloseTo(100)
  })

  it('clamps positions before the first region to the range start', () => {
    expect(s(500)).toBe(0)
  })

  it('scales linearly within a region', () => {
    expect(s(1000)).toBeCloseTo(0)
    expect(s(1050)).toBeCloseTo(50)
    expect(s(2050)).toBeCloseTo(150)
  })

  it('agrees with gnomAD regionViewerScale on the same input', () => {
    // Reference implementation from @gnomad/region-viewer 6.1.0 coordinates.js.
    const reference = (position: number) => {
      const total = regions.reduce((a, r) => a + (r.stop - r.start + 1), 0)
      const d = regions
        .filter((r) => r.start <= position)
        .reduce(
          (a, r) =>
            r.start <= position && position <= r.stop
              ? a + position - r.start
              : a + (r.stop - r.start + 1),
          0,
        )
      return 0 + (200 - 0) * (d / total)
    }
    for (const pos of [999, 1000, 1050, 1099, 1400, 2000, 2099, 3000]) {
      expect(s(pos)).toBeCloseTo(reference(pos))
    }
  })

  it('inverts back into the nearest region', () => {
    expect(s.invert(0)).toBe(1000)
    expect(s.invert(50)).toBe(1050)
    expect(s.invert(150)).toBe(2050)
    // Out-of-range pixels clamp.
    expect(s.invert(-20)).toBe(1000)
    expect(s.invert(500)).toBe(2099)
  })

  it('round-trips position -> pixel -> position within a region', () => {
    for (const pos of [1000, 1037, 1099, 2000, 2088]) {
      expect(s.invert(s(pos))).toBe(pos)
    }
  })

  it('handles an empty domain without throwing', () => {
    const empty = regionScale([], [10, 90])
    expect(empty(1234)).toBe(10)
    expect(empty.invert(50)).toBe(0)
    expect(empty.blocks).toEqual([])
  })

  it('finds the right region with many blocks (binary search)', () => {
    const many = Array.from({ length: 500 }, (_, i) => ({
      start: i * 1000,
      stop: i * 1000 + 99,
    }))
    const big = regionScale(many, [0, 500])
    // Region i occupies pixels [i, i+1).
    expect(big(0)).toBeCloseTo(0)
    expect(big(499_000)).toBeCloseTo(499)
    expect(big(250_050)).toBeCloseTo(250.5)
  })
})
