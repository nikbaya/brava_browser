import { useMemo, useState } from 'react'
import { useAsync } from '../lib/useAsync'
import { useIndex } from '../data/IndexContext'
import { fetchBiobankIndex } from '../data/client'
import { fmtPos } from '../lib/format'
import { SUPERPOPS } from '../lib/constants'
import { Notice, Spinner } from '../components/ui'
import CohortCards from '../components/CohortCards'
import DiversityPies from '../components/DiversityPies'
import Tip from '../components/Tip'
import {
  ABOUT_BLURB,
  COHORTS,
  FOUNDED,
  LEADERSHIP,
  PRINCIPLES,
  WORKING_GROUPS,
} from '../data/consortium'
import type { Biobank } from '../data/types'

const TABS = ['Overview', 'Governing Principles', 'Leadership'] as const
type Tab = (typeof TABS)[number]

/**
 * Headline participant count, quoted as the flagship paper quotes it.
 *
 * Deliberately NOT `Σ biobank.sample_size` rendered through `fmtCount`. Those
 * per-biobank sizes come from supplementary Table S3 and are every one of them a
 * round figure (500,000 / 400,000 / 90,000 / 45,000 / …), so summing them to
 * 1,247,000 and printing "1.25M" claims three significant figures the inputs
 * don't carry — and it disagreed with the exact ancestry-assigned total in the
 * pies below (Table S8: 1,119,948 across the five groups shown), which read as a
 * contradiction on one page. The two count different things; see
 * docs/data-followups.md.
 */
const PARTICIPANTS = '~1.2M'
const PARTICIPANTS_HELP =
  'Ten biobanks and cohorts comprising over 1.2 million participants, as reported in the BRaVa flagship paper. Per-biobank totals are published as round figures, so no exact sum is meaningful; the ancestral-diversity pies below give the exact sequenced, ancestry-assigned counts.'

export default function AboutPage() {
  const { data, loading, error } = useAsync(fetchBiobankIndex, [])
  const { phenotypes, geneIndex } = useIndex()
  const [tab, setTab] = useState<Tab>('Overview')

  if (loading) return <Spinner label="Loading consortium data…" />
  if (error || !data)
    return <Notice title="Could not load consortium data">{error?.message}</Notice>

  const biobanks = data.biobanks
  const nGenes = geneIndex?.ids.length ?? 0

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-bold text-ink">The BRaVa consortium</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink-soft">{ABOUT_BLURB}</p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={PARTICIPANTS} label="Participants" help={PARTICIPANTS_HELP} />
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
      </div>
    </div>
  )
}

function Overview({ biobanks }: { biobanks: Biobank[] }) {
  // Reconcile the pies with the "~1.2M" headline in the same breath the pies are
  // shown, so the two figures never read as a contradiction. Computed, not
  // hard-coded, so it can't go stale if biobanks.json is rebuilt: `shown` is what
  // the pies actually add up to, `other` is any ancestry group outside the five
  // superpopulations they draw (today: 309 Middle Eastern samples from CCPM).
  const { shown, other, otherGroups } = useMemo(() => {
    let shown = 0
    let other = 0
    const otherGroups = new Set<string>()
    for (const b of biobanks)
      for (const [anc, n] of Object.entries(b.ancestry_n)) {
        if ((SUPERPOPS as readonly string[]).includes(anc)) shown += n
        else if (n > 0) {
          other += n
          otherGroups.add(anc)
        }
      }
    return { shown, other, otherGroups: [...otherGroups].sort() }
  }, [biobanks])

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-1 text-lg font-semibold text-ink">Ancestral diversity</h2>
        <p className="mb-4 max-w-3xl text-sm text-ink-soft">
          BRaVa's strength is the breadth of genetic ancestries it brings together.
          Each pie is one genetic-ancestry group; the slices show how that
          ancestry's representation is assembled across the contributing biobanks
          (hover for counts).
        </p>
        <div className="rounded-2xl border border-line bg-surface p-4">
          <DiversityPies biobanks={biobanks} />
        </div>
        <p className="mt-2 max-w-3xl text-xs text-ink-faint">
          These pies total <span className="tnum">{fmtPos(shown)}</span> sequenced
          samples assigned to one of the five genetic-ancestry groups shown
          {other > 0 && (
            <>
              {' '}
              (a further <span className="tnum">{fmtPos(other)}</span> in{' '}
              {otherGroups.join(', ')} are not plotted)
            </>
          )}
          . That is a different quantity from the ~1.2M participants above, which
          counts everyone enrolled in the ten biobanks and is published as rounded
          per-biobank totals.
        </p>
      </section>

      {/* Same order as the landing page: the ancestry pies, then the cohorts
          they are assembled from. Formerly its own "Participating Biobanks"
          tab, which hid the roster one click away from the diversity it
          explains. */}
      <section>
        <h2 className="mb-1 text-lg font-semibold text-ink">Participating biobanks</h2>
        <p className="mb-4 max-w-3xl text-sm text-ink-soft">
          BRaVa unites {COHORTS.length} biobanks and cohorts worldwide. Cohorts with
          results in this release show their sample size and ancestry
          composition; others are founding members whose data is not in this release.
        </p>
        <CohortCards biobanks={biobanks} />
      </section>
    </div>
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
            <div className="mt-0.5 text-xs text-ink-faint">{l.affiliation}</div>
          </div>
        ))}
      </div>

      <h2 className="mt-8 mb-3 text-lg font-semibold text-ink">Working groups</h2>
      <div className="space-y-3">
        {WORKING_GROUPS.map((g) => (
          <div key={g.name} className="rounded-2xl border border-line bg-surface p-4">
            <div className="flex items-baseline justify-between gap-2">
              <div className="font-semibold text-ink">{g.name}</div>
              <div className="text-xs text-ink-faint">{g.members.length} members</div>
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

function Stat({
  value,
  label,
  help,
}: {
  value: string
  label: string
  /** Provenance note. Marked with the same dotted underline as table headers. */
  help?: string
}) {
  return (
    <div className="rounded-xl border border-line bg-surface px-4 py-3">
      <div className="text-2xl font-bold tabular-nums text-brand">{value}</div>
      {help ? (
        <Tip
          label={help}
          wide
          className="cursor-help text-xs text-ink-faint underline decoration-ink-faint/70 decoration-dotted underline-offset-[3px]"
        >
          {label}
        </Tip>
      ) : (
        <div className="text-xs text-ink-faint">{label}</div>
      )}
    </div>
  )
}
