import { Link } from 'react-router-dom'
import SearchBar from '../components/SearchBar'
import CohortCards from '../components/CohortCards'
import DiversityPies from '../components/DiversityPies'
import { useAsync } from '../lib/useAsync'
import { fetchBiobankIndex } from '../data/client'
import { COHORTS } from '../data/consortium'
import type { Biobank } from '../data/types'

// Curated examples shown under the search bar (Google-style).
const EXAMPLE_GENES = ['PCSK9', 'LDLR', 'APOB', 'TTN', 'GIGYF1']
const EXAMPLE_TRAITS: { id: string; label: string }[] = [
  { id: 'LDLC', label: 'LDL Cholesterol' },
  { id: 'T2Diab', label: 'Type 2 Diabetes' },
  { id: 'Height', label: 'Height' },
]

export default function LandingPage() {
  // biobanks.json is a 3 KB bundled asset, so the sections below the fold cost
  // no round trip to the data host. Failures are silent — the hero is the page.
  const { data } = useAsync(fetchBiobankIndex, [])

  return (
    <div>
      {/* Hero: fixed vertical padding, deliberately NOT a viewport-height box.
          Centering inside `min-h-[calc(100vh-…)]` made the whitespace around the
          search bar breathe in and out with the window, and on a tall screen it
          was far more air than the block needs. Nav lives in the shared Header. */}
      <section className="mx-auto flex max-w-2xl flex-col items-center px-4 pt-10 pb-12 text-center">
        <img
          src={`${import.meta.env.BASE_URL}BRaVa_logo.svg`}
          alt="BRaVa"
          className="mb-6 h-28 w-auto md:h-36"
        />
        <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">
          Biobank Rare Variant Analysis
        </h1>
        <p className="mt-2 max-w-xl text-sm text-ink-soft md:text-base">
          Explore rare coding-variant associations across 44 traits and
          ~1.2 million individuals from 10 global biobanks.
        </p>

        <div className="mt-8 w-full">
          <SearchBar autoFocus size="lg" />
        </div>

        <div className="mt-8 flex flex-col gap-3 text-sm">
          <ExampleRow label="Example genes">
            {EXAMPLE_GENES.map((g) => (
              <Chip key={g} to={`/gene/${g}`}>
                {g}
              </Chip>
            ))}
          </ExampleRow>
          <ExampleRow label="Example traits">
            {EXAMPLE_TRAITS.map((t) => (
              <Chip key={t.id} to={`/phenotype/${t.id}`}>
                {t.label}
              </Chip>
            ))}
          </ExampleRow>
        </div>
      </section>

      {data && (
        <div className="mx-auto max-w-7xl space-y-8 px-4 pt-4 pb-16">
          <Diversity biobanks={data.biobanks} />
          <Biobanks biobanks={data.biobanks} />
        </div>
      )}
    </div>
  )
}

function Diversity({ biobanks }: { biobanks: Biobank[] }) {
  return (
    <Section
      title="Ancestral diversity"
      blurb={
        <>
          BRaVa's strength is the breadth of genetic ancestries it brings
          together. Each pie is one genetic-ancestry group, sized by sample
          count; the slices show how that ancestry is assembled across the
          contributing biobanks (hover for counts).{' '}
          <Link
            to={{ pathname: '/faq', hash: '#what-is-ancestry' }}
            className="text-brand whitespace-nowrap hover:underline"
          >
            What is ancestry?
          </Link>
        </>
      }
    >
      <div className="rounded-2xl border border-line bg-surface p-4">
        <DiversityPies biobanks={biobanks} />
      </div>
    </Section>
  )
}

function Biobanks({ biobanks }: { biobanks: Biobank[] }) {
  return (
    <Section
      title="Participating biobanks"
      blurb={`BRaVa unites ${COHORTS.length} biobanks and cohorts worldwide. Cohorts with results in this release show their sample size and ancestry composition; others are founding members whose data is not in this release.`}
    >
      {/* The same cards as the About page's Participating Biobanks tab — no
          "Cohort details" link, because this *is* the detail. */}
      <CohortCards biobanks={biobanks} />
    </Section>
  )
}

function Section({
  title,
  blurb,
  children,
}: {
  title: string
  blurb: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-ink">{title}</h2>
      <p className="mb-4 max-w-3xl text-sm text-ink-soft">{blurb}</p>
      {children}
    </section>
  )
}

function ExampleRow({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  // On a phone the "EXAMPLE GENES" label costs ~110px of the row and pushed the
  // last chip onto a second line, so below `sm` it sits on its own line and the
  // chips get the full width. From `sm` up it's the original single row.
  return (
    <div className="flex flex-col items-center gap-1.5 sm:flex-row sm:flex-wrap sm:justify-center sm:gap-2">
      <span className="text-xs font-medium tracking-wide text-ink-faint uppercase">
        {label}
      </span>
      <div className="flex flex-wrap items-center justify-center gap-2">
        {children}
      </div>
    </div>
  )
}

function Chip({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-full border border-line bg-surface px-2.5 py-1 text-[13px] text-ink-soft transition hover:border-brand hover:bg-brand-light hover:text-brand sm:px-3 sm:text-sm"
    >
      {children}
    </Link>
  )
}
