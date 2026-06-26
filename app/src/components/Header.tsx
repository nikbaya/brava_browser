import { Link } from 'react-router-dom'
import SearchBar from './SearchBar'

/** Top bar shown on every page except the landing page. */
export default function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-2">
        <Link to="/" className="flex shrink-0 items-center" aria-label="BRaVa browser home">
          <img
            src={`${import.meta.env.BASE_URL}BRaVa_logo.svg`}
            alt="BRaVa"
            className="h-10 w-auto"
          />
        </Link>
        <div className="mx-auto min-w-0 max-w-md flex-1">
          <SearchBar />
        </div>
        <nav className="flex shrink-0 items-center gap-4 text-sm">
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
