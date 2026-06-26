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

export const MASK_META: { raw: Mask; label: string; short: string }[] = [
  { raw: 'pLoF', label: 'pLoF', short: 'pLoF' },
  {
    raw: 'damaging_missense_or_protein_altering',
    label: 'Damaging missense / protein-altering',
    short: 'Damaging missense',
  },
  {
    raw: 'other_missense_or_protein_altering',
    label: 'Other missense / protein-altering',
    short: 'Other missense',
  },
  { raw: 'synonymous', label: 'Synonymous', short: 'Synonymous' },
  {
    raw: 'pLoF;damaging_missense_or_protein_altering',
    label: 'pLoF or damaging missense',
    short: 'pLoF | dmg missense',
  },
  {
    raw: 'pLoF;damaging_missense_or_protein_altering;other_missense_or_protein_altering;synonymous',
    label: 'pLoF, missense & synonymous (all variants)',
    short: 'All variants',
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

// Sensible defaults tuned to surface real signal.
export const DEFAULTS = {
  ancestry: 'All' as Ancestry,
  maskIndex: 4, // pLoF | damaging missense
  mafIndex: 0, // < 0.1%
  test: 'SKAT-O' as Test,
}
