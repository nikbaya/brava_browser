import { useEffect, useRef, useState, type ReactNode } from 'react'

/** Row of small colored circles representing the annotations in a mask. */
export function MaskIcon({ colors }: { colors: string[] }) {
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5">
      {colors.map((c, i) => (
        <span
          key={i}
          className="h-2.5 w-2.5 rounded-full ring-1 ring-black/10"
          style={{ backgroundColor: c }}
        />
      ))}
    </span>
  )
}

export interface DropdownOption<T> {
  value: T
  label: string
  /** Optional leading icon (e.g. mask annotation swatches). */
  icon?: ReactNode
}

/**
 * Labelled custom dropdown shared across all filter controls. Replaces the
 * native `<select>` so every control looks identical and options can carry
 * icons (which a native `<option>` can't render).
 */
export default function Dropdown<T extends string | number>({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: DropdownOption<T>[]
}) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const selected = options.find((o) => o.value === value)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node))
        setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const pick = (v: T) => {
    onChange(v)
    setOpen(false)
  }

  return (
    <div className="flex flex-col gap-0.5 text-[11px] font-medium tracking-wide text-ink-faint uppercase">
      {label && <span>{label}</span>}
      <div ref={boxRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex w-full items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-left text-[13px] font-normal tracking-normal normal-case text-ink outline-none hover:border-brand focus:border-brand focus:ring-2 focus:ring-brand/20"
        >
          {selected?.icon}
          <span className="truncate">{selected?.label}</span>
          <span className="ml-auto pl-1 text-ink-faint">▾</span>
        </button>

        {open && (
          <ul className="absolute z-30 mt-1 min-w-full overflow-auto rounded-lg border border-line bg-surface py-1 text-left shadow-xl">
            {options.map((o) => (
              <li key={String(o.value)}>
                <button
                  type="button"
                  onClick={() => pick(o.value)}
                  className={`flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[13px] whitespace-nowrap normal-case hover:bg-brand-light ${
                    o.value === value
                      ? 'bg-brand-light font-semibold text-brand'
                      : 'text-ink'
                  }`}
                >
                  {o.icon}
                  {o.label}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
