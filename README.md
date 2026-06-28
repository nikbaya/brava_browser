# BRaVa browser

A fast, static browser for [Biobank Rare Variant Analysis
(BRaVa)](https://brava-genetics.github.io) consortium **gene-level** rare
coding-variant association results — gene-level meta-analysis of ~1.2M
individuals across 10 global biobanks. Modeled on gnomAD / Genebass.

- **Landing** — Google-style search over genes (symbol / Ensembl ID) and traits.
- **Gene page** — phenome-wide associations (PheWAS), a cross-ancestry **forest
  plot** (β ± 95% CI per ancestry + meta + heterogeneity p), and a sortable
  results table.
- **Phenotype page** — canvas **Manhattan** plot + virtualized results table;
  click any gene for its cross-ancestry forest.

Filter everything by ancestry (cross-ancestry meta · EUR/AFR/AMR/EAS/SAS/non-EUR),
variant mask, MAF cutoff, and test (Burden / SKAT / SKAT-O).

## Architecture

The raw data (~8 GB of gzipped TSVs in `gs://brava-meta-analysis-public/gene/`)
is too large to load in-browser, so the project is two halves:

1. **`pipeline/`** — a Python (Polars) ETL that transforms the raw TSVs into
   compact, columnar JSON: one file per gene, one per (phenotype × ancestry),
   plus small bundled metadata indexes. Output is published to a `browser/`
   prefix in the public GCS bucket.
2. **`app/`** — a React + Vite + TypeScript single-page app hosted on GitHub
   Pages. It bundles the small search indexes and fetches the per-gene /
   per-phenotype files from GCS over HTTPS (CORS).

```
GitHub Pages (app + meta indexes)
        │ fetch() + CORS
        ▼
gs://brava-meta-analysis-public/browser/{gene,phenotype,meta}/…
```

## Develop the app

```bash
cd app
npm install
npm run dev        # http://localhost:5173 (uses bundled sample data)
```

By default the app reads sample data from `app/public/data` (a few traits +
example genes, committed so the app runs offline). Point it at the full dataset
on GCS with `VITE_DATA_BASE_URL`:

```bash
VITE_DATA_BASE_URL=https://storage.googleapis.com/brava-meta-analysis-public/browser \
  npm run dev
```

## Build / refresh the data (`pipeline/`)

```bash
cd pipeline
pip install -r requirements.txt   # polars; needs gsutil authenticated

make meta      # gene + phenotype metadata indexes -> ../app/public/data/meta
make sample    # small local dataset for dev
make full      # full dataset -> ./build  (~45 min, sharded to bound memory)
make upload    # push ./build to gs://…/browser/ (gzip-transcoded; needs write access)
```

`make upload` requires `storage.objects.create` on the bucket; authenticate the
right account first (`gcloud auth login`). It uploads with `gsutil cp -Z` so the
JSON is gzip-transcoded (`Content-Encoding: gzip`) — object names stay `.json`
and browsers decompress transparently.

## Deploy

1. **CORS (once):** allow the Pages origin to fetch. Data is hosted on
   Cloudflare R2, so set the bucket's CORS policy in the dashboard (R2 →
   `brava-browser` → Settings → CORS Policy), pasting [infra/cors.json](infra/cors.json).
   The object-scoped R2 API token cannot edit CORS, so this is dashboard-only.
2. **Pages:** enable GitHub Pages → *Source: GitHub Actions*. Pushing to `main`
   runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml), which
   builds the app (with `VITE_DATA_BASE_URL` set to the GCS prefix) and deploys.

## Data notes

- Gene-level only (v1). Each (gene, mask, MAF) carries Burden / SKAT / SKAT-O
  p-values; effect size **β** and **SE** come from the inverse-variance-weighted
  Burden meta, along with the cross-cohort heterogeneity p (`Pvalue_het`).
- Gene symbols / positions are joined from Ensembl 110 (GRCh38); phenotype
  names, categories, and binary/quantitative class are parsed from the
  [BRaVa curation](https://github.com/BRaVa-genetics/BRaVa_curation) repo.
- Summary statistics only — **not for clinical use**.
