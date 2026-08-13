// Full BRaVa gene-level meta-analysis author list, transcribed from
// "BRaVa author list - BRaVa_tidied.tsv" (repo root). Includes both named
// individuals and collective biobank/consortium credits (e.g. "Penn Medicine
// BioBank"), in the same order as the flagship preprint's author byline (see
// PAPER_AUTHORS in FaqPage.tsx, which must stay in sync with this order).

export interface Author {
  name: string
  /** Affiliation(s), verbatim from the TSV. Empty for some collective credits. */
  affiliations: string[]
  /**
   * Biobank id in consortium.ts's COHORTS, when the author can be confidently
   * tied to one: either they're named under that cohort on the official
   * https://brava-genetics.github.io/BRaVa/people.html roster, or their
   * affiliation is that cohort's home institution/department (e.g. the
   * Charles Bronfman Institute at Mount Sinai → BioMe). Left unset for authors
   * who work across cohorts (BRaVa methods/analysis team at the Broad/MGH,
   * Sanger sequencing staff) or whose affiliation doesn't match any cohort —
   * these need a manual call, not a guess.
   */
  biobankId?: string
}

export const AUTHORS: Author[] = [
  { name: 'Duncan S Palmer', affiliations: ['Big Data Institute, Li Ka Shing Centre for Health Information and Discovery, University of Oxford, Oxford, UK', 'Department of Statistics, University of Oxford, Oxford, UK', 'Program in Medical and Population Genetics, Broad Institute of MIT and Harvard, Cambridge, MA, USA', 'The Pioneer Centre for SMARTbiomed, Big Data Institute, Li Ka Shing Centre for Health Information and Discovery, University of Oxford, Oxford, UK'], biobankId: 'uk-biobank' },
  { name: 'Barney Hill', affiliations: ['Centre for Human Genetics, University of Oxford, Oxford, UK'], biobankId: 'uk-biobank' },
  { name: 'Sam Hodgson', affiliations: ['Wolfson Institute of Population Health, Queen Mary University of London, London, UK'], biobankId: 'genes-and-health' },
  { name: 'Maarja Jõeloo', affiliations: ['Estonian Genome Centre, Institute of Genomics, University of Tartu, Tartu, Estonia'], biobankId: 'egcut' },
  { name: 'Georgios Kalantzis', affiliations: ['Wellcome Sanger Institute, Hinxton, UK'], biobankId: 'genes-and-health' },
  { name: 'Athanasios Kousathanas', affiliations: ['Genomics England, London, UK'], biobankId: 'gel' },
  { name: 'Satoshi Koyama', affiliations: ['Personalized Medicine, Mass General Brigham, Boston, MA, USA', 'Heart and Vascular Institute, Mass General Brigham, Boston, MA, USA', 'Program in Medical and Population Genetics, Broad Institute of MIT and Harvard, Cambridge, MA, USA', 'Cardiovascular Disease Initiative, Broad Institute of MIT and Harvard, Cambridge, MA, USA', 'Department of Medicine, Harvard Medical School, Boston, MA, USA'], biobankId: 'mgbb' },
  { name: 'Wenhan Lu', affiliations: ['Analytic and Translational Genetics Unit, Massachusetts General Hospital, Boston, MA, USA', 'Stanley Center for Psychiatric Research, Broad Institute of MIT and Harvard, Cambridge, MA, USA', 'Program in Medical and Population Genetics, Broad Institute of MIT and Harvard, Cambridge, MA, USA'], biobankId: 'all-of-us' },
  { name: 'Shinichi Namba', affiliations: ['Department of Genome Informatics, Graduate School of Medicine, The University of Tokyo, Tokyo, Japan', 'Laboratory for Systems Genetics, RIKEN Center for Integrative Medical Sciences, Yokohama, Japan'], biobankId: 'bbj' },
  { name: 'Zachary B Rodriguez', affiliations: ['Division of Translational Medicine and Human Genetics, Department of Medicine, Perelman School of Medicine, University of Pennsylvania, Philadelphia, PA, USA'], biobankId: 'pmbb' },
  { name: 'Jonathan A Shortt', affiliations: ['Department of Biomedical Informatics, University of Colorado, Anschutz Medical Campus, Aurora, CO, USA'], biobankId: 'ccpm' },
  { name: 'Kyuto Sonehara', affiliations: ['Department of Genome Informatics, Graduate School of Medicine, The University of Tokyo, Tokyo, Japan', 'Laboratory for Systems Genetics, RIKEN Center for Integrative Medical Sciences, Yokohama, Japan'], biobankId: 'bbj' },
  { name: 'Nicholas Vartanian', affiliations: ['The Charles Bronfman Institute for Personalized Medicine, Icahn School of Medicine at Mount Sinai, New York, NY, USA'], biobankId: 'biome' },
  { name: 'Ha My T Vy', affiliations: ['The Charles Bronfman Institute for Personalized Medicine, Icahn School of Medicine at Mount Sinai, New York, NY, USA'], biobankId: 'biome' },
  { name: 'Isaac A Wade', affiliations: ['Nuffield Department of Population Health, Medical Sciences Division, University of Oxford, Oxford, UK'], biobankId: 'uk-biobank' },
  { name: 'Samantha L White', affiliations: ['Department of Biomedical Informatics, University of Colorado Anschutz, Aurora, CO, USA'], biobankId: 'ccpm' },
  { name: 'Nikolas A Baya', affiliations: ['Big Data Institute, Li Ka Shing Centre for Health Information and Discovery, University of Oxford, Oxford, UK', 'Centre for Human Genetics, University of Oxford, Oxford, UK'], biobankId: 'uk-biobank' },
  { name: 'Nathalie Chami', affiliations: ['The Charles Bronfman Institute for Personalized Medicine, Icahn School of Medicine at Mount Sinai, New York, NY, USA'], biobankId: 'biome' },
  { name: 'Ron Do', affiliations: ['The Charles Bronfman Institute for Personalized Medicine, Icahn School of Medicine at Mount Sinai, New York, NY, USA'], biobankId: 'biome' },
  { name: 'Karol Estrada', affiliations: ['Translational Genomics, Maze Therapeutics, South San Francisco, CA, USA'] },
  { name: 'Sarah Finer', affiliations: ['Wolfson Institute of Population Health, Queen Mary University of London, London, UK'], biobankId: 'genes-and-health' },
  { name: 'Giulio Genovese', affiliations: ['Stanley Center, Broad Institute of MIT and Harvard, MA, USA'] },
  { name: 'Jeremy Guez', affiliations: ['Analytic and Translational Genetics Unit, Massachusetts General Hospital, Boston, MA, USA', 'Program in Medical and Population Genetics, Broad Institute of MIT and Harvard, Cambridge, MA, USA'] },
  { name: 'Yuval Itan', affiliations: ['The Charles Bronfman Institute for Personalized Medicine, Icahn School of Medicine at Mount Sinai, New York, NY, USA', 'Department of Genetics and Genomic Sciences, Icahn School of Medicine at Mount Sinai, New York, NY, USA'], biobankId: 'biome' },
  { name: 'Masahiro Kanai', affiliations: ['Center for Computational and Integrative Biology, Massachusetts General Hospital, Boston, MA, USA', 'Program in Medical and Population Genetics, Broad Institute of MIT and Harvard, Cambridge, MA, USA', 'Department of Genome Informatics, Graduate School of Medicine, The University of Tokyo, Tokyo, Japan'], biobankId: 'bbj' },
  { name: 'Frederik H Lassen', affiliations: ['Big Data Institute, Li Ka Shing Centre for Health Information and Discovery, University of Oxford, Oxford, UK', 'Centre for Human Genetics, University of Oxford, Oxford, UK'], biobankId: 'uk-biobank' },
  { name: 'Koichi Matsuda', affiliations: ['Laboratory of Clinical Genome Sequencing, Department of Computational Biology and Medical Sciences, Graduate School of Frontier Sciences, The University of Tokyo, Tokyo, Japan', 'Laboratory of Genome Technology, Human Genome Center, Institute of Medical Science, The University of Tokyo, Tokyo, Japan'], biobankId: 'bbj' },
  { name: 'Loukas Moutsianas', affiliations: ['Genomics England, London, UK'], biobankId: 'gel' },
  { name: 'Gina M Peloso', affiliations: ['Department of Biostatistics, Boston University School of Public Health, Boston, MA, USA'], biobankId: 'mgbb' },
  { name: 'Priit Palta', affiliations: ['Estonian Genome Centre, Institute of Genomics, University of Tartu, Tartu, Estonia'], biobankId: 'egcut' },
  { name: 'Daniel J Rader', affiliations: ['Division of Translational Medicine and Human Genetics, Department of Medicine, Perelman School of Medicine, University of Pennsylvania, Philadelphia, PA, USA', 'Department of Genetics, Perelman School of Medicine, University of Pennsylvania, Philadelphia, PA, USA'], biobankId: 'pmbb' },
  { name: 'Augusto Rendon', affiliations: ['Genomics England, London, UK'], biobankId: 'gel' },
  { name: 'Ghislain Rocheleau', affiliations: ['The Charles Bronfman Institute for Personalized Medicine, Icahn School of Medicine at Mount Sinai, New York, NY, USA', 'Department of Genetics and Genomic Sciences, Icahn School of Medicine at Mount Sinai, New York, NY, USA'], biobankId: 'biome' },
  { name: 'Omid Sadeghi-Alavijeh', affiliations: ['Centre for Kidney and Bladder Health, University College London, London, UK'] },
  { name: 'Margaret Sunitha Selvaraj', affiliations: ['Center for Genomic Medicine, Massachusetts General Hospital, Boston, MA, USA', 'Cardiovascular Research Center, Massachusetts General Hospital, Boston, MA, USA', 'Cardiovascular Disease Initiative, Broad Institute of MIT and Harvard, Cambridge, MA, USA', 'Department of Medicine, Harvard Medical School, Boston, MA, USA'], biobankId: 'mgbb' },
  { name: 'Roelof AJ Smit', affiliations: ['The Charles Bronfman Institute for Personalized Medicine, Icahn School of Medicine at Mount Sinai, New York, NY, USA', 'Novo Nordisk Foundation Center for Basic Metabolic Research, University of Copenhagen, Copenhagen, Denmark'], biobankId: 'biome' },
  { name: 'Dapeng Wang', affiliations: ['National Heart and Lung Institute, Imperial College London, London, UK'] },
  { name: 'Emilie M Wigdor', affiliations: ['Institute of Developmental and Regenerative Medicine, University of Oxford, Oxford, UK', 'Department of Paediatrics, University of Oxford, Oxford, UK'] },
  { name: 'Zhi Yu', affiliations: ['Clinical and Translational Epidemiology Unit, Massachusetts General Hospital, Boston, MA, USA', 'Cardiovascular Disease Initiative, Broad Institute of MIT and Harvard, Cambridge, MA, USA', 'Cardiovascular Research Center, Massachusetts General Hospital, Boston, MA, USA', 'Center for Genomic Medicine, Massachusetts General Hospital, Boston, MA, USA'], biobankId: 'mgbb' },
  { name: 'Colorado Center for Personalized Medicine', affiliations: ['University of Colorado Anschutz, Aurora, CO, USA'], biobankId: 'ccpm' },
  { name: 'Estonian Biobank Research Team', affiliations: ['Estonian Genome Centre, Institute of Genomics, University of Tartu, Tartu, Estonia'], biobankId: 'egcut' },
  { name: 'Genes & Health Industry Consortium', affiliations: [], biobankId: 'genes-and-health' },
  { name: 'Genes & Health Research Team', affiliations: [], biobankId: 'genes-and-health' },
  { name: 'Penn Medicine BioBank', affiliations: [], biobankId: 'pmbb' },
  { name: 'The BioBank Japan Project', affiliations: [], biobankId: 'bbj' },
  { name: 'Christopher R Gignoux', affiliations: ['Department of Biomedical Informatics, University of Colorado Anschutz, Aurora, CO, USA', 'Colorado Center for Personalized Medicine, University of Colorado Anschutz, Aurora, CO, USA', 'Human Medical Genetics and Genomics Program, University of Colorado Anschutz, Aurora, CO, USA', 'University of Colorado Cancer Center, University of Colorado Anschutz, Aurora, CO, USA'], biobankId: 'ccpm' },
  { name: 'Henrike Heyne', affiliations: ['Hasso Plattner Institute, Digital Engineering Faculty, University of Potsdam, Potsdam, Germany', 'Windreich Department of Artificial Intelligence and Human Health, Icahn School of Medicine at Mount Sinai, New York, NY, USA', 'Finnish Institute for Molecular Medicine, University of Helsinki, Helsinki, Finland', 'Program in Medical and Population Genetics, Broad Institute of MIT and Harvard, Cambridge, MA, USA'] },
  { name: 'Ruth JF Loos', affiliations: ['Novo Nordisk Foundation Center for Basic Metabolic Research, University of Copenhagen, Copenhagen, Denmark', 'The Charles Bronfman Institute for Personalized Medicine, Icahn School of Medicine at Mount Sinai, New York, NY, USA'], biobankId: 'biome' },
  { name: 'Hilary C Martin', affiliations: ['Wellcome Sanger Institute, Hinxton, UK'], biobankId: 'genes-and-health' },
  { name: 'Lili Milani', affiliations: ['Estonian Genome Centre, Institute of Genomics, University of Tartu, Tartu, Estonia'], biobankId: 'egcut' },
  { name: 'Pradeep Natarajan', affiliations: ['Center for Genomic Medicine, Massachusetts General Hospital, Boston, MA, USA', 'Heart and Vascular Institute, Mass General Brigham, Boston, MA, USA', 'Program in Medical and Population Genetics, Broad Institute of MIT and Harvard, Cambridge, MA, USA', 'Cardiovascular Disease Initiative, Broad Institute of MIT and Harvard, Cambridge, MA, USA', 'Department of Medicine, Harvard Medical School, Boston, MA, USA'], biobankId: 'mgbb' },
  { name: 'Yukinori Okada', affiliations: ['Department of Genome Informatics, Graduate School of Medicine, The University of Tokyo, Tokyo, Japan', 'Laboratory for Systems Genetics, RIKEN Center for Integrative Medical Sciences, Yokohama, Japan', 'Laboratory of Statistical Immunology, Immunology Frontier Research Center (WPI-IFReC), The University of Osaka, Suita, Japan', 'Premium Research Institute for Human Metaverse Medicine (WPI-PRIMe), The University of Osaka, Suita, Japan'], biobankId: 'bbj' },
  { name: 'Nikita Pozdeyev', affiliations: ['Department of Biomedical Informatics, University of Colorado Anschutz, Aurora, CO, USA', 'Division of Endocrinology, Diabetes and Metabolism, University of Colorado Anschutz, Aurora, CO, USA', 'Colorado Center for Personalized Medicine, University of Colorado Anschutz, Aurora, CO, USA', 'University of Colorado Cancer Center, University of Colorado Anschutz, Aurora, CO, USA'], biobankId: 'ccpm' },
  { name: 'David A van Heel', affiliations: ['Blizard Institute, Queen Mary University of London, 4 Newark Street, London, UK'], biobankId: 'genes-and-health' },
  { name: 'Anurag Verma', affiliations: ['Division of Translational Medicine and Human Genetics, Department of Medicine, Perelman School of Medicine, University of Pennsylvania, Philadelphia, PA, USA', 'Division of Informatics, Department of Biostatistics, Epidemiology and Informatics, Perelman School of Medicine, University of Pennsylvania, Philadelphia, PA, USA'], biobankId: 'pmbb' },
  { name: 'Wei Zhou', affiliations: ['Program in Medical and Population Genetics, Broad Institute of MIT and Harvard, Cambridge, MA, USA', 'Analytic and Translational Genetics Unit, Massachusetts General Hospital, Boston, MA, USA', 'Stanley Center for Psychiatric Research, Broad Institute of MIT and Harvard, Cambridge, MA, USA', 'Psychiatric and Neurodevelopmental Genetics Unit, Center for Genomic Medicine, Massachusetts General Hospital, Boston, MA, USA'] },
  { name: 'Konrad J Karczewski', affiliations: ['Analytic and Translational Genetics Unit, Massachusetts General Hospital, Boston, MA, USA', 'Program in Medical and Population Genetics, Broad Institute of MIT and Harvard, Cambridge, MA, USA', 'Novo Nordisk Foundation Center for Genomic Mechanisms of Disease, Broad Institute of MIT and Harvard, Cambridge, MA, USA'], biobankId: 'all-of-us' },
  { name: 'Cecilia M Lindgren', affiliations: ['Department of Statistics, University of Oxford, Oxford, UK', "Nuffield Department of Women's & Reproductive Health, University of Oxford, Oxford, UK", 'The Pioneer Centre for SMARTbiomed, Big Data Institute, Li Ka Shing Centre for Health Information and Discovery, University of Oxford, Oxford, UK'], biobankId: 'uk-biobank' },
  { name: 'Benjamin M Neale', affiliations: ['Analytic and Translational Genetics Unit, Massachusetts General Hospital, Boston, MA, USA', 'Stanley Center for Psychiatric Research, Broad Institute of MIT and Harvard, Cambridge, MA, USA', 'Program in Medical and Population Genetics, Broad Institute of MIT and Harvard, Cambridge, MA, USA', 'Novo Nordisk Foundation Center for Genomic Mechanisms of Disease, Broad Institute of MIT and Harvard, Cambridge, MA, USA'], biobankId: 'uk-biobank' },
]
