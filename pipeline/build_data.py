"""Build the per-phenotype and per-gene JSON data files in a single pass.

For each (phenotype, ancestry) raw TSV we:
  * pivot the Burden/SKAT/SKAT-O rows into one row per (gene, mask, maf),
  * write phenotype/{PHENO}.{ANC}.json  (drives Manhattan + table),
  * stash the rows (tagged with pheno/anc index) to a temp parquet.
Then we scan all temp parquets, group by gene, and write gene/{ENSG}.json
(drives the gene page).

Examples:
    # Sample: a few phenotypes, gene files only for the example genes
    python build_data.py --out ../app/public/data \
        --phenos LDLC,T2Diab,Height,CAD,AFib \
        --genes PCSK9,LDLR,APOB,TTN,GIGYF1,BRCA2,APOC3,ANGPTL3,ASGR1,GCK

    # Full run
    python build_data.py --out build --phenos all --genes all
"""

from __future__ import annotations

import argparse
import json
import shutil
from pathlib import Path

import polars as pl

from common import ANCESTRIES, ANCESTRY_INDEX, pivot_tests, read_gene_tsv, round_sig

GENE_KEYS = ["ensg", "mask_idx", "maf_idx"]


def load_meta(out: Path):
    genes = pl.read_parquet(out / "meta" / "genes.parquet")
    ensg_to_idx = dict(zip(genes["id"].to_list(), genes["gene_idx"].to_list()))
    pheno_list = json.loads((out / "meta" / "phenotypes.json").read_text())[
        "phenotypes"
    ]
    pheno_idx = {p["id"]: i for i, p in enumerate(pheno_list)}
    pheno_anc = {p["id"]: p["ancestries"] for p in pheno_list}
    return ensg_to_idx, pheno_idx, pheno_anc


def write_phenotype_file(
    df: pl.DataFrame, pheno: str, anc: str, ensg_to_idx: dict, out: Path
) -> int:
    """df: pivoted rows for one (pheno, anc). Returns rows written."""
    df = df.with_columns(
        pl.col("ensg").replace_strict(ensg_to_idx, default=None).alias("gene_idx")
    ).drop_nulls("gene_idx")
    df = df.with_columns(
        round_sig(pl.col("beta")).alias("beta"),
        round_sig(pl.col("se")).alias("se"),
    ).sort("gene_idx", "mask_idx", "maf_idx")

    payload = {
        "pheno": pheno,
        "anc": anc,
        "n": df.height,
        "gene_idx": df["gene_idx"].cast(pl.Int32).to_list(),
        "mask": df["mask_idx"].cast(pl.Int8).to_list(),
        "maf": df["maf_idx"].cast(pl.Int8).to_list(),
        "lp_burden": df["lp_burden"].to_list(),
        "lp_skat": df["lp_skat"].to_list(),
        "lp_skato": df["lp_skato"].to_list(),
        "lp_het": df["lp_het"].to_list(),
        "beta": df["beta"].to_list(),
        "se": df["se"].to_list(),
    }
    pdir = out / "phenotype"
    pdir.mkdir(parents=True, exist_ok=True)
    (pdir / f"{pheno}.{anc}.json").write_text(
        json.dumps(payload, separators=(",", ":"))
    )
    return df.height


def _write_gene_partition(df: pl.DataFrame, gdir: Path) -> int:
    df = df.with_columns(
        round_sig(pl.col("beta")).alias("beta"),
        round_sig(pl.col("se")).alias("se"),
    ).sort("ensg", "pheno_idx", "mask_idx", "maf_idx")
    count = 0
    for ensg, g in df.group_by("ensg", maintain_order=True):
        ensg = ensg[0] if isinstance(ensg, tuple) else ensg
        payload = {
            "id": ensg,
            "n": g.height,
            "pheno": g["pheno_idx"].cast(pl.Int16).to_list(),
            "anc": g["anc_idx"].cast(pl.Int8).to_list(),
            "mask": g["mask_idx"].cast(pl.Int8).to_list(),
            "maf": g["maf_idx"].cast(pl.Int8).to_list(),
            "lp_burden": g["lp_burden"].to_list(),
            "lp_skat": g["lp_skat"].to_list(),
            "lp_skato": g["lp_skato"].to_list(),
            "lp_het": g["lp_het"].to_list(),
            "beta": g["beta"].to_list(),
            "se": g["se"].to_list(),
        }
        (gdir / f"{ensg}.json").write_text(json.dumps(payload, separators=(",", ":")))
        count += 1
    return count


def write_gene_files(
    tmp: Path, out: Path, gene_allow: set[str] | None, shards: int = 1
) -> int:
    """Group all stashed rows by gene and emit gene/{ENSG}.json.

    For the full dataset the concatenated frame is ~65M rows, so we process it in
    `shards` hash partitions of genes to bound peak memory (each pass re-scans the
    temp parquets but only collects its slice).
    """
    gdir = out / "gene"
    gdir.mkdir(parents=True, exist_ok=True)
    base = pl.scan_parquet(tmp / "*.parquet")
    if gene_allow is not None:
        base = base.filter(pl.col("ensg").is_in(list(gene_allow)))

    count = 0
    for s in range(shards):
        lf = base
        if shards > 1:
            lf = lf.filter(pl.col("ensg").hash(0) % shards == s)
        df = lf.collect()
        if df.is_empty():
            continue
        count += _write_gene_partition(df, gdir)
        del df
    return count


def resolve_gene_allow(genes_arg: str, out: Path) -> set[str] | None:
    if genes_arg == "all":
        return None
    meta = pl.read_parquet(out / "meta" / "genes.parquet")
    sym_to_id = dict(zip(meta["symbol"].to_list(), meta["id"].to_list()))
    allow = set()
    for tok in genes_arg.split(","):
        tok = tok.strip()
        if not tok:
            continue
        allow.add(sym_to_id.get(tok, tok))  # accept symbol or ENSG
    return allow


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--phenos", default="all", help="comma list or 'all'")
    ap.add_argument("--genes", default="all", help="comma list (symbol/ENSG) or 'all'")
    ap.add_argument("--tmp", type=Path, default=None)
    ap.add_argument("--skip-genes", action="store_true")
    ap.add_argument(
        "--gene-shards",
        type=int,
        default=1,
        help="hash-partition the gene pass to bound memory (use ~16 for full)",
    )
    args = ap.parse_args()

    ensg_to_idx, pheno_idx, pheno_anc = load_meta(args.out)
    suffix_of = {name: sfx for name, sfx in ANCESTRIES}

    phenos = (
        sorted(pheno_idx) if args.phenos == "all" else args.phenos.split(",")
    )
    tmp = args.tmp or (args.out / "_tmp")
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir(parents=True)

    total_pheno_files = 0
    for pheno in phenos:
        if pheno not in pheno_idx:
            print(f"  ! unknown phenotype {pheno!r}, skipping")
            continue
        for anc in pheno_anc[pheno]:
            df = read_gene_tsv(pheno, suffix_of[anc])
            if df is None:
                continue
            piv = pivot_tests(df, GENE_KEYS)
            n = write_phenotype_file(piv, pheno, anc, ensg_to_idx, args.out)
            total_pheno_files += 1
            # Stash for the gene pass.
            piv.with_columns(
                pl.lit(pheno_idx[pheno]).alias("pheno_idx"),
                pl.lit(ANCESTRY_INDEX[anc]).alias("anc_idx"),
            ).write_parquet(tmp / f"{pheno}.{anc}.parquet")
            print(f"  {pheno}.{anc}: {n} rows")

    print(f"Wrote {total_pheno_files} phenotype files")

    if not args.skip_genes:
        allow = resolve_gene_allow(args.genes, args.out)
        n_genes = write_gene_files(tmp, args.out, allow, shards=args.gene_shards)
        print(f"Wrote {n_genes} gene files")

    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
