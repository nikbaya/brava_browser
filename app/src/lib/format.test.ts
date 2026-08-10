import { describe, it, expect } from 'vitest'
import {
  fmtPLog,
  fmtPLog3,
  fmtPCompact,
  fmtP,
  pFromNeglog10,
  fmtBeta,
  fmtBeta3,
  neglog10,
  fmtCount,
  biobankShort,
} from './format'

describe('fmtPLog (p-value from stored -log10)', () => {
  it('reconstructs the mantissa/exponent without underflow at extreme p', () => {
    // p = 1.17e-205  ->  lp = -log10(p) = 204.93…  ->  back to "1.17e-205"
    const lp = -Math.log10(1.17e-205)
    expect(fmtPLog(lp)).toBe('1.17e-205')
  })

  it('handles a clean power of ten', () => {
    expect(fmtPLog(205)).toBe('1.00e-205') // p = 1e-205
    expect(fmtPLog(10)).toBe('1.00e-10')
  })

  it('round-trips a known SAIGE value (PCSK9×LDLC scale)', () => {
    const p = 4.2e-58
    expect(fmtPLog(-Math.log10(p))).toBe('4.20e-58')
  })

  it('uses plain decimals for non-significant p (lp <= 3)', () => {
    expect(fmtPLog(0)).toBe('1.000') // p = 1
    expect(fmtPLog(1)).toBe('0.100') // p = 0.1
    expect(fmtPLog(2)).toBe('0.010') // p = 0.01
  })

  it('returns the em dash for null / NaN', () => {
    expect(fmtPLog(null)).toBe('—')
    expect(fmtPLog(undefined)).toBe('—')
    expect(fmtPLog(NaN)).toBe('—')
  })

  it('never produces a 10.00e form (mantissa stays in [1,10))', () => {
    for (let lp = 3.01; lp < 320; lp += 0.137) {
      const s = fmtPLog(lp)
      const mantissa = parseFloat(s.split('e')[0])
      expect(mantissa).toBeGreaterThanOrEqual(1)
      expect(mantissa).toBeLessThan(10)
    }
  })
})

describe('fmtPLog3 / fmtBeta3 (tooltips: always 3 significant figures)', () => {
  it('keeps 3 sig figs for non-significant p, not 3 decimals', () => {
    expect(fmtPLog3(2)).toBe('0.0100') // p = 0.01 — the table form gives "0.010"
    expect(fmtPLog3(1)).toBe('0.100') // p = 0.1
    expect(fmtPLog3(3)).toBe('0.00100') // p = 0.001
    expect(fmtPLog3(0)).toBe('1.00') // p = 1
    expect(fmtPLog3(-Math.log10(0.05))).toBe('0.0500')
  })

  it('defers to the e-form (already a 3-sig-fig mantissa) below 1e-3', () => {
    expect(fmtPLog3(-Math.log10(1.17e-205))).toBe('1.17e-205')
    expect(fmtPLog3(10)).toBe('1.00e-10')
  })

  it('gives β 3 sig figs across magnitudes', () => {
    expect(fmtBeta3(0.01)).toBe('0.0100') // fmtBeta would give "0.01"
    expect(fmtBeta3(-0.5)).toBe('−0.500') // U+2212 MINUS SIGN
    expect(fmtBeta3(0.0123456)).toBe('0.0123')
    expect(fmtBeta3(12.3456)).toBe('12.3')
    expect(fmtBeta3(0)).toBe('0.00')
    expect(fmtBeta3(0.0001)).toBe('1.00e-4')
    expect(fmtBeta3(5000)).toBe('5.00e+3')
  })

  it('returns the em dash for null / NaN', () => {
    expect(fmtPLog3(null)).toBe('—')
    expect(fmtBeta3(undefined)).toBe('—')
    expect(fmtBeta3(NaN)).toBe('—')
  })
})

describe('fmtPCompact (dense per-ancestry grid)', () => {
  it('shows 3 decimals for p >= 0.01, matching its 3-sig-fig tooltip', () => {
    // PCSK9 x ColonRectCanc x AMR: stored lp = 0.02 -> p = 0.954992…
    expect(fmtPCompact(0.02)).toBe('0.955')
    expect(fmtPLog3(0.02)).toBe('0.955') // cell and tooltip agree
    expect(fmtPCompact(0)).toBe('1.000')
    expect(fmtPCompact(2)).toBe('0.010')
  })

  it('drops to a 1-sig-fig mantissa below p = 0.01', () => {
    expect(fmtPCompact(2.1)).toBe('8e-3')
    expect(fmtPCompact(205)).toBe('1e-205')
  })

  // The column is sized for the sci branch's 6 chars ("2e-156"), so a 5-char
  // ceiling here means 3 dp needs no column resize.
  it('stays within 5 chars for every p >= 0.01', () => {
    for (let lp = 0; lp <= 2; lp += 0.01) {
      expect(fmtPCompact(lp).length).toBeLessThanOrEqual(5)
    }
  })

  it('returns the em dash for null / NaN', () => {
    expect(fmtPCompact(null)).toBe('—')
    expect(fmtPCompact(NaN)).toBe('—')
  })
})

describe('pFromNeglog10', () => {
  it('inverts -log10', () => {
    expect(pFromNeglog10(10)).toBeCloseTo(1e-10, 15)
    expect(pFromNeglog10(0)).toBe(1)
  })
  it('is null-safe', () => {
    expect(pFromNeglog10(null)).toBeNull()
    expect(pFromNeglog10(NaN)).toBeNull()
  })
})

describe('neglog10', () => {
  it('computes -log10(p)', () => {
    expect(neglog10(1e-8)).toBeCloseTo(8, 10)
  })
  it('rejects non-positive / null', () => {
    expect(neglog10(0)).toBeNull()
    expect(neglog10(-1)).toBeNull()
    expect(neglog10(null)).toBeNull()
  })
})

describe('fmtP (raw p-value)', () => {
  it('shows mid-range p as 3-dp decimal', () => {
    expect(fmtP(0.05)).toBe('0.050')
    expect(fmtP(0.5)).toBe('0.500')
  })
  it('shows small p in scientific notation', () => {
    expect(fmtP(1e-10)).toBe('1.00e-10')
  })
  it('handles 0 and null', () => {
    expect(fmtP(0)).toBe('0')
    expect(fmtP(null)).toBe('—')
  })
})

describe('fmtBeta', () => {
  it('uses 2-dp fixed for normal magnitudes (d3 renders a Unicode minus)', () => {
    expect(fmtBeta(-0.5)).toBe('−0.50') // U+2212 MINUS SIGN, not ASCII '-'
    expect(fmtBeta(0)).toBe('0.00')
    expect(fmtBeta(12.3)).toBe('12.30')
  })
  it('switches to scientific for very small / very large', () => {
    expect(fmtBeta(0.0001)).toBe('1.00e-4')
    expect(fmtBeta(5000)).toBe('5.00e+3')
  })
  it('is null/NaN safe', () => {
    expect(fmtBeta(null)).toBe('—')
    expect(fmtBeta(NaN)).toBe('—')
  })
})

describe('fmtCount', () => {
  it('renders compact sample sizes with B not G (trailing zeros trimmed)', () => {
    expect(fmtCount(1_200_000)).toBe('1.2M')
    expect(fmtCount(844_000)).toBe('844k')
  })
  it('is null-safe', () => {
    expect(fmtCount(null)).toBe('—')
  })
})

describe('biobankShort', () => {
  // The real catalogue (app/public/data/meta/biobanks.json), so the rule is
  // pinned against the names the legend actually renders.
  it('keeps names that fit a legend row', () => {
    expect(biobankShort('uk-biobank', 'UK Biobank')).toBe('UK Biobank')
    expect(biobankShort('all-of-us', 'All of Us')).toBe('All of Us')
    expect(biobankShort('gel', 'Genomics England')).toBe('Genomics England')
    expect(biobankShort('bbj', 'BioBank Japan')).toBe('BioBank Japan')
  })
  it("falls back to the biobank's own ID when the name is too long", () => {
    expect(biobankShort('ccpm', 'Colorado Center for Personalized Medicine')).toBe('CCPM')
    expect(biobankShort('mgbb', 'Mass General Brigham Biobank')).toBe('MGBB')
    expect(biobankShort('pmbb', 'Penn Medicine BioBank')).toBe('PMBB')
  })
})
