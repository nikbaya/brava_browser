import type { PhenotypeMeta } from '../data/types'

export type EffectTone = 'risk' | 'protective' | 'up' | 'down'

export interface EffectInfo {
  tone: EffectTone
  label: string
}

/**
 * Describe an effect direction in terms appropriate to the trait type.
 * Binary traits: risk-increasing vs protective. Quantitative traits: the
 * burden raises vs lowers the trait value (no good/bad connotation).
 */
export function effectInfo(
  beta: number | null | undefined,
  type: PhenotypeMeta['type'],
): EffectInfo | null {
  if (beta == null || Number.isNaN(beta) || beta === 0) return null
  if (type === 'binary') {
    return beta > 0
      ? { tone: 'risk', label: 'risk ↑' }
      : { tone: 'protective', label: 'protective ↓' }
  }
  return beta > 0
    ? { tone: 'up', label: 'higher ↑' }
    : { tone: 'down', label: 'lower ↓' }
}
