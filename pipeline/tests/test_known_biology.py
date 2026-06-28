"""Sanity checks against established biology on the built data.

If the gene/phenotype join, the pivot, or the beta sign convention were wrong,
these well-known lipid associations would break. They are the human-readable
counterpart to the structural tests: not just internally consistent, but
*correct*.

  * PCSK9 loss-of-function LOWERS LDL cholesterol (beta < 0), very significant.
  * LDLR loss-of-function RAISES LDL cholesterol (beta > 0) — familial
    hypercholesterolemia — very significant.
  * The synonymous mask (calibration control) should be far less significant
    than the damaging masks for these genes.

Convention under test: beta > 0 = trait-increasing, beta < 0 = decreasing.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from common import ANCESTRY_INDEX, MASK_INDEX

PHENO = "LDLC"
ALL = ANCESTRY_INDEX["All"]
PLOF = MASK_INDEX["pLoF"]
PLOF_DM = MASK_INDEX["pLoF;damaging_missense_or_protein_altering"]
SYN = MASK_INDEX["synonymous"]
MAF0 = 0  # <0.001


@pytest.fixture(scope="session")
def ctx(build_dir: Path):
    genes = json.loads((build_dir / "meta" / "genes.json").read_text())
    sym_to_id = {s: i for s, i in zip(genes["symbols"], genes["ids"]) if s}
    phenos = json.loads((build_dir / "meta" / "phenotypes.json").read_text())[
        "phenotypes"
    ]
    pidx = {p["id"]: i for i, p in enumerate(phenos)}
    if PHENO not in pidx:
        pytest.skip(f"{PHENO} not in build")
    return build_dir, sym_to_id, pidx[PHENO]


def _rows_for(build_dir: Path, ensg: str, pheno_idx: int, anc: int, mask: int, maf: int):
    path = build_dir / "gene" / f"{ensg}.json"
    if not path.exists():
        pytest.skip(f"gene file {ensg} not built")
    d = json.loads(path.read_text())
    out = []
    for i in range(d["n"]):
        if (
            d["pheno"][i] == pheno_idx
            and d["anc"][i] == anc
            and d["mask"][i] == mask
            and d["maf"][i] == maf
        ):
            out.append({"lp_skato": d["lp_skato"][i], "beta": d["beta"][i]})
    return out


def _best(build_dir, ensg, pidx, masks):
    """Most-significant (lp_skato, beta) across the given damaging masks."""
    rows = []
    for m in masks:
        rows += _rows_for(build_dir, ensg, pidx, ALL, m, MAF0)
    rows = [r for r in rows if r["lp_skato"] is not None]
    if not rows:
        pytest.skip("no damaging-mask rows for gene×LDLC")
    return max(rows, key=lambda r: r["lp_skato"])


def test_pcsk9_lowers_ldl(ctx):
    build_dir, sym_to_id, pidx = ctx
    if "PCSK9" not in sym_to_id:
        pytest.skip("PCSK9 not in gene index")
    r = _best(build_dir, sym_to_id["PCSK9"], pidx, [PLOF, PLOF_DM])
    assert r["lp_skato"] > 8, f"PCSK9×LDLC not significant: lp={r['lp_skato']}"
    assert r["beta"] is not None and r["beta"] < 0, (
        f"PCSK9 LoF should LOWER LDL (beta<0), got {r['beta']}"
    )


def test_ldlr_raises_ldl(ctx):
    build_dir, sym_to_id, pidx = ctx
    if "LDLR" not in sym_to_id:
        pytest.skip("LDLR not in gene index")
    r = _best(build_dir, sym_to_id["LDLR"], pidx, [PLOF, PLOF_DM])
    assert r["lp_skato"] > 8, f"LDLR×LDLC not significant: lp={r['lp_skato']}"
    assert r["beta"] is not None and r["beta"] > 0, (
        f"LDLR LoF should RAISE LDL (beta>0), got {r['beta']}"
    )


def test_synonymous_control_weaker_than_damaging(ctx):
    """Calibration control: synonymous variants in PCSK9 should be far less
    significant for LDL than the damaging masks (no real signal)."""
    build_dir, sym_to_id, pidx = ctx
    if "PCSK9" not in sym_to_id:
        pytest.skip("PCSK9 not in gene index")
    ensg = sym_to_id["PCSK9"]
    damaging = _best(build_dir, ensg, pidx, [PLOF, PLOF_DM])["lp_skato"]
    syn_rows = [
        r["lp_skato"]
        for r in _rows_for(build_dir, ensg, pidx, ALL, SYN, MAF0)
        if r["lp_skato"] is not None
    ]
    if not syn_rows:
        pytest.skip("no synonymous row for PCSK9×LDLC")
    assert max(syn_rows) < damaging
