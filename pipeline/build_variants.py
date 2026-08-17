"""Build the variant-level (v2) JSON data files.

Unlike the gene-level ETL (Polars, tabular), variant VCFs are huge line-oriented
files (AFib meta alone = 2.47M rows), so this is a pure-stdlib *streaming* build:
each VCF is read exactly once, variants are interval-joined to Ensembl gene
bodies by position overlap (no functional annotations exist in these files), and
the results are emitted as compact columnar JSON.

Outputs (see docs/variant-v2-design.md):
  variant/gene/{ENSG}.json       All-meta, all phenotypes. First paint.
                                 shared coord table + sparse per-phenotype slices
                                 (beta/se/lp/nc/ne/i2/cq/ed).
  variant/gene/{ENSG}.anc.json   All 6 non-meta ancestries (beta/se/lp). Lazy,
                                 powers the per-variant forest plot.
  variant/overview/{PHENO}.json  Pixel-decimated genome-wide Manhattan.

Memory is bounded by hash-sharding the gene pass: pass 1 streams every VCF and
appends gene-assigned records to `--gene-shards` temp files keyed by hash(ensg);
pass 2 reads one shard at a time, groups by gene, and writes the gene files.

Examples:
    # Sample from already-downloaded local VCFs (dev/testing):
    python build_variants.py --out build --phenos AFib \
        --genes TTN,PCSK9,LDLR --local-dir /path/to/vcfs

    # Full run straight from GCS:
    python build_variants.py --out build --phenos all --genes all --gene-shards 16
"""

from __future__ import annotations

import argparse
import gzip
import heapq
import json
import math
import os
import shutil
import subprocess
from pathlib import Path

# --- constants (inlined; common.py imports polars which isn't on this path) ----

# See common.py's BUCKET for the rationale — default to the official
# Requester Pays bucket, override via BRAVA_RAW_BUCKET for a local/private
# mirror (kept out of the committed repo; see docs/local-notes.md).
BUCKET = os.environ.get("BRAVA_RAW_BUCKET", "gs://brava-meta-analysis")
VARIANT_PREFIX = f"{BUCKET}/variant"

# (name, file suffix). 'All' is the no-suffix cross-ancestry meta file. Index
# order is the wire contract with the frontend (constants.ts ANCESTRIES).
ANCESTRIES: list[tuple[str, str]] = [
    ("All", ""),
    ("EUR", "EUR"),
    ("AFR", "AFR"),
    ("AMR", "AMR"),
    ("EAS", "EAS"),
    ("SAS", "SAS"),
    ("non_EUR", "non_EUR"),
]
ANCESTRY_INDEX = {a: i for i, (a, _) in enumerate(ANCESTRIES)}
NON_META = [a for a, _ in ANCESTRIES if a != "All"]

CHROM_ORDER = {str(c): i for i, c in enumerate(list(range(1, 23)) + ["X", "Y"])}

FILE_TMPL = "{stem}_variant_meta_analysis_100_cutoff{suffix}.vcf.gz"

# The SAMPLE column's subfields are named by the per-row FORMAT column (f[8]).
# The order/subset VARIES by phenotype — quantitative traits omit NC (number of
# cases) — so positions must be resolved per file from FORMAT, never hard-coded.
# Fields we read: ES (beta), SE, LP (-log10 p), NC (cases), NE (effective N),
# I2 (heterogeneity), CQ (Cochran's Q -> -log10), ED (per-cohort direction).

# Overview decimation: retain every variant with lp >= this at full resolution;
# thin the null band to one point per (chrom, POS_BIN, lp rounded to 0.1).
OVERVIEW_KEEP_LP = 2.0
POS_BIN = 2_000_000  # ~1550 genome-wide x-bins (3.1Gb / 2Mb)


def pheno_stem(pheno: str) -> str:
    return pheno if pheno.endswith("_F") else f"{pheno}_ALL"


# --- numeric helpers ----------------------------------------------------------


def sig3(tok: str) -> float | None:
    """Parse to 3 significant figures; None for '.', non-finite."""
    if tok == "." or tok == "":
        return None
    x = float(tok)
    if not math.isfinite(x):
        return None
    if x == 0.0:
        return 0.0
    return round(x, 2 - math.floor(math.log10(abs(x))))


def lp2(tok: str) -> float | None:
    """-log10 p to 2 decimals (log-scale: ~2 sig figs of mantissa at any exp)."""
    if tok == "." or tok == "":
        return None
    x = float(tok)
    return round(x, 2) if math.isfinite(x) else None


def as_int(tok: str) -> int | None:
    if tok == "." or tok == "":
        return None
    x = float(tok)
    return int(x) if math.isfinite(x) else None


# --- gene interval index ------------------------------------------------------


class GeneIndex:
    """Sorted gene bodies per chromosome for a position-sweep overlap join."""

    def __init__(self, genes_json: Path):
        d = json.loads(genes_json.read_text())
        self.ids: list[str] = d["ids"]
        self.symbols: list[str] = d["symbols"]
        self.chr: list[str] = d["chr"]
        self.idx_of = {g: i for i, g in enumerate(self.ids)}
        # per chrom -> list of (start, end, gene_idx), sorted by start
        self.by_chrom: dict[str, list[tuple[int, int, int]]] = {}
        for i, ch in enumerate(d["chr"]):
            self.by_chrom.setdefault(ch, []).append(
                (d["start"][i], d["end"][i], i)
            )
        for ch in self.by_chrom:
            self.by_chrom[ch].sort()

    def resolve(self, tokens: list[str]) -> set[str] | None:
        """'all' or symbol/ENSG list -> set of ENSG ids (None = all)."""
        if tokens == ["all"]:
            return None
        allow: set[str] = set()
        sym_to_id = {s: self.ids[i] for i, s in enumerate(self.symbols)}
        for t in tokens:
            t = t.strip()
            if t:
                allow.add(sym_to_id.get(t, t))
        return allow


def sweep_overlaps(chrom_genes, positions):
    """Yield (variant_index, [gene_idx,...]) for position-sorted variants.

    chrom_genes: [(start,end,gene_idx)] sorted by start. positions: ascending
    variant positions. Active set is a min-heap keyed by end; a variant at pos
    overlaps exactly the genes with start<=pos and end>=pos.
    """
    heap: list[tuple[int, int]] = []  # (end, gene_idx)
    gi = 0
    ng = len(chrom_genes)
    for vi, pos in enumerate(positions):
        while gi < ng and chrom_genes[gi][0] <= pos:
            s, e, gidx = chrom_genes[gi]
            heapq.heappush(heap, (e, gidx))
            gi += 1
        while heap and heap[0][0] < pos:
            heapq.heappop(heap)
        yield vi, [g for _, g in heap]


# --- VCF streaming ------------------------------------------------------------


def vcf_lines(pheno: str, suffix: str, local_dir: Path | None):
    """Yield decompressed data lines (str) of a variant VCF, or None if absent."""
    name = FILE_TMPL.format(
        stem=pheno_stem(pheno), suffix=f".{suffix}" if suffix else ""
    )
    if local_dir is not None:
        path = local_dir / name
        if not path.exists():
            return None
        return _iter_local(path)
    return _iter_gsutil(f"{VARIANT_PREFIX}/{name}")


def _iter_local(path: Path):
    with gzip.open(path, "rt") as fh:
        for line in fh:
            if line[0] != "#":
                yield line


def _iter_gsutil(url: str):
    # `gsutil cat | gunzip` streamed; skip if the object doesn't exist.
    check = subprocess.run(["gsutil", "-q", "stat", url])
    if check.returncode != 0:
        return
    cat = subprocess.Popen(["gsutil", "cat", url], stdout=subprocess.PIPE)
    gz = subprocess.Popen(
        ["gzip", "-dc"], stdin=cat.stdout, stdout=subprocess.PIPE, text=True
    )
    cat.stdout.close()
    for line in gz.stdout:
        if line[0] != "#":
            yield line
    gz.wait()
    cat.wait()


# --- overview accumulation ----------------------------------------------------


class Overview:
    """Pixel-binned decimation of one phenotype's genome-wide meta results."""

    def __init__(self):
        self.chrom: list[int] = []
        self.pos: list[int] = []
        self.ref: list[str] = []
        self.alt: list[str] = []
        self.lp: list[float] = []
        self.beta: list[float | None] = []
        self.dr: list[int] = []  # sign(beta): 1 / -1 / 0
        self.gene: list[int] = []  # gene_idx or -1
        self._seen: set[tuple[int, int, int]] = set()

    def add(self, chrom_i, pos, ref, alt, lp, beta, gene_idx):
        if lp is None:
            return
        if lp < OVERVIEW_KEEP_LP:
            key = (chrom_i, pos // POS_BIN, round(lp * 10))
            if key in self._seen:
                return
            self._seen.add(key)
        d = 0 if beta is None or beta == 0 else (1 if beta > 0 else -1)
        self.chrom.append(chrom_i)
        self.pos.append(pos)
        self.ref.append(ref)
        self.alt.append(alt)
        self.lp.append(lp)
        self.beta.append(beta)
        self.dr.append(d)
        self.gene.append(gene_idx if gene_idx is not None else -1)

    def payload(self, pheno: str) -> dict:
        return {
            "pheno": pheno,
            "n": len(self.pos),
            "keep_lp": OVERVIEW_KEEP_LP,
            "chr": self.chrom,
            "pos": self.pos,
            "ref": self.ref,
            "alt": self.alt,
            "lp": self.lp,
            "beta": self.beta,
            "dir": self.dr,
            "gene_idx": self.gene,
        }


# --- pass 1: stream VCFs, stash gene-assigned records -------------------------

# Stash record TSV columns (see _emit_gene). ed has only [+-?] chars -> tab-safe.
STASH_COLS = "ensg pheno_idx anc_idx pos ref alt beta se lp nc ne i2 cq ed".split()


def _fmt(v) -> str:
    return "" if v is None else (repr(v) if isinstance(v, float) else str(v))


def pass1(
    phenos, pheno_idx, gidx, gene_allow, local_dir, tmp, shards, out,
    overview_only=False,
):
    shard_files = (
        [] if overview_only else [open(tmp / f"s{h}.tsv", "w") for h in range(shards)]
    )
    ov_dir = out / "variant" / "overview"
    ov_dir.mkdir(parents=True, exist_ok=True)
    allow_gidx = (
        None if gene_allow is None else {gidx.idx_of[g] for g in gene_allow if g in gidx.idx_of}
    )
    # Overview data only ever comes from the "All" (meta) file, so an
    # overview-only run can skip streaming the 6 ancestry-stratified VCFs
    # entirely (~7x less VCF volume) since they'd only feed the gene shards.
    ancestries = [("All", "")] if overview_only else ANCESTRIES
    n_assign = 0
    for pheno in phenos:
        pidx = pheno_idx[pheno]
        for anc, suffix in ancestries:
            aidx = ANCESTRY_INDEX[anc]
            is_meta = anc == "All"
            ov = Overview() if is_meta else None
            it = vcf_lines(pheno, suffix, local_dir)
            if it is None:
                continue
            n = _stream_file(
                it, pidx, aidx, gidx, allow_gidx, shard_files, shards, ov,
                overview_only,
            )
            if ov is not None:
                (ov_dir / f"{pheno}.json").write_text(
                    json.dumps(ov.payload(pheno), separators=(",", ":"))
                )
            n_assign += n
            print(f"  {pheno}.{anc}: {n} gene-assignments")
    for f in shard_files:
        f.close()
    return n_assign


def _stream_file(it, pidx, aidx, gidx, allow_gidx, shard_files, shards, ov, overview_only=False):
    """Stream one VCF (position-sorted), sweep-join per chromosome, stash rows."""
    n = 0
    cur_chrom: str | None = None
    # (pos, ref, alt, tokens, fpos) for current chromosome; fpos is the
    # FORMAT->index map in effect for that row (shared object, negligible cost).
    buf: list[tuple] = []
    fpos: dict[str, int] = {}
    cur_fmt: str | None = None

    def val(t: list[str], fp: dict[str, int], name: str) -> str:
        """SAMPLE subfield by FORMAT name; '.' if absent (missing = null)."""
        i = fp.get(name, -1)
        return t[i] if 0 <= i < len(t) else "."

    def flush(chrom):
        nonlocal n
        chrom_genes = gidx.by_chrom.get(chrom, [])
        positions = [b[0] for b in buf]
        for vi, genes in sweep_overlaps(chrom_genes, positions):
            pos, ref, alt, t, fp = buf[vi]
            beta = sig3(val(t, fp, "ES")); se = sig3(val(t, fp, "SE"))
            lp = lp2(val(t, fp, "LP"))
            if ov is not None:
                g0 = genes[0] if genes else None
                ov.add(CHROM_ORDER[chrom], pos, ref, alt, lp, beta, g0)
            if overview_only or not genes:
                continue
            nc = as_int(val(t, fp, "NC")); ne = as_int(val(t, fp, "NE"))
            i2 = sig3(val(t, fp, "I2")); cq = lp2(val(t, fp, "CQ"))
            ed = val(t, fp, "ED")
            for gi in genes:
                if allow_gidx is not None and gi not in allow_gidx:
                    continue
                ensg = gidx.ids[gi]
                rec = (
                    ensg, str(pidx), str(aidx), str(pos), ref, alt,
                    _fmt(beta), _fmt(se), _fmt(lp),
                    _fmt(nc), _fmt(ne), _fmt(i2), _fmt(cq), ed,
                )
                shard_files[hash(ensg) % shards].write("\t".join(rec) + "\n")
                n += 1

    for line in it:
        f = line.rstrip("\n").split("\t")
        raw_chrom = f[0]
        chrom = raw_chrom[3:] if raw_chrom.startswith("chr") else raw_chrom
        if chrom not in CHROM_ORDER:
            continue
        if f[8] != cur_fmt:  # resolve SAMPLE field positions from FORMAT
            cur_fmt = f[8]
            fpos = {name: i for i, name in enumerate(cur_fmt.split(":"))}
        if chrom != cur_chrom:
            if cur_chrom is not None:
                flush(cur_chrom)
            buf = []
            cur_chrom = chrom
        buf.append((int(f[1]), f[3], f[4], f[9].split(":"), fpos))
    if cur_chrom is not None and buf:
        flush(cur_chrom)
    return n


# --- pass 2: group shards by gene, emit gene files ---------------------------


def _num(s: str):
    return None if s == "" else float(s)


def pass2(tmp, shards, gidx, out, threshold):
    gdir = out / "variant" / "gene"
    gdir.mkdir(parents=True, exist_ok=True)
    n_genes = 0
    split_set: set[str] = set()
    for h in range(shards):
        path = tmp / f"s{h}.tsv"
        if not path.exists():
            continue
        by_gene: dict[str, list[list[str]]] = {}
        with open(path) as fh:
            for line in fh:
                r = line.rstrip("\n").split("\t")
                by_gene.setdefault(r[0], []).append(r)
        for ensg, rows in by_gene.items():
            _emit_gene(ensg, rows, gidx, gdir, split_set, threshold)
            n_genes += 1
    return n_genes, split_set


def _union_table(rows):
    """Sorted union of (pos,ref,alt) across a gene's rows -> (pos,ref,alt,idxmap)."""
    keys = {(int(r[3]), r[4], r[5]) for r in rows}
    ordered = sorted(keys)
    idxmap = {k: i for i, k in enumerate(ordered)}
    return (
        [k[0] for k in ordered],
        [k[1] for k in ordered],
        [k[2] for k in ordered],
        idxmap,
    )


def _meta_payload(ensg, chrom, meta_rows) -> dict:
    """All-meta payload: shared coord table + sparse per-phenotype slices."""
    pos, ref, alt, idxmap = _union_table(meta_rows)
    by_pheno: dict[str, dict] = {}
    for r in meta_rows:
        vi = idxmap[(int(r[3]), r[4], r[5])]
        sl = by_pheno.setdefault(
            r[1], {"idx": [], "beta": [], "se": [], "lp": [],
                   "nc": [], "ne": [], "i2": [], "cq": [], "ed": []}
        )
        sl["idx"].append(vi)
        sl["beta"].append(_num(r[6])); sl["se"].append(_num(r[7]))
        sl["lp"].append(_num(r[8])); sl["nc"].append(_num(r[9]))
        sl["ne"].append(_num(r[10])); sl["i2"].append(_num(r[11]))
        sl["cq"].append(_num(r[12])); sl["ed"].append(r[13] or None)
    return {"id": ensg, "chr": chrom, "nv": len(pos),
            "pos": pos, "ref": ref, "alt": alt, "by_pheno": by_pheno}


def _anc_payload(ensg, other_rows) -> dict:
    """Non-meta ancestry payload (beta/se/lp), grouped by ancestry then pheno."""
    posA, refA, altA, idxA = _union_table(other_rows)
    by_anc: dict[str, dict] = {}
    for r in other_rows:
        vi = idxA[(int(r[3]), r[4], r[5])]
        sl = by_anc.setdefault(r[2], {}).setdefault(
            r[1], {"idx": [], "beta": [], "se": [], "lp": []}
        )
        sl["idx"].append(vi)
        sl["beta"].append(_num(r[6])); sl["se"].append(_num(r[7]))
        sl["lp"].append(_num(r[8]))
    return {"id": ensg, "nv": len(posA),
            "pos": posA, "ref": refA, "alt": altA, "by_anc": by_anc}


def _dump(obj) -> str:
    return json.dumps(obj, separators=(",", ":"))


def _emit_gene(ensg, rows, gidx, gdir, split_set, threshold):
    """Write one gene's variant files.

    Small genes -> single {ENSG}.json (+ .anc.json) holding all phenotypes.
    Genes whose all-phenotype meta payload exceeds `threshold` bytes are split
    into per-phenotype {ENSG}.{pheno_idx}.json (+ .anc) and recorded in the
    bundled manifest so the frontend knows to fetch the per-phenotype form.
    """
    meta = [r for r in rows if r[2] == "0"]
    other = [r for r in rows if r[2] != "0"]
    gi = gidx.idx_of.get(ensg)
    chrom = gidx.chr[gi] if gi is not None else None

    full = _dump(_meta_payload(ensg, chrom, meta)) if meta else None
    if full is not None and len(full) <= threshold:
        (gdir / f"{ensg}.json").write_text(full)
        if other:
            (gdir / f"{ensg}.anc.json").write_text(_dump(_anc_payload(ensg, other)))
        return

    # Oversized (e.g. TTN): split by phenotype to keep every fetch small.
    split_set.add(ensg)
    meta_by_p: dict[str, list] = {}
    for r in meta:
        meta_by_p.setdefault(r[1], []).append(r)
    for p, rs in meta_by_p.items():
        (gdir / f"{ensg}.{p}.json").write_text(_dump(_meta_payload(ensg, chrom, rs)))
    other_by_p: dict[str, list] = {}
    for r in other:
        other_by_p.setdefault(r[1], []).append(r)
    for p, rs in other_by_p.items():
        (gdir / f"{ensg}.{p}.anc.json").write_text(_dump(_anc_payload(ensg, rs)))


# --- driver -------------------------------------------------------------------


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--phenos", default="all", help="comma list or 'all'")
    ap.add_argument("--genes", default="all", help="comma list (symbol/ENSG) or 'all'")
    ap.add_argument("--local-dir", type=Path, default=None,
                    help="read VCFs from this dir instead of GCS (testing)")
    ap.add_argument("--meta-dir", type=Path, default=None,
                    help="dir with genes.json/phenotypes.json (default: --out/meta)")
    ap.add_argument("--gene-shards", type=int, default=1)
    ap.add_argument("--split-threshold", type=int, default=800_000,
                    help="genes whose all-pheno meta JSON exceeds this many "
                         "bytes are split into per-phenotype files")
    ap.add_argument("--tmp", type=Path, default=None)
    ap.add_argument("--overview-only", action="store_true",
                    help="regenerate only variant/overview/{PHENO}.json (streams "
                         "just the 'All'-meta VCF per phenotype, skips the gene "
                         "pass entirely) — for adding/changing overview fields "
                         "without a full re-run over every ancestry VCF")
    args = ap.parse_args()

    meta_dir = args.meta_dir or (args.out / "meta")
    gidx = GeneIndex(meta_dir / "genes.json")
    pheno_list = json.loads((meta_dir / "phenotypes.json").read_text())["phenotypes"]
    pheno_idx = {p["id"]: i for i, p in enumerate(pheno_list)}

    phenos = (
        list(pheno_idx) if args.phenos == "all" else args.phenos.split(",")
    )
    phenos = [p for p in phenos if p in pheno_idx or print(f"  ! unknown {p!r}")]
    gene_allow = gidx.resolve(args.genes.split(",") if args.genes != "all" else ["all"])

    tmp = args.tmp or (args.out / "_tmp_variant")
    if tmp.exists():
        shutil.rmtree(tmp)
    tmp.mkdir(parents=True)

    n_anc = 1 if args.overview_only else len(ANCESTRIES)
    print(f"Pass 1: streaming {len(phenos)} phenotype(s) x {n_anc} anc")
    n_assign = pass1(
        phenos, pheno_idx, gidx, gene_allow, args.local_dir,
        tmp, args.gene_shards, args.out, args.overview_only,
    )
    print(f"  {n_assign} gene-assignments stashed")

    if args.overview_only:
        print("Pass 2: skipped (--overview-only)")
    else:
        print("Pass 2: grouping by gene")
        n_genes, split_set = pass2(
            tmp, args.gene_shards, gidx, args.out, args.split_threshold
        )
        print(f"Wrote {n_genes} gene files ({len(split_set)} split by phenotype)")

        # Manifest of split genes -> bundled with the app so the frontend picks
        # the per-phenotype fetch form for these (few) oversized genes.
        manifest = args.out / "meta"
        manifest.mkdir(parents=True, exist_ok=True)
        (manifest / "variant_split.json").write_text(
            _dump({"split": sorted(split_set)})
        )

    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
