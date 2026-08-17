import { useEffect, useRef, useState, type ReactNode } from 'react'
import Tip from './Tip'

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
  width,
  disabled,
  disabledReason,
}: {
  label: string
  value: T
  onChange: (v: T) => void
  options: DropdownOption<T>[]
  /** Fixed width (Tailwind class, e.g. `w-52`) so the control doesn't resize —
   *  and shift the toolbar — when the selected label changes. The popup menu
   *  stays `min-w-full`, so long labels remain fully readable there. */
  width?: string
  /** Grey the control out and block opening it — e.g. a filter that has no
   *  effect in the view currently on screen. */
  disabled?: boolean
  /** Tooltip shown while disabled, explaining why. */
  disabledReason?: string
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

  // A mode switch elsewhere on the page (e.g. Gene/Variant toggle) can disable
  // this control while its menu happens to be open.
  useEffect(() => {
    if (disabled) setOpen(false)
  }, [disabled])

  const pick = (v: T) => {
    onChange(v)
    setOpen(false)
  }

  const button = (
    <button
      type="button"
      disabled={disabled}
      onClick={() => setOpen((o) => !o)}
      className={`flex w-full items-center gap-1.5 rounded-md border px-2 py-1 text-left text-[13px] font-normal tracking-normal normal-case outline-none ${
        disabled
          ? 'cursor-default border-line bg-surface-soft text-ink-faint'
          : 'border-line bg-surface text-ink hover:border-brand focus:border-brand focus:ring-2 focus:ring-brand/20'
      }`}
    >
      {selected?.icon}
      <span className="truncate">{selected?.label}</span>
      <span className="ml-auto pl-1 text-ink-faint">▾</span>
    </button>
  )

  return (
    <div
      className={`flex flex-col gap-0.5 text-xs font-medium tracking-wide text-ink-faint uppercase ${width ?? ''}`}
    >
      {label && <span>{label}</span>}
      <div ref={boxRef} className="relative">
        {disabled && disabledReason ? (
          <Tip label={disabledReason} className="block w-full">
            {button}
          </Tip>
        ) : (
          button
        )}

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
