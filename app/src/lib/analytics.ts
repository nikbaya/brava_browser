/** GoatCounter pageview counting for a hash-routed SPA.
 *
 *  count.js is loaded with `no_onload` (see index.html) because its automatic
 *  pageview only fires once per document load and records `location.pathname`,
 *  which under HashRouter is the same for every route — so every gene and
 *  phenotype page would report as one path. Instead we count manually on each
 *  route change, using the router path (`/gene/PCSK9`) rather than the real URL
 *  (`/brava_browser/#/gene/PCSK9`) so paths read cleanly in the dashboard and
 *  stay identical across dev, Pages, and any future host.
 *
 *  count.js already skips localhost / private-range hosts, so `npm run dev`
 *  (even with --host) never reports.
 */

type CountVars = { path?: string; referrer?: string; title?: string }

declare global {
  interface Window {
    goatcounter?: { count?: (vars?: CountVars) => void }
  }
}

/** count.js is `async`, so the first pageview usually beats it. Queue until it
 *  lands; drop the queue if the script never arrives (blocked, offline). */
const queue: CountVars[] = []
let listening = false
let sentFirst = false

export function countPageview(path: string) {
  // The initial pageview keeps document.referrer so external traffic sources
  // are attributed. Later in-app navigations send an empty referrer — otherwise
  // document.referrer (unchanged by SPA routing) would re-credit the same
  // external source on every click, and internal paths would crowd out real
  // referrers. count.js only falls back to document.referrer for null/undefined,
  // so '' genuinely means "none".
  send(sentFirst ? { path, referrer: '' } : { path })
  sentFirst = true
}

function send(vars: CountVars) {
  if (window.goatcounter?.count) {
    window.goatcounter.count(vars)
    return
  }
  queue.push(vars)
  if (listening) return

  const script = document.querySelector<HTMLScriptElement>('script[data-goatcounter]')
  if (!script) {
    queue.length = 0
    return
  }
  listening = true
  script.addEventListener('load', flush, { once: true })
  script.addEventListener('error', discard, { once: true })
}

function flush() {
  listening = false
  for (const vars of queue.splice(0)) window.goatcounter?.count?.(vars)
}

function discard() {
  listening = false
  queue.length = 0
}
