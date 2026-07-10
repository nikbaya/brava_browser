# Data follow-ups (upstream provenance issues)

Known quirks in the raw BRaVa meta-analysis outputs that the browser faithfully
reflects but that may warrant follow-up with the data producers. These are NOT
browser/pipeline bugs — the pipeline reads whatever fields the source files
contain and shows `—`/null when a field is absent.

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
