import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import {
  SIG_GENE_CAUCHY,
  SIG_GENE_MASK_BONFERRONI,
  SIG_VARIANT,
} from '../lib/constants'
import { PAPER_DOI, PAPER_TITLE, PAPER_URL } from '../data/paper'

/** Full author list, in the order they appear on the paper. */
const PAPER_AUTHORS = [
  'Duncan S Palmer', 'Barney Hill', 'Sam Hodgson', 'Maarja Jõeloo', 'Georgios Kalantzis',
  'Athanasios Kousathanas', 'Satoshi Koyama', 'Wenhan Lu', 'Shinichi Namba',
  'Zachary B Rodriguez', 'Jonathan A Shortt', 'Kyuto Sonehara', 'Nicholas Vartanian',
  'Ha My T Vy', 'Isaac A Wade', 'Samantha L White', 'Nikolas A Baya', 'Nathalie Chami',
  'Ron Do', 'Karol Estrada', 'Sarah Finer', 'Giulio Genovese', 'Jeremy Guez', 'Yuval Itan',
  'Masahiro Kanai', 'Frederik H Lassen', 'Koichi Matsuda', 'Loukas Moutsianas',
  'Gina M Peloso', 'Priit Palta', 'Daniel J Rader', 'Augusto Rendon', 'Ghislain Rocheleau',
  'Omid Sadeghi-Alavijeh', 'Margaret Sunitha Selvaraj', 'Roelof AJ Smit', 'Dapeng Wang',
  'Emilie M Wigdor', 'Zhi Yu', 'Colorado Center for Personalized Medicine',
  'Estonian Biobank Research Team', 'Genes & Health Industry Consortium1',
  'Genes & Health Research Team', 'Penn Medicine BioBank', 'The BioBank Japan Project',
  'Christopher R Gignoux', 'Henrike Heyne', 'Ruth JF Loos', 'Hilary C Martin',
  'Lili Milani', 'Pradeep Natarajan', 'Yukinori Okada', 'Nikita Pozdeyev',
  'David A van Heel', 'Anurag Verma', 'Wei Zhou', 'Konrad J Karczewski',
  'Cecilia M Lindgren', 'Benjamin M Neale',
]

/** Collective / consortium credits, wrapped in braces in BibTeX so it isn't parsed as "First Last". */
const GROUP_AUTHORS = new Set([
  'Colorado Center for Personalized Medicine',
  'Estonian Biobank Research Team',
  'Genes & Health Industry Consortium1',
  'Genes & Health Research Team',
  'Penn Medicine BioBank',
  'The BioBank Japan Project',
])

const AUTHORS_STRING = PAPER_AUTHORS.join(', ')

const CITATION = `${AUTHORS_STRING}. ${PAPER_TITLE}. medRxiv (2026). doi:${PAPER_DOI}`

const BIBTEX = `@article{brava2026,
  title   = {${PAPER_TITLE}},
  author  = {${PAPER_AUTHORS.map((a) => (GROUP_AUTHORS.has(a) ? `{${a}}` : a)).join(' and ')}},
  journal = {medRxiv},
  year    = {2026},
  doi     = {${PAPER_DOI}}
}`

export default function FaqPage() {
  const { hash } = useLocation()

  // Scroll to a specific section/question when arrived via a cross-page link
  // (e.g. "How to cite" from the footer, "What is ancestry?" from the pie
  // sections on the landing and About pages).
  useEffect(() => {
    if (hash) {
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [hash])

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-ink">FAQ</h1>

      <div className="mt-6 space-y-6">
        <Faq q="What is BRaVa?">
          The Biobank Rare Variant Analysis consortium harmonises rare
          coding-variant association analyses across global biobanks and
          meta-analyses them, maximising power and ancestral diversity for
          gene-based rare-variant discovery.
        </Faq>

        <Faq q="What does this browser show?">
          Gene-level rare-variant association results: for each gene, phenotype,
          variant annotation mask, and minor-allele-frequency cutoff, the
          SKAT-O, Burden, and SKAT p-values from the cross-ancestry meta-analysis
          (and each ancestry stratum), plus the inverse-variance-weighted Burden
          effect size (β), its standard error, and a cross-cohort heterogeneity
          test. Single-variant results are also available within each gene.
        </Faq>

        <Faq id="what-is-ancestry" q="What is ancestry? Is it the same as race or ethnicity?">
          <blockquote className="border-l-2 border-line pl-3 text-ink italic">
            The “ancestry” of a group of people is related to the set of
            ancestors from whom they inherited their genetic variants. It does
            not have natural boundaries and it is not the same as race or
            ethnicity.
          </blockquote>
          <p className="mt-2 text-xs text-ink-faint">
            — Pan-UK Biobank, reused with permission. See{' '}
            <a
              href="https://pan.ukbb.broadinstitute.org/docs/background#what-is-ancestry-is-it-the-same-as-race-or-ethnicity"
              target="_blank"
              rel="noreferrer"
              className="text-brand hover:underline"
            >
              pan.ukbb.broadinstitute.org
            </a>{' '}
            for a detailed description of genetic ancestry.
          </p>
        </Faq>

        <Faq q="How were individuals assigned to genetic ancestry groups?">
          <p>
            To characterise the genetic ancestries represented across BRaVa,
            participants were projected onto the principal-component space
            defined by the 1000 Genomes and Human Genome Diversity Project
            reference panels. Following the approach taken by the
            Global Biobank Meta-analysis Initiative, individuals were
            assigned to one of five broad continental ancestry groups against
            these reference panels: African (AFR), Admixed American (AMR),
            East Asian (EAS), European (EUR), and Central/South Asian (SAS).
            These are the three-letter codes used throughout this browser, as
            in the flagship paper. Association analyses were then carried out
            separately within each ancestry-by-biobank subset, before being
            meta-analysed across biobanks and ancestries.
          </p>
          <p className="mt-2">
            As in other large-scale genetic studies, these groupings are an
            analytic device used to improve calibration and reduce
            confounding from population stratification in rare-variant
            association testing; they should not be read as biologically
            discrete or socially meaningful categories.
          </p>
          <p className="mt-2">
            BRaVa is not yet globally representative. Most individuals
            assigned to the AMR and AFR groups were recruited through
            US-based biobanks, while most assigned to SAS were recruited
            through UK-based cohorts; continental African and Central/South
            American populations in particular remain underrepresented.
            Despite this, BRaVa remains one of the broadest cross-ancestry
            resources currently available for rare-variant association
            analysis. See the{' '}
            <a href={PAPER_URL} target="_blank" rel="noreferrer" className="text-brand hover:underline">
              flagship paper
            </a>{' '}
            for full detail on the ancestry-assignment procedure.
          </p>
        </Faq>

        <Faq q="How were phenotypes selected?">
          <p>
            Phenotypes were nominated by consortium members and harmonised
            across biobanks using shared ICD and SNOMED mappings, so that
            phenotype definitions were consistent between contributing
            cohorts. A subset of these nominated phenotypes was then chosen
            for analysis based on representation across
            biobank–ancestry (e.g. UK Biobank × EUR, All of Us × AFR)
            subcohorts: a disease trait was retained if it
            had at least 100 cases in at least ten biobank–ancestry
            subcohorts spanning at least five biobanks, or a case prevalence
            above 1% across ancestries in UK Biobank.
          </p>
          <p className="mt-2">
            See the{' '}
            <a
              href="https://www.medrxiv.org/content/medrxiv/early/2026/05/24/2026.05.21.26353759/DC2/embed/media-2.xlsx?download=true"
              target="_blank"
              rel="noreferrer"
              className="text-brand hover:underline"
            >
              supplementary tables
            </a>{' '}
            for the full phenotype list and selection details.
          </p>
        </Faq>

        <Faq q="What are the variant masks?">
          Genes are tested under annotation masks that pool qualifying variants:
          predicted loss-of-function (pLoF), damaging missense / protein-altering,
          other missense, synonymous (a calibration control), and the combined
          “pLoF or damaging missense” and “all variants” masks. Each is tested at
          two MAF cutoffs (&lt; 0.1% and &lt; 0.01%).
        </Faq>

        <Faq q="Which test should I look at?">
          SKAT-O is an omnibus test that adaptively combines Burden and SKAT,
          and is the primary, most powerful gene-level test — it drives the
          default significance call. Burden additionally provides a directional
          effect size (β &gt; 0 increases risk / the trait value; β &lt; 0
          decreases it), and is most powerful when a gene's variants mostly
          point the same direction. SKAT is most sensitive when a gene contains
          a mix of risk-increasing and protective variants.
        </Faq>

        <Faq q="What significance thresholds are used?">
          Two Bonferroni thresholds from the flagship paper are drawn on the
          gene-level plots. The gene-level threshold, P &lt;{' '}
          {SIG_GENE_CAUCHY.toExponential(1)}, is 0.05 corrected for ~20,000 genes
          (one combined test per gene). The stricter gene × mask threshold, P
          &lt; {SIG_GENE_MASK_BONFERRONI.toExponential(2)}, additionally corrects
          for the multiple masks tested within each gene, and applies to each
          individual (gene × mask) test. For variant-level analyses, the
          threshold is P &lt; {SIG_VARIANT.toExponential(2)}, 0.05 corrected for
          2,746,957, the maximum number of variants tested for any single trait.
        </Faq>

        <Faq q="What do the forest plots show?">
          For a focal gene × phenotype × mask × MAF, the per-ancestry Burden
          effect size (β ± 95% CI) and the cross-ancestry meta (“All”, shown as a
          diamond), annotated with each stratum’s sample size and a heterogeneity
          p-value flagging when effects differ across ancestries.
        </Faq>

        <Faq q="Why are there so few variant-level results?">
          Single-variant tests, unlike gene-based tests, cannot pool information
          across a gene, so the variant-level meta-analysis was restricted to
          variants with sufficient power to be tested on their own. Every
          qualifying variant still contributes to its gene's mask-based results,
          but only that powered subset is reported as individual variants.
        </Faq>

        <Faq
          q={
            <>
              What is N<sub>eff</sub> (effective sample size) for a variant?
            </>
          }
        >
          For binary (case-control) traits it's N<sub>eff</sub> = 4 / (1/N<sub>cases</sub>{' '}
          + 1/N<sub>controls</sub>), with N<sub>cases</sub> and N<sub>controls</sub> summed across 
          every stratum that contributed to the variant. For quantitative traits it's simply the total sample size contributing
          to the variant.
        </Faq>

        <Faq q="Which genome build are positions on?">
          All gene coordinates and chromosomal positions in this browser are on
          GRCh38 (hg38), annotated from Ensembl release 110.
        </Faq>

        <Faq q="What license are the data released under?">
          All results in this browser — and the underlying summary statistics —
          are released under a{' '}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noreferrer"
            className="text-brand hover:underline"
          >
            Creative Commons Attribution 4.0 International licence (CC BY 4.0)
          </a>
          , matching the flagship paper. You're free to share and adapt them for
          any purpose, including commercially, as long as you give appropriate
          credit — see “How to cite” below.
        </Faq>

        <Faq q="Can I use these data clinically?">
          No. These are research summary statistics and are not validated for
          clinical or diagnostic use.
        </Faq>
      </div>

      {/* How to cite — at the bottom */}
      <section id="cite" className="mt-8 scroll-mt-20 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold text-ink">How to cite</h2>
        <p className="mt-1 text-sm text-ink-soft">
          If you use BRaVa results in your work, please cite the flagship paper:
        </p>
        <Copyable label="Citation" text={CITATION}>
          <p className="text-sm text-ink">
            {AUTHORS_STRING}. <em>{PAPER_TITLE}</em>. medRxiv (2026). doi:{' '}
            <a href={PAPER_URL} target="_blank" rel="noreferrer" className="text-brand hover:underline">
              {PAPER_DOI}
            </a>
          </p>
        </Copyable>
        <Copyable label="BibTeX" text={BIBTEX} mono>
          <pre className="overflow-x-auto text-xs text-ink-soft">{BIBTEX}</pre>
        </Copyable>
      </section>
    </div>
  )
}

function Faq({ q, id, children }: { q: ReactNode; id?: string; children: ReactNode }) {
  return (
    <div id={id} className={id ? 'scroll-mt-20' : undefined}>
      <h3 className="font-semibold text-ink">{q}</h3>
      <div className="mt-1 text-sm leading-relaxed text-ink-soft">{children}</div>
    </div>
  )
}

function Copyable({
  label,
  text,
  mono,
  children,
}: {
  label: string
  text: string
  mono?: boolean
  children: ReactNode
}) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <div
      className={`mt-3 rounded-lg border border-line bg-surface-soft p-3 ${
        mono ? 'font-mono' : ''
      }`}
    >
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium tracking-wide text-ink-faint uppercase">
          {label}
        </span>
        <button
          onClick={copy}
          className="rounded-md border border-line px-2 py-0.5 text-xs text-ink-soft hover:border-brand hover:text-brand"
        >
          {copied ? 'Copied ✓' : 'Copy'}
        </button>
      </div>
      {children}
    </div>
  )
}
