import { describe, it, expect } from 'vitest'
import { lpArray, phenoRows, geneRows, forestSeries } from './select'
import type { GeneData, PhenotypeData } from '../data/types'

// A tiny phenotype payload: two genes, mask 0 & 4, maf 0 & 1.
const PHENO: PhenotypeData = {
  pheno: 'LDLC',
  anc: 'All',
  n: 4,
  gene_idx: [10, 10, 20, 20],
  mask: [0, 4, 0, 0],
  maf: [0, 0, 0, 1],
  lp_burden: [5, 6, 7, 8],
  lp_skat: [1, 2, 3, 4],
  lp_skato: [9, 10, 11, 12],
  lp_het: [0.5, null, 0.1, null],
  beta: [-0.5, 0.2, null, 0.3],
  se: [0.1, 0.05, null, 0.02],
}

describe('lpArray', () => {
  it('selects the array matching the test', () => {
    expect(lpArray(PHENO, 'Burden')).toBe(PHENO.lp_burden)
    expect(lpArray(PHENO, 'SKAT')).toBe(PHENO.lp_skat)
    expect(lpArray(PHENO, 'SKAT-O')).toBe(PHENO.lp_skato)
  })
})

describe('phenoRows', () => {
  it('filters by mask + maf and carries the selected test lp', () => {
    const rows = phenoRows(PHENO, { maskIndex: 0, mafIndex: 0, test: 'SKAT-O' })
    expect(rows).toEqual([
      { geneIdx: 10, lp: 9, beta: -0.5, se: 0.1 },
      { geneIdx: 20, lp: 11, beta: null, se: null },
    ])
  })

  it('respects the mask filter (mask 4 → one row)', () => {
    const rows = phenoRows(PHENO, { maskIndex: 4, mafIndex: 0, test: 'Burden' })
    expect(rows).toEqual([{ geneIdx: 10, lp: 6, beta: 0.2, se: 0.05 }])
  })

  it('respects the maf filter (maf 1 → one row)', () => {
    const rows = phenoRows(PHENO, { maskIndex: 0, mafIndex: 1, test: 'SKAT' })
    expect(rows).toEqual([{ geneIdx: 20, lp: 4, beta: 0.3, se: 0.02 }])
  })

  it('returns empty when nothing matches', () => {
    expect(phenoRows(PHENO, { maskIndex: 2, mafIndex: 0, test: 'Burden' })).toEqual([])
  })
})

// A gene payload spanning two phenotypes and several ancestries for one
// (mask 4, maf 0) cell, plus an off-target row that must be filtered out.
const GENE: GeneData = {
  id: 'ENSG00000169174', // PCSK9
  symbol: 'PCSK9',
  n: 6,
  pheno: [0, 0, 0, 0, 1, 0],
  anc: [0, 1, 2, 0, 0, 0], // last row is the off-target (mask 0)
  mask: [4, 4, 4, 4, 4, 0],
  maf: [0, 0, 0, 1, 0, 0],
  lp_burden: [50, 30, 20, 10, 5, 99],
  lp_skat: [40, 25, 15, 8, 4, 88],
  lp_skato: [55, 33, 22, 11, 6, 100],
  lp_het: [2.5, null, null, null, null, null], // het only on the All (anc 0) row
  beta: [-0.5, -0.4, -0.3, -0.2, 0.1, -0.9],
  se: [0.05, 0.06, 0.07, 0.08, 0.02, 0.01],
}

describe('geneRows', () => {
  it('filters by mask + maf and leaves ancestry unconstrained when null', () => {
    const rows = geneRows(GENE, { test: 'SKAT-O', maskIndex: 4, mafIndex: 0 })
    // pheno 0 ×{anc0,1,2} + pheno 1 ×anc0 = 4 rows; off-target mask-0 excluded
    expect(rows.map((r) => [r.phenoIdx, r.ancIdx])).toEqual([
      [0, 0],
      [0, 1],
      [0, 2],
      [1, 0],
    ])
    expect(rows[0].lp).toBe(55)
  })

  it('filters by ancestry when given', () => {
    const rows = geneRows(GENE, {
      test: 'Burden',
      ancIdx: 0,
      maskIndex: 4,
      mafIndex: 0,
    })
    expect(rows.map((r) => r.phenoIdx)).toEqual([0, 1])
    expect(rows.map((r) => r.lp)).toEqual([50, 5])
  })
})

describe('forestSeries', () => {
  it('collects per-ancestry rows for one pheno×mask×maf, sorted by ancestry', () => {
    const { rows, hetLp } = forestSeries(GENE, {
      phenoIdx: 0,
      maskIndex: 4,
      mafIndex: 0,
    })
    expect(rows.map((r) => r.ancIdx)).toEqual([0, 1, 2]) // sorted, maf-1 row excluded
    expect(rows[0]).toMatchObject({ ancIdx: 0, beta: -0.5, se: 0.05, lpSkato: 55 })
    expect(hetLp).toBe(2.5) // from the All (anc 0) meta row
  })

  it('returns null hetLp when the All stratum is absent for the cell', () => {
    const { rows, hetLp } = forestSeries(GENE, {
      phenoIdx: 1,
      maskIndex: 4,
      mafIndex: 0,
    })
    expect(rows.map((r) => r.ancIdx)).toEqual([0])
    expect(hetLp).toBeNull() // lp_het is null on that row
  })
})
