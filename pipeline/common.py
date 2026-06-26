"""Shared constants and helpers for the BRaVa browser ETL.

The canonical orderings here are a wire contract with the frontend
(app/src/lib/constants.ts) and the emitted JSON: integer indices into these
lists are used as compact keys in the data files. Append, never reorder.
"""

from __future__ import annotations

import gzip
import io
import subprocess
from pathlib import Path

import polars as pl

BUCKET = "gs://brava-meta-analysis-public"
GENE_PREFIX = f"{BUCKET}/gene"

# (name, file suffix). 'All' is the no-suffix cross-ancestry meta file.
ANCESTRIES: list[tuple[str, str]] = [
    ("All", ""),
    ("EUR", "EUR"),
    ("AFR", "AFR"),
    ("AMR", "AMR"),
    ("EAS", "EAS"),
    ("SAS", "SAS"),
    ("non_EUR", "non_EUR"),
]
ANCESTRY_NAMES = [a for a, _ in ANCESTRIES]
ANCESTRY_INDEX = {a: i for i, (a, _) in enumerate(ANCESTRIES)}

# Raw `Group` strings in canonical index order (must match constants.ts MASKS).
MASKS: list[str] = [
    "pLoF",
    "damaging_missense_or_protein_altering",
    "other_missense_or_protein_altering",
    "synonymous",
    "pLoF;damaging_missense_or_protein_altering",
    "pLoF;damaging_missense_or_protein_altering;other_missense_or_protein_altering;synonymous",
]
MASK_INDEX = {m: i for i, m in enumerate(MASKS)}

# MAF cutoff index order: 0 -> 0.001, 1 -> 0.0001.
MAFS = [0.001, 0.0001]
MAF_INDEX = {0.001: 0, 0.0001: 1, 1e-4: 1}

FILE_TMPL = "{pheno}_ALL_gene_meta_analysis_100_cutoff{suffix}.tsv.gz"

CHROM_ORDER = {str(c): i for i, c in enumerate(list(range(1, 23)) + ["X", "Y"])}

ROOT = Path(__file__).resolve().parent
CACHE_DIR = ROOT / ".cache"


def gene_file_url(pheno: str, suffix: str) -> str:
    name = FILE_TMPL.format(pheno=pheno, suffix=f".{suffix}" if suffix else "")
    return f"{GENE_PREFIX}/{name}"


def gsutil_ls(prefix: str) -> list[str]:
    out = subprocess.run(
        ["gsutil", "ls", prefix], capture_output=True, text=True, check=True
    )
    return [ln for ln in out.stdout.splitlines() if ln.strip()]


def list_phenotypes() -> list[str]:
    """Distinct phenotype abbreviations present in the gene/ prefix."""
    names: set[str] = set()
    for path in gsutil_ls(f"{GENE_PREFIX}/"):
        base = path.rsplit("/", 1)[-1]
        if "_ALL_gene_meta_analysis" in base:
            names.add(base.split("_ALL_gene_meta_analysis")[0])
    return sorted(names)


# Raw TSV schema (13 cols). We only parse what the browser needs.
_RAW_COLS = [
    "Region",
    "Group",
    "max_MAF",
    "Pvalue",
    "Stat",
    "type",
    "df",
    "sum_weights",
    "BETA_Burden",
    "chisq_het",
    "Pvalue_het",
    "SE_Burden",
    "class",
]


def read_gene_tsv(pheno: str, suffix: str) -> pl.DataFrame | None:
    """Stream a gzipped gene TSV from GCS into a tidy Polars frame.

    Returns one row per (gene, mask, maf, test-class) with: ensg, mask_idx,
    maf_idx, class, neglog10 p, beta, se. Returns None if the file is absent.
    """
    url = gene_file_url(pheno, suffix)
    proc = subprocess.run(["gsutil", "cat", url], capture_output=True)
    if proc.returncode != 0:
        return None
    raw = gzip.decompress(proc.stdout)
    df = pl.read_csv(
        io.BytesIO(raw),
        separator="\t",
        columns=[
            "Region", "Group", "max_MAF", "Pvalue", "type",
            "Pvalue_het", "BETA_Burden", "SE_Burden", "class",
        ],
        schema_overrides={
            "Region": pl.Utf8,
            "Group": pl.Utf8,
            "max_MAF": pl.Float64,
            "Pvalue": pl.Float64,
            "type": pl.Utf8,
            "Pvalue_het": pl.Float64,
            "BETA_Burden": pl.Float64,
            "SE_Burden": pl.Float64,
            "class": pl.Utf8,
        },
        null_values=["", "NA"],
    )

    def neglog10(col: str) -> pl.Expr:
        return (
            pl.when(pl.col(col) > 0)
            .then(-pl.col(col).log10())
            .otherwise(None)
            .round(2)
        )

    df = (
        df.with_columns(
            pl.col("Group").replace_strict(MASK_INDEX, default=None).alias("mask_idx"),
            pl.col("max_MAF").replace_strict(MAF_INDEX, default=None).alias("maf_idx"),
            neglog10("Pvalue").alias("lp"),
            neglog10("Pvalue_het").alias("lp_het"),
        )
        .drop_nulls(["mask_idx", "maf_idx"])
        .rename(
            {
                "Region": "ensg",
                "type": "typ",
                "BETA_Burden": "beta",
                "SE_Burden": "se",
                "class": "cls",
            }
        )
        .select(
            "ensg", "mask_idx", "maf_idx", "cls", "typ", "lp", "lp_het", "beta", "se"
        )
    )
    return df


# Within the Burden class there are two rows per key: the Stouffer combination
# (β only, no SE) and the inverse-variance-weighted meta, which carries the real
# SE_Burden and the heterogeneity test (Pvalue_het). We surface the IVW row.
IVW = "Inverse variance weighted"


def pivot_tests(df: pl.DataFrame, keys: list[str]) -> pl.DataFrame:
    """Collapse Burden/SKAT/SKAT-O rows into one row per `keys` with
    lp_burden / lp_skat / lp_skato, plus IVW Burden beta/se and het p (lp_het).
    """
    burden = df.filter(pl.col("cls") == "Burden")
    ivw = (
        burden.filter(pl.col("typ") == IVW)
        .group_by(keys)
        .agg(
            pl.col("lp").first().alias("lp_ivw"),
            pl.col("beta").first().alias("beta_ivw"),
            pl.col("se").first().alias("se"),
            pl.col("lp_het").first().alias("lp_het"),
        )
    )
    stf = (
        burden.filter(pl.col("typ") != IVW)
        .group_by(keys)
        .agg(
            pl.col("lp").first().alias("lp_stf"),
            pl.col("beta").first().alias("beta_stf"),
        )
    )
    # Prefer the IVW meta; fall back to Stouffer for p/beta if IVW is absent.
    burden_j = (
        ivw.join(stf, on=keys, how="full", coalesce=True)
        .with_columns(
            pl.coalesce("lp_ivw", "lp_stf").alias("lp_burden"),
            pl.coalesce("beta_ivw", "beta_stf").alias("beta"),
        )
        .select(keys + ["lp_burden", "beta", "se", "lp_het"])
    )
    skat = (
        df.filter(pl.col("cls") == "SKAT")
        .group_by(keys)
        .agg(pl.col("lp").first().alias("lp_skat"))
    )
    skato = (
        df.filter(pl.col("cls") == "SKAT-O")
        .group_by(keys)
        .agg(pl.col("lp").first().alias("lp_skato"))
    )
    return (
        burden_j.join(skat, on=keys, how="full", coalesce=True)
        .join(skato, on=keys, how="full", coalesce=True)
    )


def round_sig(expr: pl.Expr, sig: int = 4) -> pl.Expr:
    """Round a float expression to `sig` significant figures (None-safe)."""
    return expr.round_sig_figs(sig)
