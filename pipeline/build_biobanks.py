"""Build the biobank catalogue (meta/biobanks.json) for the info page.

Source: the flagship-paper supplementary tables (an .xlsx in the repo):
  * Table S3 — one row per biobank: location, total sample size, ascertainment
    strategy, sequencing data, ancestries present.
  * Table S8 — per-biobank x ancestry sample counts (ancestry composition for
    the pie charts).

Geographic coordinates (for the world map) and country flags are not in the
supplement, so they are curated here, keyed by the stable Biobank ID.

Usage:
    python build_biobanks.py --supp "../media-2 (2).xlsx" --out ../app/public/data
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import pandas as pd

from common import supp_tables

# Approximate coordinates of each biobank's coordinating centre (lat, lng).
COORDS: dict[str, tuple[float, float]] = {
    "all-of-us": (36.17, -86.78),       # Nashville, TN (program ops)
    "biome": (40.79, -73.95),           # Mount Sinai, New York City
    "bbj": (35.68, 139.69),             # Tokyo
    "ccpm": (39.74, -104.99),           # Aurora/Denver, Colorado
    "egcut": (58.38, 26.72),            # Tartu, Estonia
    "genes-and-health": (51.54, -0.05),  # East London
    "gel": (51.50, -0.12),              # London
    "pmbb": (39.95, -75.19),            # Philadelphia (Penn Medicine BioBank)
    "mgbb": (42.36, -71.06),            # Boston (Mass General Brigham Biobank)
    "uk-biobank": (53.39, -2.21),       # Stockport / Manchester
}

# Table S3 swaps the names of these two US biobanks (confirmed with the
# consortium): pmbb is Penn Medicine, mgbb is Mass General Brigham. Override the
# S3 "Biobank" text so the catalogue is correct.
NAME_OVERRIDE: dict[str, str] = {
    "pmbb": "Penn Medicine BioBank",
    "mgbb": "Mass General Brigham Biobank",
}

# Country name (as written in Table S3) -> ISO-3166 alpha-2 (for the flag emoji).
COUNTRY_ISO: dict[str, str] = {
    "United States of America": "US",
    "United Kingdom": "GB",
    "Japan": "JP",
    "Estonia": "EE",
}


def flag_emoji(iso2: str) -> str:
    """Regional-indicator flag emoji for a 2-letter country code."""
    return "".join(chr(0x1F1E6 + ord(c) - ord("A")) for c in iso2.upper())


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--supp", type=Path, default=None, help="local supp .xlsx (else fetch)")
    ap.add_argument("--out", type=Path, default=Path("../app/public/data"))
    args = ap.parse_args()

    supp = supp_tables(args.supp)
    s3 = pd.read_excel(supp, sheet_name="Table S3", header=0)
    s8 = pd.read_excel(supp, sheet_name="Table S8", header=0)

    # ancestry composition: biobank id -> {ancestry: N}
    comp: dict[str, dict[str, int]] = {}
    for _, r in s8.iterrows():
        comp.setdefault(str(r["Biobank ID"]), {})[str(r["Ancestry"])] = int(r["N"])

    biobanks = []
    for _, r in s3.iterrows():
        bid = str(r["Biobank ID"])
        country = str(r["Location"])
        iso = COUNTRY_ISO.get(country, "")
        lat, lng = COORDS.get(bid, (0.0, 0.0))
        ancestry_n = comp.get(bid, {})
        biobanks.append(
            {
                "id": bid,
                "name": NAME_OVERRIDE.get(bid, str(r["Biobank"])),
                "country": country,
                "iso2": iso,
                "flag": flag_emoji(iso) if iso else "",
                "lat": lat,
                "lng": lng,
                "sample_size": int(r["Sample size"]),
                "ascertainment": str(r["Ascertainment strategy"]),
                "sequencing": str(r["Sequencing data available"]),
                "ancestries": [a.strip() for a in str(r["Genetic ancestry"]).split(",")],
                "ancestry_n": dict(sorted(ancestry_n.items(), key=lambda kv: -kv[1])),
            }
        )

    biobanks.sort(key=lambda b: -b["sample_size"])
    meta = args.out / "meta"
    meta.mkdir(parents=True, exist_ok=True)
    (meta / "biobanks.json").write_text(
        json.dumps({"biobanks": biobanks}, separators=(",", ":"), ensure_ascii=False)
    )
    total = sum(b["sample_size"] for b in biobanks)
    print(f"Wrote {meta/'biobanks.json'} ({len(biobanks)} biobanks, ~{total:,} samples)")


if __name__ == "__main__":
    main()
