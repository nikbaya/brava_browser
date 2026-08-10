/**
 * Scrolling to an in-page section, allowing for the sticky chrome.
 *
 * `Element.scrollIntoView()` on its own tucks the target *underneath* the site
 * header and the page's StickyTitle bar: both are `position: sticky`, so they
 * overlay the top of the viewport and the browser doesn't subtract them.
 *
 * The offset is measured rather than hard-coded because the StickyTitle wraps —
 * the title and the filter row share a line on a desktop and stack on a phone —
 * so its height is a function of the viewport width, not a constant.
 */

/** Extra breathing room between the sticky bars and the section heading. */
const GAP = 8

export function stickyOffset(): number {
  const h = (sel: string) =>
    document.querySelector(sel)?.getBoundingClientRect().height ?? 0
  return h('header') + h('[data-sticky-title]') + GAP
}

/** Page y that puts `el`'s top edge just below the sticky bars. */
function targetTop(el: Element): number {
  return Math.max(0, el.getBoundingClientRect().top + window.scrollY - stickyOffset())
}

/** Scroll `el` to just below the sticky bars. No-op for a missing element. */
export function scrollToEl(
  el: Element | null | undefined,
  behavior: ScrollBehavior = 'smooth',
) {
  if (!el) return
  window.scrollTo({ top: targetTop(el), behavior })
}

/**
 * Scroll `el` to the top and *keep* it there while the section fills in.
 *
 * One scroll isn't enough for a section whose contents arrive from the network.
 * The variant section is the last thing on the gene page, and at the moment of
 * the jump it's still a spinner — the document isn't tall enough to lift its
 * heading to the top, so the browser clamps the scroll at the bottom of the page
 * and the heading lands mid-viewport. Nothing moves it afterwards: the plot and
 * table grow *below* the heading, so the page just gets taller under a stale
 * scroll position. Re-applying on each growth of the document holds the heading
 * at the top until the layout settles.
 *
 * Two ways it lets go, so it can't hold the page hostage: the first deliberate
 * user scroll (wheel / touch / key), and a timeout, in case the content never
 * arrives. Returns a canceller for the caller to run on unmount.
 */
export function pinToTop(
  el: Element | null | undefined,
  { behavior = 'auto' as ScrollBehavior, timeoutMs = 6000 } = {},
): () => void {
  if (!el) return () => {}
  scrollToEl(el, behavior)

  // Re-pin only on a real change in document height. A ResizeObserver fires
  // once on observe() with the current size, and that immediate callback would
  // otherwise snap-cancel a smooth scroll before it had moved a pixel.
  let lastH = document.documentElement.scrollHeight
  const apply = () => {
    const h = document.documentElement.scrollHeight
    if (h === lastH) return
    lastH = h
    // Already there (the growth was below the fold): leave the position alone.
    if (Math.abs(window.scrollY - targetTop(el)) < 2) return
    scrollToEl(el, 'auto')
  }

  const ro = new ResizeObserver(apply)
  ro.observe(document.body)
  ro.observe(el)

  // Any deliberate interaction ends the pin: the reader is now driving.
  const RELEASE = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const
  const stop = () => {
    ro.disconnect()
    window.clearTimeout(timer)
    for (const ev of RELEASE) window.removeEventListener(ev, stop)
  }
  const timer = window.setTimeout(stop, timeoutMs)
  for (const ev of RELEASE) window.addEventListener(ev, stop, { passive: true })

  return stop
}
