/**
 * Text metrics for SVG layout.
 *
 * SVG has no reflow: a <text> that overruns the space reserved for it is simply
 * clipped at the viewport edge, so anything laid out by hand (the forest plots'
 * right-hand "β [lo, hi]" gutter) has to know how wide its own labels are before
 * it picks the margins. Guessing from character counts breaks the moment a value
 * formats as "−1.23e-4" instead of "−0.52".
 */

let measureCtx: CanvasRenderingContext2D | null | undefined

/** Shared 1×1 context used only for text metrics. */
function measurer(): CanvasRenderingContext2D | null {
  if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d')
  return measureCtx
}

/**
 * Width of `text` in CSS px when rendered in `font` (a CSS `font` shorthand).
 * Falls back to a rough monospace-ish estimate if no 2D context is available
 * (jsdom without canvas), which only ever makes a gutter slightly too wide.
 */
export function textWidth(text: string, font: string): number {
  const ctx = measurer()
  if (!ctx) return text.length * font2px(font) * 0.62
  ctx.font = font
  return ctx.measureText(text).width
}

/**
 * The page's body font at `px` — the font an SVG <text> inherits unless it says
 * otherwise, so measuring in it matches what the browser will draw.
 */
export function bodyFont(px: number): string {
  const family =
    (typeof document !== 'undefined' && getComputedStyle(document.body).fontFamily) ||
    'sans-serif'
  return `${px}px ${family}`
}

function font2px(font: string): number {
  return Number.parseFloat(font) || 11
}
