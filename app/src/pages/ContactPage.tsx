import type { ReactNode } from 'react'

const EMAIL = 'bravaconsortium@gmail.com'
const FEEDBACK_FORM_URL = 'https://forms.gle/e7FwnzTPQqRJBoPWA'
const REPO_URL = 'https://github.com/nikbaya/brava_browser'

export default function ContactPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-bold text-ink">Contact</h1>
      <p className="mt-2 text-sm text-ink-soft">
        Questions, feedback, and bug reports are all welcome.
      </p>

      <Section title="Email">
        <p>
          Reach the consortium directly at{' '}
          <a href={`mailto:${EMAIL}`} className="text-brand hover:underline">
            {EMAIL}
          </a>
          , including if you represent a biobank interested in joining BRaVa.
        </p>
      </Section>

      <Section title="Feedback form">
        <p>
          Share feedback on the browser through our{' '}
          <a
            href={FEEDBACK_FORM_URL}
            target="_blank"
            rel="noreferrer"
            className="text-brand hover:underline"
          >
            feedback form
          </a>
          .
        </p>
      </Section>

      <Section title="GitHub">
        <p>
          Questions and feature requests can also be submitted as issues on the{' '}
          <a
            href={REPO_URL}
            target="_blank"
            rel="noreferrer"
            className="text-brand hover:underline"
          >
            GitHub repository
          </a>
          .
        </p>
      </Section>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-7">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <div className="mt-1 text-sm leading-relaxed text-ink-soft">{children}</div>
    </section>
  )
}
