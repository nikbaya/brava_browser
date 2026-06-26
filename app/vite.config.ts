import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Served from GitHub Pages at a project subpath (e.g. /brava_browser/).
// Relative base keeps asset + data URLs correct regardless of the repo name,
// and works with HashRouter (which avoids 404-on-refresh on Pages).
// https://vite.dev/config/
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
