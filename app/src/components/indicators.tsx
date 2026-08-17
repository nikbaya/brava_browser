import {
  ANCESTRIES,
  ANCESTRY_COLOR,
  ANCESTRY_META,
  decodeAncMask,
  SIG_GENE_CAUCHY,
  SIG_GENE_MASK_BONFERRONI,
  SIG_SUGGEST,
  SIG_VARIANT,
  type Ancestry,
} from '../lib/constants'
import { effectInfo } from '../lib/effect'
import { fmtP } from '../lib/format'
import type { PhenotypeMeta } from '../data/types'
import Tip from './Tip'

const LP_GENE = -Math.log10(SIG_GENE_CAUCHY) // ≈ 5.60
const LP_VARIANT = -Math.log10(SIG_VARIANT) // ≈ 7.74
const LP_SUGGEST = -Math.log10(SIG_SUGGEST) // = 4, p < 1e-4

/**
 * Significance indicator dot, keyed off -log10(p). Default (`kind="gene"`):
 *   green  = past gene-level significance (P < 2.5e-6)
 *   amber  = suggestive (P < 1e-4)
 *   hollow = not significant
 * `kind="variant"` (single-variant p-values) uses the variant-level Bonferroni
 * threshold (P < 1.82e-8) in place of the gene-level/gene-mask tiers, with the
 * same amber suggestive tier.
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

/** Whether a −log10 p clears the gene-level significance line (i.e. is one of
 *  the "highlighted" hits — matches the bold styling in `sigTextClass`). */
export function isSig(lp: number | null | undefined): boolean {
  return lp != null && lp >= LP_GENE
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
  dim = false,
}: {
  beta: number | null | undefined
  max: number
  /** Fade the triangle back (e.g. the association isn't significant), so the
   *  significant hits read as the vivid ones. */
  dim?: boolean
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
        opacity: dim ? 0.3 : 1,
      }}
    />
  )
}

/**
 * Inline magnitude meter ("health bar") for a dense table cell: the filled
 * length is the value as a fraction of `max`, on a **linear** scale — a bar's
 * length has to stay proportional to its value, so the √ lift used for the dots
 * and triangles (where the encoding is opacity/height, not extent) would read as
 * a different number here. The track is always drawn so a short bar reads as
 * "little support" rather than "small number".
 *
 * Deliberately a single neutral hue: extent already carries the magnitude, and
 * the semantic tokens are spoken for — protective/accent mean significance
 * (`SigDot`), red/blue mean effect direction (`DirDot`), and the bold
 * ANCESTRY_COLOR palette means ancestry. Neutral also survives the row-hover
 * `bg-brand-light` wash, which a brand-tinted bar would sink into.
 *
 * `aria-hidden` because the exact value sits in text beside it — the bar is a
 * scanning aid, not the only carrier of the number.
 */
export function MagnitudeBar({
  value,
  max,
  width = 40,
}: {
  value: number | null | undefined
  max: number
  /** Track width in px; the filled span is a fraction of this. */
  width?: number
}) {
  if (value == null || Number.isNaN(value) || max <= 0) return null
  const frac = Math.max(0, Math.min(1, value / max))
  // Floor the drawn width so a genuinely tiny value stays a visible sliver
  // instead of vanishing into the track; only a true 0 draws nothing.
  const w = frac > 0 ? Math.max(2, Math.round(frac * width)) : 0
  return (
    <span
      aria-hidden
      className="relative inline-block h-[5px] shrink-0 rounded-full bg-line"
      style={{ width }}
    >
      <span
        className="absolute inset-y-0 left-0 rounded-full bg-ink-faint"
        style={{ width: w }}
      />
    </span>
  )
}

export function SigDot({
  lp,
  kind = 'gene',
}: {
  lp: number | null | undefined
  /** 'gene' (default): gene-level + gene-mask + suggestive tiers.
   *  'variant': single variant-level Bonferroni tier + suggestive. */
  kind?: 'gene' | 'variant'
}) {
  let cls = 'border border-ink-faint/40'
  let title = 'Not significant'
  if (lp != null) {
    if (kind === 'variant') {
      if (lp >= LP_VARIANT) {
        cls = SIG_GENE_COLOR
        title = `Variant-level significant (P < ${fmtP(SIG_VARIANT)})`
      } else if (lp >= LP_SUGGEST) {
        cls = SIG_SUGGEST_COLOR
        title = `Suggestive (P < ${fmtP(SIG_SUGGEST)})`
      }
    } else if (lp >= LP_GENE) {
      cls = SIG_GENE_COLOR
      title = `Gene-level significant (P < ${fmtP(SIG_GENE_CAUCHY)})`
    } else if (lp >= -Math.log10(SIG_GENE_MASK_BONFERRONI)) {
      cls = SIG_MASK_COLOR
      title = `Gene-mask significant (P < ${fmtP(SIG_GENE_MASK_BONFERRONI)})`
    } else if (lp >= LP_SUGGEST) {
      cls = SIG_SUGGEST_COLOR
      title = `Suggestive (P < ${fmtP(SIG_SUGGEST)})`
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

/**
 * A single outlined ancestry chip — 3-char superpop code, colored border +
 * text, no fill — matching the forest plot's `ANCESTRY_COLOR` palette.
 * `dim` (no color, just the outline in the muted default text color) is for
 * a chip that's technically present but shouldn't draw the eye, e.g. an
 * ancestry the containing row can't act on. Shared building block for
 * `AncestryChips` below, the ancestry-filter dropdown (TableFilters.tsx),
 * and the sample-size pies (SamplePie.tsx) — one visual convention for
 * "this is ancestry X" everywhere in the app.
 */
export function AncestryChip({ anc, dim = false }: { anc: Ancestry; dim?: boolean }) {
  return (
    <span
      className="inline-flex shrink-0 items-center rounded border px-1 text-[9px] font-medium leading-[14px]"
      style={dim ? undefined : { borderColor: ANCESTRY_COLOR[anc], color: ANCESTRY_COLOR[anc] }}
    >
      {ANCESTRY_META[anc].label}
    </span>
  )
}

/**
 * Ancestry-availability tags: one `AncestryChip` per population ancestry a
 * variant was observed in. Takes a raw `anc_mask` bitmask (see
 * `decodeAncMask`) — both the gene page's per-gene variant table and the
 * phenotype page's genome-wide overview table use this, reading straight off
 * their row's `ancMask` field (baked into the data at pipeline build time,
 * so no extra fetch either way).
 */
export function AncestryChips({ mask }: { mask: number }) {
  const ancIdxs = decodeAncMask(mask)
  if (ancIdxs.length === 0) return null
  const label = `Observed in: ${ancIdxs.map((i) => ANCESTRY_META[ANCESTRIES[i]].long).join(', ')}`
  return (
    <Tip label={label} className="inline-flex shrink-0 items-center gap-0.5">
      {ancIdxs.map((i) => (
        <AncestryChip key={i} anc={ANCESTRIES[i]} />
      ))}
    </Tip>
  )
}

