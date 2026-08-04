# UI follow-ups

Small polish items noted for later.

## Must report 3 sig figs everywhere

Ideally include beta burden values in table, not just triangle up/down symbol.

## Clicking on gene in phenotype page must show gene page with phenotype in forest plot.

## Landing page:
- Add ancestral diversity pie charts?
- Consider adding global map (with current and future partnering biobanks)?

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


## Download button on gene / phenotype pages

Explore a per-page download, so a user looking at one gene or trait can take
those rows away without going to the [Downloads page](../app/src/pages/DownloadsPage.tsx)
and pulling whole files from GCS. (Listed as "one-click export" in
[competitive-ideas.md](competitive-ideas.md) — this is the actionable version.)

**Two very different implementations, and the cheap one is also the better UX:**

1. **Export what's already loaded (recommended).** The page has already fetched
   and parsed everything the table shows, so serialising the current rows to
   CSV/TSV in the browser (`Blob` + `URL.createObjectURL`) costs **zero extra
   requests** — no R2 reads, no pipeline change, works offline. Respecting the
   active mask / MAF / test / ancestry filters makes it "download exactly what I
   am looking at", which the bulk GCS files can't offer.
2. **Link to the raw source files.** Cheap to build but sends users to
   per-phenotype × ancestry files far larger than what they were viewing, and
   adds R2 reads. Probably not worth it given the Downloads page exists.

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

## Table caption doesn't stay put during horizontal scroll

Tables now scroll sideways below their natural width with the first column frozen
([VirtualTable.tsx](../app/src/components/VirtualTable.tsx)). The sticky caption
(active filters / β legend) lives inside the min-width wrapper, so it pans out of
view as you scroll right, unlike the frozen column.

Fix direction: pin the caption's content with `sticky left-0` and constrain it to
the scrollport width (needs the container's `clientWidth`, e.g. via
`ResizeObserver`), or move the caption outside the min-width wrapper and stack
the two sticky bands by measured caption height.

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
