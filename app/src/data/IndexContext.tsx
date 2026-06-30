import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { fetchGeneIndex, fetchPhenotypeIndex } from './client'
import type { GeneIndex, PhenotypeMeta } from './types'

export interface SearchResult {
  kind: 'gene' | 'phenotype'
  id: string // ENSG or phenotype abbrev
  primary: string // gene symbol or phenotype name
  tag: string // chip label: chromosome (gene) / category (phenotype)
  secondary: string // right-aligned detail: ENSG / trait type
}

interface IndexValue {
  geneIndex: GeneIndex | null
  phenotypes: PhenotypeMeta[]
  loading: boolean
  error: Error | null
  /** ENSG -> gene_idx, for O(1) lookups. */
  geneIdByEnsg: Map<string, number>
  /** lower-cased symbol -> gene_idx. */
  geneIdxBySymbol: Map<string, number>
  search: (q: string, limit?: number) => SearchResult[]
  resolveGene: (idOrSymbol: string) => { ensg: string; idx: number } | null
}

const Ctx = createContext<IndexValue | null>(null)

export function IndexProvider({ children }: { children: ReactNode }) {
  const [geneIndex, setGeneIndex] = useState<GeneIndex | null>(null)
  const [phenotypes, setPhenotypes] = useState<PhenotypeMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    let alive = true
    Promise.all([fetchGeneIndex(), fetchPhenotypeIndex()])
      .then(([g, p]) => {
        if (!alive) return
        setGeneIndex(g)
        setPhenotypes(p.phenotypes)
      })
      .catch((e) => alive && setError(e as Error))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [])

  // Lower-cased lookup tables, built once when the index arrives.
  const lookups = useMemo(() => {
    const byEnsg = new Map<string, number>()
    const bySymbol = new Map<string, number>()
    const symbolLower: string[] = []
    if (geneIndex) {
      for (let i = 0; i < geneIndex.ids.length; i++) {
        byEnsg.set(geneIndex.ids[i], i)
        const s = geneIndex.symbols[i]
        const sl = s ? s.toLowerCase() : ''
        symbolLower.push(sl)
        if (sl) bySymbol.set(sl, i)
      }
    }
    return { byEnsg, bySymbol, symbolLower }
  }, [geneIndex])

  const value = useMemo<IndexValue>(() => {
    const { byEnsg, bySymbol, symbolLower } = lookups

    const resolveGene = (idOrSymbol: string) => {
      const q = idOrSymbol.trim()
      if (!q) return null
      if (byEnsg.has(q)) return { ensg: q, idx: byEnsg.get(q)! }
      const idx = bySymbol.get(q.toLowerCase())
      if (idx != null && geneIndex) return { ensg: geneIndex.ids[idx], idx }
      return null
    }

    const search = (raw: string, limit = 10): SearchResult[] => {
      const q = raw.trim().toLowerCase()
      if (!q) return []
      const out: SearchResult[] = []

      // Phenotypes first (small list, high value): match name or id.
      for (const p of phenotypes) {
        if (
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
        ) {
          out.push({
            kind: 'phenotype',
            id: p.id,
            primary: p.name,
            tag: p.category,
            secondary: p.type === 'binary' ? 'Binary' : 'Quantitative',
          })
        }
      }

      // Genes: rank by best hit on symbol OR ENSG id (exact=0, prefix=1,
      // substring=2). Prefix-tier hits rank above substring-tier.
      if (geneIndex) {
        const rank = (s: string) =>
          !s ? -1 : s === q ? 0 : s.startsWith(q) ? 1 : s.includes(q) ? 2 : -1
        const prefix: SearchResult[] = []
        const contains: SearchResult[] = []
        for (let i = 0; i < geneIndex.ids.length; i++) {
          const symHit = rank(symbolLower[i])
          const ensgHit = rank(geneIndex.ids[i].toLowerCase())
          const hit =
            symHit < 0
              ? ensgHit
              : ensgHit < 0
                ? symHit
                : Math.min(symHit, ensgHit)
          if (hit < 0) continue
          const r: SearchResult = {
            kind: 'gene',
            id: geneIndex.ids[i],
            primary: geneIndex.symbols[i] || geneIndex.ids[i],
            tag: 'gene',
            secondary: geneIndex.ids[i],
          }
          ;(hit <= 1 ? prefix : contains).push(r)
          if (prefix.length >= limit) break
        }
        out.push(...prefix, ...contains)
      }
      return out.slice(0, limit)
    }

    return {
      geneIndex,
      phenotypes,
      loading,
      error,
      geneIdByEnsg: byEnsg,
      geneIdxBySymbol: bySymbol,
      search,
      resolveGene,
    }
  }, [geneIndex, phenotypes, loading, error, lookups])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useIndex(): IndexValue {
  const v = useContext(Ctx)
  if (!v) throw new Error('useIndex must be used within IndexProvider')
  return v
}
