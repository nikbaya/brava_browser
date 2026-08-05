import { fmtCount } from '../lib/format'
import { COHORTS, type Cohort } from '../data/consortium'
import type { Biobank } from '../data/types'
import { Pill } from './ui'
import AncestryPie from './AncestryPie'

/**
 * The consortium's cohorts as full cards: flag, country, sample size,
 * ascertainment + sequencing pills, ancestry pie and contributing investigators.
 *
 * Shared by the About page's "Participating Biobanks" tab and the landing page
 * — the landing page used to carry a stripped-down variant of the same grid, so
 * the two drifted apart in look and in what they credited.
 */
export default function CohortCards({ biobanks }: { biobanks: Biobank[] }) {
  const byId = new Map(biobanks.map((b) => [b.id, b]))
  // Contributing cohorts (with results in this release) first, largest first;
  // founding members without data sort last (-1, below any real sample size).
  const sorted = [...COHORTS].sort((a, b) => {
    const an = a.id ? (byId.get(a.id)?.sample_size ?? 0) : -1
    const bn = b.id ? (byId.get(b.id)?.sample_size ?? 0) : -1
    return bn - an
  })

  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {sorted.map((c) => (
        <CohortCard key={c.name} c={c} b={c.id ? byId.get(c.id) : undefined} />
      ))}
    </div>
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
