import { format } from 'd3-format'

const fixed2 = format('.2f')
const sci2 = format('.2e')
const si = format('.3~s')

/** Build "1.17e-205" from a mantissa + exponent. */
function eNotation(mantissa: number, exp: number, digits = 2): string {
  return `${mantissa.toFixed(digits)}e${exp}`
}

/**
 * Format a p-value from its stored -log10(p). Computing mantissa/exponent
 * directly from the log avoids float underflow for extreme values (p ≈ 10⁻³⁰⁰⁺).
 */
export function fmtPLog(lp: number | null | undefined): string {
  if (lp == null || Number.isNaN(lp)) return '—'
  if (lp <= 3) return format('.3f')(Math.pow(10, -lp)) // p ≥ 1e-3: plain decimal
  const logp = -lp // = log10(p)
  let exp = Math.floor(logp)
  let mantissa = Math.pow(10, logp - exp) // in [1, 10)
  // Rounding the mantissa to 2 dp can bump it to 10.00; renormalise so it stays
  // in [1, 10) (e.g. 9.999e-206 -> 1.00e-205) rather than printing "10.00e-206".
  if (Number(mantissa.toFixed(2)) >= 10) {
    mantissa /= 10
    exp += 1
  }
  return eNotation(mantissa, exp)
}

/**
 * Ultra-compact p-value from its stored -log10(p), for the dense per-ancestry
 * grid: a 1-significant-figure mantissa (e.g. "2e-205", "8e-6") and a plain
 * 2-decimal form for p ≥ 0.01. The full-precision value lives in the cell's
 * title attribute.
 */
export function fmtPCompact(lp: number | null | undefined): string {
  if (lp == null || Number.isNaN(lp)) return '—'
  if (lp <= 2) return format('.2f')(Math.pow(10, -lp)) // p ≥ 0.01: "0.03"
  const logp = -lp
  let exp = Math.floor(logp)
  let mantissa = Math.pow(10, logp - exp) // [1, 10)
  if (Math.round(mantissa) >= 10) {
    mantissa /= 10
    exp += 1
  }
  return `${Math.round(mantissa)}e${exp}`
}

/**
 * Compact β for the dense grid: drops the leading zero (".03", "-.12") and
 * uses 3 dp below 0.1 so typical small burden effects stay legible without
 * scientific notation (which truncated in the narrow columns). Falls back to
 * 1-sig-fig sci only for |β| < 0.001 or ≥ 100. Full value is in the title attr.
 */
export function fmtBetaCompact(b: number | null | undefined): string {
  if (b == null || Number.isNaN(b)) return '—'
  const a = Math.abs(b)
  if (a === 0) return '0'
  if (a < 0.001 || a >= 100) return format('.0e')(b) // 1 sig fig: fits "-5e-4"
  const s = a >= 0.1 ? b.toFixed(2) : b.toFixed(3)
  return s.replace(/^(-?)0\./, '$1.')
}

/** Format a raw p-value (when -log10 isn't already available). */
export function fmtP(p: number | null | undefined): string {
  if (p == null || Number.isNaN(p)) return '—'
  if (p === 0) return '0'
  if (p >= 1e-3 && p <= 0.999) return format('.3f')(p)
  return sci2(p)
}

/** Reconstruct a p-value from the stored -log10(p). */
export function pFromNeglog10(lp: number | null | undefined): number | null {
  if (lp == null || Number.isNaN(lp)) return null
  return Math.pow(10, -lp)
}

/** Format an effect size / standard error. */
export function fmtBeta(b: number | null | undefined): string {
  if (b == null || Number.isNaN(b)) return '—'
  const a = Math.abs(b)
  if (a !== 0 && (a < 0.01 || a >= 1000)) return sci2(b)
  return fixed2(b)
}

/** Odds ratio from the Burden log-odds β (exp β). Null-safe. */
export function fmtOR(b: number | null | undefined): string {
  if (b == null || Number.isNaN(b)) return '—'
  const or = Math.exp(b)
  if (or !== 0 && (or < 0.01 || or >= 1000)) return sci2(or)
  return fixed2(or)
}

/** -log10(p), for plotting / sorting; null-safe. */
export function neglog10(p: number | null | undefined): number | null {
  if (p == null || p <= 0 || Number.isNaN(p)) return null
  return -Math.log10(p)
}

/** Compact integer (e.g. sample sizes): 1.2M, 844k. */
export function fmtCount(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return si(n).replace('G', 'B')
}

/** Genomic position with thousands separators. */
export const fmtPos = format(',')
