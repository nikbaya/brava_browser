"""Unit tests for the core ETL transform (common.parse_gene_tsv + pivot_tests).

These pin down the exact, easy-to-silently-break invariants that determine
whether the numbers on the website are correct:

  * the Burden effect (beta) **and** SE are taken from the Inverse-Variance-
    Weighted row, NOT the Stouffer row (the historical `.first()` bug that
    dropped SE and stored the wrong beta);
  * p-values are stored as -log10(p), rounded to 2 dp, and round-trip;
  * Group/max_MAF map to the canonical mask/maf indices, and unknown values
    are dropped;
  * non-finite SE/beta (degenerate SAIGE strata) become null, never the
    invalid-JSON literals Infinity/NaN.

The transform is exercised with a hand-built synthetic TSV, so it runs offline
with no gsutil and no network.
"""

from __future__ import annotations

import math

import polars as pl
import pytest

from common import parse_gene_tsv, pivot_tests
from build_data import GENE_KEYS, finite_round

# 13-column raw schema, header + rows. One gene (G1) at the pLoF mask, MAF 0.001,
# carries the full Burden(IVW)/Burden(Stouffer)/SKAT/SKAT-O quartet. A second
# block (G1, synonymous, MAF 1e-4) and an unknown Group ("garbage") check the
# index mapping + row dropping. G2 has only a Stouffer Burden row (IVW absent).
HEADER = (
    "Region\tGroup\tmax_MAF\tPvalue\tStat\ttype\tdf\tsum_weights\t"
    "BETA_Burden\tchisq_het\tPvalue_het\tSE_Burden\tclass"
)


def _row(region, group, maf, pval, typ, beta, phet, se, cls):
    return (
        f"{region}\t{group}\t{maf}\t{pval}\t0\t{typ}\t1\t1\t"
        f"{beta}\t0\t{phet}\t{se}\t{cls}"
    )


IVW = "Inverse variance weighted"
STF = "Stouffer"


def _synthetic_tsv() -> bytes:
    rows = [
        HEADER,
        # G1, pLoF, 0.001 — Burden has two rows: IVW (real beta/se/het) + Stouffer
        _row("G1", "pLoF", "0.001", "1e-10", IVW, "-0.5", "0.02", "0.1", "Burden"),
        _row("G1", "pLoF", "0.001", "2e-10", STF, "-0.4", "NA", "NA", "Burden"),
        _row("G1", "pLoF", "0.001", "3e-05", STF, "NA", "NA", "NA", "SKAT"),
        _row("G1", "pLoF", "0.001", "4e-11", STF, "NA", "NA", "NA", "SKAT-O"),
        # G1, synonymous, 1e-04 — checks mask idx 3 and maf idx 1
        _row("G1", "synonymous", "1e-04", "0.5", IVW, "0.01", "0.9", "0.2", "Burden"),
        _row("G1", "synonymous", "1e-04", "0.6", STF, "0.02", "NA", "NA", "SKAT"),
        _row("G1", "synonymous", "1e-04", "0.7", STF, "NA", "NA", "NA", "SKAT-O"),
        # Unknown Group — must be dropped (not in MASKS)
        _row("G1", "garbage", "0.001", "1e-3", IVW, "0.1", "NA", "0.1", "Burden"),
        # G2, pLoF, 0.001 — only a Stouffer Burden row (IVW absent → fall back)
        _row("G2", "pLoF", "0.001", "5e-06", STF, "0.3", "NA", "NA", "Burden"),
        _row("G2", "pLoF", "0.001", "6e-06", STF, "NA", "NA", "NA", "SKAT-O"),
    ]
    return ("\n".join(rows) + "\n").encode()


@pytest.fixture(scope="module")
def parsed() -> pl.DataFrame:
    return parse_gene_tsv(_synthetic_tsv())


@pytest.fixture(scope="module")
def pivoted(parsed: pl.DataFrame) -> pl.DataFrame:
    return pivot_tests(parsed, GENE_KEYS)


# --------------------------------------------------------------------------- #
# parse_gene_tsv                                                               #
# --------------------------------------------------------------------------- #


def test_unknown_group_dropped(parsed: pl.DataFrame):
    # The "garbage" Group has no canonical mask index → dropped.
    assert parsed.filter(pl.col("mask_idx").is_null()).height == 0
    assert "garbage" not in parsed.columns  # sanity: no leftover raw col


def test_mask_and_maf_indices(parsed: pl.DataFrame):
    plof = parsed.filter((pl.col("ensg") == "G1") & (pl.col("mask_idx") == 0))
    assert plof["maf_idx"].unique().to_list() == [0]  # 0.001 -> 0
    syn = parsed.filter(pl.col("mask_idx") == 3)  # synonymous
    assert syn.height > 0
    assert syn["maf_idx"].unique().to_list() == [1]  # 1e-04 -> 1


def test_neglog10_roundtrip(parsed: pl.DataFrame):
    # -log10(1e-10) == 10.0, rounded to 2 dp.
    ivw = parsed.filter(
        (pl.col("ensg") == "G1")
        & (pl.col("mask_idx") == 0)
        & (pl.col("cls") == "Burden")
        & (pl.col("typ") == IVW)
    )
    assert ivw.height == 1
    assert ivw["lp"].item() == pytest.approx(10.0, abs=1e-9)
    # het p 0.02 -> -log10 ~ 1.70
    assert ivw["lp_het"].item() == pytest.approx(-math.log10(0.02), abs=0.01)


def test_lp_is_rounded_2dp(parsed: pl.DataFrame):
    for v in parsed["lp"].drop_nulls().to_list():
        assert round(v, 2) == v


# --------------------------------------------------------------------------- #
# pivot_tests — the critical IVW selection                                     #
# --------------------------------------------------------------------------- #


def _g1_plof(pivoted: pl.DataFrame) -> dict:
    row = pivoted.filter(
        (pl.col("ensg") == "G1") & (pl.col("mask_idx") == 0) & (pl.col("maf_idx") == 0)
    )
    assert row.height == 1
    return row.to_dicts()[0]


def test_burden_beta_from_ivw_not_stouffer(pivoted: pl.DataFrame):
    """Regression: beta must be the IVW -0.5, never the Stouffer -0.4."""
    r = _g1_plof(pivoted)
    assert r["beta"] == pytest.approx(-0.5)


def test_se_populated_from_ivw(pivoted: pl.DataFrame):
    """Regression for the dropped-SE bug: SE must come from the IVW row."""
    r = _g1_plof(pivoted)
    assert r["se"] is not None
    assert r["se"] == pytest.approx(0.1)


def test_burden_lp_from_ivw(pivoted: pl.DataFrame):
    r = _g1_plof(pivoted)
    # IVW Pvalue 1e-10 -> 10.0, not Stouffer 2e-10 -> 9.70
    assert r["lp_burden"] == pytest.approx(10.0, abs=1e-9)


def test_het_lp_present_on_meta(pivoted: pl.DataFrame):
    r = _g1_plof(pivoted)
    assert r["lp_het"] == pytest.approx(-math.log10(0.02), abs=0.01)


def test_skat_and_skato_from_stouffer(pivoted: pl.DataFrame):
    r = _g1_plof(pivoted)
    assert r["lp_skat"] == pytest.approx(-math.log10(3e-5), abs=0.01)
    assert r["lp_skato"] == pytest.approx(-math.log10(4e-11), abs=0.01)


def test_ivw_absent_falls_back_to_stouffer(pivoted: pl.DataFrame):
    """G2 has only a Stouffer Burden row: lp/beta fall back, se stays null."""
    row = pivoted.filter(pl.col("ensg") == "G2")
    assert row.height == 1
    r = row.to_dicts()[0]
    assert r["beta"] == pytest.approx(0.3)
    assert r["se"] is None
    assert r["lp_burden"] == pytest.approx(-math.log10(5e-6), abs=0.01)
    assert r["lp_skato"] == pytest.approx(-math.log10(6e-6), abs=0.01)


def test_one_row_per_gene_mask_maf(pivoted: pl.DataFrame):
    keyed = pivoted.select(GENE_KEYS)
    assert keyed.is_duplicated().sum() == 0


# --------------------------------------------------------------------------- #
# finite_round — non-finite guard (invalid-JSON prevention)                    #
# --------------------------------------------------------------------------- #


def test_finite_round_nulls_nonfinite():
    df = pl.DataFrame({"beta": [1.23456, math.inf, -math.inf, float("nan"), None]})
    out = df.select(finite_round("beta"))["beta"].to_list()
    assert out[0] == pytest.approx(1.235, rel=1e-3)  # rounded to sig figs
    assert out[1] is None  # +inf
    assert out[2] is None  # -inf
    assert out[3] is None  # nan
    assert out[4] is None  # already null
