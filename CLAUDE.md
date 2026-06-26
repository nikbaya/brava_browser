I would like to create a browser for Biobank Rare Variant Analysis (BRaVa) consortium results.

The browser should be professional and be very responsive (low lag). Prioritize usability and good U/I and U/X. Use gnomAD and Genebass as examples of good browsers.

The raw data lives in gsutil ls -lr gs://brava-meta-analysis-public, which has subfolders gene/ and variant/, which correspond to gene and variant level results.

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
explicit quality bar.

## Architecture (two halves)

GitHub Pages is static and the raw data is ~8 GB, so:

1. **`pipeline/`** — Python + **Polars** ETL turning raw SAIGE-GENE+ TSVs into
   compact **columnar JSON** (parallel arrays + integer indices as the wire
   contract). Output → `browser/` prefix in the public GCS bucket.
2. **`app/`** — React 19 + Vite 8 + TypeScript + Tailwind v4 SPA. Bundles small
   search indexes (instant search, works offline) and fetches bulky per-gene /
   per-phenotype JSON from GCS over HTTPS+CORS.

```
GitHub Pages (app + bundled meta indexes)
   │ fetch() + CORS
   ▼
gs://brava-meta-analysis-public/browser/{gene,phenotype,meta}/…
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
  text-[13px], alternating shading, **sticky caption** showing active filters
  while scrolling.
- **Manhattan:** HTML **canvas** ([ManhattanPlot.tsx](app/src/components/ManhattanPlot.tsx)),
  19k+ points, linear hit-test, significance lines, tight x-axis whitespace.
- **PheWAS & forest:** SVG.
- **Multi-ancestry view = forest plot** ([ForestPlot.tsx](app/src/components/ForestPlot.tsx)):
  IVW Burden β ± 1.96·SE per ancestry, `All` rendered last as a meta diamond,
  P_het header (flags "heterogeneous" when <0.05), axis label adapts to trait
  type (β log-OR for binary / SD units for quantitative). All per-ancestry data
  is already in `gene/{ENSG}.json` (no extra fetch on the gene page; the
  phenotype page fetches the gene file into a side drawer).
  [PhenoPicker.tsx](app/src/components/PhenoPicker.tsx) = searchable combobox.
- **Indicator dots** ([indicators.tsx](app/src/components/indicators.tsx)):
  `SigDot` (significance tiers, soft green/amber) + `DirDot` (direction, soft
  blue/red) replace a full "effect" column. Colors are **alpha-softened** (~30–55%
  opacity on existing semantic tokens) so they don't clash with the bold,
  full-opacity ancestry palette (`ANCESTRY_COLOR` in
  [constants.ts](app/src/lib/constants.ts)).
- **Effect wording** ([effect.ts](app/src/lib/effect.ts)): binary →
  risk↑/protective↓; quantitative → higher↑/lower↓.
- **Scientific notation:** "e" form (e.g. `1.17e-205`), NOT superscript — the
  user explicitly prefers e for readability. `fmtPLog` reconstructs mantissa/exp
  from −log10 to avoid underflow ([format.ts](app/src/lib/format.ts)).
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
- [Makefile](pipeline/Makefile): `make meta|sample|full|upload`. `upload` uses
  `gsutil -m cp -Z -r` (gzip-transcoding; names stay `.json`, browsers
  decompress transparently).

## Deploy / infra

- [.github/workflows/deploy.yml](.github/workflows/deploy.yml): builds `app/`
  with `VITE_DATA_BASE_URL=https://storage.googleapis.com/brava-meta-analysis-public/browser`,
  deploys to Pages on push to `main`.
- [infra/cors.json](infra/cors.json): GET/HEAD from nikbaya.github.io,
  brava-genetics.github.io, localhost:5173/4173.
- Local dev: `cd app && npm run dev` → http://localhost:5173.

## Current state / open items (as of 2026-06-26)

- App is feature-complete for v1; production build ~360 KB JS / 113 KB gzipped,
  no console errors. Nothing committed yet (single `Initial commit` on `main`) —
  the user has NOT authorized commit/push.
- **Full data build running in background** (`make full`, ~45 min): phenotype
  files done, hash-sharded gene-file pass in progress → `pipeline/build/`.
- **BLOCKED — GCS upload:** active gcloud account
  (`nbaya@broadinstitute.org`) lacks `storage.objects.create` on the bucket
  (403). User must `gcloud auth login` with a write-capable account, then
  `cd pipeline && make upload` and
  `gsutil cors set ../infra/cors.json gs://brava-meta-analysis-public`.
- **TODO to go live:** finish full build → upload to GCS + set CORS → enable
  GitHub Pages (Source: GitHub Actions) → push to `main`.

