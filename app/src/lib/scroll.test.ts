import { afterEach, describe, expect, it } from 'vitest'
import { pinToTop, scrollToEl, stickyOffset } from './scroll'

/**
 * Fake page just rich enough for these functions: sticky bars of known height, a
 * document of a settable height, and a viewport that **clamps** `scrollTo` the
 * way a real browser does. That clamp is the whole point — it's what leaves a
 * deep link to the last section stranded mid-viewport while the section is still
 * loading, and what `pinToTop` exists to recover from.
 */
const HEADER_H = 56
const TITLE_H = 64
const VIEWPORT_H = 800
/** Sticky offset the module should compute: both bars plus its 8px gap. */
const OFFSET = HEADER_H + TITLE_H + 8

interface Page {
  /** Where the section sits in *document* coordinates. */
  sectionTop: number
  docHeight: number
  scrollY: number
  /** Fire the ResizeObserver callbacks, as a browser would after a reflow. */
  reflow(): void
  /** Dispatch a window event (e.g. a user's wheel). */
  fire(type: string): void
  section: Element
}

function fakePage(init: { sectionTop: number; docHeight: number }): Page {
  const observers: (() => void)[] = []
  const listeners = new Map<string, Set<() => void>>()

  const page: Page = {
    sectionTop: init.sectionTop,
    docHeight: init.docHeight,
    scrollY: 0,
    reflow: () => observers.forEach((cb) => cb()),
    fire: (type) => listeners.get(type)?.forEach((fn) => fn()),
    // Only the geometry these functions read; typed as an Element so callers
    // (and the assertions below) see the real signature.
    section: {
      getBoundingClientRect: () => ({
        top: page.sectionTop - page.scrollY,
        height: 400,
      }),
    } as unknown as Element,
  }

  const bars: Record<string, number> = {
    header: HEADER_H,
    '[data-sticky-title]': TITLE_H,
  }

  globalThis.document = {
    querySelector: (sel: string) =>
      sel in bars ? { getBoundingClientRect: () => ({ height: bars[sel] }) } : null,
    get documentElement() {
      return { scrollHeight: page.docHeight }
    },
    body: {},
  } as unknown as Document

  globalThis.window = {
    get scrollY() {
      return page.scrollY
    },
    scrollTo: ({ top }: ScrollToOptions) => {
      // A browser cannot scroll past the end of the document.
      page.scrollY = Math.min(top ?? 0, Math.max(0, page.docHeight - VIEWPORT_H))
    },
    addEventListener: (t: string, fn: () => void) => {
      if (!listeners.has(t)) listeners.set(t, new Set())
      listeners.get(t)!.add(fn)
    },
    removeEventListener: (t: string, fn: () => void) => listeners.get(t)?.delete(fn),
    setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
    clearTimeout: (id: number) => clearTimeout(id),
  } as unknown as Window & typeof globalThis

  globalThis.ResizeObserver = class {
    /** Held so `disconnect` can remove this instance's own callback. */
    cb: () => void
    constructor(cb: () => void) {
      this.cb = cb
      observers.push(cb)
    }
    observe() {}
    disconnect() {
      const i = observers.indexOf(this.cb)
      if (i >= 0) observers.splice(i, 1)
    }
  } as unknown as typeof ResizeObserver

  return page
}

afterEach(() => {
  delete (globalThis as { document?: unknown }).document
  delete (globalThis as { window?: unknown }).window
})

describe('stickyOffset', () => {
  it('sums the sticky bars actually on the page', () => {
    fakePage({ sectionTop: 0, docHeight: 2000 })
    expect(stickyOffset()).toBe(OFFSET)
  })
})

describe('scrollToEl', () => {
  it('leaves the section top clear of the sticky bars', () => {
    const page = fakePage({ sectionTop: 1200, docHeight: 4000 })
    scrollToEl(page.section, 'auto')
    expect(page.scrollY).toBe(1200 - OFFSET)
    // i.e. the heading renders just below the bars, not underneath them.
    expect(page.section.getBoundingClientRect().top).toBe(OFFSET)
  })

  it('does nothing without an element', () => {
    const page = fakePage({ sectionTop: 1200, docHeight: 4000 })
    scrollToEl(null)
    expect(page.scrollY).toBe(0)
  })
})

describe('pinToTop', () => {
  it('re-pins once the section finishes loading and the page grows', () => {
    // Section near the bottom of a page that is still mostly a spinner.
    const page = fakePage({ sectionTop: 1200, docHeight: 1500 })
    const stop = pinToTop(page.section, { behavior: 'auto' })

    // Clamped: the document can't scroll far enough yet, so the heading is
    // stranded well below the sticky bars. This is the reported bug.
    expect(page.scrollY).toBe(700)
    expect(page.section.getBoundingClientRect().top).toBeGreaterThan(OFFSET)

    // Table and plot arrive; the page gets taller *below* the heading.
    page.docHeight = 4000
    page.reflow()

    expect(page.scrollY).toBe(1200 - OFFSET)
    expect(page.section.getBoundingClientRect().top).toBe(OFFSET)
    stop()
  })

  it('lets go as soon as the reader scrolls', () => {
    const page = fakePage({ sectionTop: 1200, docHeight: 1500 })
    pinToTop(page.section, { behavior: 'auto' })

    page.fire('wheel')
    page.scrollY = 0 // the reader has scrolled back up
    page.docHeight = 4000
    page.reflow()

    expect(page.scrollY).toBe(0)
  })

  it('ignores a reflow that did not change the page height', () => {
    const page = fakePage({ sectionTop: 1200, docHeight: 4000 })
    pinToTop(page.section, { behavior: 'smooth' })
    page.scrollY = 50 // e.g. mid smooth-scroll animation
    page.reflow()
    // No snap: the height is unchanged, so there is nothing to correct.
    expect(page.scrollY).toBe(50)
  })
})
