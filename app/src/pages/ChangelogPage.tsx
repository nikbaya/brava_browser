import { useAsync } from '../lib/useAsync'
import { fetchChangelog } from '../data/client'
import { Notice, Spinner } from '../components/ui'

const REPO_URL = 'https://github.com/nikbaya/brava_browser'

export default function ChangelogPage() {
  const { data, loading, error } = useAsync(fetchChangelog, [])

  if (loading) return <Spinner label="Loading changelog…" />
  if (error || !data)
    return <Notice title="Could not load changelog">{error?.message}</Notice>

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-ink">Changelog</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Every change shipped to this browser, generated directly from the{' '}
        <a href={REPO_URL} target="_blank" rel="noreferrer" className="text-brand hover:underline">
          GitHub repository
        </a>
        's commit history.
      </p>

      <ol className="mt-6 space-y-4 border-l border-line pl-4">
        {data.commits.map((c) => (
          <li key={c.sha}>
            <div className="flex items-baseline gap-2 text-xs text-ink-faint">
              <time dateTime={c.date}>{formatDate(c.date)}</time>
              <a
                href={`${REPO_URL}/commit/${c.sha}`}
                target="_blank"
                rel="noreferrer"
                className="font-mono hover:text-brand hover:underline"
              >
                {c.sha}
              </a>
            </div>
            <p className="text-sm text-ink">{c.message}</p>
          </li>
        ))}
      </ol>

      {data.commits.length === 0 && (
        <p className="mt-6 text-sm text-ink-soft">No changelog entries yet.</p>
      )}
    </div>
  )
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}
