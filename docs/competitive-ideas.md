# Competing with the All by All (All of Us) browser

Notes from a competitive review of <https://allbyall.researchallofus.org/>
(2026-07-10). Captured for later; **not a commitment to build**. See the scope
constraint at the bottom — several ideas here involve derived analysis we've
decided *not* to ship for now.

## What All by All is

- ~3,400–3,500 phenotypes; ~250k–400k WGS participants; ~500B associations.
- Three test types per phenotype-ancestry: common-variant GWAS (ACAF), exonic
  GWAS, and RVAS gene-based. Per-ancestry + meta-analysis (11,550 combos).
- Visualized mainly via Manhattan + gene-anchored PheWAS.
- Full data = Hail tables on the **Controlled-Tier Researcher Workbench**; the
  public browser is a preview. Reports P-value and β per association.
- Sources: Nature Genetics s41588-025-02364-2; AoU support "Overview of the All
  by All tables".

## Their weaknesses we can exploit

1. **Single program — no cross-biobank replication.** All of Us only; no
   per-cohort forest, no cross-cohort heterogeneity. BRaVa meta-analyzes ~10
   global biobanks (`Pvalue_het`) — a structural moat.
2. **Access friction.** Full data behind identity verification + institutional
   DURA + training; downloads happen on the Workbench. BRaVa is 100% public,
   no login, one-click download.
3. **Server-query heavy / laggy.** 500B associations = live backend queries;
   slow plot paints. BRaVa is static columnar JSON, client-rendered, R2-cached
   → structurally faster ("instant").
4. **Noisy phenotypes** (EHR phecodeX etc.) vs BRaVa's curated, harmonized
   definitions.
5. **US-only** diversity vs BRaVa's genuinely global multi-ancestry cohorts.
6. **Thin mask/annotation transparency** in RVAS.

## Our honest gaps to mitigate

- **No common-variant GWAS** — BRaVa is rare-coding-variant only. Position as
  "rare coding specialist," don't compete on breadth.
- **No allele frequency** in our data (VCFs lack AF). Mitigate via per-variant
  gnomAD linkout (v2).
- **No functional annotation yet** (empty INFO). Annotation-ready design +
  linkouts.
- **~44 phenotypes** vs thousands. Frame as depth + rigor + replication.

## Feature ideas (ranked by impact ÷ effort on the static + R2 free-tier stack)

### Presentation / UX (aligned with "paper basics only")
- **Shareable permalinks** encoding gene × mask × MAF × ancestry × test (already
  on HashRouter) + **one-click export**: plot → SVG/PNG, table → CSV/TSV.
  Directly beats their gated Workbench download. *No derived analysis.*
- **Command-palette search** (⌘K) for instant gene/phenotype jump; idle/hover
  **prefetch** of `.anc.json` / top-peak gene files (already scoped for v2.1).
- **Variant-level linkouts (v2):** per-variant gnomAD variant page
  (`/variant/{chr}-{pos}-{ref}-{alt}?dataset=gnomad_r4`) — doubles as the AF
  workaround — plus ClinVar by coordinate. (Gene-level linkouts already exist:
  gnomAD, Genebass, Ensembl, GeneCards in `GenePage.tsx`.)
- **Marginal gene-level linkout adds:** Open Targets, ClinVar. Low priority.
- **Finish v2 variant LocusZoom** (regional view within a gene; in progress).
- **Compare mode:** pin two genes or two phenotypes side by side (presentation
  of existing values only).

### Deferred — involves derived/extra analysis (ON HOLD per scope decision)
- **Replication scorecard** (full spec below). Composite verdict badges
  (Robust / Heterogeneous / Ancestry-specific), cross-ancestry concordance
  counts, cross-biobank direction tallies. The user declined this on
  2026-07-10: "keep it to basics of what's in the paper — no extra analysis."
  Kept here only as a record; do not build without revisiting that decision.

## Deferred spec: Replication Scorecard (NOT scheduled)

A compact card above the forest plot answering "is this gene–trait hit real, and
does it hold across biobanks/ancestries?" All inputs already ship in
`gene/{ENSG}.json` (via `forestSeries()` — per-ancestry β/SE + `hetLp`); no
pipeline change.

Four panels + composite verdict:

| Panel | Shows | Derived from |
|---|---|---|
| Significance | meta SKAT-O P + tier chip (exome-wide <1.39e-7 / gene-level <2.5e-6 / suggestive / ns) | meta lp of selected test |
| Effect | risk↑/protective↓ (binary) or higher/lower (quant); OR=exp(β) or β, ±95% CI | meta β/SE + trait type |
| Cross-biobank | `P_het` → Consistent ✓ (≥0.05) / Heterogeneous ⚠ (<0.05) | `hetLp` |
| Cross-ancestry | "K/N ancestries concordant" (same sign as meta AND nominal p<0.05); per-ancestry ✓/·/✗ | per-ancestry β sign + lp≥1.3 |

Composite badge (tunable): 🟢 Robust · 🟡 Heterogeneous · 🔵 Ancestry-specific ·
⚪ Suggestive · ⚫ Not significant.

Variant-level extension: the per-biobank direction string (`ED`, e.g. `++?+-…`
across ~22 biobanks) makes cross-biobank literal ("17/22 concordant"). No
single-program browser can show this.

Build estimate (if ever un-deferred): ~1 component + 1 selector, pure frontend,
~half a day. **Blocked by the "no extra analysis" scope decision** —
see `memory/scope-paper-basics-no-extra-analysis.md`.
