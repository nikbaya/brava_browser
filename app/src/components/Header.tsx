import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import SearchBar from './SearchBar'

const NAV = [
  { to: '/all-results', label: 'All results' },
  { to: '/downloads', label: 'Downloads' },
  { to: '/about', label: 'About' },
  { to: '/faq', label: 'FAQ' },
  { to: '/contact', label: 'Contact' },
]

/** Top bar shown on every page except the landing page. Fixed height (h-14) so
 *  the grey StickyTitle sub-bar can pin directly beneath it (top-14).
 *
 *  Below `sm` the nav collapses into a burger menu and the wordmark drops to the
 *  logo mark: the links are `shrink-0`, so at phone widths they held their full
 *  ~200px and squeezed the search bar — the primary action here — down to a few
 *  dozen pixels. */
export default function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:gap-4">
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
          <span className="hidden text-xl font-bold tracking-tight text-ink sm:inline">
            BRaVa
          </span>
        </Link>
        <div className="w-full max-w-md min-w-0">
          <SearchBar />
        </div>
        <nav className="ml-auto hidden shrink-0 items-center gap-4 text-sm sm:flex">
          {NAV.map((n) => (
            <Link key={n.to} to={n.to} className="text-ink-soft hover:text-brand">
              {n.label}
            </Link>
          ))}
        </nav>
        <BurgerNav />
      </div>
    </header>
  )
}

/** The same links as a dropdown panel, shown only below `sm`. */
function BurgerNav() {
  const [open, setOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const { pathname } = useLocation()

  // Close on navigation. Tapping a link inside the panel is the common case,
  // but this also covers the search bar navigating out from under an open menu.
  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={boxRef} className="relative ml-auto shrink-0 sm:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Menu"
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex h-9 w-9 items-center justify-center rounded-md text-ink-soft hover:bg-surface-soft hover:text-brand"
      >
        {open ? <CloseIcon /> : <BurgerIcon />}
      </button>

      {open && (
        // The panel hangs below the bar rather than inside it: the header's
        // h-14 is load-bearing (StickyTitle pins at top-14), so the menu must
        // not change the bar's height.
        <nav className="absolute top-full right-0 mt-1 min-w-40 rounded-lg border border-line bg-surface py-1 shadow-xl">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className="block px-3 py-2 text-sm text-ink hover:bg-brand-light hover:text-brand"
            >
              {n.label}
            </Link>
          ))}
        </nav>
      )}
    </div>
  )
}

function BurgerIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="M3 5.5h14M3 10h14M3 14.5h14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="none" aria-hidden>
      <path
        d="m5 5 10 10M15 5 5 15"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}
