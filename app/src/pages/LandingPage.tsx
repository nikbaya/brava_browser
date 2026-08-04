import { Link } from 'react-router-dom'
import SearchBar from '../components/SearchBar'
import DiversityPies from '../components/DiversityPies'
import { useAsync } from '../lib/useAsync'
import { fetchBiobankIndex } from '../data/client'
import { fmtCount } from '../lib/format'
import { COHORTS, type Cohort } from '../data/consortium'
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
      {/* Hero: viewport minus the sticky header (h-14) and footer, minus a
          sliver so the top of the next section peeks above the fold and hints
          that there's more below. Nav lives in the shared Header. */}
      <section className="mx-auto flex min-h-[calc(100vh-230px)] max-w-2xl flex-col items-center justify-center px-4 text-center">
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
      blurb="BRaVa's strength is the breadth of genetic ancestries it brings together. Each pie is one genetic-ancestry group, sized by sample count; the slices show how that ancestry is assembled across the contributing biobanks (hover for counts)."
    >
      <div className="rounded-2xl border border-line bg-surface p-4">
        <DiversityPies biobanks={biobanks} />
      </div>
    </Section>
  )
}

function Biobanks({ biobanks }: { biobanks: Biobank[] }) {
  const byId = new Map(biobanks.map((b) => [b.id, b]))
  const n = (c: Cohort) => (c.id ? (byId.get(c.id)?.sample_size ?? 0) : 0)
  // Cohorts with results in this release first, largest to smallest.
  const sorted = [...COHORTS].sort((a, b) => n(b) - n(a))

  return (
    <Section
      title="Participating biobanks"
      blurb={`BRaVa unites ${COHORTS.length} biobanks and cohorts worldwide. ${
        byId.size
      } contribute results to this release; the rest are founding members whose data is not yet included.`}
      more={{ to: '/about', label: 'Cohort details' }}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {sorted.map((c) => {
          const b = c.id ? byId.get(c.id) : undefined
          return (
            <div
              key={c.name}
              className={`flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5 ${
                b ? '' : 'opacity-70'
              }`}
            >
              <span className="text-xl leading-none">{c.flag}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-medium text-ink">{c.name}</div>
                <div className="text-[11px] text-ink-faint">{c.country}</div>
              </div>
              {b && (
                <div className="shrink-0 text-right">
                  <div className="text-[13px] font-semibold tabular-nums text-ink">
                    {fmtCount(b.sample_size)}
                  </div>
                  <div className="text-[10px] text-ink-faint">samples</div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

function Section({
  title,
  blurb,
  more,
  children,
}: {
  title: string
  blurb: string
  more?: { to: string; label: string }
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {more && (
          <Link to={more.to} className="shrink-0 text-sm text-brand hover:underline">
            {more.label} →
          </Link>
        )}
      </div>
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
  return (
    <div className="flex flex-wrap items-center justify-center gap-2">
      <span className="text-xs font-medium tracking-wide text-ink-faint uppercase">
        {label}
      </span>
      {children}
    </div>
  )
}

function Chip({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded-full border border-line bg-surface px-3 py-1 text-ink-soft transition hover:border-brand hover:bg-brand-light hover:text-brand"
    >
      {children}
    </Link>
  )
}
