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
