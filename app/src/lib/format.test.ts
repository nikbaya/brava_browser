import { describe, it, expect } from 'vitest'
import {
  fmtPLog,
  fmtP,
  pFromNeglog10,
  fmtBeta,
  neglog10,
  fmtCount,
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
