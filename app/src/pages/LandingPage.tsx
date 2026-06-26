import { Link } from 'react-router-dom'
import SearchBar from '../components/SearchBar'

// Curated examples shown under the search bar (Google-style).
const EXAMPLE_GENES = ['PCSK9', 'LDLR', 'APOB', 'TTN', 'GIGYF1']
const EXAMPLE_TRAITS: { id: string; label: string }[] = [
  { id: 'LDLC', label: 'LDL Cholesterol' },
  { id: 'T2Diab', label: 'Type 2 Diabetes' },
  { id: 'Height', label: 'Height' },
  { id: 'CAD', label: 'Coronary Artery Disease' },
]

export default function LandingPage() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-2xl flex-col items-center justify-center px-4 pb-24 text-center">
      <img
        src={`${import.meta.env.BASE_URL}BRaVa_logo.svg`}
        alt="BRaVa"
        className="mb-6 h-28 w-auto md:h-36"
      />
      <h1 className="text-2xl font-semibold tracking-tight text-ink md:text-3xl">
        Biobank Rare Variant Analysis
      </h1>
      <p className="mt-2 max-w-xl text-sm text-ink-soft md:text-base">
        Explore gene-level rare coding-variant associations across 44 traits and
        ~1.2 million individuals from 10 global biobanks.
      </p>

      <div className="mt-8 w-full">
        <SearchBar autoFocus size="lg" />
      </div>

      <div className="mt-8 flex flex-col gap-3 text-sm">
        <ExampleRow label="Genes">
          {EXAMPLE_GENES.map((g) => (
            <Chip key={g} to={`/gene/${g}`}>
              {g}
            </Chip>
          ))}
        </ExampleRow>
        <ExampleRow label="Traits">
          {EXAMPLE_TRAITS.map((t) => (
            <Chip key={t.id} to={`/phenotype/${t.id}`}>
              {t.label}
            </Chip>
          ))}
        </ExampleRow>
      </div>
    </div>
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
      className="rounded-full border border-line bg-surface px-3 py-1 text-ink-soft transition hover:border-brand hover:text-brand"
    >
      {children}
    </Link>
  )
}
