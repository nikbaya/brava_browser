import { useEffect, useMemo, useRef, useState } from 'react'

export interface PhenoOption {
  idx: number
  name: string
}

/**
 * Compact searchable combobox for choosing a phenotype (e.g. the forest-plot
 * focus). Shows the current selection; click to type-filter the option list.
 */
export default function PhenoPicker({
  value,
  options,
  onChange,
}: {
  value: number | null | undefined
  options: PhenoOption[]
  onChange: (idx: number) => void
}) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const boxRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selected = options.find((o) => o.idx === value)

  const matches = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return options
    return options.filter((o) => o.name.toLowerCase().includes(s))
  }, [q, options])

  useEffect(() => setActive(0), [q])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) {
        setOpen(false)
        setQ('')
      }
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const pick = (o: PhenoOption) => {
    onChange(o.idx)
    setOpen(false)
    setQ('')
  }

  return (
    <div ref={boxRef} className="relative">
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1 rounded-md border border-line bg-surface px-2 py-1 text-[13px] text-ink hover:border-brand"
        >
          {selected?.name ?? 'Select phenotype'}
          <span className="text-ink-faint">▾</span>
        </button>
      ) : (
        <input
          ref={inputRef}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault()
              setActive((a) => Math.min(a + 1, matches.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setActive((a) => Math.max(a - 1, 0))
            } else if (e.key === 'Enter' && matches[active]) {
              e.preventDefault()
              pick(matches[active])
            } else if (e.key === 'Escape') {
              setOpen(false)
              setQ('')
            }
          }}
          placeholder={selected?.name ?? 'Search phenotype…'}
          className="w-56 rounded-md border border-brand bg-surface px-2 py-1 text-[13px] text-ink outline-none focus:ring-2 focus:ring-brand/20"
        />
      )}

      {open && (
        <ul className="absolute z-30 mt-1 max-h-72 w-64 overflow-auto rounded-lg border border-line bg-surface py-1 text-left shadow-xl">
          {matches.length === 0 && (
            <li className="px-3 py-2 text-xs text-ink-faint">No matches</li>
          )}
          {matches.map((o, i) => (
            <li key={o.idx}>
              <button
                type="button"
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o)}
                className={`w-full px-3 py-1.5 text-left text-[13px] ${
                  i === active ? 'bg-brand-light' : ''
                } ${o.idx === value ? 'font-semibold text-brand' : 'text-ink'}`}
              >
                {o.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
