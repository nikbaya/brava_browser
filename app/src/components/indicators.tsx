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
export const DIR_POS = '#c0392b'
export const DIR_NEG = '#2563a8'

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

/**
 * Text styling for a p-value in the dense per-ancestry grid, where a dot per
 * cell would be too noisy. Significant cells read bold + dark; suggestive stay
 * medium; non-significant fade back so the eye lands on the hits.
 */
export function sigTextClass(lp: number | null | undefined): string {
  if (lp == null) return 'text-ink-faint/60'
  if (lp >= LP_GENE) return 'font-semibold text-ink'
  if (lp >= -Math.log10(SIG_GENE_MASK_BONFERRONI)) return 'font-medium text-ink'
  if (lp >= LP_SUGGEST) return 'text-ink-soft'
  return 'text-ink-faint'
}

/** Inline colour for a β in the grid: red = positive, blue = negative. */
export function dirTextColor(beta: number | null | undefined): string | undefined {
  if (beta == null || Number.isNaN(beta) || beta === 0) return undefined
  return beta > 0 ? DIR_POS : DIR_NEG
}

/**
 * Effect-size glyph for the Burden β grid: a triangle pointing up (β > 0, red /
 * risk↑) or down (β < 0, blue / protective↓), its height scaled by |β| relative
 * to `max` (√ scale so small effects stay visible). A CSS border triangle keeps
 * edges crisp at any size. Null/zero → a faint dot.
 */
export function EffectTriangle({
  beta,
  max,
}: {
  beta: number | null | undefined
  max: number
}) {
  if (beta == null || Number.isNaN(beta) || beta === 0)
    return <span className="text-ink-faint/40">·</span>
  const up = beta > 0
  const t = max > 0 ? Math.min(1, Math.abs(beta) / max) : 0
  const h = 5 + Math.round(6 * Math.sqrt(t)) // height 5…11px
  const w = Math.round(h * 1.25)
  const color = up ? DIR_POS : DIR_NEG
  const side = `${w / 2}px solid transparent`
  const base = `${h}px solid ${color}`
  return (
    <span
      aria-hidden
      className="inline-block"
      style={{
        width: 0,
        height: 0,
        borderLeft: side,
        borderRight: side,
        ...(up ? { borderBottom: base } : { borderTop: base }),
      }}
    />
  )
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

