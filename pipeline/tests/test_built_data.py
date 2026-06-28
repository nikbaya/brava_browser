"""Integrity tests on the *emitted* JSON the website actually serves.

These run against the local build (pipeline/build) and verify the wire contract
end-to-end:

  * every columnar payload has internally-consistent array lengths and indices
    within the canonical ranges (so the frontend never indexes out of bounds);
  * the JSON is browser-valid — no Infinity/NaN literals;
  * meta indices line up (genes.json position == gene_idx; phenotypes.json
    position == pheno_idx used in the gene files);
  * **cross-layer consistency**: the per-gene files and the per-phenotype files
    are two views of the same numbers — for a sampled (gene, phenotype,
    ancestry, mask, maf) the lp/beta/se agree exactly. This is the single
    strongest guard that the numbers shown are the numbers computed.

Skips cleanly if `build/` is absent (run `make full` or `make sample` first).
"""

from __future__ import annotations

import json
import random
from pathlib import Path

import pytest

from common import ANCESTRY_NAMES, MASKS, MAFS

random.seed(20260628)

_RAISE_NONFINITE = dict(
    parse_constant=lambda c: (_ for _ in ()).throw(
        ValueError(f"non-finite JSON literal: {c!r}")
    )
)


def _load_json(path: Path):
    """json.loads that REJECTS Infinity/-Infinity/NaN (invalid for browsers)."""
    return json.loads(path.read_text(), **_RAISE_NONFINITE)


@pytest.fixture(scope="session")
def genes(build_dir: Path):
    return _load_json(build_dir / "meta" / "genes.json")


@pytest.fixture(scope="session")
def phenotypes(build_dir: Path):
    return _load_json(build_dir / "meta" / "phenotypes.json")["phenotypes"]


def _sample(paths: list[Path], k: int) -> list[Path]:
    return random.sample(paths, min(k, len(paths)))


# --------------------------------------------------------------------------- #
# meta indices                                                                 #
# --------------------------------------------------------------------------- #


def test_genes_index_well_formed(genes):
    n = len(genes["ids"])
    assert n > 15000  # ~20k protein-coding genes
    for key in ("ids", "symbols", "chr", "start", "end"):
        assert len(genes[key]) == n, f"genes.{key} length mismatch"
    assert len(set(genes["ids"])) == n  # ENSG ids unique
    assert all(c in {*(str(i) for i in range(1, 23)), "X", "Y"} for c in genes["chr"])


def test_phenotypes_index_well_formed(phenotypes):
    ids = [p["id"] for p in phenotypes]
    assert len(set(ids)) == len(ids)  # unique
    for p in phenotypes:
        assert p["type"] in ("binary", "quantitative")
        assert p["ancestries"], f"{p['id']} has no ancestries"
        assert set(p["ancestries"]) <= set(ANCESTRY_NAMES)
        assert "All" in p["ancestries"]  # cross-ancestry meta always present


# --------------------------------------------------------------------------- #
# columnar payload invariants                                                  #
# --------------------------------------------------------------------------- #

_PHENO_ARRAYS = (
    "gene_idx", "mask", "maf", "lp_burden", "lp_skat", "lp_skato",
    "lp_het", "beta", "se",
)
_GENE_ARRAYS = (
    "pheno", "anc", "mask", "maf", "lp_burden", "lp_skat", "lp_skato",
    "lp_het", "beta", "se",
)


def _check_arrays(payload, names, n):
    for name in names:
        assert len(payload[name]) == n, f"{name} length != n ({len(payload[name])}!={n})"


def _check_lp(payload):
    for col in ("lp_burden", "lp_skat", "lp_skato", "lp_het"):
        for v in payload[col]:
            assert v is None or v >= 0, f"{col} has negative -log10 p: {v}"


def test_phenotype_files_invariants(build_dir, genes):
    n_genes = len(genes["ids"])
    files = list((build_dir / "phenotype").glob("*.json"))
    assert files, "no phenotype files built"
    for path in _sample(files, 15):
        d = _load_json(path)
        _check_arrays(d, _PHENO_ARRAYS, d["n"])
        _check_lp(d)
        assert all(0 <= g < n_genes for g in d["gene_idx"])
        assert all(0 <= m < len(MASKS) for m in d["mask"])
        assert all(0 <= m < len(MAFS) for m in d["maf"])
        # filename PHENO.ANC.json must match payload
        stem = path.name[: -len(".json")]
        assert stem == f"{d['pheno']}.{d['anc']}"


def test_gene_files_invariants(build_dir, genes, phenotypes):
    n_pheno = len(phenotypes)
    files = list((build_dir / "gene").glob("*.json"))
    if not files:
        pytest.skip("gene files not built yet")
    for path in _sample(files, 30):
        d = _load_json(path)
        _check_arrays(d, _GENE_ARRAYS, d["n"])
        _check_lp(d)
        assert path.name == f"{d['id']}.json"
        assert all(0 <= p < n_pheno for p in d["pheno"])
        assert all(0 <= a < len(ANCESTRY_NAMES) for a in d["anc"])
        assert all(0 <= m < len(MASKS) for m in d["mask"])
        assert all(0 <= m < len(MAFS) for m in d["maf"])


# --------------------------------------------------------------------------- #
# cross-layer consistency: gene view == phenotype view                          #
# --------------------------------------------------------------------------- #


def _approx_eq(a, b) -> bool:
    if a is None or b is None:
        return a is b or a == b
    return abs(a - b) <= 1e-6 + 1e-6 * max(abs(a), abs(b))


def test_gene_and_phenotype_views_agree(build_dir, genes, phenotypes):
    """For a handful of (phenotype, ancestry) files, verify that the rows in the
    per-gene files carry identical numbers — proving index alignment and that
    both representations the site reads are the same underlying result."""
    gene_dir = build_dir / "gene"
    if not list(gene_dir.glob("*.json")):
        pytest.skip("gene files not built yet")

    id_to_gidx = {g: i for i, g in enumerate(genes["ids"])}
    pheno_idx = {p["id"]: i for i, p in enumerate(phenotypes)}
    anc_idx = {a: i for i, a in enumerate(ANCESTRY_NAMES)}

    pfiles = _sample(list((build_dir / "phenotype").glob("*.json")), 4)
    assert pfiles
    compared = 0
    for ppath in pfiles:
        pd = _load_json(ppath)
        pid, anc = pd["pheno"], pd["anc"]
        pidx, aidx = pheno_idx[pid], anc_idx[anc]

        # Index this phenotype view by (gene_idx, mask, maf).
        pview = {}
        for i in range(pd["n"]):
            pview[(pd["gene_idx"][i], pd["mask"][i], pd["maf"][i])] = i

        # Sample genes present in this phenotype file and cross-check.
        gidxs = list({pd["gene_idx"][i] for i in range(pd["n"])})
        gidx_to_id = {v: k for k, v in id_to_gidx.items()}
        for gidx in _sample(gidxs, 12):
            gpath = gene_dir / f"{gidx_to_id[gidx]}.json"
            if not gpath.exists():
                continue
            gd = _load_json(gpath)
            for j in range(gd["n"]):
                if gd["pheno"][j] != pidx or gd["anc"][j] != aidx:
                    continue
                key = (gidx, gd["mask"][j], gd["maf"][j])
                assert key in pview, f"{key} in gene file but not phenotype file"
                i = pview[key]
                for col in ("lp_burden", "lp_skat", "lp_skato", "lp_het", "beta", "se"):
                    assert _approx_eq(gd[col][j], pd[col][i]), (
                        f"{gidx_to_id[gidx]} {pid}.{anc} {col} "
                        f"gene={gd[col][j]} pheno={pd[col][i]}"
                    )
                    compared += 1
    assert compared > 0, "cross-layer check did not compare anything"
