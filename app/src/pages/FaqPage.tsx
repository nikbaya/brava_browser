import { useEffect, useState, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import {
  SIG_GENE_CAUCHY,
  SIG_GENE_MASK_BONFERRONI,
} from '../lib/constants'

const PAPER_TITLE =
  'The Biobank Rare Variant consortium powers the discovery of rare genetic associations through global collaboration'
const PAPER_DOI = '10.1101/2026.05.21.26353759'
const PAPER_URL = `https://doi.org/${PAPER_DOI}`

const CITATION = `Biobank Rare Variant Analysis (BRaVa) consortium. ${PAPER_TITLE}. medRxiv (2026). doi:${PAPER_DOI}`

const BIBTEX = `@article{brava2026,
  title   = {${PAPER_TITLE}},
  author  = {{Biobank Rare Variant Analysis (BRaVa) consortium}},
  journal = {medRxiv},
  year    = {2026},
  doi     = {${PAPER_DOI}}
}`

export default function FaqPage() {
  const { hash } = useLocation()

  // Scroll to the "How to cite" section when arrived via the footer link.
  useEffect(() => {
    if (hash === '#cite') {
      document.getElementById('cite')?.scrollIntoView({ behavior: 'smooth' })
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
          test. Variant-level results are not included in this version.
        </Faq>

        <Faq q="What are the variant masks?">
          Genes are tested under annotation masks that pool qualifying variants:
          predicted loss-of-function (pLoF), damaging missense / protein-altering,
          other missense, synonymous (a calibration control), and the combined
          “pLoF or damaging missense” and “all variants” masks. Each is tested at
          two MAF cutoffs (&lt; 0.1% and &lt; 0.01%).
        </Faq>

        <Faq q="Which test should I look at?">
          SKAT-O is the primary, most powerful gene-level test and drives the
          default significance call. Burden additionally provides a directional
          effect size (β &gt; 0 increases risk / the trait value; β &lt; 0
          decreases it). SKAT is most sensitive when a gene contains a mix of
          risk-increasing and protective variants.
        </Faq>

        <Faq q="What significance thresholds are used?">
          Two Bonferroni thresholds from the flagship paper are drawn on the
          plots. The gene-level threshold, P &lt;{' '}
          {SIG_GENE_CAUCHY.toExponential(1)}, is 0.05 corrected for ~20,000 genes
          (one combined test per gene). The stricter gene × mask threshold, P
          &lt; {SIG_GENE_MASK_BONFERRONI.toExponential(2)}, additionally corrects
          for the multiple masks tested within each gene, and applies to each
          individual (gene × mask) test.
        </Faq>

        <Faq q="What do the forest plots show?">
          For a focal gene × phenotype × mask × MAF, the per-ancestry Burden
          effect size (β ± 95% CI) and the cross-ancestry meta (“All”, shown as a
          diamond), annotated with each stratum’s sample size and a heterogeneity
          p-value flagging when effects differ across ancestries.
        </Faq>

        <Faq q="Which genome build are positions on?">
          All gene coordinates and chromosomal positions in this browser are on
          GRCh38 (hg38), annotated from Ensembl release 110.
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
            Biobank Rare Variant Analysis (BRaVa) consortium.{' '}
            <em>{PAPER_TITLE}</em>. medRxiv (2026). doi:{' '}
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

function Faq({ q, children }: { q: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="font-semibold text-ink">{q}</h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-soft">{children}</p>
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
        <span className="text-[11px] font-medium tracking-wide text-ink-faint uppercase">
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
