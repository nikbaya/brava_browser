import { useEffect, useRef, useState } from 'react'
import Tip from './Tip'

type Status = 'idle' | 'copied' | 'failed'

/**
 * "Copy a link to this view" chip, styled to match `DownloadButton` (which saves
 * the *numbers*) and `SaveFigureButton` (the *picture*) — this one saves the
 * *address*, so a colleague opens the same section with the same selections.
 *
 * The URL is built on click via `getUrl()`, not on render: the caller reads live
 * state (selected phenotype, ancestry) that changes far more often than anyone
 * presses this button.
 *
 * `navigator.clipboard` is unavailable outside a secure context (plain-HTTP
 * dev hosts) and can be refused by permission, so a failure is surfaced rather
 * than swallowed — silently doing nothing reads as a broken button.
 */
export default function CopyLinkButton({
  getUrl,
  label = 'Copy link',
  help,
}: {
  getUrl: () => string
  label?: string
  help: string
}) {
  const [status, setStatus] = useState<Status>('idle')
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(timer.current), [])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(getUrl())
      setStatus('copied')
    } catch {
      setStatus('failed')
    }
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setStatus('idle'), 1600)
  }

  return (
    <Tip
      label={status === 'failed' ? 'Could not reach the clipboard' : help}
      wide
      className="shrink-0"
    >
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        className="flex items-center gap-1 rounded-md border border-line px-1.5 py-0.5 text-[11px] font-medium text-ink-soft transition hover:border-brand hover:text-brand"
      >
        {/* Two interlocking chain links, sized to the 11px caption text. */}
        <svg width="11" height="11" viewBox="0 0 16 16" aria-hidden="true">
          <path
            d="M6.5 9.5a2.75 2.75 0 010-3.9l2-2a2.75 2.75 0 013.9 3.9l-1 1M9.5 6.5a2.75 2.75 0 010 3.9l-2 2a2.75 2.75 0 01-3.9-3.9l1-1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {status === 'copied' ? 'Copied ✓' : status === 'failed' ? 'Copy failed' : label}
      </button>
    </Tip>
  )
}
