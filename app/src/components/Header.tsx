import { Link } from 'react-router-dom'
import SearchBar from './SearchBar'

/** Top bar shown on every page except the landing page. */
export default function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3">
        <Link to="/" className="flex shrink-0 items-center" aria-label="BRaVa browser home">
          <img
            src={`${import.meta.env.BASE_URL}BRaVa_logo.svg`}
            alt="BRaVa"
            className="h-9 w-auto"
          />
        </Link>
        <div className="mx-auto w-full max-w-xl">
          <SearchBar />
        </div>
        <a
          href="https://brava-genetics.github.io"
          target="_blank"
          rel="noreferrer"
          className="hidden text-sm text-ink-soft hover:text-brand md:inline"
        >
          About
        </a>
      </div>
    </header>
  )
}
