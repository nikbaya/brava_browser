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
// β > 0 (risk / higher) = red, β < 0 (protective / lower) = blue.
const DIR_POS_COLOR = 'bg-[#c0392b]/50'
const DIR_NEG_COLOR = 'bg-[#2563a8]/50'

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
 * Effect-direction dot: red = positive β, blue = negative β. The tooltip
 * carries the trait-aware meaning (risk/protective vs higher/lower).
 */
export function DirDot({
  beta,
  type,
}: {
  beta: number | null | undefined
  type: PhenotypeMeta['type']
}) {
  const e = effectInfo(beta, type)
  if (!e)
    return (
      <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full border border-ink-faint/40" />
    )
  const color = (beta as number) > 0 ? DIR_POS_COLOR : DIR_NEG_COLOR
  return (
    <span
      title={e.label}
      className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${color}`}
    />
  )
}

function Swatch({ cls }: { cls: string }) {
  return <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls}`} />
}

/** Compact key explaining the table indicator dots. */
export function IndicatorLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-faint">
      <span className="inline-flex items-center gap-1">
        <Swatch cls={SIG_GENE_COLOR} /> P &lt; 2.5×10⁻⁶
      </span>
      <span className="inline-flex items-center gap-1">
        <Swatch cls={SIG_SUGGEST_COLOR} /> P &lt; 1×10⁻⁴
      </span>
      <span className="text-line">|</span>
      <span className="inline-flex items-center gap-1">
        <Swatch cls={DIR_POS_COLOR} /> β &gt; 0
      </span>
      <span className="inline-flex items-center gap-1">
        <Swatch cls={DIR_NEG_COLOR} /> β &lt; 0
      </span>
    </div>
  )
}
