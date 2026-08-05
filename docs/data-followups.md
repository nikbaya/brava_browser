# Data follow-ups (upstream provenance issues)

Known quirks in the raw BRaVa meta-analysis outputs that the browser faithfully
reflects but that may warrant follow-up with the data producers. These are NOT
browser/pipeline bugs — the pipeline reads whatever fields the source files
contain and shows `—`/null when a field is absent.

## GPT is highly significant for alanine transaminase for all non-EUR but completely missing in EUR.

It does have a defined burden beta so I suspect it's simply an underflow error with the EUR and ALL p-values. In this case, we should represent it as <1e-300 in tables and -log10p = 300 in the Manhattan (with label showing p<1e-300).

## Check sample counts — RESOLVED (not a bug; the two numbers count different things)

The About page shows **1.25M participants** in the stat tile and **1,119,948**
in the "All" meta pie. Both are computed from
[biobanks.json](../app/public/data/meta/biobanks.json), but from *different
supplementary tables* of the flagship paper (see
[build_biobanks.py](../pipeline/build_biobanks.py)):

| Figure | Source | Value |
|---|---|---|
| Stat tile "Participants" | Σ Table **S3** `Sample size` (`b.sample_size`) | 1,247,000 → `fmtCount` → **1.25M** |
| "All" meta pie total | Σ Table **S8** per-biobank×ancestry `N`, over the 5 superpops | **1,119,948** |
| (S8 grand total) | as above **+ 309 MID** (CCPM), which the pies drop | 1,120,257 |

Three separate causes, in order of size:

1. **S3 is rounded, S8 is exact.** Every S3 sample size is a round number
   (500,000 / 400,000 / 90,000 / 78,000 / 45,000×3 / 31,000 / 10,000 / 3,000).
   It is the *approximate biobank size*, not the analyzed N. Proof that it is
   not merely a superset: for three biobanks the S8 ancestry sum **exceeds**
   the S3 figure (CCPM 91,222 > 90,000; MGBB 49,067 > 45,000; BBJ 10,245 >
   10,000). So `1.25M` is a sum of rounded numbers presented to 3 sig figs —
   false precision.
2. **Different quantity.** S8 counts ancestry-assigned sequenced samples; S3
   counts biobank participants. Neither is the per-phenotype analyzed N (that
   lives in `pheno_sizes.json` and is smaller still).
3. **MID is excluded from the pies** (`SUPERPOPS` in
   [constants.ts](../app/src/lib/constants.ts) has only EUR/AFR/AMR/EAS/SAS),
   dropping CCPM's 309 Middle Eastern samples: 1,120,257 − 309 = 1,119,948.

**The manuscript says "over 1.2 million" / "~1.2 million individuals"** across
the ten biobanks — i.e. the S3-style total, quoted deliberately loosely.

**Fix direction:** the stat tile should not report a 3-sig-fig figure derived by
summing rounded inputs. Prefer the paper's own wording (`~1.2M`), or show the
exact S8 count (1,120,257) and label it "sequenced samples". Consider adding MID
to the pies (or a footnote) so the pie total and any quoted grand total agree.


## FemInf_F (female infertility): missing NS / NC / NE at variant level

**Observed:** N-effective (NEFF) is blank for variant-level female-infertility
results (e.g. VWA5B1, ENSG00000158816). Cases (NC) and N-samples (NS) are blank
too.

**Cause:** the variant meta-analysis VCF
`FemInf_F_variant_meta_analysis_100_cutoff*.vcf.gz` was produced with a
**reduced per-variant FORMAT**:

```
FemInf_F : ES:SE:LP:I2:CQ:ED            ← no NS, NC, NE
normal   : NS:NC:ES:SE:LP:NE:I2:CQ:ED   (binary; quant drops NC only)
```

It carries only effect size, SE, −log10 p, I², Cochran's Q, and the per-cohort
direction string. **FemInf_F is the only trait affected** — the other five
female-specific `_F` traits (BenCervUterNeo_F, BreastCanc_F, CervCanc_F,
EFRMB_F, MatHem_F) all include NS/NC/NE.

**Impact:** the browser shows `—` for NEFF (and cases/NS) on female-infertility
variant rows. Nothing to fix on our side — the field isn't in the source VCF.

**Follow-up:** ask the BRaVa meta-analysis producers whether FemInf_F can be
re-exported with the standard FORMAT (including NE) so sample sizes display like
every other trait. Until then, consider a small tooltip noting "not reported for
this trait" if it causes confusion.

_Scope note:_ only the **variant-level** FemInf_F file was checked. Worth
confirming whether the **gene-level** FemInf_F output has the same gap.
