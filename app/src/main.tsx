import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { HashRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { IndexProvider } from './data/IndexContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <HashRouter>
      <IndexProvider>
        <App />
      </IndexProvider>
    </HashRouter>
  </StrictMode>,
)
