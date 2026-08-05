/**
 * "Save this plot as a figure" — exports a live SVG plot as a print-resolution
 * PNG or as vector SVG, at the **exact dimensions shown on screen**.
 *
 * For PNG the pixel grid is scaled by `dpi / 96` (96 = the CSS reference pixel),
 * so a 720 × 200 CSS-px plot becomes 2250 × 625 device px at 300 dpi while still
 * measuring 7.5 × 2.08 inches when placed — nothing is re-laid-out, so the
 * figure is pixel-for-pixel the plot the user is looking at, just sharper.
 *
 * Three details make the output actually usable in a manuscript:
 *
 * 1. **Styles are inlined.** Our plots colour themselves with Tailwind classes
 *    (`fill-ink-faint`, `text-[11px]`), which resolve against the document's
 *    stylesheet. A serialised SVG has no access to that stylesheet — rendered in
 *    an `<img>` or opened in Illustrator, every element would fall back to black
 *    16px text. We copy the *computed* value of a small set of presentation
 *    properties onto each cloned node, then drop the classes. Both export paths
 *    share this step, so the SVG file and the PNG are the same figure.
 * 2. **The PNG is tagged 300 dpi.** Canvas only knows pixels, so we splice a
 *    `pHYs` chunk into the encoded PNG. Without it Word/Illustrator/LaTeX assume
 *    72 or 96 dpi and place the figure at 3× its intended size; with it the
 *    physical dimensions match the screen and journals read it as 300 dpi.
 * 3. **An explicit white background.** Neither format has one implicitly, and a
 *    transparent figure dropped on a dark slide loses all its dark-ink text.
 *
 * A **caption band** carrying the gene / variant, phenotype, mask and MAF is
 * drawn above the plot, because that context lives in HTML *around* the SVG on
 * the page and would otherwise be lost the moment the figure leaves the browser.
 * It is added as a band: the plot content is translated down by the band's height
 * and the image grows to match, so **the plot's own geometry is untouched** — the
 * axis, rows and markers keep the exact dimensions and scale shown on screen.
 */

import { slug } from './exportTable'

/** CSS reference pixels per inch — the fixed anchor for the `dpi` scale factor. */
const CSS_DPI = 96

/** Default output resolution: 300 dpi is the usual journal figure requirement. */
export const FIGURE_DPI = 300

/**
 * Presentation properties copied from the live element to its clone. Kept to an
 * explicit list: dumping the whole computed style would bloat the markup by
 * ~300 declarations per node and drag in layout properties that mean nothing in
 * a standalone SVG.
 */
const INLINED = [
  'fill',
  'fill-opacity',
  'fill-rule',
  'stroke',
  'stroke-width',
  'stroke-opacity',
  'stroke-dasharray',
  'stroke-linecap',
  'stroke-linejoin',
  'opacity',
  'font-family',
  'font-size',
  'font-weight',
  'font-style',
  'font-variant-numeric',
  'letter-spacing',
  'text-anchor',
  'dominant-baseline',
] as const

/**
 * Elements carrying this attribute are dropped from the exported figure —
 * transparent hover hit-targets and the row highlight, which are interaction
 * affordances rather than part of the plot.
 */
export const PNG_SKIP_ATTR = 'data-png-skip'

/**
 * Build a filesystem-safe stem from label fragments, using the same `slug` as the
 * TSV exports so a figure and the table it came from sit next to each other in a
 * download folder under matching names.
 */
export function figureFilename(parts: (string | number | null | undefined)[]): string {
  const stem = parts
    .filter((p) => p != null && p !== '')
    .map((p) => slug(String(p)))
    // `slug` falls back to 'brava' for a fragment with nothing usable in it —
    // drop those rather than repeating the prefix mid-name.
    .filter((p) => p !== 'brava')
    .join('_')
  return `brava_${stem || 'figure'}.png`
}

/** The formats the figure menu offers. */
export type FigureFormat = 'png' | 'svg'

/**
 * Provenance printed above the plot in the exported file: what was plotted, and
 * under which selection. Redundant with the page around the plot — which is
 * exactly the point, since a downloaded figure travels without it.
 */
export interface FigureCaption {
  /** Subject, set in semibold — e.g. `PCSK9 × LDL cholesterol`. */
  title: string
  /** Qualifiers, set faint below the title — mask, MAF, test, P_het. */
  subtitle?: string
}

/** Caption band metrics, in CSS px. */
const CAP = {
  padX: 1, // matches the plots' own `px-1` caption alignment
  padTop: 3,
  padBottom: 7,
  titleSize: 12,
  subSize: 10.5,
  lineGap: 3,
} as const

/** Extension-swapped sibling of `filename`, so one stem serves both formats. */
export function withExtension(filename: string, format: FigureFormat): string {
  return `${filename.replace(/\.(png|svg)$/i, '')}.${format}`
}

export interface FigureOptions {
  dpi?: number
  background?: string
  caption?: FigureCaption
}

/** Export `svg` in `format` and hand the browser the download. */
export async function downloadFigure(
  svg: SVGSVGElement,
  filename: string,
  format: FigureFormat,
  opts: FigureOptions = {},
): Promise<void> {
  const name = withExtension(filename, format)
  if (format === 'svg') {
    const { markup } = serialiseStandalone(svg, opts)
    downloadBlob(name, new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }))
    return
  }
  downloadBlob(name, await svgToPngBlob(svg, opts))
}

export async function svgToPngBlob(svg: SVGSVGElement, opts: FigureOptions = {}): Promise<Blob> {
  const dpi = opts.dpi ?? FIGURE_DPI
  const { markup, width, height } = serialiseStandalone(svg, opts)
  const scale = dpi / CSS_DPI
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * scale)
  canvas.height = Math.round(height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas is unavailable')

  const img = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`)
  // Scale the whole drawing rather than the source geometry, so text and
  // strokes are re-rendered at device resolution instead of being upsampled.
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.drawImage(img, 0, 0, width, height)

  const png = await canvasToBlob(canvas)
  return withPngDpi(await png.arrayBuffer(), dpi)
}

/**
 * On-screen CSS size of the plot. Prefer the attributes the plot set itself;
 * getBoundingClientRect is the fallback for a `width="100%"` SVG.
 */
function measure(svg: SVGSVGElement): { width: number; height: number } {
  const rect = svg.getBoundingClientRect()
  const width = Number(svg.getAttribute('width')) || rect.width
  const height = Number(svg.getAttribute('height')) || rect.height
  if (!(width > 0 && height > 0)) throw new Error('Plot has no size to export')
  return { width, height }
}

const SVG_NS = 'http://www.w3.org/2000/svg'

const el = <K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] => {
  const node = document.createElementNS(SVG_NS, tag)
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v))
  return node
}

/**
 * Deep-clone `svg` into a self-contained document: computed presentation styles
 * inlined, class hooks and interaction-only nodes removed, an opaque background
 * behind the marks, the caption band on top, and explicit size + viewBox so
 * neither the raster step nor a vector editor has to guess the dimensions.
 *
 * Returns the markup together with the size it declares — the caption band makes
 * the image taller than the plot, and the PNG canvas has to agree with it.
 */
function serialiseStandalone(
  svg: SVGSVGElement,
  { background = '#ffffff', caption }: FigureOptions,
): { markup: string; width: number; height: number } {
  const { width, height } = measure(svg)
  const clone = svg.cloneNode(true) as SVGSVGElement

  // Style before pruning: the two trees must stay index-aligned while walking.
  const live = svg.querySelectorAll('*')
  const copies = clone.querySelectorAll('*')
  inlineStyle(svg, clone)
  for (let i = 0; i < live.length && i < copies.length; i++) {
    inlineStyle(live[i], copies[i])
  }
  clone.querySelectorAll(`[${PNG_SKIP_ATTR}]`).forEach((node) => node.remove())

  const font = getComputedStyle(svg).fontFamily || 'system-ui, sans-serif'
  const band = caption ? captionBand(caption, width, font) : null
  const totalH = height + (band?.height ?? 0)

  if (band) {
    // Shift the plot down as a whole: its internal coordinates — and so its
    // dimensions and scale — are identical to what's on screen.
    const shifted = el('g', { transform: `translate(0 ${band.height})` })
    while (clone.firstChild) shifted.appendChild(clone.firstChild)
    clone.appendChild(band.group)
    clone.appendChild(shifted)
  }

  clone.setAttribute('xmlns', SVG_NS)
  clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
  clone.setAttribute('width', String(width))
  clone.setAttribute('height', String(totalH))
  // Always our own box: the plots draw in raw user units (no viewBox of their
  // own), and an inherited one would fight the caption translate.
  clone.setAttribute('viewBox', `0 0 ${width} ${totalH}`)

  if (background) {
    clone.insertBefore(
      el('rect', { x: 0, y: 0, width, height: totalH, fill: background }),
      clone.firstChild,
    )
  }

  return { markup: new XMLSerializer().serializeToString(clone), width, height: totalH }
}

/**
 * Provenance band drawn above the plot. Lines are wrapped to the plot width so a
 * long trait name can't run off the edge of the figure.
 */
function captionBand(
  caption: FigureCaption,
  width: number,
  font: string,
): { group: SVGGElement; height: number } {
  const inner = Math.max(width - 2 * CAP.padX, 1)
  const ink = cssVar('--color-ink', '#15202b')
  const faint = cssVar('--color-ink-faint', '#8794a1')
  const group = el('g', {})
  let y = CAP.padTop

  const put = (text: string, size: number, weight: number, fill: string) => {
    y += size // y is the text baseline, so advance before placing the line
    const node = el('text', {
      x: CAP.padX,
      y,
      fill,
      style: `font-family:${font};font-size:${size}px;font-weight:${weight}`,
    })
    node.textContent = text
    group.appendChild(node)
    y += CAP.lineGap
  }

  for (const line of wrap(caption.title, inner, `600 ${CAP.titleSize}px ${font}`)) {
    put(line, CAP.titleSize, 600, ink)
  }
  if (caption.subtitle) {
    for (const line of wrap(caption.subtitle, inner, `400 ${CAP.subSize}px ${font}`)) {
      put(line, CAP.subSize, 400, faint)
    }
  }

  return { group, height: y - CAP.lineGap + CAP.padBottom }
}

/** Greedy word wrap measured with the same font the band will render in. */
function wrap(text: string, maxWidth: number, font: string): string[] {
  const ctx = measurer()
  if (!ctx) return [text]
  ctx.font = font
  const lines: string[] = []
  let line = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines.length ? lines : [text]
}

let measureCtx: CanvasRenderingContext2D | null | undefined
/** Shared 1×1 context used only for text metrics. */
function measurer(): CanvasRenderingContext2D | null {
  if (measureCtx === undefined) measureCtx = document.createElement('canvas').getContext('2d')
  return measureCtx
}

/** Design-token lookup, so the caption matches the page's ink colours. */
function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return v || fallback
}

function inlineStyle(from: Element, to: Element): void {
  const computed = getComputedStyle(from)
  let css = to.getAttribute('style') ?? ''
  for (const prop of INLINED) {
    const value = computed.getPropertyValue(prop)
    if (value && value !== 'normal' && value !== 'none' && value !== 'auto') {
      css += `${prop}:${value};`
    }
  }
  if (css) to.setAttribute('style', css)
  // Tailwind classes are dead weight (and misleading) once styles are inlined.
  to.removeAttribute('class')
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not rasterise the plot'))
    img.src = src
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png')
  })
}

/**
 * Return a copy of `png` with a `pHYs` chunk declaring `dpi`, inserted directly
 * after IHDR (the spec requires pHYs before IDAT; after IHDR is always legal).
 * If a pHYs chunk is already present it is replaced.
 */
export function withPngDpi(png: ArrayBuffer, dpi: number): Blob {
  return new Blob([pngWithDpiBytes(png, dpi)], { type: 'image/png' })
}

/** The byte-level half of {@link withPngDpi}, split out so tests can inspect it. */
export function pngWithDpiBytes(png: ArrayBuffer, dpi: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(png)
  const view = new DataView(bytes.buffer)
  const SIG = 8
  // pixels per metre, rounded — the unit pHYs actually stores (1 in = 0.0254 m).
  const ppm = Math.round(dpi / 0.0254)

  const phys = new Uint8Array(21) // 4 len + 4 type + 9 data + 4 crc
  const pv = new DataView(phys.buffer)
  pv.setUint32(0, 9)
  phys.set([0x70, 0x48, 0x59, 0x73], 4) // "pHYs"
  pv.setUint32(8, ppm)
  pv.setUint32(12, ppm)
  phys[16] = 1 // unit specifier: metre
  pv.setUint32(17, crc32(phys.subarray(4, 17)))

  // Walk the chunk list to find where IHDR ends and drop any existing pHYs.
  const keep: Uint8Array[] = []
  let at = SIG
  let insertAfterIhdr = false
  while (at + 8 <= bytes.length) {
    const len = view.getUint32(at)
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7])
    const end = at + 12 + len
    if (type !== 'pHYs') keep.push(bytes.subarray(at, end))
    if (type === 'IHDR') {
      keep.push(phys)
      insertAfterIhdr = true
    }
    at = end
    if (type === 'IEND') break
  }
  // Malformed/unrecognised encoder output: hand back the original rather than a
  // truncated file.
  if (!insertAfterIhdr) return bytes

  const out = new Uint8Array(SIG + keep.reduce((n, c) => n + c.length, 0))
  out.set(bytes.subarray(0, SIG))
  let cursor = SIG
  for (const chunk of keep) {
    out.set(chunk, cursor)
    cursor += chunk.length
  }
  return out
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  // Must be in the document for the click to count as user-initiated in Firefox.
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoking synchronously cancels the download in Safari; yield a task first.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
