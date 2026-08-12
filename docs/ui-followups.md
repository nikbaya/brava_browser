# UI follow-ups

Small polish items noted for later.

## Show the Burden β value in the table, not just the up/down triangle

The per-ancestry grid renders β as an `EffectTriangle` with the number only in
the tooltip ([ancestryColumns.tsx](../app/src/components/ancestryColumns.tsx#L133)).
Worth a numeric β column, or a toggle.

(The "3 significant figures everywhere" half of this item shipped: `fmtPLog3` /
`fmtBeta3` in every tooltip, `fmtPCompact` at 3 dp in the dense grid.)

## Clicking on gene in phenotype page must show gene page with phenotype in forest plot.

## Landing page:
- Consider adding global map (with current and future partnering biobanks)?

## Mobile: collapse the header nav into a burger menu

[Header.tsx](../app/src/components/Header.tsx) puts the logo, the search bar and
three nav links (Downloads / About / FAQ) in one flex row at every width. The
links are `shrink-0`, so on a phone they hold their full width and the search
bar — the primary action, and the only one that has to be usable one-handed —
is squeezed into what's left.

Put the three links behind a burger button pinned top right below roughly `sm`,
and let the search bar take the freed width. Points to settle: the logo probably
drops to the mark without the "BRaVa" wordmark at that width; the menu needs to
close on navigation and on Escape; and the header is `sticky top-0 z-30` with the
`StickyTitle` sub-bar pinned at `top-14`, so an open panel has to sit above both
without disturbing that fixed `h-14`.

## Manhattan plots
Include actual cutoff pval in gene-level and gene-mask legend

## 'Sample size by ancestry' plots on phenotype pages
- Add note on chart size not being proportional to sample size.
  - Pie **radius** uses a floored √ scale: `scaledRadius = R_MIN + (R_MAX − R_MIN)·√(total/max)`
    with `R_MIN=20`, `R_MAX=38` ([app/src/components/SamplePie.tsx:35-37](../app/src/components/SamplePie.tsx#L35-L37)).
    `max` is the largest stratum *within that row of pies* (per-ancestry pies and the meta
    `non_EUR`/`All` pies each normalize to their own max), so sizes are relative, not absolute.
  - The `+R_MIN` constant means the radius can never drop below 20/38 ≈ 53% of max → area
    never below ~28% of max, no matter how small the stratum. So it is NOT area-proportional
    to N: e.g. a 10k stratum next to a 700k stratum renders at ~1/3 the area, not the ~1/70th
    that true proportionality demands. The distortion is worst at the small end, where the
    constant dominates the near-zero √ term.
  - This is an intentional legibility tradeoff (tiny strata stay visible); the exact N is in
    the tooltip/label via `fmtN`. Options if we revisit: (a) document the caveat only, or
    (b) switch to true √-area (`r = R_MAX·√(total/max)`) with a hard min-clamp (e.g.
    `Math.max(r, 6)`) so only pathologically tiny pies get a floor.
- Maybe allow mouseover to expand chart to make it easier to see small slivers? Or on click it opens a popup in center of page with labels for each sliver?
- List the sliver-specific info below each pie chart?
- I don't like the 'not allowed' tooltip for greyed-out ancestries. Maybe just have a tooltip note that this ancestry is not available for this phenotype?

## More info
- Add '?' button cursortips for 'Ancestry', variant mask, mask maf and test dropdown titles.

## Canonical gene URL should be the ENSG, so other sites can link to us

`/gene/:id` already **accepts** an ENSG — `resolveGene` looks up either form and
[GenePage.tsx](../app/src/pages/GenePage.tsx#L37) falls back to treating an
`ENSG…` param as the id directly. The problem is that our own links mint the
**symbol**: [SearchBar.tsx:64](../app/src/components/SearchBar.tsx#L64) and the
landing-page example chips ([LandingPage.tsx:49](../app/src/pages/LandingPage.tsx#L49))
navigate to `/gene/PCSK9`, so that is the URL a user copies out of the address
bar and the one that ends up cited elsewhere. (The phenotype page already links
by `ensg`.)

Symbols are unstable (HGNC renames, aliases, and symbols that have been reused
across loci), so a symbol URL is a fragile inbound link. Make the ENSG canonical:

- All internal navigation emits `/gene/ENSG00000169174`.
- A symbol param keeps working but **redirects** (`<Navigate replace>`) to the
  ENSG URL, so the address bar always settles on the stable form.
- Show the symbol prominently in the page heading (it already is) — the URL
  being an ENSG costs nothing in readability there.
- Note the analytics implication: [analytics.ts](../app/src/lib/analytics.ts)
  reports the router path, so today's dashboard has symbol paths and would gain
  ENSG ones; a redirect that fires before the pageview avoids double-counting.
- Worth a one-line "stable link to this page" affordance on the gene page once
  the ENSG is canonical, mirroring what gnomAD/Open Targets do.


## Download button on gene / phenotype pages — DONE (option 1)

Shipped as "export what's already loaded": [exportTable.ts](../app/src/lib/exportTable.ts)
(serialiser) + [DownloadButton.tsx](../app/src/components/DownloadButton.tsx),
declared per table via VirtualTable's `exportSpec` prop. Live on the gene table,
the phenotype table, and the variant table. **Zero extra requests** — no R2
reads, no pipeline change, works offline.

Decisions worth not re-litigating:

- **The button lives in VirtualTable's caption bar**, not on the page, because
  that component owns `getSortedRowModel()` — so the file is the rows on screen
  *in the order shown*, which a page-level button couldn't produce without
  duplicating the sort.
- **Row extraction and serialisation are both deferred to the click.** The
  caption bar re-renders on every scroll frame (the virtualizer drives it), so
  mapping 20k rows per render would cost more than the download.
- **TSV, not CSV.** Phenotype names, categories and mask labels contain commas;
  tabs never occur in this data, so tab-delimited needs no escaping path at all
  and matches the upstream BRaVa summary-stat files.
- **Qualifying constants become columns** (gene, phenotype, mask, MAF, test,
  ancestry) rather than a `#` comment header, so each row is self-describing and
  the file still loads with a plain `read.delim` / `pd.read_csv(sep='\t')`.
- **Both `P` and `neglog10P` ship.** `P` is reconstructed from the stored
  −log10 via `exportP` (`10**-lp` underflows to 0 past ~1e-308), and the raw
  −log10 column is the lossless one.
- Missing values export as **empty cells**, the NA convention in R and pandas —
  never the display formatters' em-dash, which would poison the column type.
- Per-ancestry triples come from `ancestryExportColumns` in
  [ancestryColumns.tsx](../app/src/components/ancestryColumns.tsx), beside the
  on-screen grid columns they mirror, so the two can't drift.

Not done (deliberately): **linking to the raw source files** from these pages.
It sends users to per-phenotype × ancestry files far larger than what they were
viewing and adds R2 reads; the [Downloads page](../app/src/pages/DownloadsPage.tsx)
already covers bulk access.

### R2 request budget — how much headroom is there?

Cloudflare R2 free tier (see [CLAUDE.md](../CLAUDE.md) for the full table):

| | Free / month | What counts |
|---|---|---|
| **Class B** (reads) | **10,000,000** | one per file fetched from R2 |
| Class A (writes/lists) | 1,000,000 | uploads only — users never trigger these |
| Egress | unlimited, free | why R2 was chosen |

Only `dataUrl`/`variantUrl` fetches hit R2. The bundled `meta/*.json` indexes
(gene + phenotype search, biobanks, pheno sizes, variant split) ship with the app
and are served by GitHub Pages, so they cost nothing against R2 — see
[client.ts](../app/src/data/client.ts).

Per pageview, worst case:
- **Gene page:** `gene/{ENSG}.json`, plus the variant base file and its `.anc`
  file when the variant view is opened → **1–3 reads**.
- **Phenotype page:** one `phenotype/{id}.{anc}.json` per available ancestry,
  eagerly loaded so the grid can show all columns, plus a gene file if the forest
  drawer is opened → **up to ~8 reads**.

So ~5 reads for a typical pageview → **roughly 2 million pageviews/month before
the 10M Class B ceiling**, and the client's in-memory cache means repeat views in
one session are free. A download button of type (1) adds **nothing** to this.
Conclusion: requests are not a constraint — build the client-side export.

## ClinVar annotations on the variant view

Now that the gene page has a gene-model track and exon-collapsed axis
([GeneTrack.tsx](../app/src/components/GeneTrack.tsx),
[exonScale.ts](../app/src/lib/exonScale.ts)), the natural next layer is ClinVar —
it answers "is this variant already known to be pathogenic?", which is the first
question a clinical geneticist asks of a rare-variant hit. gnomAD puts it as a
separate track directly above the variant plot.

**Two UI surfaces, in order of value:**

1. **A ClinVar track** above the LocusZoom, sharing the same x scale (and the
   same collapsed-axis toggle) — one mark per ClinVar variant in the gene, shaped
   or colored by clinical significance (P/LP vs VUS vs B/LB) and by review status
   (stars). This gives the "our signal sits on top of known pathogenic variants"
   read at a glance.
2. **A column/badge in the variant table** for BRaVa variants that match a
   ClinVar record on chr:pos:ref:alt, linking out to the ClinVar entry. Cheaper
   than the track and useful on its own.

**Data source.** NCBI's `variant_summary.txt.gz` (or the ClinVar VCF) from
<https://ftp.ncbi.nlm.nih.gov/pub/clinvar/>. Filter to GRCh38, to the ~20k genes
in our index, and to the fields we'd actually draw: position, ref/alt,
significance, review status, variation ID. Same shape as the exon build: a
`build_clinvar.py` emitting per-chromosome or per-gene shards.

**Open questions to settle before building:**
- **Size.** Unmeasured. ClinVar is ~4M records; even filtered to our genes and
  five fields this is likely too big to *bundle* the way the exon shards are
  (1.4 MB gzipped total). Per-gene shards on R2 would cost one extra Class B read
  per gene page, or per-chromosome bundled shards may work if the filtered set is
  small enough. Measure before choosing.
- **Staleness.** ClinVar changes weekly; exon structure doesn't. Whatever we ship
  needs a stated release date in the UI, and a rebuild story. This is the main
  argument for linking out rather than embedding a snapshot.
- **Matching.** ClinVar normalizes indels differently from the BRaVa VCFs, so
  chr:pos:ref:alt matching will silently miss some indels. Worth quantifying the
  miss rate on one gene before promising a "in ClinVar" badge.

## Chromosome ideogram + locus context on the gene page

Show where the gene sits on its chromosome (cytoband ideogram with a position
marker), and ideally let neighbouring genes be clicked to navigate. Requested as
"zoomable and other genes clickable".

**The data is nearly all already bundled.** [genes.json](../app/public/data/meta/genes.json)
(984 KB, shipped with the app) carries `ids`/`symbols`/`chr`/`start`/`end` for all
20,033 genes, so neighbour genes cost **zero fetches and zero R2 reads** — filter
by chromosome once and memoise (chr1 is the worst case at 2,061 genes).

**The one missing input is cytobands.** Not in the repo, and *not* in the Ensembl
110 GTF everything else is built from, so this needs a new one-off external
source: UCSC `cytoBand.txt.gz` (hg38) or Ensembl REST
`/info/assembly/homo_sapiens?bands=1`. ~1,400 bands → roughly 30 KB as compact
columnar JSON, well under 10 KB gzipped. A short `build_cytobands.py` emitting
`meta/cytobands.json`, **bundled with the app** like the exon shards, so it costs
no Class B reads. Bonus: it supplies true chromosome lengths and centromere
positions, which [genome.ts](../app/src/lib/genome.ts#L23-L28) currently only
approximates from max-gene-end.

### Two tiers of effort, and they are very different

1. **Static ideogram + position marker (~1–2 h).** An SVG sibling of
   [GeneTrack.tsx](../app/src/components/GeneTrack.tsx): rounded-rect outline,
   band rects filled by Giemsa stain (`gneg` / `gpos25…100` / `acen` / `gvar` /
   `stalk`), red tick at the gene. ~100 lines, no new interaction model. The
   centromere pinch is the only fiddly drawing bit — drawing `acen` as dark
   triangles inside a plain rounded rect is the usual simplification.
2. **Continuous zoom + clickable neighbours (a day-plus, a real component).**
   Viewport state, wheel/drag pan-zoom, a draggable viewport box on the ideogram
   overview, hit-testing, reset control, trackpad/touch handling. The genuinely
   hard part is **gene-symbol label collision avoidance and lane packing** — at
   whole-chromosome scale there are ~2,000 genes and no labels are possible, so
   labels can only appear below roughly a 2 Mb window. Likely canvas rather than
   SVG at that density. 400–600 lines plus tests, and it introduces a second
   x-scale concept alongside [exonScale.ts](../app/src/lib/exonScale.ts).

### Decide before building

- **Placement.** "Directly under the gene diagram" is incoherent as-is: that
  diagram sits under [LocusZoom.tsx](../app/src/components/LocusZoom.tsx), whose
  axis is **exon-collapsed by default** (introns excised), so genomic distance
  isn't linear there. Put the ideogram near the gene-page header (beside the
  chr/position text), or below the diagram as a visually separate "locus context"
  block with its own genomic axis and label.
- **Genes with no results.** The index holds 20,033 genes but BRaVa results cover
  19,490, so a clickable neighbour can land on a gene page with no data. Render
  non-result genes faint and non-clickable.

**Recommended shape:** tier 1 plus a *fixed-window* neighbour strip (gene span ×5,
or ±500 kb) with neighbours as clickable arrows carrying symbols → `/gene/{ENSG}`.
That delivers the position context and jump-to-neighbour value for a fraction of
tier 2's cost, and doesn't foreclose adding continuous zoom later.

## Variant table: extending the N (eff.) meter beyond the cross-ancestry meta

**Shipped:** in meta mode (ancestry = `All`) the N (eff.) cell carries a
`MagnitudeBar` ([indicators.tsx](../app/src/components/indicators.tsx)) whose
length is the variant's effective sample size over the largest N among the loaded
rows, mirroring how `DirDot` normalises |β| per column. Pure frontend — `ne` was
already in the meta slice.

**Not shipped, and why:** for any single ancestry the column is dropped entirely,
because `.anc.json` slices carry only `idx`/`beta`/`se`/`lp`
([types.ts](../app/src/data/types.ts) `VariantAncSlice`). There is no per-variant,
per-ancestry N in the shipped data, so the meter disappears exactly when you
subset — the opposite of what you'd want.

### Option A — per-stratum N (makes the meter work in every ancestry)

Pass 1 of the ETL **already writes `ne` for every ancestry row** into the shard
files ([build_variants.py](../pipeline/build_variants.py) — the record is built
identically regardless of `aidx`); only `_anc_payload` drops it on the way out. So
it's a two-line pipeline change plus a full re-run.

Measured cost (on the local full build, gzip -6, biggest 40 `.anc.json` files):

| | |
|---|---|
| Adding `ne` to anc slices | **+18.6% gzipped** on the anc payload |
| Bucket impact | anc ≈ ⅓ of the 2.52 GiB v2 data → **3.75 → ~3.90 GiB** of the 10 GB ceiling |
| Class A ops | ~176k re-uploads against the 1M/month budget — fine once, not repeatedly |
| Wall clock | `make full-variants` ~1–2 h + ~6 GB GCS download |

Free offset while in there: `_num` casts every shard field to `float`, so `ne`/`nc`
ship as `"75717.0"` — two wasted bytes per value across every meta file. Emitting
them as ints pays back part of the growth.

**Do this opportunistically**, bundled with the next variant ETL re-run (e.g. a
ClinVar or annotation pass), not as a standalone rebuild.

### Option B — stacked per-ancestry composition bar via `.anc.json`

Superseded by Option C below, which gets the same thing for free. Recorded for
completeness: a segmented bar built from the per-ancestry *files* would need
Option A **plus** the `.anc.json` fetch on first paint in meta mode, where it's
currently lazy (`needAnc` is false until a variant is selected,
[GeneVariants.tsx](../app/src/components/GeneVariants.tsx)) — a first-paint
regression and an extra Class B read on the common path.

### Option C — decode `ED`, which makes composition free (**preferred**)

An earlier note here claimed `ED` was per-biobank and therefore useless for
ancestry composition. **That was wrong.** Measured properly:

- `ED` is one character per **biobank × ancestry stratum**. Its length is constant
  within a phenotype and ranges 4–33 across the 44 phenotypes (0/44 phenotypes
  showed more than one distinct length over 120 sampled genes). Only 10 biobanks
  exist, so lengths above 10 already rule out per-biobank.
- The stratum **order and identity are recoverable**: each meta VCF's
  `##bcftools_metalCommand` header line lists its metal inputs in `ED` order, and
  every input filename encodes biobank, ancestry and cohort counts —
  `all-of-us.palmer.BRaVa_v8.HipRep.v8.ALL.AFR.176.77793.SAIGE.variant.20240326.vcf.gz`
  → all-of-us / AFR / 176 cases / 77,793 controls.

Verified on 3,000 variants each for HipRep (5 strata), AlcCons (4), BMI (25) and
LDLC (26): summing the strata that `ED` marks as contributing (`+`/`-`, vs `?`)
reproduces the file's own `NS`, `NC` and `NE` **exactly, 3000/3000 in every case**,
where

    NE = Σ over contributing strata of 4 / (1/N_case + 1/N_ctrl)     (binary)
    NE = Σ over contributing strata of N                            (quantitative)

So `ED` + a header-derived stratum table yields, per variant, exactly which strata
contributed and their sizes — i.e. **per-ancestry sample composition, without
touching the variant data or re-uploading anything**. The build step is 44 tiny
range-reads of VCF headers emitting a bundled `meta/variant_studies.json`
(44 phenotypes × ≤34 strata × {biobank, ancestry, cases, controls} — kilobytes,
like the exon shards, so zero Class B cost).

**The parser is solved and validated across all 44 phenotypes** (875 strata).
Two rules matter, and both cost a debugging round when guessed:

1. **Select inputs structurally, not by heuristic.** Take every `.vcf.gz` path under
   `meta-analysis_inputs/` in order of appearance; the `-o` output lives under
   `meta-analysis_outputs/`. Filtering on "filename contains SAIGE" silently drops
   `uk-biobank.baya.pilot.Height.JULY23Freeze.ALL.EUR.401497.regenie.variant.20250606.vcf.gz`
   — Height's UKB EUR stratum is a **regenie** run, the only non-SAIGE input in the
   whole set, and losing it shifts every `ED` position after it.
2. **The method field is not `[A-Za-z]+`.** Genomics England's inputs are labelled
   `SAIGEv_1_1_9` (63 of 875 strata), so a letters-only pattern fails on 20
   phenotypes. Use `[A-Za-z][A-Za-z0-9_]*`.

Working filename grammar:

    {biobank}.{analyst}.{freeze}.{pheno}.{ver}.{SEX}.{ANC}.{counts}.{method}.variant.{date}.vcf.gz
      SEX     = ALL | F | M            (768 ALL, 107 F across the 44 phenotypes)
      ANC     = AFR | AMR | EAS | EUR | SAS      (no MID/other appears)
      counts  = {cases}.{controls} for binary traits, a single {n} for quantitative

With that, all 44 phenotypes satisfy `len(parsed) == len(ED)`, and summing the
`ED`-marked strata reproduces `NS`, `NC` and `NE` on 2,000 variants per phenotype
with zero mismatches. **Keep the `len(parsed) == len(ED)` assertion in the build
anyway** and fail loudly: a future submission with a new filename shape would
otherwise silently misattribute every ancestry rather than error.

Remaining caveats:
- `meta/pheno_sizes.json` is **not** authoritative for this: its stratum counts
  matched `ED` length for only 12 of 38 phenotypes, and the six `_F` phenotypes are
  absent from it entirely. Use the VCF headers.
- This covers meta mode only. In a single-ancestry view `.anc.json` carries no `ED`
  either, so Option A is still the route for per-stratum N there.
- The counts in the filenames are **cohort** sizes for the stratum, not
  variant-specific ones. That is exactly what reproduces `NS`/`NC`/`NE`, so it is
  the right denominator — but it means the bar shows the composition of the
  *strata that carried the variant*, not per-ancestry allele counts.

### Worth considering either way — normalise to the achievable N

The shipped bar is normalised to the table's own max, so it's a *relative* read:
a full bar means "best-supported variant here", not "well powered" (the cell's
tooltip spells the denominator out for this reason). `meta/pheno_sizes.json` is
already bundled with true per-phenotype × ancestry × biobank N, so the denominator
could instead be the max **achievable** N for the selected phenotype × stratum —
absolute, stable across sorting and filtering, and zero data cost. That would also
give the stratum column a meaningful bar with no per-variant N at all, though it
would be constant down the column rather than per row.

## Gene table: header/body cell-divider misalignment

The per-ancestry grid header's group-cell outline doesn't line up with the body
rows. Specifically the **bottom-left corner of the "P-value" group-header cell**
doesn't align with the vertical divider of the second (body) row's first
P-value cell.

Likely cause: header groups render one flex row per level with padding on an
inner wrapper, while body cells distribute width by flex-basis:0 weights
([VirtualTable.tsx](../app/src/components/VirtualTable.tsx) — see the comment
about per-cell padding skewing width distribution). The group-header divider and
the leaf-column divider are computed on slightly different boxes, so the left
rule of the "P-value" block is a hair off from the body cell divider below it.

Fix direction: ensure the divider (left rule) is drawn on the same box/weight
for group headers, leaf headers, and body cells — e.g. move the divider onto the
flex item itself (consistently) rather than the padded inner wrapper, or share a
single border-position helper across header + body.

## Phenotype page, variant-level: tag each row with the ancestries behind it

Requested after the variant Manhattan shipped. On the phenotype page's
variant-level view a row is currently just chr/pos, p and effect direction —
nothing says whether that signal came from every stratum or from EUR alone,
which for a consortium whose whole point is ancestral diversity is the first
thing a reader wants to know. Proposed: a compact ancestry tag per row (dot
strip or chips in `ANCESTRY_COLOR`), and probably a filter built on it
("variants with a non-EUR contributing stratum").

### What the data says today

`variant/overview/{PHENO}.json` — the file the view reads — carries only
`chr`, `pos`, `lp`, `dir`, `gene_idx` (`Overview.payload` in
[build_variants.py](../pipeline/build_variants.py)), and it is built from the
**meta** VCF only. So there is nothing to tag with; this needs a pipeline
change, unlike the gene-page variant table, where the per-gene meta file
already carries `ed` per variant.

### Where the ancestries come from

Exactly the `ED` decoding worked out under *Option C* above — that research
applies unchanged here, and it's the reason this is worth doing:

- `ED` is one character per **biobank × ancestry stratum**, and the stratum
  identities/order are recoverable from each meta VCF's `##bcftools_metalCommand`
  header (validated across all 44 phenotypes / 875 strata; summing the `+`/`-`
  strata reproduces `NS`/`NC`/`NE` exactly).
- So per variant we know precisely which strata contributed, hence which
  ancestries — collapsing biobank × ancestry down to the 5 superpops.

Same caveat as there: this is *which strata carried the variant*, cohort-level,
not per-ancestry allele counts. The tag should read "ancestries represented",
never "ancestry-specific frequency".

### Cost — small, and nothing like a full re-upload

Add one parallel `anc` array to the overview payload: a 5-bit mask per row
(EUR/AFR/AMR/EAS/SAS → 0–31), which is a low-cardinality integer column and so
gzips down to very little.

- **Build:** only pass 1 emits the overview, and only for the meta stratum, so
  this does *not* need the full `full-variants` run. Worth adding an
  `--overview-only` mode that streams just the 44 meta VCFs and skips the gene
  stash/shard/merge entirely — that's the difference between minutes and the
  ~1–2 h full ETL.
- **R2:** `v2/variant/overview/` is **44 objects**, one per phenotype. Re-uploading
  them is ~44 Class A ops against the 1M/month ceiling — i.e. free. This is the
  key point: the 176k-object variant tree is untouched.
- Also emit the bundled `meta/variant_studies.json` from Option C while in
  there (kilobytes, ships with the app, zero Class B cost); the gene-page
  N-meter work wants the same file, so the two items share a build step.

### Decide before building

- **Superpops or strata?** A 5-bit mask loses "which biobank", which the gene
  page's per-variant view could still show from `ed`. Simplest is the mask here
  and full detail on the gene page.
- **Tag or filter or both?** A dot strip on every row is a lot of ink in a dense
  table; a single "EUR-only / multi-ancestry" marker plus a filter may read
  better. Worth mocking both before committing to a column.

## Per-ancestry filter sliders: P-value, beta, and P_het

The gene/phenotype tables have a global P ≤ / |β| ≥ slider filter, but nothing
lets a user filter on a **specific ancestry's** P or β (or on `P_het`) in the
per-ancestry grid — e.g. "show genes significant in AFR" or "flag rows with
P_het < 0.05". Worth adding ancestry-scoped sliders alongside the existing
ones once the UI for stacking multiple filter controls is worked out.

## Miami plot: compare two ancestries

Either (a) for one trait, both ancestries' full gene Manhattan back-to-back
(the classic Miami layout — one ancestry mirrored below the axis), or (b) for
one ancestry pair, only the genes significant in at least one, across all
traits. Would reuse `genomeLayout`/`ManhattanPlot`'s x-scale; the "all sig
genes across all traits" variant (b) is the same underlying data as the
proposed all-results page below, just re-sliced by ancestry instead of by
mask/maf/test.

## All-results page — SHIPPED (v1 scaffold)

`/all-results`: every (gene, phenotype) result past the gene-level Cauchy
threshold (P < 2.5e-6), across all 44 traits, with the same mask/MAF/test/
ancestry dropdowns as the phenotype page. [AllResultsPage.tsx](../app/src/pages/AllResultsPage.tsx)
+ [AllResultsManhattan.tsx](../app/src/components/AllResultsManhattan.tsx).

**Data: bundled, sharded by ancestry, not R2.** [build_all_results.py](../pipeline/build_all_results.py)
scans every phenotype × ancestry gene TSV and keeps only rows clearing
`SIG_GENE_CAUCHY`, melting each pivoted (gene, mask, maf) row into up to 3 hit
rows (one per test). Measured on the real bucket: the cross-ancestry "All"
meta alone yields **8,653 hits** across 44 phenotypes × 6 masks × 2 MAFs × 3
tests (~900 KB raw TSV worth of rows); LDLC's 7 ancestry files individually
range from 4 (EAS) to 287 (All) rows, a few KB each as JSON. So per-ancestry
sharding (`meta/all_results.{ANC}.json`, 7 files) — not one combined file —
both bounds any single fetch and lets ancestry switching stay lazy (same
pattern as `meta/exons/chr{N}.json` and the gene page's `.anc.json`); every
shard is comfortably small enough to bundle with the app rather than host on
R2, so switching mask/MAF/test/ancestry costs zero R2 reads either way.

**`beta` is always the IVW Burden effect**, regardless of which test's
p-value triggered the hit — this mirrors `phenoRows`/`geneRows` in
[select.ts](../app/src/lib/select.ts), which show Burden's β alongside
whichever test the user has selected. An earlier draft nulled `beta` for
non-Burden hits and had to be corrected before the real build ran.

**Points are colored by chromosome, not phenotype** — same as `ManhattanPlot`.
44 traits can land on the same gene, and a 44-way categorical legend would be
noisier than useful; the tooltip + click disambiguate which trait a point is.

**Not done / next:**
- Clicking a point navigates to `/gene/{ensg}` with no phenotype
  pre-selection — same gap as the phenotype page (see the item above about
  wiring phenotype → gene forest navigation); fixing that lands here for free
  once built.
- No further P/β threshold slider on the table — every row already clears the
  inclusion threshold, so a slider would only narrow within an already-tiny
  set; a gene/phenotype search box covers the common case for now.
- Rebuild story: `make all-results` (needs gsutil access; ~7.8 GiB across all
  280 gene TSVs) whenever the underlying data changes, then commit the 7
  `meta/all_results.*.json` shards. Standalone target, not wired into `make
  full`/`upload` — its output is bundled, not R2-hosted.

## Search: map lay / synonym terms to the phenotypes they mean

The header search
([IndexContext.tsx](../app/src/data/IndexContext.tsx)) is a case-insensitive
**substring** match on a phenotype's name, id and category (and on gene symbol /
ENSG). That works when the user already types our wording and fails completely
otherwise — measured against the shipped `phenotypes.json`, all of these return
**zero** results today:

| typed | means | today |
|---|---|---|
| heart attack, myocardial infarction | CAD | — |
| high blood pressure | HTN | — |
| colorectal, bowel cancer | ColonRectCanc ("Colon and rectum cancer") | — |
| kidney stones, stones | Urolith | — |
| blood clot, DVT, PE | VTE | — |
| emphysema | COPD | — |
| Crohn, ulcerative colitis | IBD | — |
| obesity | BMI / WHRBMI | — |
| liver enzymes | ALT / AST | — |
| inflammation | CRP | — |
| heavy periods | EFRMB_F | — |
| womb cancer | BenCervUterNeo_F | — |
| osteoarthritis | HipRep (its usual indication) | — |

Note `colorectal` in particular: it isn't a lay term at all, it's the standard
clinical word for a phenotype we happen to name "Colon and rectum cancer".

### Shape

A curated **alias list per phenotype**, bundled — not embeddings. This is a
static site with no backend, the vocabulary is 44 phenotypes, and a precomputed
embedding index would be both heavier and less predictable than a few hundred
hand-checked strings. Emit it from
[build_phenotypes.py](../pipeline/build_phenotypes.py) as an `aliases` array on
each phenotype (a curated dict in the script, like `COORDS` / `NAME_OVERRIDE` in
[build_biobanks.py](../pipeline/build_biobanks.py)), so it ships in
`meta/phenotypes.json` — bundled with the app, zero R2 cost, nothing to
re-upload.

Then in `search`: match aliases too, but rank alias hits **below** name/id
prefix hits, and keep displaying the canonical name in the result row. Probably
show what matched ("heart attack → Coronary artery disease") so a lay term
doesn't look like it silently returned something else.

### Get the terms from the curation, then review them

Prefer seeding from the phenotype definitions in
[BRaVa_curation](https://github.com/BRaVa-genetics/BRaVa_curation) — the ICD-10 /
phecode descriptions behind each trait are real clinical vocabulary and are
defensible as sourced, rather than invented here. Hand-curation on top for the
genuinely lay terms.

**These need a consortium review before shipping.** Several of the pairs above
are near-synonyms rather than equivalences — a myocardial infarction is an event,
CAD is the disease; osteoarthritis is the usual indication for a hip replacement,
not the phenotype. That's fine for *finding* a trait and wrong as a *label*, so
aliases must stay strictly in the search index: never rendered as a subtitle,
never in a page title, never in an export.

Same mechanism would carry gene-symbol aliases (previous/withdrawn HGNC symbols),
which the Ensembl GTF the gene index is built from already has.
