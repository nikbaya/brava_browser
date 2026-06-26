import { useState } from 'react'
import { useAsync } from '../lib/useAsync'
import { useIndex } from '../data/IndexContext'
import { fetchBiobankIndex } from '../data/client'
import { fmtCount, fmtPos } from '../lib/format'
import { Notice, Pill, Spinner } from '../components/ui'
import WorldMap from '../components/WorldMap'
import AncestryPie from '../components/AncestryPie'
import type { Biobank } from '../data/types'

export default function AboutPage() {
  const { data, loading, error } = useAsync(fetchBiobankIndex, [])
  const { phenotypes, geneIndex } = useIndex()
  const [selected, setSelected] = useState<string | null>(null)

  if (loading) return <Spinner label="Loading consortium data…" />
  if (error || !data)
    return <Notice title="Could not load consortium data">{error?.message}</Notice>

  const biobanks = data.biobanks
  const totalN = biobanks.reduce((s, b) => s + b.sample_size, 0)
  const nGenes = geneIndex?.ids.length ?? 0

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="text-2xl font-bold text-ink">The BRaVa consortium</h1>
      <p className="mt-2 max-w-3xl text-sm text-ink-soft">
        The Biobank Rare Variant Analysis (BRaVa) consortium harmonises rare
        coding-variant association analyses across global biobanks, enabling
        gene-level meta-analysis at unprecedented scale and ancestral diversity.
        This browser presents the gene-level results.
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat value={fmtCount(totalN)} label="Participants" />
        <Stat value={String(biobanks.length)} label="Biobanks" />
        <Stat value={String(phenotypes.length)} label="Phenotypes" />
        <Stat value={fmtPos(nGenes)} label="Genes tested" />
      </div>

      <div className="mt-6 overflow-hidden rounded-2xl border border-line bg-surface p-2">
        <WorldMap biobanks={biobanks} selected={selected} onSelect={setSelected} />
      </div>

      <h2 className="mt-8 mb-3 text-lg font-semibold text-ink">
        Contributing biobanks
      </h2>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {biobanks.map((b) => (
          <BiobankCard
            key={b.id}
            b={b}
            active={selected === b.id}
            onHover={setSelected}
          />
        ))}
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

function BiobankCard({
  b,
  active,
  onHover,
}: {
  b: Biobank
  active: boolean
  onHover: (id: string | null) => void
}) {
  const popBased = b.ascertainment.toLowerCase().startsWith('population')
  return (
    <div
      onMouseEnter={() => onHover(b.id)}
      onMouseLeave={() => onHover(null)}
      className={`rounded-2xl border bg-surface p-4 transition-shadow ${
        active ? 'border-brand shadow-md' : 'border-line'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2 font-semibold text-ink">
            <span className="text-xl leading-none">{b.flag}</span>
            {b.name}
          </div>
          <div className="text-xs text-ink-faint">{b.country}</div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold tabular-nums text-ink">
            {fmtCount(b.sample_size)}
          </div>
          <div className="text-[10px] text-ink-faint">samples</div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5">
        <Pill tone={popBased ? 'brand' : 'up'}>
          {popBased ? 'Population-based' : 'Hospital-based'}
        </Pill>
        <Pill tone="neutral">{b.sequencing}</Pill>
      </div>

      <div className="mt-3 border-t border-line pt-3">
        <AncestryPie data={b.ancestry_n} size={64} />
      </div>
    </div>
  )
}
