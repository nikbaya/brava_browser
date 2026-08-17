import { useEffect, useRef, useState, type ReactNode } from 'react'
import Dropdown, { MaskIcon } from './Dropdown'
import {
  ANCESTRY_META,
  MAF_META,
  MASK_META,
  TESTS,
  type Ancestry,
  type Test,
} from '../lib/constants'

export interface FilterState {
  ancestry: Ancestry
  maskIndex: number
  mafIndex: number
  test: Test
}

interface Props {
  value: FilterState
  onChange: (next: FilterState) => void
  /** Restrict the ancestry options (e.g. those a phenotype actually has). */
  ancestries?: Ancestry[]
  /** Hide the ancestry control (gene page handles ancestry separately). */
  hideAncestry?: boolean
  /** Grey out Variant mask / Max MAF / Test — none of the three apply to a
   *  single-variant view (no annotation mask, no per-mask MAF cutoff, no
   *  gene-level test). Ancestry is left active, since it still narrows which
   *  variants are shown. */
  disableMaskMafTest?: boolean
}

// Control widths in px, mirroring the Tailwind classes used below, so the wrap
// threshold is computed from the real layout rather than guessed. (Ancestry is
// w-52 / 208px — it doesn't enter the threshold, but see the note below.)
const W_MASK = 224 // w-56
const W_NARROW = 96 // w-24, for both Max MAF and Test
const GAP = 10 // gap-2.5

/**
 * Row width at which "Variant mask + Test" still share a line. Above it, that
 * pairing is what saves a line; below it, nothing can pair those two.
 */
const PAIR_MIN = W_MASK + GAP + W_NARROW // 330

/**
 * Shared mask / MAF / test (+ optional ancestry) filter row.
 *
 * Control order is chosen for how the row *wraps*, and the best order depends on
 * how much width the row actually has — so it's measured, not assumed. A media
 * query would be wrong here: on the phenotype page this bar shares a
 * non-wrapping row with the page title, so its width isn't a fixed function of
 * the viewport.
 *
 * Two regimes, given Ancestry 208px, Variant mask 224px, Max MAF and Test 96px
 * each, and 10px gaps:
 *
 *  - **Row ≥ 330px** — Variant mask + Test fit together, so pair each wide
 *    control with a narrow one: Ancestry + Max MAF (314px), then Variant mask +
 *    Test (330px). Two lines. Leaving the wide controls adjacent instead strands
 *    Ancestry alone and spills Test onto a third line.
 *  - **Row < 330px** — no pairing can save a line, since 224 + 96 overflows. Use
 *    source order so the two narrow controls share the last line
 *    (Ancestry / Variant mask / Max MAF + Test) instead of stranding Test.
 *
 * Reordering can't feed back into the measurement: a wrap container's min- and
 * max-content widths are both order-independent (widest single item, and the sum
 * of all items, respectively), so the row's width is the same either way.
 */
const DISABLED_REASON = 'Not used for single-variant results'

export default function FilterBar({
  value,
  onChange,
  ancestries,
  hideAncestry,
  disableMaskMafTest,
}: Props) {
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch })
  const ancOptions = (ancestries ?? (Object.keys(ANCESTRY_META) as Ancestry[])).map(
    (a) => ({ value: a, label: ANCESTRY_META[a].long }),
  )

  const rowRef = useRef<HTMLDivElement>(null)
  const [rowW, setRowW] = useState(0)
  useEffect(() => {
    const el = rowRef.current
    if (!el) return
    // contentRect excludes the row's own padding, which is what the widths
    // above are measured against.
    const ro = new ResizeObserver((e) =>
      setRowW(Math.round(e[0].contentRect.width)),
    )
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // 0 = not yet measured; assume roomy, the common case, to avoid a first-paint
  // reshuffle on desktop.
  const tight = rowW > 0 && rowW < PAIR_MIN

  const ancestry = !hideAncestry && (
    <Dropdown
      key="ancestry"
      label="Ancestry"
      width="w-52"
      value={value.ancestry}
      onChange={(a) => set({ ancestry: a as Ancestry })}
      options={ancOptions}
    />
  )
  const mask = (
    <Dropdown
      key="mask"
      label="Variant mask"
      width="w-56"
      value={value.maskIndex}
      onChange={(maskIndex) => set({ maskIndex })}
      options={MASK_META.map((m, i) => ({
        value: i,
        label: m.label,
        icon: <MaskIcon colors={m.colors} />,
      }))}
      disabled={disableMaskMafTest}
      disabledReason={DISABLED_REASON}
    />
  )
  const maf = (
    <Dropdown
      key="maf"
      label="Max MAF"
      width="w-24"
      value={value.mafIndex}
      onChange={(mafIndex) => set({ mafIndex })}
      options={MAF_META.map((m, i) => ({ value: i, label: m.label }))}
      disabled={disableMaskMafTest}
      disabledReason={DISABLED_REASON}
    />
  )
  const test = (
    <Dropdown
      key="test"
      label="Test"
      width="w-24"
      value={value.test}
      onChange={(t) => set({ test: t as Test })}
      options={TESTS.map((t) => ({ value: t, label: t }))}
      disabled={disableMaskMafTest}
      disabledReason={DISABLED_REASON}
    />
  )

  const order: ReactNode[] = tight
    ? [ancestry, mask, maf, test]
    : [ancestry, maf, mask, test]

  return (
    <div
      ref={rowRef}
      // Default flex-shrink (1), same as the title block beside it in the
      // page header — but the title carries a higher `shrink` weight (see
      // GenePage/PhenotypePage/AllResultsPage) so it gives up width first.
      // This row must stay shrinkable, not `shrink-0`: it's what lets its own
      // internal wrap logic (tight vs. not) respond to whatever width it
      // ends up with, and an unshrinkable row can overflow the viewport
      // outright when the header can't make room any other way.
      className="flex flex-wrap items-end gap-2.5 rounded-lg border border-line bg-surface px-3 py-2"
    >
      {order}
    </div>
  )
}
