import { lazy, Suspense, useEffect } from 'react'
import { Route, Routes, useLocation } from 'react-router-dom'
import { countPageview } from './lib/analytics'
import Header from './components/Header'
import LandingPage from './pages/LandingPage'
import GenePage from './pages/GenePage'
import PhenotypePage from './pages/PhenotypePage'
import NotFound from './pages/NotFound'
import { Spinner } from './components/ui'

// Lazy-loaded so the world-atlas map data only downloads when needed.
const AboutPage = lazy(() => import('./pages/AboutPage'))
const FaqPage = lazy(() => import('./pages/FaqPage'))
const DownloadsPage = lazy(() => import('./pages/DownloadsPage'))
const AllResultsPage = lazy(() => import('./pages/AllResultsPage'))
const ContactPage = lazy(() => import('./pages/ContactPage'))

export default function App() {
  const { pathname, hash } = useLocation()

  // One GoatCounter pageview per route, keyed on the router path.
  useEffect(() => {
    countPageview(pathname)
  }, [pathname])

  // React Router doesn't reset scroll on navigation by itself, so without this
  // a page opens wherever the previous page's scroll happened to be. Skip when
  // a hash anchor is present (e.g. /faq#cite from the Downloads page) so the target
  // page's own scroll-to-anchor effect can land there instead.
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0)
  }, [pathname, hash])

  return (
    <div className="flex min-h-full flex-col">
      <Header />
      <main className="flex-1">
        <Suspense fallback={<Spinner />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/gene/:id" element={<GenePage />} />
            <Route path="/phenotype/:id" element={<PhenotypePage />} />
            <Route path="/all-results" element={<AllResultsPage />} />
            <Route path="/about" element={<AboutPage />} />
            <Route path="/faq" element={<FaqPage />} />
            <Route path="/downloads" element={<DownloadsPage />} />
            <Route path="/contact" element={<ContactPage />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}
