import { describe, expect, it } from 'vitest'
import { exportP, slug, toTSV, type ExportColumn } from './exportTable'

interface Row {
  name: string
  lp: number | null
  beta: number | null
}

const COLS: ExportColumn<Row>[] = [
  { header: 'name', value: (r) => r.name },
  { header: 'P', value: (r) => exportP(r.lp) },
  { header: 'neglog10P', value: (r) => r.lp },
  { header: 'beta', value: (r) => r.beta },
]

describe('toTSV', () => {
  it('writes a header row and one line per row, newline-terminated', () => {
    const tsv = toTSV(COLS, [{ name: 'PCSK9', lp: 5, beta: -0.42 }])
    expect(tsv).toBe('name\tP\tneglog10P\tbeta\nPCSK9\t1.00e-5\t5\t-0.42\n')
  })

  it('renders missing values as empty cells, not "—" or "null"', () => {
    // Blank is what R's read.delim and pandas both read as NA; the display
    // formatters' em-dash would parse as a string and poison the column type.
    const tsv = toTSV(COLS, [{ name: 'X', lp: null, beta: null }])
    // Not `.trim()`: that would eat the trailing empty cells being asserted.
    expect(tsv.split('\n')[1]).toBe('X\t\t\t')
  })

  it('keeps a tab or newline inside a value from breaking the layout', () => {
    const tsv = toTSV(COLS, [{ name: 'a\tb\nc', lp: null, beta: null }])
    const lines = tsv.split('\n').slice(0, -1) // drop the trailing-newline tail
    expect(lines).toHaveLength(2)
    expect(lines[1].split('\t')).toHaveLength(4)
    expect(lines[1]).toContain('a b c')
  })

  it('emits only a header when there are no rows', () => {
    expect(toTSV(COLS, [])).toBe('name\tP\tneglog10P\tbeta\n')
  })

  it('does not quote commas — the reason this is TSV and not CSV', () => {
    const cols: ExportColumn<{ s: string }>[] = [{ header: 's', value: (r) => r.s }]
    expect(toTSV(cols, [{ s: 'Endocrine/Metabolic, other' }]).trim().split('\n')[1]).toBe(
      'Endocrine/Metabolic, other',
    )
  })
})

describe('exportP', () => {
  it('survives the extreme tail, where 10**-lp would underflow to 0', () => {
    expect(Math.pow(10, -400)).toBe(0) // the trap this exists to avoid
    expect(exportP(400)).toBe('1.00e-400')
  })

  it('is parseable as a number in every branch', () => {
    for (const lp of [0, 0.5, 2, 3, 5, 205.5, 400])
      expect(Number.isFinite(Number(exportP(lp)))).toBe(true)
  })

  it('is blank for a missing p-value', () => {
    expect(exportP(null)).toBe('')
    expect(exportP(undefined)).toBe('')
  })
})

describe('slug', () => {
  it('makes mask and test labels safe for a file name', () => {
    expect(slug('pLoF | dmg missense')).toBe('pLoF-dmg-missense')
    expect(slug('SKAT-O')).toBe('SKAT-O')
    expect(slug('Damaging missense / protein-altering')).toBe(
      'Damaging-missense-protein-altering',
    )
  })

  it('never returns an empty fragment', () => {
    expect(slug('///')).toBe('brava')
  })
})
