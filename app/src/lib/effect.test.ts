import { describe, it, expect } from 'vitest'
import { effectInfo } from './effect'

describe('effectInfo', () => {
  it('binary: beta>0 is risk-increasing, beta<0 is protective', () => {
    expect(effectInfo(0.3, 'binary')).toEqual({ tone: 'risk', label: 'risk ↑' })
    expect(effectInfo(-0.3, 'binary')).toEqual({
      tone: 'protective',
      label: 'protective ↓',
    })
  })

  it('quantitative: beta>0 raises, beta<0 lowers the trait', () => {
    expect(effectInfo(0.3, 'quantitative')).toEqual({ tone: 'up', label: 'higher ↑' })
    expect(effectInfo(-0.3, 'quantitative')).toEqual({
      tone: 'down',
      label: 'lower ↓',
    })
  })

  it('returns null for no/zero/invalid effect', () => {
    expect(effectInfo(0, 'binary')).toBeNull()
    expect(effectInfo(null, 'binary')).toBeNull()
    expect(effectInfo(undefined, 'quantitative')).toBeNull()
    expect(effectInfo(NaN, 'binary')).toBeNull()
  })
})
