// Static consortium reference content, transcribed from the public BRaVa site
// (https://brava-genetics.github.io/BRaVa/). Kept here so the About page can
// present governance / leadership / participating-cohort info without a network
// dependency.

export const FOUNDED = 'February 2022'

export const ABOUT_BLURB =
  'The Biobank Rare Variant Analysis (BRaVa) consortium is an open, collaborative effort — formed in February 2022 — between biobanks and cohorts from across the globe to aggregate and analyse rare (coding) variant associations in whole-exome and whole-genome sequencing data. By harmonising calling, quality control, and analysis, BRaVa boosts the statistical power of rare-variant studies, enables cross-cohort validation, and makes it possible to study diseases and traits too infrequent for any single biobank.'

/** The seven founding principles (verbatim). */
export const PRINCIPLES: string[] = [
  'Collaborate in an environment of honesty, fairness and trust.',
  'Promote early-career researchers.',
  "Respect other groups' data.",
  'Operate transparently with a goal of no surprises.',
  'Seek permission from each group to use results prior to public release.',
  "Do not share another group's results with other parties without permission.",
  'We should not inhibit any work being done within an individual group (or between pairs of groups, etc).',
]

export interface Leader {
  name: string
  affiliation: string
  photo: string // path under public/
}

export const LEADERSHIP: Leader[] = [
  { name: 'Duncan S. Palmer', affiliation: 'University of Oxford', photo: 'team/duncan.webp' },
  {
    name: 'Konrad J. Karczewski',
    affiliation: 'Broad Institute · Massachusetts General Hospital',
    photo: 'team/konrad.jpg',
  },
  {
    name: 'Cecilia M. Lindgren',
    affiliation: 'University of Oxford',
    photo: 'team/cecilia.jpg',
  },
  {
    name: 'Benjamin M. Neale',
    affiliation: 'Broad Institute · Massachusetts General Hospital',
    photo: 'team/ben.jpg',
  },
]

export interface Cohort {
  name: string
  country: string
  flag: string
  /** Biobank id in biobanks.json when this cohort contributes to the release. */
  id?: string
}

// The 16 founding cohorts. `id` links to biobanks.json for those whose results
// are in this gene-level release (enriched with sample size + ancestry pie).
export const COHORTS: Cohort[] = [
  { name: 'All of Us', country: 'USA', flag: '🇺🇸', id: 'all-of-us' },
  { name: 'ALSPAC', country: 'UK', flag: '🇬🇧' },
  { name: 'BioBank Japan', country: 'Japan', flag: '🇯🇵', id: 'bbj' },
  { name: 'BioMe', country: 'USA', flag: '🇺🇸', id: 'biome' },
  { name: 'China Kadoorie Biobank', country: 'China', flag: '🇨🇳' },
  { name: 'CCPM Biobank', country: 'USA', flag: '🇺🇸', id: 'ccpm' },
  { name: 'DanRaV', country: 'Denmark', flag: '🇩🇰' },
  { name: 'deCODE', country: 'Iceland', flag: '🇮🇸' },
  { name: 'Estonian Biobank', country: 'Estonia', flag: '🇪🇪', id: 'egcut' },
  { name: 'Genes & Health', country: 'UK', flag: '🇬🇧', id: 'genes-and-health' },
  { name: 'Genomics England', country: 'UK', flag: '🇬🇧', id: 'gel' },
  { name: 'Mass General Brigham Biobank', country: 'USA', flag: '🇺🇸', id: 'mgbb' },
  { name: 'Penn Medicine BioBank', country: 'USA', flag: '🇺🇸', id: 'pmbb' },
  { name: 'Qatar Genome', country: 'Qatar', flag: '🇶🇦' },
  { name: 'UK Biobank', country: 'UK', flag: '🇬🇧', id: 'uk-biobank' },
  { name: 'Viking Genes', country: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿' },
]
