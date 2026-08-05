import { describe, expect, it } from 'vitest'
import { FIGURE_DPI, figureFilename, pngWithDpiBytes, withExtension } from './exportImage'

/** CRC32 over `bytes`, mirroring the PNG spec (independent of the module's copy). */
function crc32(bytes: number[]): number {
  let c = 0xffffffff
  for (const b of bytes) {
    c ^= b
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  }
  return (c ^ 0xffffffff) >>> 0
}

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

function be32(n: number): number[] {
  return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
}

function chunk(type: string, data: number[]): number[] {
  const t = [...type].map((c) => c.charCodeAt(0))
  return [...be32(data.length), ...t, ...data, ...be32(crc32([...t, ...data]))]
}

/** Minimal well-formed PNG skeleton (chunk structure only — no real pixels). */
function fakePng(extra: number[] = []): ArrayBuffer {
  const bytes = [
    ...SIG,
    ...chunk('IHDR', [...be32(2), ...be32(2), 8, 6, 0, 0, 0]),
    ...extra,
    ...chunk('IDAT', [1, 2, 3, 4]),
    ...chunk('IEND', []),
  ]
  return new Uint8Array(bytes).buffer
}

interface Chunk {
  type: string
  data: Uint8Array
  /** CRC as stored in the file, for verifying what the module wrote. */
  crc: number
}

/** Walk the chunk list in file order. */
function chunks(bytes: Uint8Array): Chunk[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const out: Chunk[] = []
  let at = 8
  while (at + 8 <= bytes.length) {
    const len = view.getUint32(at)
    const type = String.fromCharCode(...bytes.subarray(at + 4, at + 8))
    out.push({ type, data: bytes.subarray(at + 8, at + 8 + len), crc: view.getUint32(at + 8 + len) })
    at += 12 + len
    if (type === 'IEND') break
  }
  return out
}

const u32 = (d: Uint8Array, at: number): number =>
  new DataView(d.buffer, d.byteOffset, d.byteLength).getUint32(at)

describe('pngWithDpiBytes', () => {
  it('inserts a pHYs chunk right after IHDR declaring the dpi in pixels/metre', () => {
    const list = chunks(pngWithDpiBytes(fakePng(), FIGURE_DPI))
    expect(list.map((c) => c.type)).toEqual(['IHDR', 'pHYs', 'IDAT', 'IEND'])

    const { data } = list[1]
    // 300 dpi / 0.0254 m-per-inch = 11811 pixels per metre (both axes).
    expect(u32(data, 0)).toBe(11811)
    expect(u32(data, 4)).toBe(11811)
    expect(data[8]).toBe(1) // unit specifier: metre
  })

  it('writes a valid CRC for the pHYs chunk', () => {
    const { data, crc } = chunks(pngWithDpiBytes(fakePng(), FIGURE_DPI))[1]
    expect(crc).toBe(crc32([...[...'pHYs'].map((c) => c.charCodeAt(0)), ...data]))
  })

  it('replaces an existing pHYs rather than emitting two', () => {
    const stale = chunk('pHYs', [...be32(2835), ...be32(2835), 1]) // 72 dpi
    const list = chunks(pngWithDpiBytes(fakePng(stale), FIGURE_DPI))
    const phys = list.filter((c) => c.type === 'pHYs')
    expect(phys).toHaveLength(1)
    expect(u32(phys[0].data, 0)).toBe(11811)
  })

  it('leaves bytes untouched when there is no IHDR to insert after', () => {
    const junk = new Uint8Array([...SIG, 0, 0, 0, 0]).buffer
    expect([...pngWithDpiBytes(junk, FIGURE_DPI)]).toEqual([...new Uint8Array(junk)])
  })
})

describe('figureFilename', () => {
  it('slugs fragments and joins them under the brava_ prefix', () => {
    // The fragments a gene-level forest actually passes: MASK_META.short and the
    // numeric MAF_META.value, matching the TSV export's name (not the display
    // labels — `< 0.1%` would name the same cutoff "0.1" against the table's
    // "0.001").
    expect(
      figureFilename(['PCSK9', 'LDL_Cholesterol', 'pLoF | dmg missense', 'maf0.001', 'forest']),
    ).toBe('brava_PCSK9_LDL_Cholesterol_pLoF-dmg-missense_maf0.001_forest.png')
  })

  it('drops missing fragments', () => {
    expect(figureFilename([null, 'AFib', undefined, ''])).toBe('brava_AFib.png')
  })

  it('never produces a bare prefix', () => {
    expect(figureFilename([])).toBe('brava_figure.png')
  })
})

describe('withExtension', () => {
  it('swaps the extension without doubling it', () => {
    expect(withExtension('brava_PCSK9_forest.png', 'svg')).toBe('brava_PCSK9_forest.svg')
    expect(withExtension('brava_PCSK9_forest.png', 'png')).toBe('brava_PCSK9_forest.png')
  })

  it('keeps dots inside the stem', () => {
    expect(withExtension('brava_maf0.001_forest', 'png')).toBe('brava_maf0.001_forest.png')
  })
})
