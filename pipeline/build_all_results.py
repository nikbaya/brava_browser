"""Build the "all results" index: every (gene, phenotype, mask, maf, test) row
past the suggestive-significance threshold, one file per ancestry.

Unlike build_data.py's per-phenotype files (which carry every gene, letting
the client filter to what's significant), this keeps only rows that already
clear common.SIG_SUGGEST -- across 44 phenotypes x 6 masks x 2 MAFs x 3 tests x
~19,490 genes that collapses to tens of thousands of rows per ancestry, so the
output is still small enough to bundle with the app
(meta/all_results.{ANC}.json, like meta/exons/) instead of hosted on R2.
Powers the all-results page's genome-wide Manhattan across every trait with
zero extra network cost.

SIG_SUGGEST (1e-4), not the stricter SIG_GENE_CAUCHY (2.5e-6), is the
inclusion cutoff: measured on the real bucket, 2.5e-6 yields ~8.7k hit-rows
across all 44 phenotypes' cross-ancestry meta alone (~74 KB gzipped across all
7 ancestry shards) while 1e-4 yields ~2.3x that (~170 KB gzipped) -- still a
small fraction of the app's existing bundled meta (genes.json alone is 984 KB)
in exchange for showing the suggestive band too, not just genome-wide
significant hits. 1e-3 was measured at ~7.8x (~580 KB) and 1e-2 at ~50x
(~3.7 MB, and mostly noise at that point) -- see docs/ui-followups.md's
All-results entry for the full table.

Examples:
    # Sample: a couple of phenotypes, for local dev
    python build_all_results.py --out ../app/public/data --phenos LDLC,Height

    # Full run (needs gsutil access to the raw bucket; ~7.8 GiB download)
    python build_all_results.py --out ../app/public/data --phenos all
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import polars as pl

from build_data import GENE_KEYS, finite_round
from common import ANCESTRIES, SIG_SUGGEST, pivot_tests, read_gene_tsv
import math

LP_THRESH = -math.log10(SIG_SUGGEST)  # = 4.0, p < 1e-4
TEST_COLS = ["lp_burden", "lp_skat", "lp_skato"]  # index order matches TESTS.ts


def load_meta(out: Path):
    genes = pl.read_parquet(out / "meta" / "genes.parquet")
    ensg_to_idx = dict(zip(genes["id"].to_list(), genes["gene_idx"].to_list()))
    pheno_list = json.loads((out / "meta" / "phenotypes.json").read_text())[
        "phenotypes"
    ]
    pheno_idx = {p["id"]: i for i, p in enumerate(pheno_list)}
    pheno_anc = {p["id"]: p["ancestries"] for p in pheno_list}
    return ensg_to_idx, pheno_idx, pheno_anc


def melt_hits(piv: pl.DataFrame, pheno_idx: int) -> pl.DataFrame:
    """One pivoted (gene, mask, maf) row -> up to 3 hit rows (one per test that
    clears LP_THRESH). `beta` is always the IVW Burden effect (present on every
    pivoted row regardless of which test's p-value triggered the hit) --
    mirrors phenoRows/geneRows in lib/select.ts, which likewise show the Burden
    beta alongside whichever test's p-value the user has selected."""
    parts = [
        piv.filter(pl.col(lp_col) >= LP_THRESH).select(
            pl.col("ensg"),
            pl.col("mask_idx"),
            pl.col("maf_idx"),
            pl.lit(test_idx, dtype=pl.Int8).alias("test_idx"),
            pl.col(lp_col).alias("lp"),
            pl.col("beta"),
        )
        for test_idx, lp_col in enumerate(TEST_COLS)
    ]
    out = pl.concat(parts) if parts else piv.head(0)
    return out.with_columns(pl.lit(pheno_idx, dtype=pl.Int16).alias("pheno_idx"))


def write_all_results_file(df: pl.DataFrame, anc: str, ensg_to_idx: dict, out: Path) -> int:
    df = df.with_columns(
        pl.col("ensg").replace_strict(ensg_to_idx, default=None).alias("gene_idx")
    ).drop_nulls("gene_idx")
    df = df.with_columns(finite_round("beta")).sort(
        "gene_idx", "pheno_idx", "mask_idx", "maf_idx", "test_idx"
    )
    payload = {
        "anc": anc,
        "n": df.height,
        "pheno_idx": df["pheno_idx"].cast(pl.Int16).to_list(),
        "gene_idx": df["gene_idx"].cast(pl.Int32).to_list(),
        "mask_idx": df["mask_idx"].cast(pl.Int8).to_list(),
        "maf_idx": df["maf_idx"].cast(pl.Int8).to_list(),
        "test_idx": df["test_idx"].cast(pl.Int8).to_list(),
        "lp": df["lp"].to_list(),
        "beta": df["beta"].to_list(),
    }
    mdir = out / "meta"
    mdir.mkdir(parents=True, exist_ok=True)
    (mdir / f"all_results.{anc}.json").write_text(json.dumps(payload, separators=(",", ":")))
    return df.height


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--phenos", default="all", help="comma list or 'all'")
    args = ap.parse_args()

    ensg_to_idx, pheno_idx, pheno_anc = load_meta(args.out)
    suffix_of = {name: sfx for name, sfx in ANCESTRIES}
    phenos = sorted(pheno_idx) if args.phenos == "all" else args.phenos.split(",")

    hits_by_anc: dict[str, list[pl.DataFrame]] = {name: [] for name, _ in ANCESTRIES}

    for pheno in phenos:
        if pheno not in pheno_idx:
            print(f"  ! unknown phenotype {pheno!r}, skipping")
            continue
        for anc in pheno_anc[pheno]:
            df = read_gene_tsv(pheno, suffix_of[anc])
            if df is None:
                continue
            piv = pivot_tests(df, GENE_KEYS)
            hits = melt_hits(piv, pheno_idx[pheno])
            if hits.height:
                hits_by_anc[anc].append(hits)
            print(f"  {pheno}.{anc}: {hits.height} hits")

    for anc, parts in hits_by_anc.items():
        if not parts:
            continue
        n = write_all_results_file(pl.concat(parts), anc, ensg_to_idx, args.out)
        print(f"Wrote meta/all_results.{anc}.json: {n} rows")


if __name__ == "__main__":
    main()
