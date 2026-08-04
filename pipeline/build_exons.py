"""Build the gene-model (exon) index from the Ensembl GTF.

Variant-level results carry no functional annotations — variants are assigned to
genes purely by position overlap (see build_variants.py) — so the browser needs
exon structure to show *where* in a gene a variant falls. gnomAD's API is the
obvious source but is rate-limited to 10 requests/60s, which is unusable at page
load; the same information is already in the Ensembl 110 GTF that
build_annotation.py downloads, in the same release and coordinate system as the
gene index.

One transcript per gene: MANE Select where it exists, else Ensembl canonical
(this is also what gnomAD displays by default).

Output is sharded by chromosome (meta/exons/chr{N}.json) so the gene page fetches
~40 KB instead of a single multi-MB blob. Exon/CDS intervals are flat
[offset, length, offset, length, …] pairs relative to the transcript start to
keep the numbers small.

Usage:
    python build_exons.py --out ../app/public/data
"""

from __future__ import annotations

import argparse
import gzip
import json
import re
from collections import defaultdict
from pathlib import Path

from common import CHROM_ORDER, ensembl_gtf

_GENE_ID = re.compile(r'gene_id "([^".]+)')
_TX_ID = re.compile(r'transcript_id "([^".]+)')

# Transcript preference: lower rank wins. MANE Select is a single well-defined
# transcript agreed between Ensembl and RefSeq; Ensembl canonical is the fallback
# for the handful of genes without one.
_MANE, _CANONICAL = 0, 1
_SRC_NAME = {_MANE: "mane_select", _CANONICAL: "ensembl_canonical"}


def parse_transcripts(gtf: Path, keep_genes: set[str]) -> dict[str, dict]:
    """Single streaming pass: collect exons/CDS for candidate transcripts.

    Ensembl GTFs list a transcript line before its own exon/CDS lines, but we
    don't rely on ordering: we accumulate intervals for every MANE Select /
    Ensembl canonical transcript (at most two per gene, usually the same one) and
    resolve the winner per gene at the end.
    """
    # transcript_id -> {gene, chr, strand, rank, exon: [(s,e)], cds: [(s,e)]}
    cand: dict[str, dict] = {}
    # gene_id -> best (rank, transcript_id)
    best: dict[str, tuple[int, str]] = {}
    n_lines = 0

    with gzip.open(gtf, "rt") as fh:
        for line in fh:
            if line[0] == "#":
                continue
            n_lines += 1
            # Cheap prefilter before the expensive split/regex work: only three
            # feature types matter, and only tagged transcripts are candidates.
            f = line.split("\t", 9)
            if len(f) < 9:
                continue
            feat = f[2]
            if feat == "transcript":
                attrs = f[8]
                if 'tag "MANE_Select"' in attrs:
                    rank = _MANE
                elif 'tag "Ensembl_canonical"' in attrs:
                    rank = _CANONICAL
                else:
                    continue
                chrom = f[0]
                if chrom not in CHROM_ORDER:
                    continue
                m_g = _GENE_ID.search(attrs)
                m_t = _TX_ID.search(attrs)
                if not m_g or not m_t or m_g.group(1) not in keep_genes:
                    continue
                gene, tx = m_g.group(1), m_t.group(1)
                cand[tx] = {
                    "gene": gene,
                    "chr": chrom,
                    "strand": -1 if f[6] == "-" else 1,
                    "rank": rank,
                    "exon": [],
                    "cds": [],
                }
                prev = best.get(gene)
                if prev is None or rank < prev[0]:
                    best[gene] = (rank, tx)
            elif feat == "exon" or feat == "CDS":
                m_t = _TX_ID.search(f[8])
                if not m_t:
                    continue
                rec = cand.get(m_t.group(1))
                if rec is None:
                    continue
                rec["exon" if feat == "exon" else "cds"].append(
                    (int(f[3]), int(f[4]))
                )

    print(f"  scanned {n_lines:,} GTF records, {len(cand):,} candidate transcripts")
    return {gene: {**cand[tx], "tx": tx} for gene, (_, tx) in best.items()}


def flat_intervals(spans: list[tuple[int, int]], origin: int) -> list[int]:
    """[(start,end), …] -> flat [offset, length, …] relative to `origin`.

    GTF coordinates are 1-based inclusive, so length = end - start + 1.
    """
    out: list[int] = []
    for s, e in sorted(spans):
        out.append(s - origin)
        out.append(e - s + 1)
    return out


def build_shards(models: dict[str, dict]) -> dict[str, dict]:
    shards: dict[str, dict] = defaultdict(dict)
    for gene, rec in models.items():
        exons = rec["exon"]
        if not exons:
            continue
        origin = min(s for s, _ in exons)
        shards[rec["chr"]][gene] = {
            "tx": rec["tx"],
            "src": _SRC_NAME[rec["rank"]],
            "strand": rec["strand"],
            "start": origin,
            "exons": flat_intervals(exons, origin),
            "cds": flat_intervals(rec["cds"], origin),
        }
    return shards


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="../app/public/data", type=Path)
    args = ap.parse_args()

    # Restrict to the genes in the canonical index so gene-page lookups always
    # resolve and we don't ship models for genes with no results. Reads
    # genes.json (not the parquet) so this runs off a checked-out repo alone.
    index = json.loads((args.out / "meta" / "genes.json").read_text())
    keep = set(index["ids"])
    print(f"{len(keep):,} genes in the canonical index")

    models = parse_transcripts(ensembl_gtf(), keep)
    n_mane = sum(1 for r in models.values() if r["rank"] == _MANE)
    print(
        f"  {len(models):,} gene models "
        f"({n_mane:,} MANE Select, {len(models) - n_mane:,} Ensembl canonical)"
    )
    missing = keep - set(models)
    if missing:
        print(f"  ! {len(missing):,} indexed genes have no transcript model")

    shards = build_shards(models)
    edir = args.out / "meta" / "exons"
    edir.mkdir(parents=True, exist_ok=True)
    for old in edir.glob("chr*.json"):
        old.unlink()

    total = 0
    for chrom in sorted(shards, key=lambda c: CHROM_ORDER[c]):
        payload = {"chr": chrom, "genes": shards[chrom]}
        path = edir / f"chr{chrom}.json"
        path.write_text(json.dumps(payload, separators=(",", ":")))
        total += path.stat().st_size
        print(f"  chr{chrom}: {len(shards[chrom]):,} genes, {path.stat().st_size/1024:.0f} KB")
    print(f"Wrote {len(shards)} shards to {edir} ({total/1024/1024:.2f} MB total)")


if __name__ == "__main__":
    main()
