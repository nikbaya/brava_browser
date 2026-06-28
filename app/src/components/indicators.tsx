import {
  SIG_GENE_CAUCHY,
  SIG_GENE_MASK_BONFERRONI,
} from '../lib/constants'
import { effectInfo } from '../lib/effect'
import type { PhenotypeMeta } from '../data/types'

const LP_GENE = -Math.log10(SIG_GENE_CAUCHY) // ≈ 5.60
const LP_SUGGEST = 4 // p < 1e-4

/**
 * Significance indicator dot, keyed off -log10(p):
 *   green  = past gene-level significance (P < 2.5×10⁻⁶)
 *   amber  = suggestive (P < 1×10⁻⁴)
 *   hollow = not significant
 */
// Same semantic hues, alpha-softened so they read lighter than the bold,
// full-opacity ancestry colours used in the forest plot.
const SIG_GENE_COLOR = 'bg-protective/55'
const SIG_MASK_COLOR = 'bg-protective/30'
const SIG_SUGGEST_COLOR = 'bg-accent/55'
// β > 0 (risk / higher) = red, β < 0 (protective / lower) = blue. The dot's
// opacity scales with |β| so larger burden effects read as deeper colour.
const DIR_POS = '#c0392b'
const DIR_NEG = '#2563a8'

function rgba(hex: string, a: number) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a.toFixed(3)})`
}

/**
 * Fill opacity from relative magnitude (|β| ÷ the column's max |β|, 0..1).
 * Absolute β scales differ wildly by phenotype, so we normalise per column; the
 * √ lifts mid-range values so differences stay visible. Undefined → mid tone.
 */
function dirAlpha(intensity: number | undefined) {
  if (intensity == null) return 0.55
  const i = Math.max(0, Math.min(1, intensity))
  return 0.28 + 0.67 * Math.sqrt(i) // ~0.28 (smallest) … 0.95 (largest)
}

export function SigDot({ lp }: { lp: number | null | undefined }) {
  let cls = 'border border-ink-faint/40'
  let title = 'Not significant'
  if (lp != null) {
    if (lp >= LP_GENE) {
      cls = SIG_GENE_COLOR
      title = 'Gene-level significant (P < 2.5×10⁻⁶)'
    } else if (lp >= -Math.log10(SIG_GENE_MASK_BONFERRONI)) {
      cls = SIG_MASK_COLOR
      title = 'Gene-mask significant (P < 1.39×10⁻⁷)'
    } else if (lp >= LP_SUGGEST) {
      cls = SIG_SUGGEST_COLOR
      title = 'Suggestive (P < 1×10⁻⁴)'
    }
  }
  return (
    <span
      title={title}
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${cls}`}
    />
  )
}

/**
 * Effect-direction dot: red = positive β, blue = negative β, with the dot's
 * opacity scaled by |β| so larger burden effects appear deeper. The tooltip
 * carries the trait-aware meaning (risk/protective vs higher/lower).
 */
export function DirDot({
  beta,
  type,
  intensity,
}: {
  beta: number | null | undefined
  type: PhenotypeMeta['type']
  /** |β| ÷ column max (0..1); drives opacity. Omit for a neutral mid tone. */
  intensity?: number
}) {
  const e = effectInfo(beta, type)
  if (!e)
    return (
      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-ink-faint/40" />
    )
  const b = beta as number
  const fill = rgba(b > 0 ? DIR_POS : DIR_NEG, dirAlpha(intensity))
  return (
    <span
      title={e.label}
      style={{ backgroundColor: fill }}
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
    />
  )
}

