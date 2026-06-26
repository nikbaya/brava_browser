"""Build the canonical gene index (meta/genes.json) from an Ensembl GTF.

Output is columnar and sorted by genomic position, so the array index doubles
as the `gene_idx` referenced by the phenotype data files and as a natural
Manhattan x-axis ordering.

Usage:
    python build_annotation.py --out ../app/public/data
"""

from __future__ import annotations

import argparse
import json
import re
import urllib.request
from pathlib import Path

import polars as pl

from common import CACHE_DIR, CHROM_ORDER

GTF_URL = (
    "https://ftp.ensembl.org/pub/release-110/gtf/homo_sapiens/"
    "Homo_sapiens.GRCh38.110.gtf.gz"
)

_ATTR = {
    "gene_id": re.compile(r'gene_id "([^".]+)'),
    "gene_name": re.compile(r'gene_name "([^"]+)"'),
    "gene_biotype": re.compile(r'gene_biotype "([^"]+)"'),
}


def download_gtf() -> Path:
    CACHE_DIR.mkdir(exist_ok=True)
    dest = CACHE_DIR / "ensembl_110.gtf.gz"
    if not dest.exists():
        print(f"Downloading {GTF_URL} …")
        urllib.request.urlretrieve(GTF_URL, dest)
    return dest


def parse_genes(gtf: Path) -> pl.DataFrame:
    rows: list[dict] = []
    import gzip

    with gzip.open(gtf, "rt") as fh:
        for line in fh:
            if line.startswith("#"):
                continue
            f = line.split("\t")
            if len(f) < 9 or f[2] != "gene":
                continue
            chrom = f[0]
            if chrom not in CHROM_ORDER:
                continue
            attrs = f[8]
            m_id = _ATTR["gene_id"].search(attrs)
            m_bt = _ATTR["gene_biotype"].search(attrs)
            if not m_id or not m_bt or m_bt.group(1) != "protein_coding":
                continue
            m_name = _ATTR["gene_name"].search(attrs)
            rows.append(
                {
                    "id": m_id.group(1),
                    "symbol": m_name.group(1) if m_name else "",
                    "chr": chrom,
                    "start": int(f[3]),
                    "end": int(f[4]),
                }
            )
    df = pl.DataFrame(rows)
    return df.sort(
        by=[pl.col("chr").replace_strict(CHROM_ORDER, default=99), "start"]
    )


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="../app/public/data", type=Path)
    args = ap.parse_args()

    df = parse_genes(download_gtf())
    print(f"{df.height} protein-coding genes")

    meta = args.out / "meta"
    meta.mkdir(parents=True, exist_ok=True)
    genes = {
        "ids": df["id"].to_list(),
        "symbols": df["symbol"].to_list(),
        "chr": df["chr"].to_list(),
        "start": df["start"].to_list(),
        "end": df["end"].to_list(),
    }
    (meta / "genes.json").write_text(json.dumps(genes, separators=(",", ":")))
    # Parquet copy for downstream builders (ensg -> gene_idx mapping).
    df.with_row_index("gene_idx").write_parquet(meta / "genes.parquet")
    print(f"Wrote {meta/'genes.json'} and genes.parquet")


if __name__ == "__main__":
    main()
