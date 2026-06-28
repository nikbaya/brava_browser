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

export interface WorkingGroup {
  name: string
  members: string[]
}

export const WORKING_GROUPS: WorkingGroup[] = [
  {
    name: 'Organising committee',
    members: ['Nic Timpson', 'Ron Do', 'Judy Cho', 'Iona Millwood', 'Chris Gignoux', 'Unnur Þorsteinsdóttir', 'Lili Milani', 'David van Heel', 'Hilary Martin', 'Loukas Moutsianas', 'Augusto Rendon', 'Pradeep Natarajan', 'David Hunter', 'Cecilia Lindgren', 'Hamdi Mbarek', 'Said Ismail', 'Ben Neale', 'Mette Nyegaard', 'Thomas Folkmann Hansen', 'Henriette Svarre', 'Yukinori Okada', 'Anurag Verma', 'Shefali Verma', 'Konrad Karczewski', 'Jim Wilson'],
  },
  {
    name: 'Phenotype characterisation team',
    members: ['Kate Northstone', 'Judy Cho', 'Ron Do', 'Ruth Loos', 'Iona Millwood', 'Zammy Fairhurst-Hunter', 'Chris Gignoux', 'Nick Rafaels', 'Lili Milani', 'David van Heel', 'Sarah Finer', 'Loukas Moutsianas', 'Augusto Rendon', 'Thanos Kousathanas', 'Satoshi Koyama', 'Chadi Saad', 'Kaavya Paruchuri', 'Thomas Gilliland', 'Mette Nyegaard', 'Thomas Folkmann Hansen', 'Henriette Svarre', 'Yukinori Okada', 'Masahiro Kanai', 'Anurag Verma', 'Shefali Verma', 'Scott Damrauer', 'Michael Levin', 'Giorgio Sirugo', 'Kyle Satterstrom', 'Buu Truong', 'Luke Pilling', 'Janice Atkins', 'David Melzer', 'Andrew Wood', 'Jim Wilson'],
  },
  {
    name: 'Analysis team',
    members: ['Simon Haworth', 'Ron Do', 'Eimear Kenny', 'Zammy Fairhurst-Hunter', 'Alfred Pozarickij', 'Chris Gignoux', 'Jonathan Shortt', 'Sameer Chavan', 'Unnur Þorsteinsdóttir', 'Reedik Mägi', 'Maarja Lepamets', 'Qinqin Huang', 'Hilary Martin', 'David van Heel', 'Thanos Kousathanas', 'Zhi Yu', 'Buu Truong', 'Satoshi Koyama', 'Gina Peloso', 'Margaret Selvaraj', 'Jennifer Collister', 'Duncan Palmer', 'Chadi Saad', 'Palle Rohde', 'Tugce Karaderi', 'Yukinori Okada', 'Masahiro Kanai', 'Kyuto Sonehata', 'Shinichi Namba', 'Tatsuhiko Naito', 'Anurag Verma', 'Shefali Verma', 'Scott Damrauer', 'Michael Levin', 'Giorgio Sirugo', 'Wei Zhou', 'Konrad Karczewski', 'Wenhan Lu', 'Kyle Satterstrom', 'Lisette Kogelman', 'Kaitlin Samocha', 'Nicola Whiffin', 'Jim Wilson'],
  },
  {
    name: 'Methods team',
    members: ['Ron Do', 'Eimear Kenny', 'Chris Gignoux', 'Meng Lin', 'Reedik Mägi', 'Margaret Selvaraj', 'Zhi Yu', 'Satoshi Koyama', 'Gina Peloso', 'Buu Truong', 'Duncan Palmer', 'Wei Zhou', 'Konrad Karczewski', 'Palle Rohde', 'Lisette Kogelman', 'Thomas Folkmann Hansen', 'Tanya Techlo', 'Yukinori Okada', 'Masahiro Kanai', 'Kyuto Sonehata', 'Shinichi Namba'],
  },
]

export interface Cohort {
  name: string
  country: string
  flag: string
  people: string[]
  /** Biobank id in biobanks.json when this cohort contributes to the release. */
  id?: string
}

// The 16 founding cohorts. `id` links to biobanks.json for those whose results
// are in this gene-level release (enriched with sample size + ancestry pie).
export const COHORTS: Cohort[] = [
  { name: 'All of Us', country: 'USA', flag: '🇺🇸', id: 'all-of-us', people: ['Buu Truong', 'Kyle Satterstrom', 'Konrad Karczewski', 'Wenhan Lu'] },
  { name: 'ALSPAC', country: 'UK', flag: '🇬🇧', people: ['Nic Timpson', 'Kate Northstone', 'Simon Haworth'] },
  { name: 'BioBank Japan', country: 'Japan', flag: '🇯🇵', id: 'bbj', people: ['Yukinori Okada', 'Masahiro Kanai', 'Kyuto Sonehata', 'Shinichi Namba', 'Tatsuhiko Naito'] },
  { name: 'BioMe', country: 'USA', flag: '🇺🇸', id: 'biome', people: ['Ron Do', 'Judy Cho', 'Eimear Kenny', 'Ernest Turro', 'Yuval Itan', 'Ruth Loos'] },
  { name: 'China Kadoorie Biobank', country: 'China', flag: '🇨🇳', people: ['Zhengming Chen', 'Liming Li', 'Iona Millwood', 'Zammy Fairhurst-Hunter', 'Alfred Pozarickij', 'Kuang Lin', 'Michael Holmes', 'Robert Clarke', 'Robin Walters'] },
  { name: 'CCPM Biobank', country: 'USA', flag: '🇺🇸', id: 'ccpm', people: ['Chris Gignoux', 'Nick Rafaels', 'Jonathan Shortt', 'Sameer Chavan', 'Meng Lin', 'Kristy Crooks', 'Katie Marker'] },
  { name: 'DanRaV', country: 'Denmark', flag: '🇩🇰', people: ['Mette Nyegaard', 'Thomas Folkmann Hansen', 'Henriette Svarre', 'Palle Rohde', 'Lisette Kogelman', 'Tanya Techlo', 'Mona Ameri Chalmer', 'Tugce Karaderi'] },
  { name: 'deCODE', country: 'Iceland', flag: '🇮🇸', people: ['Kári Stefánsson', 'Unnur Þorsteinsdóttir'] },
  { name: 'Estonian Biobank', country: 'Estonia', flag: '🇪🇪', id: 'egcut', people: ['Lili Milani', 'Reedik Mägi'] },
  { name: 'Genes & Health', country: 'UK', flag: '🇬🇧', id: 'genes-and-health', people: ['David van Heel', 'Hilary Martin', 'Sarah Finer', 'Qinqin Huang'] },
  { name: 'Genomics England', country: 'UK', flag: '🇬🇧', id: 'gel', people: ['Matthew Brown', 'Richard Scott', 'Augusto Rendon', 'Loukas Moutsianas', 'Dalia Kasperaviciute', 'Thanos Kousathanas'] },
  { name: 'Mass General Brigham Biobank', country: 'USA', flag: '🇺🇸', id: 'mgbb', people: ['Pradeep Natarajan', 'Satoshi Koyama', 'Kaavya Paruchuri', 'Thomas Gilliland', 'Zhi Yu', 'Buu Truong', 'Gina Peloso', 'Margaret Selvaraj'] },
  { name: 'Penn Medicine BioBank', country: 'USA', flag: '🇺🇸', id: 'pmbb', people: ['Anurag Verma', 'Daniel Rader', 'Marylyn Ritchie', 'Shefali Verma', 'Scott Damrauer', 'Michael Levin', 'Giorgio Sirugo'] },
  { name: 'Qatar Genome', country: 'Qatar', flag: '🇶🇦', people: ['Said Ismail', 'Hamdi Mbarek', 'Chadi Saad'] },
  { name: 'UK Biobank', country: 'UK', flag: '🇬🇧', id: 'uk-biobank', people: ['Rory Collins', 'Mark Effingham', 'Naomi Allen', 'Cecilia Lindgren', 'Ben Neale', 'Duncan Palmer'] },
  { name: 'VIKING Genes', country: 'Scotland', flag: '🏴󠁧󠁢󠁳󠁣󠁴󠁿', people: ['Jim Wilson'] },
]
