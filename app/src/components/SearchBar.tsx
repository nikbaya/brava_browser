import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useIndex, type SearchResult } from '../data/IndexContext'

interface Props {
  autoFocus?: boolean
  size?: 'lg' | 'md'
  placeholder?: string
}

/** Type-ahead search over genes (symbol / ENSG) and phenotypes. */
export default function SearchBar({
  autoFocus,
  size = 'md',
  placeholder = 'Search a gene (e.g. PCSK9) or trait (e.g. LDL Cholesterol)',
}: Props) {
  const { search, loading } = useIndex()
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)

  const results = useMemo<SearchResult[]>(
    () => (q.trim() ? search(q, 10) : []),
    [q, search],
  )

  useEffect(() => setActive(0), [q])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const go = (r: SearchResult) => {
    setOpen(false)
    setQ('')
    navigate(r.kind === 'gene' ? `/gene/${r.id}` : `/phenotype/${r.id}`)
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!open || results.length === 0) return
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => (a + 1) % results.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => (a - 1 + results.length) % results.length)
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(results[active])
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  const big = size === 'lg'

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="relative">
        <SearchIcon
          className={`pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-faint ${big ? 'h-5 w-5' : 'h-4 w-4'}`}
        />
        <input
          autoFocus={autoFocus}
          value={q}
          disabled={loading}
          onChange={(e) => {
            setQ(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder={loading ? 'Loading index…' : placeholder}
          className={`w-full rounded-full border border-line bg-surface text-ink shadow-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-brand/25 ${
            big ? 'py-4 pr-5 pl-12 text-lg' : 'py-2.5 pr-4 pl-10 text-sm'
          }`}
        />
      </div>

      {open && results.length > 0 && (
        <ul className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-line bg-surface text-left shadow-xl">
          {results.map((r, i) => (
            <li key={`${r.kind}:${r.id}`}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => go(r)}
                className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${
                  i === active ? 'bg-brand-light' : ''
                }`}
              >
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] font-semibold tracking-wide uppercase ${
                    r.kind === 'gene'
                      ? 'bg-brand/10 text-brand'
                      : 'bg-accent/10 text-accent'
                  }`}
                >
                  {r.kind}
                </span>
                <span className="font-medium text-ink">{r.primary}</span>
                <span className="ml-auto truncate text-xs text-ink-faint">
                  {r.secondary}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="2" />
      <path
        d="m14 14 4 4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
