import { Select } from './ui'
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
}

/** Shared mask / MAF / test (+ optional ancestry) filter row. */
export default function FilterBar({
  value,
  onChange,
  ancestries,
  hideAncestry,
}: Props) {
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch })
  const ancOptions = (ancestries ?? (Object.keys(ANCESTRY_META) as Ancestry[])).map(
    (a) => ({ value: a, label: ANCESTRY_META[a].long }),
  )

  return (
    <div className="flex flex-wrap items-end gap-2.5 rounded-lg border border-line bg-surface px-3 py-2">
      {!hideAncestry && (
        <Select
          label="Ancestry"
          value={value.ancestry}
          onChange={(ancestry) => set({ ancestry: ancestry as Ancestry })}
          options={ancOptions}
        />
      )}
      <Select
        label="Variant mask"
        value={value.maskIndex}
        onChange={(maskIndex) => set({ maskIndex })}
        options={MASK_META.map((m, i) => ({ value: i, label: m.label }))}
      />
      <Select
        label="Max MAF"
        value={value.mafIndex}
        onChange={(mafIndex) => set({ mafIndex })}
        options={MAF_META.map((m, i) => ({ value: i, label: m.label }))}
      />
      <Select
        label="Test"
        value={value.test}
        onChange={(test) => set({ test: test as Test })}
        options={TESTS.map((t) => ({ value: t, label: t }))}
      />
    </div>
  )
}
