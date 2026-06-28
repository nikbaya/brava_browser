"""Cross-language wire-contract test.

The JSON uses bare integer indices for ancestry / mask / maf. Those indices are
only meaningful if the Python ETL (common.py) and the TypeScript frontend
(app/src/lib/constants.ts) agree on the exact ordering. The header in both files
says "append, never reorder" — this test enforces it so a silent reorder in one
file (which would mislabel every value on the site) fails CI instead.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from common import ANCESTRY_NAMES, MASKS, MAFS

CONSTANTS_TS = (
    Path(__file__).resolve().parents[2] / "app" / "src" / "lib" / "constants.ts"
)


def _ts_string_array(src: str, name: str) -> list[str]:
    m = re.search(rf"export const {name} = \[(.*?)\]", src, re.S)
    assert m, f"{name} not found in constants.ts"
    return re.findall(r"'([^']*)'", m.group(1))


def _ts_number_array(src: str, name: str) -> list[float]:
    m = re.search(rf"export const {name} = \[(.*?)\]", src, re.S)
    assert m, f"{name} not found in constants.ts"
    return [float(x) for x in re.findall(r"[0-9.eE+-]+", m.group(1))]


@pytest.fixture(scope="module")
def ts_src() -> str:
    if not CONSTANTS_TS.exists():
        pytest.skip("app/src/lib/constants.ts not found")
    return CONSTANTS_TS.read_text()


def test_ancestry_order_matches(ts_src):
    assert _ts_string_array(ts_src, "ANCESTRIES") == ANCESTRY_NAMES


def test_mask_order_matches(ts_src):
    assert _ts_string_array(ts_src, "MASKS") == list(MASKS)


def test_maf_order_matches(ts_src):
    assert _ts_number_array(ts_src, "MAFS") == list(MAFS)
