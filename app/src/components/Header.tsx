import { Link } from 'react-router-dom'
import SearchBar from './SearchBar'

/** Top bar shown on every page except the landing page. */
export default function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2">
        <Link
          to="/"
          className="flex shrink-0 items-center gap-2"
          aria-label="BRaVa browser home"
        >
          <img
            src={`${import.meta.env.BASE_URL}brava_logo.png`}
            alt=""
            aria-hidden="true"
            className="h-8 w-auto"
          />
          <span className="text-xl font-bold tracking-tight text-ink">BRaVa</span>
        </Link>
        <div className="min-w-0 w-full max-w-md">
          <SearchBar />
        </div>
        <nav className="ml-auto flex shrink-0 items-center gap-4 text-sm">
          <Link to="/about" className="text-ink-soft hover:text-brand">
            About
          </Link>
          <Link to="/faq" className="text-ink-soft hover:text-brand">
            FAQ
          </Link>
        </nav>
      </div>
    </header>
  )
}
