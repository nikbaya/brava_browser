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

from common import ANCESTRIES, CACHE_DIR, GENE_PREFIX, gsutil_ls

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
        if "_ALL_gene_meta_analysis" not in base or not base.endswith(".tsv.gz"):
            continue
        pheno = base.split("_ALL_gene_meta_analysis")[0]
        suffix = base[: -len(".tsv.gz")].split("100_cutoff")[-1].lstrip(".")
        if suffix in suffix_to_anc:
            found.setdefault(pheno, set()).add(suffix_to_anc[suffix])
    return {p: sorted(a, key=lambda x: order[x]) for p, a in found.items()}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="../app/public/data", type=Path)
    args = ap.parse_args()

    names, categories, klass = parse_curation()
    detected = detect_phenotypes()

    phenotypes = []
    for abbrev in sorted(detected):
        if abbrev not in names:
            print(f"  ! {abbrev!r} not in BRaVa curation — using fallback")
        phenotypes.append(
            {
                "id": abbrev,
                "name": names.get(abbrev, abbrev),
                "category": categories.get(abbrev, "Other"),
                "type": klass.get(abbrev, "binary"),
                "ancestries": detected[abbrev],
            }
        )

    meta = args.out / "meta"
    meta.mkdir(parents=True, exist_ok=True)
    (meta / "phenotypes.json").write_text(
        json.dumps({"phenotypes": phenotypes}, separators=(",", ":"))
    )
    cats = sorted({p["category"] for p in phenotypes})
    print(f"Wrote {meta/'phenotypes.json'} ({len(phenotypes)} phenotypes)")
    print(f"Categories: {', '.join(cats)}")


if __name__ == "__main__":
    main()
