import type { GeneIndex } from '../data/types'

// chrY is omitted: the BRaVa meta-analysis has no chrY gene results, so it
// would only add an empty band/tick to the Manhattan axis.
const CHR_ORDER = [
  '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12',
  '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', 'X',
]

export interface GenomeLayout {
  total: number
  offset: Map<string, number>
  ticks: { chr: string; center: number }[]
  /** Global linear coordinate for a gene by its index, or null if off-map. */
  pos: (geneIdx: number) => number | null
}

/**
 * Concatenate chromosomes end-to-end into a single linear axis for Manhattan
 * plots. Per-chromosome span is derived from the gene index itself (max gene
 * end), so it needs no external chromosome-length table.
 */
export function genomeLayout(gi: GeneIndex): GenomeLayout {
  const maxEnd = new Map<string, number>()
  for (let i = 0; i < gi.ids.length; i++) {
    const c = gi.chr[i]
    const e = gi.end[i]
    if (e > (maxEnd.get(c) ?? 0)) maxEnd.set(c, e)
  }
  const offset = new Map<string, number>()
  const ticks: { chr: string; center: number }[] = []
  let acc = 0
  for (const c of CHR_ORDER) {
    const len = maxEnd.get(c)
    if (!len) continue
    offset.set(c, acc)
    ticks.push({ chr: c, center: acc + len / 2 })
    acc += len
  }
  const total = acc
  const pos = (geneIdx: number): number | null => {
    const c = gi.chr[geneIdx]
    const off = offset.get(c)
    if (off == null) return null
    return off + (gi.start[geneIdx] + gi.end[geneIdx]) / 2
  }
  return { total, offset, ticks, pos }
}

/** Alternating chromosome band color (Manhattan convention). */
export function chrColor(chr: string): string {
  const idx = CHR_ORDER.indexOf(chr)
  return idx % 2 === 0 ? '#3b7ea1' : '#9bb7c4'
}
