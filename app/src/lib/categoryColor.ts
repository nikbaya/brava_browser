/**
 * Trait-category colours, shared by the PheWAS plot and the search dropdown.
 *
 * The map is built from the **full** category list (alphabetical, index into the
 * palette), not from whatever subset a given view happens to show. That matters
 * twice over: a category keeps the same colour from one gene's PheWAS to the
 * next even when a category has no points on one of them, and the search
 * dropdown can colour a category without knowing which plot the user will open.
 */

export const CATEGORY_PALETTE = [
  '#1f6f8b', '#e08a1e', '#2f7d4f', '#c0392b', '#7d5ba6', '#0e7c86',
  '#b5651d', '#8a8d3a', '#a83f6b', '#3b6ea5', '#5c8a3a', '#9c6b30', '#566573',
]

/**
 * Category → colour, assigned by alphabetical position. Index-based rather than
 * hashed so the colours are guaranteed distinct (a string hash could collide);
 * pass the categories of every phenotype in the index, not a filtered subset.
 */
export function categoryColors(categories: Iterable<string>): Map<string, string> {
  const cats = [...new Set(categories)].sort((a, b) => a.localeCompare(b))
  const m = new Map<string, string>()
  cats.forEach((c, i) => m.set(c, CATEGORY_PALETTE[i % CATEGORY_PALETTE.length]))
  return m
}
