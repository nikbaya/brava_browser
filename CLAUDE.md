I would like to create a browser for Biobank Rare Variant Analysis (BRaVa) consortium results.

The browser should be professional and be very responsive (low lag). Prioritize usability and good U/I and U/X. Use gnomAD and Genebass as examples of good browsers.

The raw data lives in a GCS bucket (path in `docs/local-notes.md`, gitignored — not committed here), which has subfolders gene/ and variant/, which correspond to gene and variant level results.

For the first version of this browser, focus only on the gene-level results.

The landing page should have the BRaVa logo and a search bar in the center (like the landing page for google). Have a few example traits or genes that users can click on below the search bar.

This website will be hosted on GitHub pages, on my (nikbaya) github repo to start. But eventually we will move it to the brava-genetics account.

Refer to the flagship paper preprint PDF in this repo for more background info.

---

# Project state & context (for future sessions)

> Everything below summarizes the v1 implementation so a fresh session has full
> context without re-deriving it. The brief above is the source of truth for
> intent; this section records the decisions and current state.

## What this is

A professional, low-lag **static** browser for BRaVa **gene-level** rare-variant
association results (gnomAD/Genebass-style), to be hosted on GitHub Pages. v1 is
gene-level only (no variant-level). The "All by All" (All of Us) browser is the
explicit quality bar. Do not cut corners - this should be a gold-standard browser.

## Architecture (two halves)

GitHub Pages is static and the raw data is ~8 GB, so:

1. **`pipeline/`** — Python + **Polars** ETL turning raw SAIGE-GENE+ TSVs into
   compact **columnar JSON** (parallel arrays + integer indices as the wire
   contract). Output → uploaded to a Cloudflare R2 bucket (see "Data hosting"
   below).
2. **`app/`** — React 19 + Vite 8 + TypeScript + Tailwind v4 SPA. Bundles small
   search indexes (instant search, works offline) and fetches bulky per-gene /
   per-phenotype JSON from R2 over HTTPS.

```
GitHub Pages (app + bundled meta indexes)
   │ fetch()
   ▼
Cloudflare R2 (brava-browser bucket): {gene,phenotype}/… , v2/variant/…
```

## Data model

Raw: `{PHENO}_ALL_gene_meta_analysis_100_cutoff.{ANCESTRY}.tsv.gz` (no suffix =
`All` cross-ancestry meta). ~37 phenotypes × 7 ancestries. Each file is
19,490 genes × 6 masks × 2 MAF cutoffs × {Burden, SKAT, SKAT-O}.

- **Ancestries (7):** `All`(meta), `EUR`, `AFR`, `AMR`, `EAS`, `SAS`, `non_EUR`.
- **Masks (6):** pLoF; damaging_missense_or_protein_altering;
  other_missense_or_protein_altering; synonymous (calibration control, labeled
  just "Synonymous"); pLoF;damaging_missense (= "pLoF or DM/PA"); all four
  (= "all variants").
- **Tests:** SKAT-O (primary gene significance), Burden (effect direction/size),
  SKAT. **β>0 = risk-increasing, β<0 = protective.**
- **Significance lines:** gene-level Cauchy P<2.5e-6; gene-mask Bonferroni
  P<1.39e-7.
- **CRITICAL pivot detail:** the Burden `class` has TWO rows per (gene,mask,maf):
  a `Stouffer` row (β, no SE) and an `Inverse variance weighted` (IVW) row that
  carries the real **`SE_Burden`** + heterogeneity (`Pvalue_het`).
  `pivot_tests` in [pipeline/common.py](pipeline/common.py) MUST read the **IVW**
  row for β/SE/het (an earlier `.first()` bug silently dropped SE). SKAT/SKAT-O
  use the Stouffer row.
- Numbers stored as **−log10(p)** (`lp_*`, `lp_het`) to avoid float underflow at
  p≈1e-300. β & SE populated from IVW Burden.
- No gene symbols/positions in the data — joined from **Ensembl 110 (GRCh38)**.
  Phenotype names/categories/binary-vs-quant parsed from the
  [BRaVa_curation](https://github.com/BRaVa-genetics/BRaVa_curation) repo
  (`meta_analysis/meta_analysis_utils.r`).

## Frontend conventions

- **Routing:** React Router v7 **HashRouter** (avoids GH Pages 404-on-refresh).
- **Tables:** TanStack Table + Virtual; [VirtualTable.tsx](app/src/components/VirtualTable.tsx)
  is div/flex (shared flex weights keep header+body aligned), rowHeight 30,
  text-[13px], alternating shading, **caption bar** showing active filters plus
  the TSV download button. The caption bar is rendered **outside the scroll
  container** (column headers stay inside it, `sticky top-0`): inside, it inherits
  the columns' `contentWidth`, so on a table wide enough to pan sideways the
  right-aligned download button starts off-screen and the filter summary scrolls
  away. Keep it out there — the frozen first column and sticky headers still work,
  and `overflow-hidden` on the outer box clips the scroll region to the rounded
  border.
- **Manhattan:** HTML **canvas** ([ManhattanPlot.tsx](app/src/components/ManhattanPlot.tsx)),
  19k+ points, linear hit-test, significance lines, tight x-axis whitespace.
- **PheWAS & forest:** SVG.
- **Gene model track + exon-collapsed axis** (variant view). The VCFs have no
  functional annotations (variants → genes by position overlap), so exon
  structure is the only way to see *where* in a gene a variant sits.
  [GeneTrack.tsx](app/src/components/GeneTrack.tsx) draws the MANE Select
  transcript under [LocusZoom.tsx](app/src/components/LocusZoom.tsx), sharing its
  x scale — CDS tall/dark, UTR thin/light (gnomAD's convention).
  **Do not use the gnomAD API** for this: it's rate-limited to 10 req/60s, and
  the data is already in the Ensembl GTF we build from.
  [exonScale.ts](app/src/lib/exonScale.ts) reimplements gnomAD's
  `regionViewerScale` (`@gnomad/region-viewer`): axis width is allocated *only*
  to exons ±75 bp and the gaps get **zero width** (introns excised, not
  compressed — verified against their source, and a unit test asserts agreement
  with the reference implementation). Positions inside an excised gap pin to the
  preceding block's trailing edge, matching gnomAD, so intronic variants stack on
  the exon boundary. Ours uses cumulative offsets + binary search instead of
  their per-call filter/reduce (thousands of points per frame, plus hover).
  **Axis defaults to exon-collapsed** with an `Exons`/`Genomic` toggle (genomic
  mode shades the exons behind the points instead); genes with no gene model fall
  back to genomic automatically. The collapsed view is the default because the
  median gene in our index spends only 12.6% of its span in exons (42% are under
  10%), so on a genomic axis the coding variants pile into a few pixels.
- **Outbound gnomAD links.** The variant table's Variant cell carries a small
  external-link icon (tooltip "View in gnomAD") to
  `gnomad.broadinstitute.org/variant/{chr}-{pos}-{ref}-{alt}`
  (`gnomadVariantUrl` in [GeneVariants.tsx](app/src/components/GeneVariants.tsx)).
  Both datasets are GRCh38 and gnomAD's variant id is exactly our stored
  `chrom-pos-ref-alt`, so no liftover or lookup is needed — it's a plain
  hyperlink, still **not** the rate-limited gnomAD API. **Never add a
  `?dataset=` param**: the bare URL tracks gnomAD's current default release, so
  the links keep working across future gnomAD versions. Ultra-rare BRaVa
  variants may not exist there, hence the quiet styling (faint until hover).
- **Multi-ancestry view = forest plot** ([ForestPlot.tsx](app/src/components/ForestPlot.tsx)):
  IVW Burden β ± 1.96·SE per ancestry, `All` rendered last as a meta diamond,
  P_het header (flags "heterogeneous" when <0.05), axis label adapts to trait
  type (β log-OR for binary / SD units for quantitative). All per-ancestry data
  is already in `gene/{ENSG}.json` (no extra fetch on the gene page; the
  phenotype page fetches the gene file into a side drawer).
  [PhenoPicker.tsx](app/src/components/PhenoPicker.tsx) = searchable combobox.
- **Nullable table columns must sort via `?? undefined` + `sortUndefined:
  'last'`.** TanStack's sort only special-cases `undefined`; a `null` value falls
  through to its `compareBasic`, where `null === 0`, `null > 0` and `0 > null` are
  all false — an inconsistent comparator, so blanks interleave with genuine zeros
  (this is what made a blank I² sort like I² = 0%). Every nullable numeric column
  uses an `accessorFn` that maps `null → undefined`; see
  [ancestryColumns.tsx](app/src/components/ancestryColumns.tsx) and the variant
  table in [GeneVariants.tsx](app/src/components/GeneVariants.tsx).
- The variant table shows **no OR column** — β (log OR for binary traits) is the
  reported effect; `fmtOR` still exists in [format.ts](app/src/lib/format.ts) but
  is currently unused.
- **Indicator dots** ([indicators.tsx](app/src/components/indicators.tsx)):
  `SigDot` (significance tiers, soft green/amber) + `DirDot` (direction, soft
  blue/red) replace a full "effect" column. Colors are **alpha-softened** (~30–55%
  opacity on existing semantic tokens) so they don't clash with the bold,
  full-opacity ancestry palette (`ANCESTRY_COLOR` in
  [constants.ts](app/src/lib/constants.ts)).
  `MagnitudeBar` is the third indicator: a track + fill "health bar" for a
  quantity in a dense cell, currently the variant table's **N (eff.)** column
  (fill length = the row's effective sample size ÷ the largest among the loaded
  rows). Deliberately a **single neutral hue** (`ink-faint` on `line`) — extent
  already encodes the magnitude, the semantic tokens are taken by significance
  and direction, and a brand tint would sink into the row-hover `bg-brand-light`.
  Its scale is **linear**, unlike the √ lift in `dirAlpha`/`EffectTriangle`: those
  encode with opacity/height, but a bar's *length* must stay proportional to its
  value. Only meta mode has per-variant N — extending the meter to single
  ancestries needs a variant ETL re-run, costed in
  [docs/ui-followups.md](docs/ui-followups.md).
- **Effect wording** ([effect.ts](app/src/lib/effect.ts)): binary →
  risk↑/protective↓; quantitative → higher↑/lower↓.
- **Scientific notation:** "e" form (e.g. `1.17e-205`), NOT superscript — the
  user explicitly prefers e for readability. `fmtPLog` reconstructs mantissa/exp
  from −log10 to avoid underflow ([format.ts](app/src/lib/format.ts)).
- **3 significant figures in every tooltip**, p-values and βs alike — including
  large values, so p = 0.01 reads `0.0100`, never `0.01`. Use `fmtPLog3` /
  `fmtBeta3`, not the table forms (`fmtPLog`/`fmtBeta`, which are fixed-decimal
  and keep numeric columns decimal-aligned). The dense per-ancestry grid's
  `fmtPCompact` uses 3 dp for p ≥ 0.01 so a cell never disagrees with its own
  tooltip (2 dp showed p = 0.95499 as `0.95` against a `0.955` tooltip).
  Caveat to remember: the pipeline rounds −log10(p) to 2 dp
  ([common.py](pipeline/common.py)), so p carries only ~1.2% relative precision
  (ln10 × 0.005) — the third figure is display convention, not measurement.
- **Table export = "download what's on screen"** ([exportTable.ts](app/src/lib/exportTable.ts),
  [DownloadButton.tsx](app/src/components/DownloadButton.tsx)). A table opts in by
  passing `exportSpec` to [VirtualTable](app/src/components/VirtualTable.tsx),
  which renders the button in its caption bar **because it owns
  `getSortedRowModel()`** — the file is the visible rows in the visible order, and
  a page-level button couldn't do that without duplicating the sort. Both row
  extraction and serialisation happen **on click** (that bar re-renders every
  scroll frame). **TSV, not CSV**: phenotype/mask labels contain commas, tabs
  never occur, so there is no escaping path. Qualifying constants (gene,
  phenotype, mask, MAF, test, ancestry) are written as **columns, not a `#`
  header**, so rows are self-describing and `pd.read_csv(sep='\t')` just works.
  Exports carry **both `P` and `neglog10P`** — `exportP` rebuilds P from the
  stored −log10 (`10**-lp` underflows past ~1e-308) and the −log10 column is the
  lossless one. Missing values are **empty cells** (R/pandas NA), never the
  display em-dash. Per-ancestry triples come from `ancestryExportColumns` in
  [ancestryColumns.tsx](app/src/components/ancestryColumns.tsx), next to the grid
  columns they mirror. Costs **zero fetches**, so no R2 read budget.
- **Figure export = "save the picture"** ([exportImage.ts](app/src/lib/exportImage.ts),
  [SaveFigureButton.tsx](app/src/components/SaveFigureButton.tsx)): a `Figure ▾`
  chip (styled to match `DownloadButton`, which saves the *numbers*) offering
  **PNG at 300 dpi** or **vector SVG**, wired into both forest plots
  ([ForestPlot](app/src/components/ForestPlot.tsx),
  [VariantForest](app/src/components/VariantForest.tsx)) via an `svgRef`. Three
  things this has to get right:
  (1) **Styles are inlined onto a clone.** Our plots colour themselves with
  Tailwind classes (`fill-ink-faint`, `text-[11px]`) that resolve against the
  document stylesheet; a serialised SVG has no access to it, so without inlining
  the computed values every mark exports as black 16 px text. Only a short list of
  presentation properties is copied (dumping the whole computed style adds ~300
  declarations per node).
  (2) **Dimensions are preserved exactly.** The raster is scaled by `dpi / 96`
  (96 = the CSS reference pixel) and the drawing — not the geometry — is scaled,
  so text/strokes re-render at device resolution; nothing is re-laid-out.
  A `pHYs` chunk is spliced into the encoded PNG (canvas only knows pixels), so
  Word/Illustrator/LaTeX place the figure at its on-screen physical size instead
  of assuming 72/96 dpi and blowing it up 3×; journals also read it as 300 dpi.
  (3) **Interaction chrome is stripped.** The transparent full-row hit targets and
  the hover highlight carry `data-png-skip` (`PNG_SKIP_ATTR`) and are removed from
  the clone. Both formats get an explicit **white background rect** — neither has
  one implicitly, and a transparent figure on a dark slide loses its dark ink.
  A **caption band** (gene/variant × phenotype, then mask · MAF · test · P_het ·
  BRaVa) is stamped above the plot, because that context is HTML *around* the SVG
  on the page and would be lost the moment the file leaves the browser. It is a
  *band*: the plot content is translated down and the image grows to match, so the
  plot's own geometry is byte-identical to the screen — **never re-scale the plot
  to make room for the caption**. Lines wrap to the plot width (measured with a
  shared canvas context), and the ink colours come from the `--color-ink*` tokens.
  The variant forest's caption has no mask: variant-level data carries no
  functional annotation, so a variant has no mask to name.
  Filenames go through the same `slug` and the **same fragments in the same
  order** as the TSV exports (`brava_{gene}_{trait}_{mask.short}_maf{value}_…`), so
  a figure and the numbers behind it sort together in a download folder. This is
  why `ForestPlot` takes `maskIndex`/`mafIndex` rather than pre-formatted labels:
  the header wants `MAF_META[i].label` (`< 0.1%`) but the filename must use
  `.value` (`0.001`) or the same cutoff gets two different names across the two
  downloads. Costs zero fetches.
- **The About page's "Participants" stat is the hard-coded `~1.2M`**, quoting the
  flagship paper, NOT `Σ biobank.sample_size` through `fmtCount`. Those Table S3
  sizes are all round figures (500,000 / 400,000 / …), so summing them to
  1,247,000 and printing "1.25M" asserts precision the inputs lack — and it
  contradicted the exact Table S8 total in the pies right below it (1,119,948
  across the five superpops; +309 MID that `SUPERPOPS` doesn't draw). The two
  count different things (enrolled participants vs sequenced, ancestry-assigned
  samples); a computed footnote under the pies reconciles them. Full trace in
  [docs/data-followups.md](docs/data-followups.md) — **don't "fix" the pie total
  to match the headline**, they are not the same quantity.
- **Header** ([Header.tsx](app/src/components/Header.tsx)): icon only, no text.
- **Defaults** ([constants.ts](app/src/lib/constants.ts)): ancestry `All`, mask
  index 4 (pLoF or DM/PA), MAF index 0 (<0.001), test SKAT-O.
- Gene table = one row **per phenotype** for the selected mask+MAF (Mask/MAF
  columns dropped); column header is the text "Beta (Burden)" (NOT a β glyph —
  CSS uppercase made it look like "B").
- TS constraint: **`erasableSyntaxOnly`** — no constructor parameter properties
  (assign fields explicitly, e.g. `HttpError`).

## Data layer

- [data/config.ts](app/src/data/config.ts): `META_BASE` = always bundled
  `${BASE_URL}data`; `DATA_BASE` = `VITE_DATA_BASE_URL` or bundled. `metaUrl()` /
  `dataUrl()`.
- [data/client.ts](app/src/data/client.ts): `getJSON(url)`, in-memory cache,
  doesn't cache rejections. Index fetches use `metaUrl`, gene/phenotype use
  `dataUrl`.
- [lib/select.ts](app/src/lib/select.ts): `phenoRows`, `geneRows`,
  `lpArray(test)`, `forestSeries(gene,{phenoIdx,maskIndex,mafIndex})`.

## Pipeline

- [common.py](pipeline/common.py): TSV parsing, mask naming, constants,
  `read_gene_tsv` (parses type + Pvalue_het), `pivot_tests` (IVW fix above).
- [build_data.py](pipeline/build_data.py): writes phenotype + gene files (both
  emit `lp_het`). Gene pass is **hash-sharded** (`--gene-shards`, default 1;
  `make full` uses 16) to bound memory — ~65M rows would OOM on 24 GB otherwise.
- [build_phenotypes.py](pipeline/build_phenotypes.py): parses BRaVa_curation r
  file for names/categories/class.
- [build_annotation.py](pipeline/build_annotation.py): Ensembl 110 gene index.
- [build_exons.py](pipeline/build_exons.py): gene models (exon + CDS structure)
  from the same Ensembl 110 GTF — one transcript per gene, **MANE Select** with
  **Ensembl canonical** as fallback (19,061 / 972 of 20,033 genes). Emits
  `meta/exons/chr{N}.json`, sharded by chromosome (5.7 MB raw, 1.4 MB gzipped;
  largest shard chr1 = 604 KB raw / 146 KB gz). Reads `meta/genes.json` (not the
  parquet), so it runs off a checked-out repo alone. `ensembl_gtf()` lives in
  [common.py](pipeline/common.py) so the gene index and the gene models are
  always from the same release.
- [Makefile](pipeline/Makefile): `make meta|sample|full|upload`. `upload` uses
  `gsutil -m cp -Z -r` (gzip-transcoding; names stay `.json`, browsers
  decompress transparently).

## Deploy / infra

- [.github/workflows/deploy.yml](.github/workflows/deploy.yml): builds `app/`
  with `VITE_DATA_BASE_URL`/`VITE_VARIANT_BASE_URL` pointing at the Cloudflare
  R2 bucket (see "Data hosting" below), deploys to Pages on push to `main`.
- [infra/cors.json](infra/cors.json): GET/HEAD from nikbaya.github.io,
  brava-genetics.github.io, localhost:5173/4173.
- Local dev: `cd app && npm run dev` → http://localhost:5173.

### Data hosting = Cloudflare R2 (free tier — HARD ceilings, never exceed)

The bulky per-gene/per-phenotype JSON is hosted in a Cloudflare **R2** bucket
(`brava-browser`, account Nikolasbaya@gmail.com) served via its public `r2.dev`
URL. R2 was chosen for **zero egress fees**. The browser is hosting-agnostic via
`VITE_DATA_BASE_URL`; point [deploy.yml](.github/workflows/deploy.yml) at the
r2.dev URL.

**These free-tier allowances are HARD CEILINGS — the project must NEVER exceed
them** (overage is billable, so treat each as a non-negotiable budget):

| Resource | Free ceiling / month | Notes |
|---|---|---|
| **R2 Storage** | **10 GB** | total stored bytes. Store JSON **gzip-compressed** to stay well under — the full build is ~4.7 GB uncompressed, far less gzipped. |
| **Class A ops** (writes/lists) | **1 million** | uploads. A full `make full` upload is ~40k objects — fine, but avoid needless re-uploads; use sync, not blind re-copy. |
| **Class B ops** (reads) | **10 million** | every page fetch is a read. Plenty for a research browser, but keep the client's in-memory cache (don't refetch) and long cache headers. |

Overage rates (for reference, must be avoided): Storage $0.015/GB-mo,
Class A $4.50/M, Class B $0.36/M.

Implications baked into the design: keep emitting compact columnar JSON; upload
compressed; never duplicate the dataset across buckets; if storage approaches
10 GB, prune or re-evaluate the host **before** uploading. Current usage is
measured in the next section.

**Bot / scraper exposure — deferred, current posture is monitoring-only.**
`meta/genes.json` ships every Ensembl gene ID bundled with the app, so object
paths like `gene/{ENSG}.json` are fully enumerable — a script can `curl` the
whole dataset directly from the r2.dev URL, bypassing CORS entirely (CORS only
constrains browser-issued cross-origin fetches, not direct HTTP). Investigated
2026-08-17:
- `r2.dev` has a default rate limit (~hundreds of req/s → 429s), but it's an
  anti-CDN-abuse valve, not real protection — a scraper pacing itself under
  that stays invisible while still burning the Class A/B budget. WAF, Bot Fight
  Mode, and caching are **not available on `r2.dev` at all** — only once the
  bucket sits behind a custom domain (Cloudflare zone).
- Free-plan Rate Limiting Rules on a custom domain: 1 free rule, matchable only
  on Path/Verified Bot (not IP/UA — that needs Business+), fixed 10s window.
- No hard quota/cap exists — only account-wide dollar-threshold budget alerts
  (notify-only). A real enforced cap means a custom Worker + Durable Objects
  counter in front of a custom domain — a genuine infra project, not a toggle.
- [app/public/robots.txt](app/public/robots.txt) disallows known AI-training
  bots (GPTBot, CCBot, ClaudeBot, etc.), but the site is a GitHub Pages
  **project** page (`nikbaya.github.io/brava_browser/`), and robots.txt is only
  honored by compliant crawlers at the **origin root** — a different repo. It's
  inert until/unless the site moves to a custom domain or an org root page.
- **GoatCounter can't fill this gap either.** It only sees traffic that loads
  and executes the SPA (irrelevant to direct `curl`-style R2 scraping), and it
  server-side-drops any hit whose real HTTP User-Agent self-identifies as a
  bot/crawler — unconditionally, before looking at path or event name. A
  client-side "detect a bot and fire a custom event" trick doesn't route around
  this: the request to GoatCounter's endpoint still carries the bot's real,
  self-identifying UA, so it'd be silently dropped anyway — recording nothing
  while looking like it works. Not implemented for that reason.

Given the effort (DNS delegation + Worker) versus a low-traffic research
browser, current posture is: `robots.txt` as a courtesy for compliant
crawlers, plus periodic `rclone size` checks (below) as the actual signal.
Revisit the custom-domain + Worker route only if usage climbs toward the
ceiling.

### Actual R2 usage — 3.717 GiB / 10 GB (measured 2026-08-17)

Both v1 and v2 data are uploaded. Measured stored bytes (gzipped, as served):

| Prefix | Objects | Stored (gzip) |
|---|---|---|
| `gene/` (v1) | 19,541 | 663.1 MiB |
| `phenotype/` (v1) | 280 | 596.9 MiB |
| `v2/` (variant) | 175,911 | 2.487 GiB |
| **Bucket total** | **195,732** | **3.717 GiB (3.99 GB)** |

(`v2/variant/overview/*.json` was regenerated twice on 2026-08-17 — first to
add `ref`/`alt` — 44 objects, 13.7 MiB gzipped — then again minutes later to
add `beta` too — 44 objects, 17.2 MiB gzipped — both times replacing the prior
overview files in place; bucket total is still slightly below 2026-07-29
despite the new fields.)

**~40% of the 10 GB storage ceiling — comfortable headroom.** The v2 estimate
below (~2.7 GB) proved accurate; gene-level came in under its ~1.5 GB estimate
at 1.23 GiB.

**Re-measure after any upload that adds or replaces data**, and update the table
above (with the date) so the headroom figure never goes stale:

```bash
rclone size r2:brava-browser                 # whole bucket (~1 min, lists 196k objects)
rclone size r2:brava-browser/v2              # or any single prefix
```

Note on **Class A ops**: the bucket is now 195,732 objects, so a *full* blind
re-upload costs ~196k Class A ops — five of those in one month would approach
the 1M ceiling. Always upload incrementally (`rclone copy --checksum`, which
skips unchanged objects) rather than re-copying everything.

#### Original v2 feasibility estimate (2026-06-28, kept for reference)

| | Raw on GCS (gzip) | Browser footprint on R2 (gzip) |
|---|---|---|
| Gene-level (shipped v1) | 7.8 GiB | ~1.5 GB est. (actual: 1.23 GiB) |
| Variant-level | 5.95 GiB (273 `.vcf.gz`) | ~1.5–3 GB est. (actual: 2.52 GiB) |

The gene transform achieved ≈5× shrink by pivoting + keeping only displayed
numeric fields; the variant transform landed in the same range. Cost was never
the blocker. The real constraint was UX/architecture: variant files are huge
(AFib×EUR alone = **1.84M variants**), so v2 serves by **region/locus-window
slicing** (per-gene-region variant shards), not whole-phenotype files.

## Current state / open items (as of 2026-07-29)

### v1 (gene-level) — live
- App is feature-complete and deployed to GitHub Pages via GitHub Actions.
- Gene + phenotype JSON hosted on Cloudflare R2 (`brava-browser` bucket,
  `pub-70f6a636186f47b2a7dbb9547de34be8.r2.dev`). `VITE_DATA_BASE_URL` is
  wired in [deploy.yml](.github/workflows/deploy.yml).
- Local dev: `cd app && npm run dev -- --host`; `.env.local` has both
  `VITE_DATA_BASE_URL` and `VITE_VARIANT_BASE_URL` pointing at R2.

### v2 (variant-level) — live

Frontend code, data build, and R2 upload are all **done** (commits `d43f82e`,
`7478cd7`):
- `GeneVariants`, `LocusZoom`, `VariantForest` components; data types, fetchers,
  `variantRows` / `variantAncRows` / `variantForest` selectors;
  `VITE_VARIANT_BASE_URL` wired into `config.ts` and `deploy.yml` (points to
  `…r2.dev/v2`).
- **The page's ancestry filter drives the variant view.** `GeneVariants` takes
  `ancIdx`: 0 (`All`) reads the cross-ancestry meta out of the main file, any
  other stratum reads `{ENSG}[.{pheno}].anc.json` via `variantAncRows` — the same
  file the per-variant forest lazily fetches, so the two share one cached fetch.
  **Per-ancestry slices carry only `idx`/`beta`/`se`/`lp`** (no `nc`/`ne`/`i2`/
  `cq`/`ed`), so the table drops its **N (eff.)** and **I²** columns for a single
  stratum instead of showing a column of dashes; adding them back means re-running
  the variant ETL and re-uploading ~176k objects. Strata are much sparser than the
  meta (PCSK9 × colorectal: All 225, EUR 154, non-EUR 104, AMR 50, AFR 38, SAS 24,
  EAS 0), so the "no variants in this stratum" empty state is a normal path.
  Selecting a variant clears on ancestry change (it may not exist in the new
  stratum). The All meta is a superset of the strata, so the forest's `All`
  diamond still resolves for a variant picked in stratum mode.
- `VariantForest` mirrors the gene-level `ForestPlot`: ResizeObserver width,
  full-row hover highlight + tooltip (β ± SE, 95% CI, p at 3 sig figs). Its right
  gutter is 250px because the inline `β [lo, hi] · p=…` label runs ~36 chars —
  at the old 150px the p-value was cut off. No N column: per-stratum N isn't in
  the data (see above).
- `pipeline/build_variants.py`: streaming two-pass VCF→JSON ETL. Resolves SAMPLE
  subfield positions from each file's own FORMAT column (fixed indices misalign —
  quantitative traits omit `NC`, and some files omit `NS`/`NE`).
- `pipeline/Makefile`: `full-variants`, `copy-variant-split`, `upload-variants`.
  `upload-variants` gzip-transcodes a staging copy and sets `Content-Encoding`
  (rclone has no `gsutil -Z` equivalent), matching v1.
- `app/public/data/meta/variant_split.json` ships the real manifest: **1,586
  genes** are split per-phenotype (the rest are one file for all phenotypes).
- Data on R2 under `v2/variant/`: 175,911 objects, 2.519 GiB — see the usage
  table above.

To rebuild/re-upload variant data: `make full-variants` (~1–2 h, needs GCS access
+ ~6 GB download) → `make copy-variant-split` → `make upload-variants`, then
commit `variant_split.json` if it changed and re-measure `rclone size`.

Gene/exon context for the variant view is done (see the gene model track bullet
under Frontend conventions). `meta/exons/` is **bundled with the app**, not on R2,
so it costs no Class B reads and needed no re-run of the heavy gene ETL — rebuild
with `make meta` (or just `python build_exons.py --out ../app/public/data`) and
commit the shards.

Phenotype-page variant Manhattan is **done**: a Gene/Variant toggle on the
phenotype page's Manhattan section switches between the existing gene-level
`ManhattanPlot` and the new `VariantManhattanPlot`
([PhenotypePage.tsx](app/src/pages/PhenotypePage.tsx), `manhattanMode` state),
fed by `fetchVariantOverview`. Variant mode forces the ancestry filter to
`All` (variant-level data is cross-ancestry meta only); clicking a point opens
a per-variant forest-plot drawer, and a linked `VariantOverviewTable` stays in
sync with the same filtered subset.

`variant/overview/{PHENO}.json` carries **`ref`/`alt`** alongside
chr/pos/lp/dir/gene_idx (added 2026-08-17) — the Manhattan tooltip shows
`chr{chr}:{pos} ref›alt` above the p-value line, and the linked
`VariantOverviewTable`'s Location column became a combined **Variant** column
(`chr{chr}:{pos} ref›alt` + the "view on gene page" icon), mirroring
`GeneVariants.tsx`'s per-gene Variant column. `Overview.add()`/`.payload()` in
[build_variants.py](pipeline/build_variants.py) unpack ref/alt right where
they're already parsed for the gene pass, so no extra I/O — but the wire
format changed, so the old deployed `variant/overview/*.json` needed
regenerating and re-uploading, not just a frontend change. `build_variants.py`
gained **`--overview-only`**: since overview data only ever comes from the
"All"-meta VCF (`ov = Overview() if is_meta else None`), it streams just that
one file per phenotype and skips the 6 ancestry-stratified VCFs + the entire
gene pass (~1/7 the VCF volume of a full run) — use this instead of
`full-variants` when only the overview schema changes. `variantSectionPath`'s
deep-link still resolves by pos+nearest-lp (not exact ref/alt): it's shared
with other seek-variant callers and wasn't part of this change.

`variant/overview/{PHENO}.json` also carries the real **`beta`** (added
2026-08-17, same day) — `Overview.add()` received `beta` all along (it needed
the sign for `dir`) but discarded the magnitude; now `self.beta.append(beta)`
keeps the already-`sig3`-rounded value from `flush()`. The
`VariantOverviewTable`'s Beta column swapped its direction-only `DirDot` cell
for `DirDot` + `fmtBeta(beta)`, matching `GeneVariants.tsx`'s Beta column
exactly (same `intensity` prop, same nullable-sort `?? undefined` pattern), and
gained the same **|β| ≥** `FilterRow` the gene page's variant table has,
lifted to page state so it also narrows the linked Manhattan (mirrors how
`minLp` already did). `VariantOverviewRow.dir` was removed as dead weight —
`beta`'s sign already encodes direction, and no code read `.dir` off this row
type once the cell stopped using it (the wire field `VariantOverview.dir` and
`Plotted.dir` in `VariantManhattanPlot.tsx` are untouched — those still exist
for the Manhattan tooltip's effect-direction label and canvas point color).
**Limitation to keep in mind:** this is still the *cross-ancestry meta* β
only — no per-ancestry β, and no SE, so no CI can be drawn from it (matching
the per-gene overview's own SE-less meta slice). The null band below
`keep_lp` is decimated by lp/position, not by β, so a thinned point's β is
still whatever real value it had — there's no separate "β is approximate
here" caveat, just the pre-existing "this point was thinned for density"
one.

**Not yet built (deferred to v2.1):**
- ClinVar track / "in ClinVar" badge — see [docs/ui-followups.md](docs/ui-followups.md).
- Idle/hover prefetch of `.anc.json` files.
- rsID / coordinate search (VCFs have no rsIDs; dbSNP map not available).

