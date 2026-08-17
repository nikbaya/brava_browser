// Canonical orderings shared with the Python ETL pipeline (pipeline/common.py).
// Integer indices into these arrays are used as compact keys in the JSON data
// files, so the order here is a wire contract — append, never reorder.

export const ANCESTRIES = [
  'All',
  'EUR',
  'AFR',
  'AMR',
  'EAS',
  'SAS',
  'non_EUR',
] as const
export type Ancestry = (typeof ANCESTRIES)[number]

// name -> index, matching the pipeline's anc_idx encoding.
export const ANCESTRY_INDEX: Record<Ancestry, number> = Object.fromEntries(
  ANCESTRIES.map((a, i) => [a, i]),
) as Record<Ancestry, number>

// Distinct marker colour per ancestry stratum (forest plot etc.).
export const ANCESTRY_COLOR: Record<Ancestry, string> = {
  All: '#15202b', // meta — near-black diamond
  EUR: '#1f6f8b',
  AFR: '#e08a1e',
  AMR: '#2f7d4f',
  EAS: '#c0392b',
  SAS: '#7d5ba6',
  non_EUR: '#566573',
}

// Ancestry-composition colours/labels for the biobank pies (superpopulations,
// including Middle Eastern (MID), which has no own meta stratum).
export const ANCESTRY_GROUP_COLOR: Record<string, string> = {
  EUR: '#1f6f8b',
  AFR: '#e08a1e',
  AMR: '#2f7d4f',
  EAS: '#c0392b',
  SAS: '#7d5ba6',
  MID: '#34495e',
}
export const ANCESTRY_GROUP_LABEL: Record<string, string> = {
  EUR: 'European',
  AFR: 'African',
  AMR: 'Admixed American',
  EAS: 'East Asian',
  SAS: 'Central & South Asian',
  MID: 'Middle Eastern',
}

// Super-populations shown as sample-size pies (matches the pipeline's _SUPER).
export const SUPERPOPS = ['EUR', 'AFR', 'AMR', 'EAS', 'SAS'] as const

/**
 * Decode a variant `anc_mask`'s superpop bits (bit i = SUPERPOPS[i]) into
 * canonical ANCESTRY_INDEX values, in SUPERPOPS order. Mirrors `SUPERPOP_BIT`
 * in pipeline/build_variants.py — keep the two in sync. Deliberately ignores
 * the separate non_EUR bit (see `hasNonEurMask`) — this is what the ancestry
 * *filter* matches against, and non_EUR isn't a selectable option there (its
 * samples overlap the individual populations, so an exact-match query
 * including it would be ambiguous).
 */
export function decodeAncMask(mask: number): number[] {
  const out: number[] = []
  for (let i = 0; i < SUPERPOPS.length; i++) {
    if (mask & (1 << i)) out.push(ANCESTRY_INDEX[SUPERPOPS[i]])
  }
  return out
}

/** One bit past the 5 superpop ones (see pipeline's NON_EUR_BIT): flags "also
 *  observed in the non_EUR pooled meta". A variant that only reaches the
 *  pooled non-EUR meta's reporting threshold (not any single population's
 *  own) has none of the SUPERPOPS bits set — without this it reads
 *  identically to "no ancestry data", when it's really "non-EUR only". Used
 *  for chip display (`AncestryChips`) and, narrowly, by the ancestry filter
 *  (`matchesAncFilter`) — see `NON_EUR_SUPERPOP_IDXS`. */
export function hasNonEurMask(mask: number): boolean {
  return (mask & (1 << SUPERPOPS.length)) !== 0
}

/** The 4 populations pooled into non_EUR (all of SUPERPOPS except EUR). A
 *  non-EUR-only variant (see `hasNonEurMask`) is confirmed to be *some*
 *  non-empty subset of these — but which one is unknown, so the ancestry
 *  filter (`matchesAncFilter`) only treats it as matching when every one of
 *  these is ticked; narrower selections (e.g. AFR alone) can't confirm it's
 *  actually in AFR rather than AMR/EAS/SAS, and showing it anyway would claim
 *  a certainty the data doesn't have. */
export const NON_EUR_SUPERPOP_IDXS = SUPERPOPS.filter((a) => a !== 'EUR').map(
  (a) => ANCESTRY_INDEX[a],
)

/** Canonical ANCESTRY_INDEX values for the 5 superpops an `anc_mask` bitmask
 *  can tag — the "tick which ancestries to include" filter offers exactly
 *  these (see AncestryFilterChips in TableFilters.tsx). */
export const SUPERPOP_IDXS = SUPERPOPS.map((a) => ANCESTRY_INDEX[a])

// Display labels + the file suffix used in the raw bucket
// ({PHENO}_..._cutoff{SUFFIX}.tsv.gz). 'All' is the no-suffix cross-ancestry meta.
export const ANCESTRY_META: Record<
  Ancestry,
  { label: string; long: string; suffix: string }
> = {
  All: { label: 'All', long: 'All ancestries (meta-analysis)', suffix: '' },
  EUR: { label: 'EUR', long: 'European', suffix: 'EUR' },
  AFR: { label: 'AFR', long: 'African', suffix: 'AFR' },
  AMR: { label: 'AMR', long: 'Admixed American', suffix: 'AMR' },
  EAS: { label: 'EAS', long: 'East Asian', suffix: 'EAS' },
  SAS: { label: 'SAS', long: 'Central & South Asian', suffix: 'SAS' },
  non_EUR: { label: 'non-EUR', long: 'Non-European (meta-analysis)', suffix: 'non_EUR' },
}

// Raw `Group` strings, in canonical index order.
export const MASKS = [
  'pLoF',
  'damaging_missense_or_protein_altering',
  'other_missense_or_protein_altering',
  'synonymous',
  'pLoF;damaging_missense_or_protein_altering',
  'pLoF;damaging_missense_or_protein_altering;other_missense_or_protein_altering;synonymous',
] as const
export type Mask = (typeof MASKS)[number]

// Per-annotation swatch colors. Composite masks stack the swatches of their
// constituent annotations (e.g. "pLoF or damaging missense" = two circles).
export const MASK_ANNOT_COLOR = {
  pLoF: '#8b0000', // darkred
  damaging_missense: '#f08080', // lightcoral
  other_missense: '#ffd700', // gold
  synonymous: '#87cefa', // lightskyblue
} as const

export const MASK_META: {
  raw: Mask
  label: string
  short: string
  colors: string[]
}[] = [
  { raw: 'pLoF', label: 'pLoF', short: 'pLoF', colors: [MASK_ANNOT_COLOR.pLoF] },
  {
    raw: 'damaging_missense_or_protein_altering',
    label: 'Damaging missense / protein-altering',
    short: 'Damaging missense',
    colors: [MASK_ANNOT_COLOR.damaging_missense],
  },
  {
    raw: 'other_missense_or_protein_altering',
    label: 'Other missense / protein-altering',
    short: 'Other missense',
    colors: [MASK_ANNOT_COLOR.other_missense],
  },
  {
    raw: 'synonymous',
    label: 'Synonymous',
    short: 'Synonymous',
    colors: [MASK_ANNOT_COLOR.synonymous],
  },
  {
    raw: 'pLoF;damaging_missense_or_protein_altering',
    label: 'pLoF or damaging missense',
    short: 'pLoF | dmg missense',
    colors: [MASK_ANNOT_COLOR.pLoF, MASK_ANNOT_COLOR.damaging_missense],
  },
  {
    raw: 'pLoF;damaging_missense_or_protein_altering;other_missense_or_protein_altering;synonymous',
    label: 'All variant categories',
    short: 'All variants',
    colors: [
      MASK_ANNOT_COLOR.pLoF,
      MASK_ANNOT_COLOR.damaging_missense,
      MASK_ANNOT_COLOR.other_missense,
      MASK_ANNOT_COLOR.synonymous,
    ],
  },
]

// MAF cutoff index order: 0 -> 0.001, 1 -> 0.0001.
export const MAFS = [0.001, 0.0001] as const
export const MAF_META = [
  { value: 0.001, label: '< 0.1%' },
  { value: 0.0001, label: '< 0.01%' },
]

export const TESTS = ['Burden', 'SKAT', 'SKAT-O'] as const
export type Test = (typeof TESTS)[number]

// Genome-wide significance thresholds from the BRaVa flagship paper.
export const SIG_GENE_CAUCHY = 2.5e-6 // gene-level Cauchy
export const SIG_GENE_MASK_BONFERRONI = 1.39e-7 // gene-mask Bonferroni
// Variant-level: 0.05 / 2,746,957, the max number of variants tested for any
// single trait — a fixed constant, not a per-phenotype value.
export const SIG_VARIANT = 1.82e-8
// Suggestive tier used by SigDot's amber dot, and (as of the all-results page)
// as the inclusion cutoff for pipeline/build_all_results.py's bundled index —
// loose enough to show everything past genome-wide significance plus the
// suggestive band, tight enough to keep that bundle small (see
// docs/ui-followups.md's All-results entry for the measured size tradeoff).
export const SIG_SUGGEST = 1e-4

// Sensible defaults tuned to surface real signal.
export const DEFAULTS = {
  ancestry: 'All' as Ancestry,
  maskIndex: 4, // pLoF | damaging missense
  mafIndex: 0, // < 0.1%
  test: 'SKAT-O' as Test,
}
