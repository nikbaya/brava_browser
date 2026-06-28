import { useState } from 'react'
import { useAsync } from '../lib/useAsync'
import { useIndex } from '../data/IndexContext'
import { fetchBiobankIndex } from '../data/client'
import { fmtCount, fmtPos } from '../lib/format'
import { Notice, Pill, Spinner } from '../components/ui'
import AncestryPie from '../components/AncestryPie'
import DiversityPies from '../components/DiversityPies'
import {
  ABOUT_BLURB,
  COHORTS,
  FOUNDED,
  LEADERSHIP,
  PRINCIPLES,
  WORKING_GROUPS,
  type Cohort,
} from '../data/consortium'
import type { Biobank } from '../data/types'

const TABS = ['Overview', 'Governing Principles', 'Leadership', 'Participating Biobanks'] as const
type Tab = (typeof TABS)[number]

export default function AboutPage() {
  const { data, loading, error } = useAsync(fetchBiobankIndex, [])
  const { phenotypes, geneIndex } = useIndex()
  const [tab, setTab] = useState<Tab>('Overview')

  if (loading) return <Spinner label="Loading consortium data…" />
  if (error || !data)
    return <Notice title="Could not load consortium data">{error?.message}</Notice>

  const biobanks = data.biobanks
  const totalN = biobanks.reduce((s, b) => s + b.sample_size, 0)
  const nGenes = geneIndex?.ids.length ?? 0

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-bold text-ink">The BRaVa consortium</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink-soft">{ABOUT_BLURB}</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={fmtCount(totalN)} label="Participants" />
        <Stat value={String(COHORTS.length)} label="Cohorts" />
        <Stat value={String(phenotypes.length)} label="Phenotypes" />
        <Stat value={fmtPos(nGenes)} label="Genes tested" />
      </div>

      {/* tabs */}
      <div className="mt-8 flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition ${
              tab === t
                ? 'border-brand text-brand'
                : 'border-transparent text-ink-soft hover:text-ink'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-6">
        {tab === 'Overview' && <Overview biobanks={biobanks} />}
        {tab === 'Governing Principles' && <Governance />}
        {tab === 'Leadership' && <Leadership />}
        {tab === 'Participating Biobanks' && <Participating biobanks={biobanks} />}
      </div>
    </div>
  )
}

function Overview({ biobanks }: { biobanks: Biobank[] }) {
  return (
    <section>
      <h2 className="mb-1 text-lg font-semibold text-ink">Ancestral diversity</h2>
      <p className="mb-4 max-w-3xl text-sm text-ink-soft">
        BRaVa's strength is the breadth of genetic ancestries it brings together.
        Each donut is one genetic-ancestry group; the slices show how that
        ancestry's representation is assembled across the contributing biobanks
        (hover for counts).
      </p>
      <div className="rounded-2xl border border-line bg-surface p-4">
        <DiversityPies biobanks={biobanks} />
      </div>
    </section>
  )
}

function Governance() {
  return (
    <section className="max-w-3xl">
      <p className="mb-5 text-sm text-ink-soft">
        BRaVa was formed in {FOUNDED}. The collaboration is guided by seven
        founding principles:
      </p>
      <ol className="space-y-2.5">
        {PRINCIPLES.map((p, i) => (
          <li key={i} className="flex gap-3 rounded-xl border border-line bg-surface p-3">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-light text-[12px] font-semibold text-brand">
              {i + 1}
            </span>
            <span className="text-sm text-ink">{p}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}

function Leadership() {
  const base = import.meta.env.BASE_URL
  return (
    <section>
      <h2 className="mb-3 text-lg font-semibold text-ink">Leadership team</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {LEADERSHIP.map((l) => (
          <div key={l.name} className="rounded-2xl border border-line bg-surface p-4 text-center">
            <img
              src={`${base}${l.photo}`}
              alt={l.name}
              loading="lazy"
              className="mx-auto h-24 w-24 rounded-full object-cover ring-1 ring-line"
            />
            <div className="mt-3 text-sm font-semibold text-ink">{l.name}</div>
            <div className="mt-0.5 text-[11px] text-ink-faint">{l.affiliation}</div>
          </div>
        ))}
      </div>

      <h2 className="mt-8 mb-3 text-lg font-semibold text-ink">Working groups</h2>
      <div className="space-y-3">
        {WORKING_GROUPS.map((g) => (
          <div key={g.name} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between gap-2">
              <div className="font-semibold text-ink">{g.name}</div>
              <div className="text-[11px] text-ink-faint">{g.members.length} members</div>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
              {g.members.join(' · ')}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

function Participating({ biobanks }: { biobanks: Biobank[] }) {
  const byId = new Map(biobanks.map((b) => [b.id, b]))
  // Contributing cohorts (with results in this release) first.
  const sorted = [...COHORTS].sort((a, b) => {
    const an = a.id ? (byId.get(a.id)?.sample_size ?? 0) : -1
    const bn = b.id ? (byId.get(b.id)?.sample_size ?? 0) : -1
    return bn - an
  })
  return (
    <section>
      <p className="mb-4 max-w-3xl text-sm text-ink-soft">
        BRaVa unites {COHORTS.length} biobanks and cohorts worldwide. Cohorts with
        results in this gene-level release show their sample size and ancestry
        composition; others are founding members whose data is not in this release.
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((c) => (
          <CohortCard key={c.name} c={c} b={c.id ? byId.get(c.id) : undefined} />
        ))}
      </div>
    </section>
  )
}

function CohortCard({ c, b }: { c: Cohort; b?: Biobank }) {
  const popBased = b?.ascertainment.toLowerCase().startsWith('population')
  return (
    <div className="flex flex-col rounded-2xl border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 font-semibold text-ink">
            <span className="text-xl leading-none">{c.flag}</span>
            <span className="truncate">{c.name}</span>
          </div>
          <div className="text-xs text-ink-faint">{c.country}</div>
        </div>
        {b && (
          <div className="text-right">
            <div className="text-lg font-bold tabular-nums text-ink">
              {fmtCount(b.sample_size)}
            </div>
            <div className="text-[10px] text-ink-faint">samples</div>
          </div>
        )}
      </div>

      {b && (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Pill tone={popBased ? 'brand' : 'up'}>
              {popBased ? 'Population-based' : 'Hospital-based'}
            </Pill>
            <Pill tone="neutral">{b.sequencing}</Pill>
          </div>
          <div className="mt-3 border-t border-line pt-3">
            <AncestryPie data={b.ancestry_n} size={64} />
          </div>
        </>
      )}

      <div className="mt-3 border-t border-line pt-2 text-[11px] text-ink-faint">
        {c.people.join(' · ')}
      </div>
    </div>
  )
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="text-2xl font-bold tabular-nums text-brand">{value}</div>
      <div className="text-xs text-ink-faint">{label}</div>
    </div>
  )
}
