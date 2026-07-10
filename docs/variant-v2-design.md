# Variant-level (v2) — storage feasibility & access architecture

Status: **design agreed** (grilling session, 2026-07-02). Not yet built.
Scope of this doc: whether variant-level results can be **stored on R2 within
the free tier** and served with **world-class, lightning responsiveness** — given
we **do not have variant functional annotations yet**.

## TL;DR verdict

**Storage is feasible with comfortable headroom.** Full browser footprint
projects to **~2.7 GB** (all 7 ancestries, full field set) → **~4–4.5 GB total**
alongside the shipped v1 gene-level data (~1.5 GB), against the **10 GB** R2
free-tier ceiling. Object count ~157k (well under the 1M Class-A budget). Storage
was never the binding constraint — **access architecture is**, and the design
below makes it lightning.

## What the raw data actually is (measured)

`gs://brava-meta-analysis-public/variant/` — **273 objects, 5.95 GiB gzipped**,
44 phenotypes × 7 ancestry tiers (`All` meta + EUR/AFR/AMR/EAS/SAS/non_EUR),
named `{PHENO}_ALL_variant_meta_analysis_100_cutoff.{ANC}.vcf.gz` (no ANC = `All`
cross-biobank meta). Phenotype set is **identical to v1's 44** (incl. `_F_`
strata) → indices align across gene- and variant-level.

Each VCF row = `CHROM POS ID REF ALT . . .` + a FORMAT/SAMPLE pair:

| Field | Meaning | Kept? |
|---|---|---|
| `ES` | effect size β (vs ALT allele) | ✅ |
| `SE` | standard error | ✅ |
| `LP` | −log10 p-value | ✅ |
| `NC` | number of cases (binary traits) | ✅ base |
| `NE` | effective sample size | ✅ base |
| `I2` | Cochran's I² (heterogeneity) | ✅ base only |
| `CQ` | Cochran's Q −log10 p (heterogeneity p) | ✅ base only |
| `ED` | per-study (22-biobank) direction string | ✅ base only |
| `NS` | raw N samples | ❌ (NE preferred) |
| `INFO` | **empty (`.`)** — no consequence, no gene, no annotation | — |

**Two critical gaps** driven by the data itself:
- **No functional annotations** (empty INFO) → variant→gene is by **position
  overlap** only; no per-variant consequence/mask coloring in v2.
- **No allele frequency/count** → a gnomAD-style AF column is impossible from
  this data.

## Measured sizing (worst case: AFib meta, 2.47M variants)

| Encoding | gz size |
|---|---|
| Raw `.vcf.gz` | 75.8 MB |
| Columnar JSON, baseline precision (β/SE 4dp, lp 3dp) | 25.1 MB |
| **Aggressive precision (β/SE 3 sig figs, lp 2dp)** | **20.1 MB** (−20%) |
| Base + NC+NE+I2+CQ (no ED) | 28.8 MB |
| ED alone | +4.4 MB |
| coords only (pos/ref/alt) | 8.2 MB |

lp distribution (2.47M): lp≥2 (p<.01) = 19.9k (0.81%); lp≥3 = 2.3k; only **3**
exceed the gene-mask Bonferroni line (lp≈6.9). The Manhattan is almost all null
grass with sparse peaks.

## Design decisions (the grilled tree)

1. **Annotation fork → design annotation-ready, ship position-only.** Reserve
   optional per-variant `gene_idx`/`consequence_idx`/`mask_idx` columns; backfill
   when BRaVa's upstream annotations are sourced. No reshaping needed later.
2. **Sharding unit → per-gene file + per-phenotype overview.** Mirrors v1's
   proven `gene/{ENSG}.json` model. Exome variants are ~all genic, so
   position-overlap gene assignment is near-complete today.
3. **Ancestry split → lazy-load, single file.** Base `variant/gene/{ENSG}.json`
   holds **All-meta only** (all phenotypes). A single lazy
   `variant/gene/{ENSG}.anc.json` holds **all 6 non-meta ancestries** (beta/se/lp)
   — one fetch powers every forest plot on the gene (halves object count vs
   per-ancestry files). Fetched only when a forest plot opens.
   **Oversized-gene split (implemented):** measured TTN at all 44 phenotypes is
   multi-MB, so genes whose all-phenotype meta JSON exceeds `--split-threshold`
   (default 800 KB) are split into per-phenotype `variant/gene/{ENSG}.{pheno_idx}.json`
   (+ `.{pheno_idx}.anc.json`) and listed in the bundled `meta/variant_split.json`
   manifest. ~99.5% of genes stay single-file; only the handful of giants split,
   so every fetch stays small and object count stays ~24k (Class-A safe).
4. **Encoding → shared coordinate table + sparse per-phenotype slices.** Gene's
   union of variants stored once (`pos[]`,`ref[]`,`alt[]`, sorted); each
   phenotype stores `idx[]`+`beta[]`+`se[]`+`lp[]`. Faster parse (integer indices
   vs re-parsing coordinate strings); real byte win on big genes. Consistent with
   v1's columnar wire contract.
5. **Precision → aggressive:** β/SE to 3 sig figs, lp to 2 dp (−20%,
   display-lossless — 2dp of −log10p resolves p mantissa to ~2 sig figs at any
   exponent). Raw VCFs linked for full precision.
6. **Field set:**
   - **Base (All-meta) file:** β, SE, lp, NC, NE, I2, CQ, ED. (Heterogeneity +
     22-biobank concordance are the meta-analysis "is this real?" differentiators;
     cheap at per-gene scale.)
   - **Per-ancestry files (lazy):** β, SE, lp only (forest plot needs no more).
7. **Overview file → pixel-binned decimation.** Retain **all lp≥2** at full res
   (~20k), plus ≤1 background point per (x-pixel × y-bin) (~30k) → ~50k points,
   few hundred KB/phenotype. Reconstructs the exact rendered Manhattan. Fields:
   `pos, lp, sign(β), gene_idx`. Click a peak → load that gene file.
8. **Variant→gene → overlap-all against Ensembl 110 gene bodies** (no padding).
   Multi-gene variants duplicated across files (negligible). No-gene variants kept
   in the overview with `gene_idx=null` (→ region view). Labeled position-based;
   a proxy for BRaVa's annotation-based assignment, correctable via fork (1).
9. **Search/lookup → coordinate/region parsing via the existing gene index.** No
   variant search index (would be multi-MB, breaks instant/offline search). rsID
   search deferred to annotation phase (needs dbSNP map — VCFs have no rsIDs).
   Search bar stays genes+phenotypes; variants reached through gene/Manhattan
   (gnomAD-style).
10. **Delivery → versioned-immutable + prefetch.** Serve under `browser/v2/…`
    with `Cache-Control: immutable, max-age=1y` (fixes v1 app/data drift; protects
    Class-B budget). Reuse v1 gzip-transcode upload + `getJSON` in-memory cache.
    **Prefetch** per-ancestry files on idle/hover and top-peak gene files from the
    overview — the "fast → lightning" differentiator.
11. **Build → extend the Polars ETL.** Reuse v1's exact gene + phenotype indexes.
    New piece: **variant→gene interval join** (sorted-merge / position-binning;
    Polars has no native range join). **Hash-shard by gene** (`--gene-shards`) to
    bound memory. Emit per-gene meta + per-gene per-ancestry + per-phenotype
    overview. Run offline (network-bound on ~6 GiB), upload via `rclone` to the
    `v2/` prefix.

## Storage budget (projected)

| Component | Est. gz |
|---|---|
| Per-gene All-meta (all 44 pheno, full base fields) | ~1.2 GB |
| Per-gene per-ancestry (6 non-meta tiers, β/SE/lp) | ~1.4 GB |
| Per-phenotype overviews (44) | ~tens of MB |
| **Variant-level subtotal** | **~2.7 GB** |
| + v1 gene-level (shipped) | ~1.5 GB |
| **Total vs 10 GB ceiling** | **~4.2 GB ✅** |

## Implementation status (2026-07-02)

**Done & verified (compile + build + data-serving):**
- `pipeline/build_variants.py` — stdlib streaming ETL (sweep interval-join,
  shared coord table, sparse slices, overview decimation, per-phenotype split +
  `meta/variant_split.json` manifest). Tested on the AFib sample.
- `pipeline/Makefile` — `sample-variants` / `full-variants` / `upload-variants`.
- Frontend data layer — `types.ts`, `config.ts` (`VARIANT_BASE`, versioned v2/),
  `client.ts` fetchers, `select.ts` (`variantRows`, `variantForest`).
- Gene-page variant view — `LocusZoom.tsx` (canvas), `VariantForest.tsx` (SVG),
  `GeneVariants.tsx` (table + orchestration), wired into `GenePage.tsx` keyed to
  the focused phenotype. `npm run build` passes (120 KB gz). Sample AFib data
  built into `app/public/data/variant`.

**Not yet built (tasks #6–#8):** phenotype-page variant Manhattan (overview file
is emitted but no UI consumes it), coordinate/region search routing, idle/hover
prefetch, real-browser render verification, and the full 44-phenotype data build
+ R2 upload.

## To validate at build time
- True worst-case gene (TTN) base-file size → confirm no phenotype-split needed.
- Actual multi-gene overlap duplication rate → confirm negligible.
- Coordinate-dedup byte savings on a real multi-phenotype gene → confirm the
  shared-table complexity pays (parse-speed justifies it regardless).
- Re-measure total gzipped output before upload to confirm <10 GB (per CLAUDE.md).
