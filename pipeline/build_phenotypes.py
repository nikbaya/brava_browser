"""Build the phenotype catalogue (meta/phenotypes.json).

Phenotype abbreviations come from the bucket. Full names, broad categories, and
binary/continuous class are taken from the authoritative BRaVa curation file
(meta_analysis/meta_analysis_utils.r), parsed directly so the catalogue stays in
sync with the consortium. Available ancestry strata are detected from which
result files actually exist.

Usage:
    python build_phenotypes.py --out ../app/public/data
"""

from __future__ import annotations

import argparse
import json
import re
import urllib.request
from pathlib import Path

import pandas as pd

from common import (
    ANCESTRIES,
    CACHE_DIR,
    GENE_PREFIX,
    gsutil_ls,
    stem_to_id,
    supp_tables,
)

# Per-ancestry strata exposed by the browser besides the cross-ancestry meta.
_SUPER = ["EUR", "AFR", "AMR", "EAS", "SAS"]
_NON_EUR = ["AFR", "AMR", "EAS", "SAS", "MID"]  # MID has no own stratum; folds in

R_URL = (
    "https://raw.githubusercontent.com/BRaVa-genetics/BRaVa_curation/"
    "main/meta_analysis/meta_analysis_utils.r"
)


def _r_source() -> str:
    CACHE_DIR.mkdir(exist_ok=True)
    dest = CACHE_DIR / "meta_analysis_utils.r"
    if not dest.exists():
        print(f"Downloading {R_URL} …")
        urllib.request.urlretrieve(R_URL, dest)
    return dest.read_text()


def _list_block(text: str, name: str) -> str:
    """Return the body of an R `name <- list( … )`, balancing parentheses."""
    m = re.search(rf"{name}\s*<-\s*list\(", text)
    if not m:
        raise ValueError(f"{name} not found in R source")
    i, depth = m.end(), 1
    while depth:
        c = text[i]
        depth += c == "("
        depth -= c == ")"
        i += 1
    return text[m.end() : i - 1]


def _named_strings(block: str) -> dict[str, str]:
    # entries like  `KEY` = "Value"  or  KEY = "Value"
    return {
        m.group(1): m.group(2)
        for m in re.finditer(r'`?([A-Za-z0-9_]+)`?\s*=\s*"([^"]*)"', block)
    }


def parse_curation() -> tuple[dict, dict, dict]:
    text = _r_source()
    names = _named_strings(_list_block(text, "renaming_phenotype_list"))
    categories = _named_strings(_list_block(text, "phenotype_broad_categories"))

    cls_block = _list_block(text, "phenotype_class")
    klass: dict[str, str] = {}
    for cls, out in (("binary", "binary"), ("continuous", "quantitative")):
        m = re.search(rf"{cls}\s*=\s*c\((.*?)\)", cls_block, re.S)
        for key in re.findall(r'"([^"]+)"', m.group(1) if m else ""):
            klass[key] = out
    return names, categories, klass


def detect_phenotypes() -> dict[str, list[str]]:
    """abbrev -> available ancestry names, from the actual file listing."""
    suffix_to_anc = {sfx: name for name, sfx in ANCESTRIES}
    order = {name: i for i, (name, _) in enumerate(ANCESTRIES)}
    found: dict[str, set[str]] = {}
    for path in gsutil_ls(f"{GENE_PREFIX}/"):
        base = path.rsplit("/", 1)[-1]
        if "_gene_meta_analysis" not in base or not base.endswith(".tsv.gz"):
            continue
        pheno = stem_to_id(base.split("_gene_meta_analysis")[0])
        suffix = base[: -len(".tsv.gz")].split("100_cutoff")[-1].lstrip(".")
        if suffix in suffix_to_anc:
            found.setdefault(pheno, set()).add(suffix_to_anc[suffix])
    return {p: sorted(a, key=lambda x: order[x]) for p, a in found.items()}


def load_sample_sizes(supp: Path) -> dict[str, dict]:
    """Per-(phenotype, ancestry) N from supp tables S4 (binary) + S5 (continuous).

    Returns {pheno_id: {anc: {n, case?, ctrl?}}} with the cross-ancestry meta
    ("All") and non-European meta ("non_EUR") aggregated from the strata.
    """
    s4 = pd.read_excel(supp, sheet_name="Table S4", header=0)  # binary
    s5 = pd.read_excel(supp, sheet_name="Table S5", header=0)  # continuous
    # S5 ships duplicate rows per (pheno, ancestry, biobank); drop them so the
    # per-biobank N isn't double-counted when we sum across biobanks below.
    s5 = s5.drop_duplicates(["Phenotype ID", "Ancestry", "Biobank ID"])

    out: dict[str, dict] = {}
    # Binary: sum cases/controls across biobanks for each (pheno, ancestry).
    b = s4.groupby(["Phenotype ID", "Ancestry"])[["N cases", "N controls"]].sum()
    for (pid, anc), row in b.iterrows():
        c, k = int(row["N cases"]), int(row["N controls"])
        out.setdefault(pid, {})[anc] = {"n": c + k, "case": c, "ctrl": k}
    # Continuous: sum N across biobanks.
    q = s5.groupby(["Phenotype ID", "Ancestry"])["N"].sum()
    for (pid, anc), n in q.items():
        out.setdefault(pid, {})[anc] = {"n": int(n)}

    # Add aggregate strata (All = every ancestry; non_EUR = non-European).
    def agg(strata: dict, keys: list[str]) -> dict | None:
        rows = [strata[a] for a in keys if a in strata]
        if not rows:
            return None
        d = {"n": sum(r["n"] for r in rows)}
        if all("case" in r for r in rows):
            d["case"] = sum(r["case"] for r in rows)
            d["ctrl"] = sum(r["ctrl"] for r in rows)
        return d

    for pid, strata in out.items():
        allkeys = list(strata.keys())
        if (a := agg(strata, allkeys)) is not None:
            strata["All"] = a
        if (a := agg(strata, _NON_EUR)) is not None:
            strata["non_EUR"] = a
    return out


def load_biobank_sizes(supp: Path) -> dict[str, dict]:
    """Per-(phenotype, ancestry, biobank) N for the five super-populations.

    Powers the per-ancestry sample-size pie charts (one slice per biobank).
    Returns {pheno_id: {ancestry: [{id, n, case?, ctrl?}, …]}} for ancestries in
    _SUPER only (the meta strata "All"/"non_EUR" are sums, not pie-able).
    """
    s4 = pd.read_excel(supp, sheet_name="Table S4", header=0)  # binary
    s5 = pd.read_excel(supp, sheet_name="Table S5", header=0)  # continuous
    s5 = s5.drop_duplicates(["Phenotype ID", "Ancestry", "Biobank ID"])

    out: dict[str, dict] = {}
    for _, r in s4.iterrows():
        if r["Ancestry"] not in _SUPER:
            continue
        c, k = int(r["N cases"]), int(r["N controls"])
        out.setdefault(r["Phenotype ID"], {}).setdefault(r["Ancestry"], []).append(
            {"id": r["Biobank ID"], "n": c + k, "case": c, "ctrl": k}
        )
    for _, r in s5.iterrows():
        if r["Ancestry"] not in _SUPER:
            continue
        out.setdefault(r["Phenotype ID"], {}).setdefault(r["Ancestry"], []).append(
            {"id": r["Biobank ID"], "n": int(r["N"])}
        )
    # Largest contributor first so pie slices read big→small.
    for strata in out.values():
        for rows in strata.values():
            rows.sort(key=lambda d: -d["n"])
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="../app/public/data", type=Path)
    ap.add_argument("--supp", type=Path, default=None, help="local supp .xlsx (else fetch)")
    args = ap.parse_args()

    names, categories, klass = parse_curation()
    detected = detect_phenotypes()
    supp = supp_tables(args.supp)
    sizes = load_sample_sizes(supp)
    biobank_sizes = load_biobank_sizes(supp)

    phenotypes = []
    for abbrev in sorted(detected):
        # Female-specific analyses carry an _F suffix; metadata is keyed by base.
        female = abbrev.endswith("_F")
        base = abbrev[:-2] if female else abbrev
        if base not in names:
            print(f"  ! {base!r} not in BRaVa curation — using fallback")
        rec = {
            "id": abbrev,
            "name": names.get(base, base),
            "category": categories.get(base, "Other"),
            "type": klass.get(base, "binary"),
            "ancestries": detected[abbrev],
        }
        if female:
            rec["sex"] = "female"
        if base in sizes:
            rec["n"] = sizes[base]
        phenotypes.append(rec)

    meta = args.out / "meta"
    meta.mkdir(parents=True, exist_ok=True)
    (meta / "phenotypes.json").write_text(
        json.dumps({"phenotypes": phenotypes}, separators=(",", ":"))
    )
    # Per-biobank breakdown (keyed by the base id, matching the `n` lookup).
    (meta / "pheno_sizes.json").write_text(
        json.dumps(biobank_sizes, separators=(",", ":"))
    )
    cats = sorted({p["category"] for p in phenotypes})
    print(f"Wrote {meta/'phenotypes.json'} ({len(phenotypes)} phenotypes)")
    print(f"Wrote {meta/'pheno_sizes.json'} ({len(biobank_sizes)} phenotypes)")
    print(f"Categories: {', '.join(cats)}")


if __name__ == "__main__":
    main()
