import { lazy, Suspense } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import Header from './components/Header'
import LandingPage from './pages/LandingPage'
import GenePage from './pages/GenePage'
import PhenotypePage from './pages/PhenotypePage'
import NotFound from './pages/NotFound'
import { Spinner } from './components/ui'

// Lazy-loaded so the world-atlas map data only downloads when needed.
const AboutPage = lazy(() => import('./pages/AboutPage'))
const FaqPage = lazy(() => import('./pages/FaqPage'))

export default function App() {
  const { pathname } = useLocation()
  const isLanding = pathname === '/'

  return (
    <div className="flex min-h-full flex-col">
      {!isLanding && <Header />}
      <main className="flex-1">
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/gene/:id" element={<GenePage />} />
            <Route path="/phenotype/:id" element={<PhenotypePage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/faq" element={<FaqPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </div>
  )
}

function Footer() {
  return (
    <footer className="border-t border-line bg-surface px-4 py-6 text-center text-xs text-ink-faint">
      <p>
        BRaVa — Biobank Rare Variant Analysis consortium · meta-analysis of
        ~1.2M individuals across 10 biobanks.
      </p>
      <p className="mt-1">
        Summary statistics only · not for clinical use ·{' '}
        <Link to={{ pathname: '/faq', hash: '#cite' }} className="text-brand hover:underline">
          How to cite
        </Link>
      </p>
    </footer>
  )
}
