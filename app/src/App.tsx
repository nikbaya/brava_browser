import { Route, Routes, useLocation } from 'react-router-dom'
import Header from './components/Header'
import LandingPage from './pages/LandingPage'
import GenePage from './pages/GenePage'
import PhenotypePage from './pages/PhenotypePage'
import NotFound from './pages/NotFound'

export default function App() {
  const { pathname } = useLocation()
  const isLanding = pathname === '/'

  return (
    <div className="flex min-h-full flex-col">
      {!isLanding && <Header />}
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/gene/:id" element={<GenePage />} />
          <Route path="/phenotype/:id" element={<PhenotypePage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </div>
  )
}

function Footer() {
  return (
    <footer className="border-t border-line bg-surface px-4 py-6 text-center text-xs text-ink-faint">
      <p>
        BRaVa — Biobank Rare Variant Analysis consortium · gene-level
        meta-analysis of ~1.2M individuals across 10 biobanks.
      </p>
      <p className="mt-1">
        Summary statistics only · not for clinical use ·{' '}
        <a
          href="https://github.com/BRaVa-genetics"
          target="_blank"
          rel="noreferrer"
          className="text-brand hover:underline"
        >
          BRaVa-genetics on GitHub
        </a>
      </p>
    </footer>
  )
}
