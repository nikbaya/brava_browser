import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

const BUCKET = 'gs://brava-meta-analysis'

export default function DownloadsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-ink">Downloads</h1>

      <div className="mt-4 rounded-2xl border border-line bg-surface p-5">
        <h2 className="text-lg font-semibold text-ink">License &amp; citing the data</h2>
        <p className="mt-1 text-sm leading-relaxed text-ink-soft">
          BRaVa summary statistics are released under a{' '}
          <a
            href="https://creativecommons.org/licenses/by/4.0/"
            target="_blank"
            rel="noreferrer"
            className="text-brand hover:underline"
          >
            Creative Commons Attribution 4.0 International licence (CC BY 4.0)
          </a>
          , matching the flagship paper: you're free to share and adapt the data
          for any purpose, including commercially, as long as you give
          appropriate credit. If you use BRaVa results in your work, please cite
          the flagship paper — see{' '}
          <Link
            to={{ pathname: '/faq', hash: '#cite' }}
            className="text-brand hover:underline"
          >
            how to cite
          </Link>
          . These are research summary statistics and are not validated for
          clinical or diagnostic use.
        </p>
      </div>

      <Section title="Just need what's on screen? Use the download button">
        <p>
          Every results table in this browser — gene page, phenotype page,
          variant tables, the{' '}
          <Link to="/all-results" className="text-brand hover:underline">
            all-results page
          </Link>{' '}
          — has a download button in its caption bar. It exports exactly the
          rows you're looking at: whatever you've filtered to, in the order
          you've sorted them, as a TSV.
        </p>
      </Section>

      <div className="mt-10 border-t border-line pt-8">
        <h2 className="text-xl font-bold text-ink">Bulk downloads</h2>
        <p className="mt-2 text-sm leading-relaxed text-ink-soft">
          For anything beyond a single table — the complete summary statistics
          across every phenotype, ancestry, mask and MAF cutoff — the full data
          are available from Google Cloud Storage at{' '}
          <code className="font-mono text-ink">{BUCKET}</code>, using{' '}
          <strong className="font-semibold text-ink">Requester Pays</strong>.
          These consist of ancestry-specific and cross-ancestry meta-analysis
          test statistics at both the{' '}
          <strong className="font-semibold text-ink">variant</strong> and{' '}
          <strong className="font-semibold text-ink">gene</strong> level — the
          full summary statistics behind this browser, not a subset.
        </p>
      </div>

      <Section title="What “Requester Pays” means for you">
        <p>
          The data are public, but the <em>cost of transferring them out</em> of
          the bucket is billed to whoever downloads them rather than to BRaVa. In
          practice this means:
        </p>
        <ul className="mt-2 ml-4 list-disc space-y-1">
          <li>
            You need your own Google Cloud project with billing enabled, and
            permission to use it for requests.
          </li>
          <li>
            Every command must name that project, or the request is rejected.
            That's the <code className="font-mono">--billing-project</code> flag
            below.
          </li>
          <li>
            Google charges your project standard network-egress and operation
            rates. Transfers to a VM or bucket in the same region are cheapest —
            if you're doing a large analysis, consider copying into your own
            bucket once rather than repeatedly pulling files down.
          </li>
        </ul>
      </Section>

      <Section title="1. Install and authenticate the Google Cloud CLI">
        <p>
          Follow{' '}
          <a
            href="https://cloud.google.com/sdk/docs/install"
            target="_blank"
            rel="noreferrer"
            className="text-brand hover:underline"
          >
            Google's install instructions
          </a>{' '}
          for the <code className="font-mono">gcloud</code> CLI, then sign in:
        </p>
        <Cmd>{`gcloud auth login`}</Cmd>
      </Section>

      <Section title="2. See what's there">
        <p>
          List the top-level layout, then drill into whichever level you need.
          Replace <code className="font-mono">YOUR_PROJECT</code> with your Google
          Cloud project ID throughout.
        </p>
        <Cmd>{`gcloud storage ls --billing-project=YOUR_PROJECT ${BUCKET}/`}</Cmd>
        <p className="mt-3">
          Add <code className="font-mono">-l</code> to see sizes before you commit
          to a transfer, and <code className="font-mono">-r</code> to recurse:
        </p>
        <Cmd>{`gcloud storage ls -l --billing-project=YOUR_PROJECT ${BUCKET}/gene/`}</Cmd>
      </Section>

      <Section title="3. Download">
        <p>A single file:</p>
        <Cmd>{`gcloud storage cp --billing-project=YOUR_PROJECT \\
  ${BUCKET}/gene/FILENAME.tsv.gz .`}</Cmd>
        <p className="mt-3">
          An entire directory (<code className="font-mono">gcloud storage</code>{' '}
          parallelises transfers automatically):
        </p>
        <Cmd>{`gcloud storage cp -r --billing-project=YOUR_PROJECT \\
  ${BUCKET}/gene .`}</Cmd>
        <p className="mt-3">
          Or copy straight into a bucket of your own, which avoids pulling data
          to your laptop at all:
        </p>
        <Cmd>{`gcloud storage cp -r --billing-project=YOUR_PROJECT \\
  ${BUCKET}/gene gs://your-own-bucket/brava/`}</Cmd>
      </Section>

      <Section title="Using the older gsutil CLI">
        <p>
          If you already have <code className="font-mono">gsutil</code> muscle
          memory, the Requester Pays flag is{' '}
          <code className="font-mono">-u</code> and it goes{' '}
          <em>before</em> the subcommand. Add{' '}
          <code className="font-mono">-m</code> for parallel transfers:
        </p>
        <Cmd>{`gsutil -u YOUR_PROJECT ls ${BUCKET}/
gsutil -u YOUR_PROJECT -m cp -r ${BUCKET}/gene .`}</Cmd>
      </Section>

      <Section title="File formats">
        <p>
          Files are compressed. Gene-level results are gzipped, tab-delimited
          SAIGE-GENE+ meta-analysis output — one file per phenotype and ancestry,
          with a row per gene × variant-annotation mask × MAF cutoff × test
          (Burden, SKAT, SKAT-O). Variant-level results are VCFs, with the
          per-variant meta-analysis statistics in the sample columns.
        </p>
        <p className="mt-2">
          Everything this browser displays is derived from these files: the
          SKAT-O / Burden / SKAT p-values, the inverse-variance-weighted Burden
          effect size and standard error, and the cross-cohort heterogeneity
          test. See the{' '}
          <Link to="/faq" className="text-brand hover:underline">
            FAQ
          </Link>{' '}
          for how to interpret the masks, tests, and significance thresholds.
        </p>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-1 text-sm leading-relaxed text-ink-soft">{children}</div>
    </section>
  )
}

/** Shell snippet with a copy button. */
function Cmd({ children }: { children: string }) {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(children)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <div className="relative mt-2 rounded-lg border border-line bg-surface-soft">
      <button
        onClick={copy}
        className="absolute top-1.5 right-1.5 rounded-md border border-line bg-surface px-2 py-0.5 text-xs text-ink-soft hover:border-brand hover:text-brand"
      >
        {copied ? 'Copied ✓' : 'Copy'}
      </button>
      <pre className="overflow-x-auto px-3 py-2.5 pr-16 font-mono text-xs text-ink">
        {children}
      </pre>
    </div>
  )
}
